# Getting Started with wMCP

## Prerequisites

- Node.js 18+
- npm or pnpm

## Installation

```bash
cd wmcp-prototype
npm install
```

## Your First wMCP Module: Counter

We build a minimal module that owns counter logic. The host supplies persistence and logging via `host:requires`; the module exposes `module:capabilities` the host can call, emits `module:events`, and listens for `module:listeners`.

### Step 1: Define the Manifest

The manifest is the contract. Top-level keys use colons where they namespace module vs host concerns.

- **wmcp** — Protocol version the module targets (here `1.0`).
- **module** — Identity: `name`, `version`, `description`.
- **mount** — How the host loads the module: `entry` and optional `defaultElementId`.
- **module:capabilities** — Named operations implemented by the module. The host invokes them with `host.call(...)`. Each entry may include `mode`, `params`, `returns`, and `description`.
- **module:events** — Notifications the module emits toward the host (`wmcpClient.emit` / `host.on`).
- **module:listeners** — Events the host can send to the module (`host.emit` / `wmcpClient.on`).
- **host:requires** — Named operations the host must provide (or optionally provide if `optional: true`). The module calls them with `wmcpClient.call(...)`. Optional `hint` suggests REST shape for HTTP adapters.
- **host:config** — Configuration the host may pass at mount time (types and defaults).

```json
{
  "wmcp": "1.0",
  "module": { "name": "@aurorah/wmcp-counter", "version": "1.0.0", "description": "..." },
  "mount": { "entry": "./counter-module.ts", "defaultElementId": "counter-root" },
  "module:capabilities": {
    "counter:get": {
      "description": "Get the current counter value",
      "mode": "request",
      "returns": { "type": "object" }
    },
    "counter:increment": {
      "description": "Increment the counter",
      "mode": "request",
      "params": { "amount": { "type": "number", "required": false } },
      "returns": { "type": "object" }
    }
  },
  "module:events": {
    "counter:changed": {
      "description": "Counter value changed",
      "data": { "value": { "type": "number" }, "source": { "type": "string" } }
    }
  },
  "module:listeners": {
    "counter:reset": { "description": "Host requests a counter reset", "data": {} }
  },
  "host:requires": {
    "persist:load": {
      "description": "Load saved counter state",
      "mode": "request",
      "returns": { "type": "object" },
      "hint": { "method": "GET", "path": "/counter" }
    },
    "persist:save": {
      "description": "Save counter state",
      "mode": "request",
      "params": { "value": { "type": "number", "required": true } },
      "returns": { "type": "object" },
      "hint": { "method": "POST", "path": "/counter" }
    },
    "log:write": {
      "description": "Write audit log",
      "mode": "request",
      "params": { "action": { "type": "string", "required": true }, "detail": { "type": "object", "required": false } },
      "returns": { "type": "void" },
      "hint": { "method": "POST", "path": "/logs" },
      "optional": true
    }
  },
  "host:config": { "initialValue": { "type": "number", "default": 0 } }
}
```

### Why readiness gating? (1.1.0+)

Modules with post-paint asynchronous initialization — layout sizing, web workers, font loading, media decoders, and similar — finish their constructor and even their `mount()` before that initialization actually drains. If the host emits a `module:listeners` event in that window, listeners that depend on stable layout or worker state silently no-op.

To eliminate the race at the protocol level, the module opts in by calling `client._requireReadiness()` once in its constructor and `client._setReady()` once init has drained (typically after one or two `requestAnimationFrame` callbacks for layout-bound work, or after the relevant `await` for I/O-bound work). The client buffers host-to-module events between those calls in FIFO order and emits the reserved `wmcp:ready` event on readiness so hosts can coordinate (`host:requires` invocations are never gated).

This is the canonical pattern used by every example in this repository and by the Next.js demo. Even modules whose `mount()` looks synchronous should adopt it so future authors who copy the template inherit the safe boilerplate. Specification §7.5 defines the contract normatively.

### Step 2: Write the Module

The module owns counter state and registers handlers for `module:capabilities`. It calls `host:requires` for persistence and emits `module:events` when the value changes. It subscribes to `module:listeners` such as `counter:reset`. The constructor opts in to readiness gating; `mount()` signals readiness once initialization drains.

```typescript
import { WmcpClient } from "../../src/core/client.js";
import manifest from "./manifest.json";

class CounterModule {
  public readonly wmcpClient: WmcpClient;
  private value = 0;

  constructor() {
    this.wmcpClient = new WmcpClient(manifest as any);
    this.wmcpClient._requireReadiness();

    this.wmcpClient._registerCapabilities({
      "counter:get": async () => ({ value: this.value }),
      "counter:increment": async (params) => {
        this.value += (params.amount as number) ?? 1;
        await this.wmcpClient.call("persist:save", { value: this.value });
        this.wmcpClient.emit("counter:changed", { value: this.value, source: "user" });
        return { value: this.value };
      },
    });
    this.wmcpClient.on("counter:reset", () => {
      this.value = 0;
      this.wmcpClient.emit("counter:changed", { value: 0, source: "reset" });
    });
  }

  async mount() {
    const saved = await this.wmcpClient.call<{ value: number }>("persist:load");
    this.value = saved.value;

    this.wmcpClient._setReady();
  }
}
```

The module does not choose transport or credentials for `persist:*`; the host implements those requirements in-process or via HTTP.

### Step 3: Write the Host

