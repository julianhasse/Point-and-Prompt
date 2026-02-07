/**
 * Point and Prompt – backend proxy for LLM (Gemini) + Scan to Speak WebSocket relay.
 * Keeps the API key server-side; prototype POSTs { question, context, history } and gets { reply }.
 *
 * Set GEMINI_API_KEY in .env or environment, then: npm install && npm start
 * Open http://localhost:3001/ to use the prototype with real AI replies.
 */

require('dotenv').config();
const http = require('http');
const https = require('https');
const os = require('os');
const express = require('express');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { WebSocketServer } = require('ws');
const selfsigned = require('selfsigned');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use('/api', function (req, res, next) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.static(__dirname));

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenAI(process.env.GEMINI_API_KEY)
  : null;

const systemPrompt = `You are a diagnostic assistant for lab results. Use only the context provided (patient, selection, snippet). Do not invent data. Answer concisely and in plain language. If the context is about a specific lab result or trend, reference it.`;

function buildGeminiMessages(question, context, history) {
  const messages = [];
  const snippet = (context && context.snippet) || '';
  const label = (context && context.selection && context.selection.label) || '';
  const ctxText = [label, snippet].filter(Boolean).join('\nContext: ');
  const userContext = ctxText ? `Context: ${ctxText}\n\nQuestion: ${question}` : question;

  // Gemini API expects alternating user/model roles.
  // The history comes in as [{role: 'user', content: '...'}, {role: 'assistant', content: '...'}]
  // We need to map 'assistant' to 'model' for Gemini.
  if (history && history.length > 0) {
    history.forEach((m) => {
      messages.push({
        role: m.role === 'assistant' ? 'model' : m.role,
        parts: [{ text: m.content }],
      });
    });
  }

  messages.push({ role: 'user', parts: [{ text: userContext }] });
  return messages;
}

app.post('/api/ask', async (req, res) => {
  const { question, context, history } = req.body || {};
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid question' });
  }

  if (!genAI) {
    return res.status(503).json({
      error: 'LLM not configured. Set GEMINI_API_KEY in .env and restart the server.',
    });
  }

  try {
    const messages = buildGeminiMessages(question, context, history);

    // For Gemini, system instructions are set at the model level, not in messages directly.
    // We'll prepend the system prompt to the first user message if history is empty.
    let fullMessages = [...messages];
    if (fullMessages.length > 0 && fullMessages[0].role === 'user' && !history) {
      fullMessages[0].parts.unshift({ text: systemPrompt + "\n\n" });
    } else if (!history) {
        // If there's no history and no initial user message, handle this case.
        // This scenario might not happen with current buildGeminiMessages logic, but good to be robust.
        const snippet = (context && context.snippet) || '';
        const label = (context && context.selection && context.selection.label) || '';
        const ctxText = [label, snippet].filter(Boolean).join('\nContext: ');
        const userContext = ctxText ? `Context: ${ctxText}\n\nQuestion: ${question}` : question;
        fullMessages = [{ role: 'user', parts: [{ text: systemPrompt + "\n\n" + userContext }] }];
    }

    const result = await genAI.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-flash-latest',
      contents: fullMessages,
    });
    const reply = result.candidates[0].content.parts[0].text.trim();

    res.json({ reply });
  } catch (err) {
    console.error('Gemini error:', err.message);
    const status = err.response && err.response.status ? err.response.status : 500;
    res.status(status).json({
      error: err.message || 'Request to AI failed.',
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    llm: !!genAI,
    message: genAI ? 'LLM configured' : 'Set GEMINI_API_KEY for real AI replies',
  });
});

// Return LAN IPv4 addresses so the QR code URL can use a phone-reachable IP
const HTTPS_PORT = Number(PORT) + 1;
app.get('/api/network-info', (req, res) => {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  res.json({ addresses, port: PORT, httpsPort: HTTPS_PORT });
});

// ===== HTTP + HTTPS + WebSocket server =====
const server = http.createServer(app);

