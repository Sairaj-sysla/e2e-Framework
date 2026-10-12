import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { mobile } from '@e2e-dev/mobile';
import { mobileTools } from '@e2e-dev/mobile/tools';
import { openrouter } from '@openrouter/ai-sdk-provider';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The runner loads no .env itself. Load the git-ignored .env next to this
// file (see .env.example) before any provider reads it; variables already set
// in the shell win. .env.example is only a template and is never loaded.
const envFile = fileURLToPath(new URL('./.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;

// E2E_ENV labels the report and keys the replay cache per environment, so
// recordings from staging never replay against test. Fail fast on a typo.
const ENVIRONMENTS = ['test', 'staging', 'production'] as const;
const environment = (env.E2E_ENV ?? 'test') as (typeof ENVIRONMENTS)[number];
if (!ENVIRONMENTS.includes(environment)) {
  throw new Error(`E2E_ENV must be one of ${ENVIRONMENTS.join(', ')}; got "${env.E2E_ENV}"`);
}

// Point at a real app with APP_URL; without it the runner starts the bundled
// demo app (demo-app/server.js) on http://localhost:3000.
const webTarget = {
  name: 'web',
  engine: web(),
  app: {
    url: env.APP_URL ?? 'http://localhost:3000',
    environment,
    command: env.APP_URL
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
} as const;

// Mobile targets join the run only when their app is configured (bundle id or
// build path in .env), so the web suite keeps running on machines without
// Xcode or the Android SDK. iOS needs macOS. Set IOS_DEVICE / ANDROID_DEVICE
// to a comma-separated device list for a parallel pool (one worker per device).
const devices = (list: string | undefined) => list?.split(',').map((d) => d.trim()).filter(Boolean);

const ios = env.IOS_BUNDLE_ID || env.IOS_APP_PATH ? mobile({ platform: 'ios', device: devices(env.IOS_DEVICE) }) : undefined;
const android =
  env.ANDROID_PACKAGE || env.ANDROID_APP_PATH ? mobile({ platform: 'android', device: devices(env.ANDROID_DEVICE) }) : undefined;

const mobileTargets = [
  ...(ios ? [{ name: 'ios', engine: ios, app: { bundleId: env.IOS_BUNDLE_ID, appPath: env.IOS_APP_PATH, environment } }] : []),
  ...(android
    ? [{ name: 'android', engine: android, app: { bundleId: env.ANDROID_PACKAGE, appPath: env.ANDROID_APP_PATH, environment } }]
    : []),
];
const mobileEngines = [ios, android].filter((engine) => engine !== undefined);

export default {
  tests: 'tests/**/*.e2e.ts',
  targets: [webTarget, ...mobileTargets],
  // Every run writes .e2e/report.json; junit.xml feeds CI test tabs, and
  // markdown writes .e2e/summary.md plus one page per failure in .e2e/failures/.
  reporters: ['list', 'junit', 'markdown'],
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
      model: openrouter(env.OPENROUTER_MODEL ?? 'openai/gpt-6-luna', {
        extraBody: { max_tokens: Number(env.OPENROUTER_MAX_TOKENS ?? 4096) },
      }),
      system: 'You are a thorough QA agent. Verify every outcome.',
      // Device gestures (open_app, swipe, alert) for agent steps on iOS and Android.
      tools: mobileEngines.length ? mobileTools(mobileEngines[0], ...mobileEngines.slice(1)) : {},
    },
  },
  // DEMO-ONLY account served by demo-app/server.js. Override with
  // E2E_USER_DEMO_USERNAME / E2E_USER_DEMO_PASSWORD for a real app, and
  // never commit real passwords.
  credentials: {
    demo: {
      username: 'demo@example.test',
      password: 'DemoPass123!',
    },
  },
} satisfies E2EConfig;
