/**
 * Counter example — Host-side integration
 *
 * Demonstrates all wMCP features:
 *   (default)  In-memory mode — host provides persist:* as direct functions
 *   --override Override mode  — host overrides counter:increment with validation
 *   --http     HTTP mode      — host provides persist:* as HTTP adapters
 *
 * Run:
 *   npx tsx examples/counter/host-app.ts
 *   npx tsx examples/counter/host-app.ts --override
 *   npx tsx examples/counter/host-app.ts --http
 */

import { WmcpHost } from '../../src/core/host.js';
import { CounterModule } from './counter-module.js';

// ── In-memory mode ──

async function runInMemoryMode() {
  console.log('=== wMCP Counter Example: In-Memory Mode ===\n');

  const counter = new CounterModule();
  const host = new WmcpHost(counter.wmcpClient);

  let stored = 0;
  const logs: string[] = [];

  // Host binds host:requires — persistence + optional logging
  host.connectDirect({
    'persist:load': async () => ({ value: stored }),
    'persist:save': async (params) => {
      stored = params.value as number;
      return { success: true };
    },
    'log:write': async (params) => {
      logs.push(`[${params.action}] ${JSON.stringify(params.detail)}`);
    },
  });

  // Host listens to module:events
  host.on('counter:changed', (data) => {
    console.log(`[Host] Event counter:changed:`, data);
  });

  // Reserved protocol event — fires once after the module's _setReady().
  host.on('wmcp:ready', () => console.log('[Host] Module is ready'));

  await counter.mount({ config: { initialValue: 0 } });

  // Host calls module:capabilities
  const val0 = await host.call<{ value: number }>('counter:get');
  console.log(`[Host] counter:get -> ${val0.value}`);

  await host.call('counter:increment', { amount: 1 });
  console.log(`[Host] After +1: ${counter.getValue()}`);

  await host.call('counter:increment', { amount: 5 });
  console.log(`[Host] After +5: ${counter.getValue()}`);

  // Host emits to module:listeners
  host.emit('counter:reset', {});
  console.log(`[Host] After reset: ${counter.getValue()}`);

  console.log(`[Host] Audit log:`, logs);
  console.log('\n=== Done ===');
  host.destroy();
}

// ── Override mode ──

async function runOverrideMode() {
  console.log('=== wMCP Counter Example: Override Mode ===\n');

  const counter = new CounterModule();
  const host = new WmcpHost(counter.wmcpClient);

  let stored = 0;

  // Host overrides counter:increment with validation + super()
  host.override('counter:increment', async (params, superFn) => {
    const amount = (params.amount as number) ?? 1;
    if (amount > 100) {
      throw new Error('Increment too large (max 100)');
    }
    console.log(`[Host Override] Validated amount=${amount}, calling super...`);
    const result = await superFn(params);
    console.log(`[Host Override] super returned:`, result);
    return result;
  });

  host.connectDirect({
    'persist:load': async () => ({ value: stored }),
    'persist:save': async (params) => {
      stored = params.value as number;
      return { success: true };
    },
  });

  host.on('counter:changed', (data) => {
    console.log(`[Host] Event counter:changed:`, data);
  });

  host.on('wmcp:ready', () => console.log('[Host] Module is ready'));

  await counter.mount({ config: { initialValue: 0 } });

  await host.call('counter:increment', { amount: 3 });
  console.log(`[Host] After +3: ${counter.getValue()}`);

  await host.call('counter:increment', { amount: 10 });
  console.log(`[Host] After +10: ${counter.getValue()}`);

  // This should throw
  try {
    await host.call('counter:increment', { amount: 200 });
  } catch (err) {
    console.log(`[Host] Expected error: ${(err as Error).message}`);
  }

  console.log('\n=== Done ===');
  host.destroy();
}

// ── HTTP mode (requires mock-server.ts running) ──
//
// Architecture:
//   Module (this process) ---> Host Proxy (:3456) --[+api-key]--> Backend (:3457)
//
// The module connects to the same-origin proxy. No API keys or secrets
// appear in this client-side code. The proxy (server-side) injects
// credentials before forwarding to the backend.

async function runHttpMode() {
  console.log('=== wMCP Counter Example: HTTP Mode ===\n');

  const counter = new CounterModule();
  const host = new WmcpHost(counter.wmcpClient, {
    baseUrl: 'http://localhost:3456',
  });

  host.connect({
    'persist:load': {
      resolve: () => ({ method: 'GET', path: '/counter' }),
    },
    'persist:save': {
      resolve: (params) => ({
        method: 'POST',
        path: '/counter',
        body: { value: params.value },
      }),
    },
    'log:write': {
      resolve: (params) => ({
        method: 'POST',
        path: '/logs',
        body: { action: params.action, detail: params.detail },
      }),
    },
  });

  host.on('counter:changed', (data) => {
    console.log(`[Host] Event counter:changed:`, data);
  });

  host.on('wmcp:ready', () => console.log('[Host] Module is ready'));

  await counter.mount();

  await host.call('counter:increment', { amount: 3 });
  console.log(`[Host] After +3: ${counter.getValue()}`);

  console.log('\n=== Done ===');
  host.destroy();
}

const mode = process.argv[2];
if (mode === '--http') {
  runHttpMode().catch(console.error);
} else if (mode === '--override') {
  runOverrideMode().catch(console.error);
} else {
  runInMemoryMode().catch(console.error);
}