// Generate self-signed cert for HTTPS (needed for Web Speech API on mobile Chrome)
const lanAddresses = [];
for (const ifaces of Object.values(os.networkInterfaces())) {
  for (const iface of ifaces) {
    if (iface.family === 'IPv4' && !iface.internal) lanAddresses.push(iface.address);
  }
}
const certAttrs = [{ name: 'commonName', value: 'Point and Prompt Local' }];
const certOpts = {
  days: 365,
  keySize: 2048,
  extensions: [{
    name: 'subjectAltName',
    altNames: [
      { type: 2, value: 'localhost' },
      ...lanAddresses.map(ip => ({ type: 7, ip })),
    ],
  }],
};
const pems = selfsigned.generate(certAttrs, certOpts);
const httpsServer = https.createServer({ key: pems.private, cert: pems.cert }, app);

// Single WebSocketServer in noServer mode, shared by HTTP and HTTPS
const wss = new WebSocketServer({ noServer: true });

function handleUpgrade(request, socket, head) {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);
  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
}

server.on('upgrade', handleUpgrade);
httpsServer.on('upgrade', handleUpgrade);

// Session store: sessionId -> { desktop: ws|null, mobile: ws|null, createdAt: number }
const sessions = new Map();
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes

// Cleanup expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL) {
      if (session.desktop && session.desktop.readyState === 1) session.desktop.close();
      if (session.mobile && session.mobile.readyState === 1) session.mobile.close();
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const role = url.searchParams.get('role');
  const sessionId = url.searchParams.get('session');

  if (!role || !sessionId || !['desktop', 'mobile'].includes(role)) {
    ws.close(4000, 'Invalid role or session');
    return;
  }

  // Desktop creates sessions; mobile joins existing ones
  if (!sessions.has(sessionId)) {
    if (role === 'mobile') {
      ws.close(4001, 'Session not found');
      return;
    }
    sessions.set(sessionId, { desktop: null, mobile: null, createdAt: Date.now() });
  }

  const session = sessions.get(sessionId);

  // If a client of the same role already exists, replace it
  if (session[role] && session[role] !== ws && session[role].readyState === 1) {
    session[role].close(4002, 'Replaced by new connection');
  }
  session[role] = ws;

  // Notify the partner about connection
  const partner = role === 'desktop' ? session.mobile : session.desktop;
  if (partner && partner.readyState === 1) {
    partner.send(JSON.stringify({ type: 'status', payload: { event: 'partner_connected' } }));
    ws.send(JSON.stringify({ type: 'status', payload: { event: 'partner_connected' } }));
  }

  // Relay messages to partner
  ws.on('message', (data) => {
    const target = role === 'desktop' ? session.mobile : session.desktop;
    if (target && target.readyState === 1) {
      target.send(data.toString());
    }
  });

  // Handle disconnect
  ws.on('close', () => {
    if (session[role] === ws) {
      session[role] = null;
    }
    const remaining = role === 'desktop' ? session.mobile : session.desktop;
    if (remaining && remaining.readyState === 1) {
      remaining.send(JSON.stringify({ type: 'status', payload: { event: 'partner_disconnected' } }));
    }
    // Clean up empty sessions
    if (!session.desktop && !session.mobile) {
      sessions.delete(sessionId);
    }
  });

  // Heartbeat: ping every 15s to detect dead connections
  ws._isAlive = true;
  ws.on('pong', () => { ws._isAlive = true; });
});

// Heartbeat interval for all WebSocket connections
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws._isAlive === false) return ws.terminate();
    ws._isAlive = false;
    ws.ping();
  });
}, 15000);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`Point and Prompt server: http://localhost:${PORT}/`);
  console.log(genAI ? 'LLM: configured (Gemini)' : 'LLM: not configured – set GEMINI_API_KEY in .env for real AI');
  console.log('Scan to Speak: WebSocket relay active on /ws');
});

httpsServer.listen(HTTPS_PORT, () => {
  console.log(`Scan to Speak HTTPS: https://localhost:${HTTPS_PORT}/`);
  if (lanAddresses.length > 0) {
    console.log(`  Phone URL: https://${lanAddresses[0]}:${HTTPS_PORT}/voice.html`);
    console.log('  (Phone will show a certificate warning – tap Advanced > Proceed)');
  }
});
