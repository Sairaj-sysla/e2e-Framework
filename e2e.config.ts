import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { openrouter } from '@openrouter/ai-sdk-provider';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The runner loads no .env itself. Load the git-ignored .env next to this
// file (see .env.example) before any provider reads it; variables already set
// in the shell win. .env.example is only a template and is never loaded.
const envFile = fileURLToPath(new URL('./.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

// Point at a real app with APP_URL; without it the runner starts the bundled
// demo app (demo-app/server.js) on http://localhost:3000.
const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

export default {
  // OpenRouter serves the model id and reads OPENROUTER_API_KEY from the
  // environment. Only agent.* steps need it; tests without agent steps run
  // without a key. OPENROUTER_MODEL swaps the model for one run; it must be a
  // tool-calling model OpenRouter lists (the scaffolded 'openai/gpt-6-luna-fast'
  // is not served by OpenRouter).
  agents: {
    default: {
      // OpenRouter reserves credit for the full output limit of each request:
      // agent.act sends none (the model's maximum, 65536 tokens) and judgments
      // send 8192, more than a low-credit account can afford. extraBody is
      // merged last into the request body, so this caps every agent call.
      model: openrouter(process.env.OPENROUTER_MODEL ?? 'openai/gpt-6-luna', {
        extraBody: { max_tokens: Number(process.env.OPENROUTER_MAX_TOKENS ?? 4096) },
      }),
      system: 'You are a thorough QA agent. Verify every outcome.',
    },
  },
  targets: [{
    engine: web(),
    app: {
      url: appUrl,
      command: process.env.APP_URL
        ? undefined
        : {
            executable: 'node',
            args: ['demo-app/server.js'],
            env: { PORT: '3000' },
            log: '.e2e/logs/app.log',
            // Attach to the demo app if you already started it with `npm run demo`.
            reuseExisting: true,
          },
    },
  }],
  // DEMO-ONLY account served by demo-app/server.js. Override with
  // E2E_USER_DEMO_USERNAME / E2E_USER_DEMO_PASSWORD for a real app, and
  // never commit real passwords.
  credentials: {
    demo: {
      username: 'demo@example.test',
      password: () => process.env.DEMO_PASSWORD ?? 'DemoPass123!',
    },
  },
} satisfies E2EConfig;
