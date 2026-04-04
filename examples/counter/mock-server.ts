/**
 * Counter example — Mock Backend API + Host Proxy
 *
 * Two layers demonstrate the correct security architecture:
 *
 *   1. Backend API (port 3457) — the external service.
 *      Requires x-api-key header. In production this would be a
 *      third-party or internal API the module must never talk to directly.
 *
 *   2. Host Proxy  (port 3456) — the server-side proxy route.
 *      Runs in the host's SSR layer. Injects the API key before forwarding
 *      to the backend. The module (browser) talks to this proxy only.
 *      No credentials are exposed to the client.
 *
 * Run: npx tsx examples/counter/mock-server.ts
 * Then: npx tsx examples/counter/host-app.ts --http
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

// ── Shared helpers ──

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
  });
}

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ════════════════════════════════════════════════════════════════════
// Layer 1 — Backend API (port 3457)
// Requires x-api-key. The module NEVER talks to this directly.
// ════════════════════════════════════════════════════════════════════

const API_KEY = 'secret-backend-key-12345';
let counterValue = 0;
const auditLog: Array<{ action: string; detail?: unknown; ts: string }> = [];

const backendServer = createServer(async (req, res) => {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';
  const key = req.headers['x-api-key'];

  if (key !== API_KEY) {
    json(res, { error: 'Unauthorized' }, 401);
    return;
  }

  console.log(`  [Backend] ${method} ${url}`);

  if (method === 'GET' && url === '/counter') {
    json(res, { value: counterValue });
    return;
  }
  if (method === 'POST' && url === '/counter') {
    const body = await parseBody(req);
    counterValue = (body.value as number) ?? counterValue;
    json(res, { success: true });
    return;
  }
  if (method === 'POST' && url === '/logs') {
    const body = await parseBody(req);
    auditLog.push({ action: body.action as string, detail: body.detail, ts: new Date().toISOString() });
    json(res, {});
    return;
  }
  json(res, { error: 'Not found' }, 404);
});

// ════════════════════════════════════════════════════════════════════
// Layer 2 — Host Proxy (port 3456)
// No auth required from the client. Injects x-api-key server-side
// before forwarding to the backend.
// ════════════════════════════════════════════════════════════════════

const BACKEND_URL = 'http://localhost:3457';

const proxyServer = createServer(async (req, res) => {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  console.log(`[Proxy] ${method} ${url}  ->  ${BACKEND_URL}${url}`);

  const body = method !== 'GET' ? await parseBody(req) : undefined;

  const upstream = await fetch(`${BACKEND_URL}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,               // injected server-side
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await upstream.text();
  res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
  res.end(data);
});

// ── Start both ──

const BACKEND_PORT = 3457;
const PROXY_PORT = 3456;

backendServer.listen(BACKEND_PORT, () => {
  console.log(`[Backend] Running at http://localhost:${BACKEND_PORT}  (requires x-api-key)`);
});

proxyServer.listen(PROXY_PORT, () => {
  console.log(`[Proxy]   Running at http://localhost:${PROXY_PORT}  (no auth needed from client)`);
  console.log('');
  console.log('Architecture:');
  console.log(`  Module (browser) ---> Proxy (:${PROXY_PORT}) --[+api-key]--> Backend (:${BACKEND_PORT})`);
  console.log('');
  console.log('Proxy routes:');
  console.log('  GET  /counter  -> persist:load');
  console.log('  POST /counter  -> persist:save');
  console.log('  POST /logs     -> log:write');
});
