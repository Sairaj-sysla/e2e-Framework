// Minimal demo app for the E2E example. Plain Node.js, no dependencies.
// DEMO-ONLY credentials: never reuse them anywhere real.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));

const DEMO_USER = {
  email: 'demo@example.test',
  password: 'DemoPass123!',
  name: 'Demo User',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw new Error('Body too large');
  }
  return JSON.parse(raw || '{}');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'POST' && url.pathname === '/api/login') {
    try {
      const { email, password } = await readJson(req);
      if (email === DEMO_USER.email && password === DEMO_USER.password) {
        return sendJson(res, 200, { name: DEMO_USER.name, email: DEMO_USER.email });
      }
      return sendJson(res, 401, { error: 'Invalid email or password.' });
    } catch {
      return sendJson(res, 400, { error: 'Malformed request.' });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }

  const path = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = normalize(join(PUBLIC_DIR, path));
  if (!file.startsWith(normalize(PUBLIC_DIR))) {
    res.writeHead(403).end();
    return;
  }

  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Demo app running at http://localhost:${PORT}`);
});
