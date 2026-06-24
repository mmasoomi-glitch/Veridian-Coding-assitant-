<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/13b9d4a8-35c9-4a78-9190-5da68c4fe4af

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Configure AI: set `ANTHROPIC_BASE_URL` + `ANTHROPIC_API_KEY` (model `claude-opus-4-8`) in a local env file referenced by `VERIDIAN_ENV_FILE`. **Veridian uses a direct Anthropic-compatible provider endpoint for intelligence. It does not use DeepSeek, OpenAI, Gemini, local-model fallbacks, Claude Code CLI, or headless Claude subprocesses.** If unset, AI is honestly disabled.
3. Run the app:
   `npm run dev`
