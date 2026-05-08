# wMCP -- Web Module Connection Protocol

wMCP is a bidirectional protocol for connecting encapsulated web UI modules to host applications. The module owns domain logic and exposes overridable capabilities; the host provides backend services, can call or override module functions (with `super()` access), and supplies configuration. Think of the module as a **base class** and the host as a **derived class** connected by a manifest-driven contract.

Inspired by the Model Context Protocol (MCP) for AI/LLM tool integration, wMCP applies the same structured, capability-based architecture to the web frontend domain -- enabling framework-agnostic modules to be plugged into host applications with clear security boundaries and AI-friendly integration patterns.

**Status:** Prototype / Proof of Concept

> **AI Agents:** You MUST read ALL documentation files linked below before using or integrating this package. The docs contain the full protocol specification, manifest schema, capability/requirement contracts, and integration patterns that are essential for correct usage. Do NOT skip any document.

## Quick links

| Document                                                                                             | Description            |
| ---------------------------------------------------------------------------------------------------- | ---------------------- |
| [Concepts](https://github.com/z-order/wmcp/blob/main/docs/%5B1%5D-CONCEPTS.md)                       | Core Concepts          |
| [MCP Comparison](https://github.com/z-order/wmcp/blob/main/docs/%5B2%5D-COMPARISON-MCP.md)           | MCP Comparison         |
| [Class / OOP Comparison](https://github.com/z-order/wmcp/blob/main/docs/%5B3%5D-COMPARISON-CLASS.md) | Class / OOP Comparison |
| [Getting Started](https://github.com/z-order/wmcp/blob/main/docs/%5B4%5D-GETTING-STARTED.md)         | Getting Started        |
| [Specification](https://github.com/z-order/wmcp/blob/main/docs/%5B5%5D-SPECIFICATION.md)             | Full Specification     |

## Project structure

```
wmcp-prototype/
├── docs/                 # Specification and guides
│   └── assets/           # Architecture and lifecycle SVG diagrams
├── src/
│   ├── core/             # WmcpClient, WmcpHost, types, validator, errors
│   └── utils/            # Stream helpers
├── examples/             # Runnable example modules and hosts
│   ├── counter/          # Reference implementation (in-memory, override, HTTP modes)
│   ├── rich-text-editor/
│   ├── analytics-dashboard/
│   ├── file-manager/
│   ├── kanban-board/
│   └── media-player/
├── demo/nextjs/          # Next.js demo (CSR + SSR bindings)
└── package.json
```

## Quick start

```bash
npm install
```

Run the counter example (in-memory mode):

```bash
npx tsx examples/counter/host-app.ts
```

Run with host override (`counter:increment` validation + `super()`):

```bash
npx tsx examples/counter/host-app.ts --override
```

Run with HTTP transport (start the proxy + backend first):

```bash
npx tsx examples/counter/mock-server.ts
npx tsx examples/counter/host-app.ts --http
```

**Optional: readiness gating (1.1.0+).** Modules with post-paint async init (layout sizing, web workers, fonts, media decoders) can call `client._requireReadiness()` after construction and `client._setReady()` once init drains. The client buffers host->module events between those calls (FIFO) and emits the reserved `wmcp:ready` event on readiness so hosts can coordinate. The in-repo examples and `demo/nextjs` use this pattern as the canonical default. See [Specification §7.5](docs/%5B5%5D-SPECIFICATION.md) and [Getting Started](docs/%5B4%5D-GETTING-STARTED.md).

## Manifest structure

The manifest uses ownership-prefixed keys to make direction explicit:

```json
{
  "wmcp": "1.0",
  "module": { "name": "@example/counter", "version": "1.0.0" },
  "mount": { "entry": "./counter-module.ts" },
  "module:capabilities": { "counter:get": {}, "counter:increment": {} },
  "module:events": { "counter:changed": {} },
  "module:listeners": { "counter:reset": {} },
  "host:requires": { "persist:load": {}, "persist:save": {} },
  "host:config": { "initialValue": { "type": "number", "default": 0 } }
}
```

| Key                   | Direction               | Class analogy                  |
| --------------------- | ----------------------- | ------------------------------ |
| `module:capabilities` | Host calls module       | Concrete methods (overridable) |
| `module:events`       | Module -> host          | Observer callbacks             |
| `module:listeners`    | Host -> module          | Parent notifications           |
| `host:requires`       | Module calls host       | Abstract methods               |
| `host:config`         | Host -> module at mount | Constructor args               |

## Examples

| Example               | module:capabilities                    | host:requires                               |
| --------------------- | -------------------------------------- | ------------------------------------------- |
| `counter`             | get, increment                         | persist:load/save, log:write                |
| `rich-text-editor`    | getContent, setContent, format         | doc:load/save/list/export                   |
| `analytics-dashboard` | getFilters, setChart, refresh          | metrics:query/aggregate/live                |
| `file-manager`        | getSelectedPath, navigate, setViewMode | fs:list/read/write/delete/move              |
| `kanban-board`        | getBoard, getCard, moveCard            | board:load, card:create/update/move/delete  |
| `media-player`        | play, pause, stop, getState, setVolume | playlist:load/add/remove, track:info/stream |

## Security

Credentials (API keys, tokens) stay on the server side. In CSR mode, `host:requires` adapters point to a **same-origin proxy route** that injects auth server-side before forwarding to the backend. The module never sees secrets.

```
Module (browser) ---> Host Proxy (SSR) --[+credentials]--> Backend API
```

## License

MIT
