# Point and Prompt – Diagnostic Assistant Prototype

Lab Results prototype with **Point and Prompt**: click any result, trend, or action, ask a question, and get an AI reply in a chatbot panel.

## Run with simulated replies (no backend)

Open `index.html` in a browser. Replies are simulated. The UI will suggest starting the server for real AI.

## Run with real AI (OpenAI)

1. **Copy env and set your API key**
   ```bash
   cp .env.example .env
   # Edit .env and set OPENAI_API_KEY=sk-your-key-here
   ```
   Get a key: [OpenAI API keys](https://platform.openai.com/api-keys).

2. **Install and start the server**
   ```bash
   npm install
   npm start
   ```

3. **Open in the browser**
   - Go to **http://localhost:3001/**
   - Use Point and Prompt as usual; replies come from the LLM (default model: `gpt-4o-mini`).

The server serves the prototype and exposes `POST /api/ask` with body `{ question, context, history }`. The API key stays on the server.

### Optional env

- `OPENAI_MODEL` – e.g. `gpt-4o-mini` (default), `gpt-4o`
- `PORT` – default `3001`

### Using another backend URL

If your API runs elsewhere, set before loading the page:

```html
<script>window.POINT_PROMPT_API_URL = 'https://your-api.example.com';</script>
```

Then the prototype will POST to `https://your-api.example.com/api/ask` with the same JSON shape.
