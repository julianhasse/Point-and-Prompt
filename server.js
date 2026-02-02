/**
 * Point and Prompt – backend proxy for LLM (Gemini).
 * Keeps the API key server-side; prototype POSTs { question, context, history } and gets { reply }.
 *
 * Set GEMINI_API_KEY in .env or environment, then: npm install && npm start
 * Open http://localhost:3001/ to use the prototype with real AI replies.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

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

app.listen(PORT, () => {
  console.log(`Point and Prompt server: http://localhost:${PORT}/`);
  console.log(genAI ? 'LLM: configured (Gemini)' : 'LLM: not configured – set GEMINI_API_KEY in .env for real AI');
});
