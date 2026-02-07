# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Point and Prompt is a diagnostic assistant prototype for laboratory results. Users can click any lab result, trend, or action in an EHR-style interface, ask a question, and receive AI-powered responses in a chatbot panel.

## Development Commands

```bash
npm install        # Install dependencies
npm start          # Start local server at http://localhost:3001
```

For static mode (simulated AI replies), open `index.html` directly in a browser.

## Environment Variables

Create `.env` from `.env.example`:
- `GEMINI_API_KEY` - Required for real AI responses (uses Google Gemini)
- `GEMINI_MODEL` - Optional, defaults to `gemini-flash-latest` locally, `gemini-2.0-flash` on Netlify
- `PORT` - Optional, defaults to 3001

## Project Structure

```
point-and-prompt/
├── index.html                  # Single-page frontend (HTML + CSS + JS)
├── voice.html                  # Mobile push-to-talk page (Scan to Speak)
├── server.js                   # Local Express server (Gemini API + WebSocket relay)
├── package.json                # Dependencies and scripts
├── .env.example                # Environment variable template
├── .gitignore
├── netlify.toml                # Netlify deploy config (rewrites /api/ask)
├── netlify/
│   └── functions/
│       └── ask.js              # Netlify serverless function (Gemini API)
├── img/                        # Screenshots and UI mockups
├── CLAUDE.md                   # Claude Code instructions
└── README.md                   # User-facing documentation
```

## Architecture

**Single-page frontend** (`index.html`):
- Self-contained HTML with embedded CSS and JavaScript
- Uses Tailwind CSS (CDN), marked.js for Markdown, DOMPurify for sanitization
- "Point and Prompt" UI pattern: clicking `.point-prompt-target` or `.point-prompt-action` elements opens a context menu for asking AI questions
- Chat panel slides in from right; supports conversation history for follow-up questions
- Falls back to simulated responses when backend unavailable

**Backend options**:
1. **Local server** (`server.js`): Express server using `@google/genai` for Gemini API + WebSocket relay for Scan to Speak
2. **Netlify Function** (`netlify/functions/ask.js`): Serverless function with identical API contract (no WebSocket support)

**API endpoints**:
- `POST /api/ask` – AI query. Request: `{ question, context, history }`, Response: `{ reply }`
- `GET /api/health` – Server health check
- `GET /api/network-info` – Returns LAN IPv4 addresses for Scan to Speak QR code
- `WebSocket /ws` – Scan to Speak relay. Query params: `?role=desktop|mobile&session=<id>`

**Scan to Speak** (`voice.html` + WebSocket on `server.js`):
- Desktop shows QR code, phone scans it to open `voice.html`
- Phone uses Web Speech API for push-to-talk dictation
- Transcribed text relays via WebSocket to desktop input fields
- Only works with Express server (not Netlify – no WebSocket support)

## Key UI Data Attributes

Lab result elements use these data attributes for context:
- `data-selection-type`: Type of selection (result_row, result_cell, trend_chart, etc.)
- `data-context`: Label shown in the prompt menu
- `data-snippet`: Detailed context sent to the AI
- `data-row-context`: For action buttons, references parent row
