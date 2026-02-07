/**
 * Netlify Function: POST /api/ask (via redirect) – same contract as server.js.
 * Set GEMINI_API_KEY in Netlify site environment variables.
 */

const { GoogleGenAI } = require('@google/genai');

const systemPrompt = `You are a diagnostic assistant for lab results. Use only the context provided (patient, selection, snippet). Do not invent data. Answer concisely and in plain language. If the context is about a specific lab result or trend, reference it.`;

function buildGeminiMessages(question, context, history) {
  const messages = [];
  const snippet = (context && context.snippet) || '';
  const label = (context && context.selection && context.selection && context.selection.label) || '';
  const ctxText = [label, snippet].filter(Boolean).join('\nContext: ');
  const userContext = ctxText ? `Context: ${ctxText}\n\nQuestion: ${question}` : question;

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

exports.handler = async function (event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (e) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const { question, context, history } = body;
  if (!question || typeof question !== 'string') {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Missing or invalid question' }),
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        error: 'LLM not configured. Set GEMINI_API_KEY in Netlify site environment variables.',
      }),
    };
  }

  const genAI = new GoogleGenAI(apiKey);
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  try {
    const messages = buildGeminiMessages(question, context, history);
    let fullMessages = [...messages];
    if (fullMessages.length > 0 && fullMessages[0].role === 'user' && !(history && history.length)) {
      fullMessages[0].parts.unshift({ text: systemPrompt + '\n\n' });
    } else if (!(history && history.length)) {
      const snippet = (context && context.snippet) || '';
      const label = (context && context.selection && context.selection && context.selection.label) || '';
      const ctxText = [label, snippet].filter(Boolean).join('\nContext: ');
      const userContext = ctxText ? `Context: ${ctxText}\n\nQuestion: ${question}` : question;
      fullMessages = [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userContext }] }];
    }

    const result = await genAI.models.generateContent({
      model: modelName,
      contents: fullMessages,
    });

    const reply =
      (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts[0] && result.candidates[0].content.parts[0].text)
        ? result.candidates[0].content.parts[0].text.trim()
        : 'No response generated.';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    console.error('Gemini error:', err.message);
    const status = err.response && err.response.status ? err.response.status : 500;
    return {
      statusCode: status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message || 'Request to AI failed.' }),
    };
  }
};