The host wraps the module client with `WmcpHost`, binds `host:requires` with `connectDirect` (or `connect` for HTTP), listens to `module:events`, and can call `module:capabilities` or emit to `module:listeners`. Hosts can also subscribe to the reserved `wmcp:ready` event to coordinate work that should wait until the module's post-mount initialization drains.

```typescript
import { WmcpHost } from "../../src/core/host.js";
import { CounterModule } from "./counter-module.js";

const counter = new CounterModule();
const host = new WmcpHost(counter.wmcpClient);

let stored = 0;
host.connectDirect({
  "persist:load": async () => ({ value: stored }),
  "persist:save": async (params) => {
    stored = params.value as number;
    return { success: true };
  },
});

host.on("counter:changed", (data) => console.log("Changed:", data));
host.on("wmcp:ready", () => console.log("Module is ready"));

await counter.mount();
await host.call("counter:get"); // host calls module
await host.call("counter:increment", { amount: 5 });
host.emit("counter:reset", {}); // host emits to module
```

### Step 4: Run It

```bash
npx tsx examples/counter/host-app.ts
npx tsx examples/counter/host-app.ts --override
npx tsx examples/counter/host-app.ts --http
```

`--http` expects the mock API: run `npx tsx examples/counter/mock-server.ts` in another terminal first.

Expected output for in-memory mode:

```
=== wMCP Counter Example: In-Memory Mode ===

[CounterModule] Mounted. Restored value: 0
[Host] counter:get -> 0
[Host] Event counter:changed: { value: 1, source: 'user' }
[Host] After +1: 1
[Host] Event counter:changed: { value: 6, source: 'user' }
[Host] After +5: 6
[Host] Event counter:changed: { value: 0, source: 'reset' }
[Host] After reset: 0
[Host] Audit log: [ ... ]

=== Done ===
```

### Step 5: HTTP Mode

In HTTP mode the host binds `host:requires` as HTTP adapters pointing to a **same-origin proxy**. The module code stays the same; only host wiring changes. Credentials (API keys, tokens) are **never** in browser-side code -- the server-side proxy injects them before forwarding to the backend.

```
Module (browser) ---> Host Proxy (:3456) --[+api-key]--> Backend API (:3457)
```

```typescript
const host = new WmcpHost(counter.wmcpClient, {
  baseUrl: "http://localhost:3456", // same-origin proxy, no credentials
});

host.connect({
  "persist:load": {
    resolve: () => ({ method: "GET", path: "/counter" }),
  },
  "persist:save": {
    resolve: (params) => ({
      method: "POST",
      path: "/counter",
      body: { value: params.value },
    }),
  },
  "log:write": {
    resolve: (params) => ({
      method: "POST",
      path: "/logs",
      body: { action: params.action, detail: params.detail },
    }),
  },
});
```

The mock server (`mock-server.ts`) runs both a backend API (port 3457, requires `x-api-key`) and a host proxy (port 3456, injects the key server-side). Start it, then run with `--http` as in Step 4.

### Step 6: Mixed Mode (SSR and CSR)

`connect` can mix direct handlers and HTTP resolvers in one map. Use that to bind some `host:requires` as server-side functions (for example Next.js server actions) and others as client-side HTTP adapters.

```typescript
// server-actions.ts (conceptual)
"use server";
export async function persistLoad() {
  return serverSideFetch("/api/counter"); // secrets stay on server
}

// Host wiring
host.connect({
  "persist:load": persistLoad,
  "persist:save": {
    resolve: (params) => ({
      method: "POST",
      path: "/api/counter",
      body: { value: params.value },
    }),
  },
});
```

The module keeps calling `wmcpClient.call('persist:load')` and `wmcpClient.call('persist:save')` without knowing which binding is SSR or CSR.

### Step 7: Overrides

The host can wrap a `module:capability` with `host.override`. The callback receives `(params, superFn)` and may validate, log, or transform results before or after delegating to the module implementation via `superFn`.

```typescript
host.override("counter:increment", async (params, superFn) => {
  if ((params.amount as number) > 100) throw new Error("Too large");
  return superFn(params);
});
```

Run `npx tsx examples/counter/host-app.ts --override` to see validation that rejects oversized increments while still using the module’s handler for allowed values.

## Next Steps: Real-World Examples

Each directory follows the same pattern: manifest, module, host adapter.

1. **Rich Text Editor** (`examples/rich-text-editor/`) — CRUD operations, optional export, streaming autosave, blob returns
2. **Analytics Dashboard** (`examples/analytics-dashboard/`) — Complex query parameters, aggregation, real-time data streams
3. **File Manager** (`examples/file-manager/`) — Multiple capabilities, blob upload/download, tree navigation
4. **Kanban Board** (`examples/kanban-board/`) — High event density, drag-and-drop patterns, real-time board sync
5. **Media Player** (`examples/media-player/`) — Continuous streaming, frequent progress events, playlist management

## Key Takeaways

- The manifest splits **module:capabilities** (host calls module) from **host:requires** (module calls host), with **module:events** and **module:listeners** for directed notifications either way.
- Traffic is bidirectional: `host.call` into the module and `wmcpClient.call` into host-provided requirements.
- **host.override** wraps a module capability and can call **superFn** to run the original module implementation after validation or cross-cutting logic.
- Optional entries under **host:requires** (for example `optional: true`) let modules check `wmcpClient.has(...)` and degrade gracefully.
- The same module runs against in-memory handlers, HTTP adapters, or a mixed SSR/CSR host by changing only host wiring; auth and API details stay on the host side.
