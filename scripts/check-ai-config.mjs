// Checks the OpenRouter setup the way e2e.config.ts loads it, without ever
// printing the key. Usage: npm run check:ai
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
const fromShell = Boolean(process.env.OPENROUTER_API_KEY);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const key = process.env.OPENROUTER_API_KEY ?? '';
const model = process.env.OPENROUTER_MODEL ?? 'openai/gpt-6-luna';
let ok = true;

console.log(`.env file:           ${existsSync(envFile) ? 'found' : 'not found'}`);
console.log(`OPENROUTER_API_KEY:  ${key ? `present (from ${fromShell ? 'shell' : '.env'})` : 'MISSING'}`);
if (!key) {
  console.log('  -> copy .env.example to .env and set OPENROUTER_API_KEY, or set it in this shell.');
  process.exit(1);
}
if (key === 'your_actual_key_here' || !key.startsWith('sk-or-')) {
  console.log('  -> the value is a placeholder or not an OpenRouter key (expected prefix sk-or-).');
  ok = false;
}
console.log(`Model:               ${model}`);

try {
  // GET /key validates the key without spending credits.
  const res = await fetch('https://openrouter.ai/api/v1/key', {
    headers: { Authorization: `Bearer ${key}` },
  });
  console.log(`Key accepted:        ${res.ok ? 'yes' : `NO (HTTP ${res.status})`}`);
  if (res.ok) {
    const { data } = await res.json();
    if (data?.limit_remaining != null) console.log(`Credit remaining:    ${data.limit_remaining}`);
  } else ok = false;

  const models = await fetch('https://openrouter.ai/api/v1/models').then((r) => r.json());
  const entry = models.data?.find((m) => m.id === model);
  const tools = entry?.supported_parameters?.includes('tools');
  console.log(`Model available:     ${entry ? (tools ? 'yes, with tool calling' : 'yes, but NO tool calling') : 'NO'}`);
  if (!entry || !tools) ok = false;
} catch (error) {
  console.log(`Could not reach OpenRouter: ${error.message}`);
  ok = false;
}

console.log(ok ? '\nOpenRouter configuration OK' : '\nOpenRouter configuration has problems (see above)');
// exitCode, not process.exit(): exiting while fetch sockets close crashes libuv on Windows.
process.exitCode = ok ? 0 : 1;
