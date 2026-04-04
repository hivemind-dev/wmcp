# wMCP vs MCP: A Detailed Comparison

## Abstract

This document provides a comprehensive comparison between the Model Context Protocol (MCP, version 2025-11-25) and the Web Module Connection Protocol (wMCP, version 1.0). While both protocols address the challenge of connecting independent components to host applications through standardized interfaces, they target fundamentally different domains: MCP connects AI/LLM applications to external tools and data sources, while wMCP connects web UI modules to host web applications and their backend services.

wMCP is **bidirectional**: the module **provides** `module:capabilities` (with defaults the host may call and override) and **consumes** `host:requires` from the host; **events** flow module→host (`module:events`) and host→module (`module:listeners`). That symmetry makes **module-provided capabilities** broadly analogous to **MCP tools** (both are defined on the server/module side), while **host:requires** parallels **MCP resources** (and related client-supplied context) as things the embedded side needs from the host.

The comparison proceeds from motivation and architecture through contract formats, primitive mappings, transports, negotiation, security, AI-related design goals, lifecycle, and selection guidance. A brief discussion of convergence outlines how the two ecosystems might interoperate in future systems.

## 1. Origins and Motivation

### MCP

The Model Context Protocol was created by Anthropic and released as an open standard. Its central problem is operational: how to give large language models (LLMs) reliable, structured access to external tools, files, databases, and other capabilities without ad hoc integrations for every host application.

MCP draws explicit inspiration from the Language Server Protocol (LSP). Like LSP, MCP separates the host (e.g., an IDE or chat client) from a long-lived server process that exposes a well-defined surface area. The goal is to standardize how AI systems discover and invoke tools so that the same server can plug into multiple clients.

Typical use cases include IDE extensions, conversational assistants, and agentic workflows where the model must read resources, call APIs, and receive structured results in a repeatable way.

### wMCP

The Web Module Connection Protocol takes structural cues from MCP’s capability-oriented design but applies them to a different problem: how to embed encapsulated web UI modules into host web applications while giving those modules controlled access to backend APIs, without leaking credentials or coupling modules to a specific frontend framework—and how to let the **host** call into and **wrap** module behavior without forking the module.

wMCP addresses authentication isolation (the sub-module never holds secrets), framework-agnostic integration (hosts and modules agree on a contract, not on React/Vue/Svelte specifics), **bidirectional** integration (host-to-module calls, module-to-host requirements, and notifications in both directions), and integration workflows that are amenable to automated or AI-assisted code generation from a static manifest.

The intended outcome is a repeatable pattern for SaaS platforms and composite web applications where feature modules are developed independently but must attach to a single host runtime and security boundary, with explicit support for **override** semantics (`params`, `superFn`) akin to method inheritance.

## 2. Architecture Comparison

| Aspect | MCP | wMCP |
|--------|-----|------|
| Architecture | Host -> Client -> Server | Host ↔ WmcpHost ↔ WmcpClient (in sub-module); module registers `module:capabilities`, host binds `host:requires` and may override capabilities |
| Communication direction | Bidirectional | Bidirectional: host invokes `module:capabilities`; module invokes `host:requires`; `module:events` (module→host) and `module:listeners` (host→module) |
| Protocol basis | JSON-RPC 2.0 | Direct function calls for capability/requirement bindings; optional HTTP for `host:requires` implementations |
| Session model | Stateful sessions | Stateless per-call for RPC-style surfaces (state lives in UI, storage, or backend); event subscriptions are host-managed |
| Process model | Typically cross-process (stdio, HTTP) | Typically in-process (same browser runtime); requirements may proxy cross-network |

### MCP architecture

In MCP, a **host** application embeds an MCP **client** that maintains one or more connections to MCP **servers**. Servers expose tools, resources, prompts, and related features. Communication is framed as JSON-RPC 2.0 requests, responses, and notifications over transports such as stdio (common for local subprocesses) or Streamable HTTP for network-facing deployments.

The client mediates between the host’s AI runtime and each server: it issues `initialize`, discovers capabilities through listing operations, and routes tool invocations and resource reads according to the negotiated contract. Sessions are typically **stateful**: connection setup, capability advertisement, and ongoing message exchange assume a durable channel until explicit shutdown.

### wMCP architecture

In wMCP, the **host** instantiates a **WmcpHost** that loads a sub-module’s manifest, validates that **`host:requires`** are bound and **`module:capabilities`** are registered, and wires a **WmcpClient** inside the sub-module. The module implements default handlers for **`module:capabilities`**; the host calls them via an in-process **`host.call()`** (or equivalent) and may **replace** a binding with a wrapper **`(params, superFn) => result`** that delegates to the module default through **`superFn`**. The module calls **`host:requires`** through **`wmcpClient.call()`** so it never holds host secrets; those bindings may be in-process, HTTP-backed, or mixed per requirement.

**Notifications** are explicit in both directions: **`module:events`** are emitted by the module and observed by the host; **`module:listeners`** are delivered from the host to the module. There is no symmetric JSON-RPC layer in the default model: RPC-style traffic uses ordinary JavaScript invocations, often with native objects rather than serialized JSON at every boundary. **State** is expected to live in UI state, browser storage, or backend resources accessed through the host—not in a long-lived protocol session object on the wire.

### Architectural contrast

MCP optimizes for **heterogeneous processes** and **model-driven** orchestration: the LLM runtime is the primary consumer of **server-provided tools**, while the client may supply sampling, roots, and elicitation. wMCP optimizes for **same-origin or same-runtime** composition with **two RPC directions**: the module is the provider of **capabilities** (like an MCP server’s tools) and the consumer of **requirements** (like a client pulling host/context services). The former emphasizes wire interoperability; the latter emphasizes encapsulation, static contracts, zero credential exposure in the module, and **host-side override** of module defaults—something MCP does not model as a first-class primitive.

## 3. Contract Format

### MCP

MCP surfaces are described through runtime metadata:

- **Tools**: `{ name, description, inputSchema (JSON Schema) }` — invocable operations the model may choose to call.
- **Resources**: `{ uri, name, description, mimeType }` — addressable content the client may read for context.
- **Prompts**: `{ name, description, arguments }` — reusable prompt templates with parameters.

These declarations are obtained **dynamically** via JSON-RPC listing operations (e.g., after `initialize`), not from a single static file shipped with the server binary. Servers may update what they advertise as their implementation evolves, subject to session rules.

### wMCP

wMCP defines a **manifest**: a static JSON artifact shipped with the module. Colon-keyed sections typically include:

- **`module:capabilities`**: `{ description, mode, params, returns, hint? }` — operations the **module** provides with default implementations; the **host** invokes them and may override them.
- **`host:requires`**: `{ description, mode, params, returns, hint?, optional? }` — services the **module** needs from the **host** (backend, platform, policy).
- **`module:events`**: `{ description, data }` — notifications **module → host**.
- **`module:listeners`**: `{ description, data }` — notifications **host → module**.
- **`host:config`**: `{ type, default, enum, description }` — mount-time parameters the host supplies when mounting the module.

### Key difference

MCP’s contract is **discovered at runtime** through JSON-RPC. wMCP’s contract is **static** and readable before any module code executes. That difference has practical consequences: static manifests support build-time validation, documentation generation, and **static analysis**. They also align well with **AI-assisted code generation**, where a model reads the manifest once and emits host-side adapter code, proxy routes, and override wrappers. MCP’s dynamic discovery suits servers whose surface area may vary by version, configuration, or user permissions without redeploying a separate manifest file.

## 4. Primitives Comparison

| MCP Primitive | wMCP Equivalent | Notes |
|---------------|-----------------|-------|
| Tools | `module:capabilities` | Both are **provided by the server/module side** and invoked by the peer; MCP: model→tool; wMCP: host→capability (defaults live in the module, overridable by the host) |
| Resources | `host:requires` | MCP resources supply contextual data from the client/host side; wMCP requirements are **host-implemented** services the module calls (often with HTTP **hints**) |
| Prompts | (no equivalent) | MCP prompts are LLM-specific templates; not applicable to web UI modules |
| Sampling | (no equivalent) | MCP sampling lets servers request LLM completions; not applicable to wMCP |
| Roots | `host:config` | MCP roots define filesystem scope; wMCP `host:config` defines mount parameters and host-supplied options |
| Elicitation | `module:events` / `module:listeners` | MCP elicitation coordinates structured user input across the boundary; wMCP splits **push** directions explicitly (module emits events; host notifies listeners) |
| Notifications (both directions) | `module:events` + `module:listeners` | MCP uses JSON-RPC notifications in both directions; wMCP names **outbound** and **inbound** notification channels separately |
| (no equivalent) | Capability **override** (`params`, `superFn`) | Host wraps a module capability while delegating to the default; **no MCP equivalent** |
| (no equivalent) | Hints on `host:requires` | Advisory HTTP shape for codegen and proxies; MCP has no equivalent on the same axis |
| (no equivalent) | Streaming capabilities | wMCP has built-in stream mode for requirements/capabilities where defined; MCP supports streaming via SSE transport |

**Tools vs. module capabilities.** In MCP, tools are **server-advertised** and the model selects and parameterizes them. In wMCP, **`module:capabilities`** are **module-advertised** in the manifest and registered at runtime; the **host** (or its orchestration layer) decides when to call them. The analogy is structural (provider side defines invocable operations), not identical control flow.

**Resources vs. host:requires.** MCP resources are URI-addressed context the client surfaces to the model. wMCP **requirements** are **named operations** the host must bind so the module can reach backends and platform APIs without credentials in the module.

**Prompts and sampling.** These MCP primitives assume an LLM-centric control flow. Web UI modules do not require those roles in the wMCP model.

**Roots vs. host:config.** MCP roots bound filesystem visibility for tools operating on local trees. wMCP **config** bounds module parameters and host-supplied mount options.

**Elicitation vs. events and listeners.** MCP may request structured user input through elicitation flows. wMCP models **asynchronous boundary crossing** with **`module:events`** (module informs host) and **`module:listeners`** (host informs module), keeping direction explicit.

**Override.** wMCP allows the host to **wrap** a **`module:capability`** with **`(params, superFn) => result`**, where **`superFn`** invokes the module’s registered default—similar to **`super()`** in class inheritance. MCP has no first-class parallel: tool implementations are server-owned without a standardized host-side “super” to the original handler.

**Streaming.** MCP’s HTTP transport can carry streaming behavior via Server-Sent Events (SSE). wMCP can model streaming results through async generator-style handlers for stream-mode operations where the manifest defines them.

## 5. Transport Comparison

| Aspect | MCP | wMCP |
|--------|-----|------|
| Primary | stdio (subprocess), Streamable HTTP | **`module:capabilities`**: in-process; **override**: in-process wrapper over module default; **`host:requires`**: in-process, HTTP-backed, or **mixed** per binding |
| Streaming | SSE within HTTP transport | AsyncGenerator for stream-mode capabilities/requirements where supported |
| Message format | JSON-RPC 2.0 (request/response/notification) | Direct function invocation for bound capabilities and requirements |
| Serialization | JSON on the wire | Native JavaScript objects at in-process boundaries; JSON when requirements hit HTTP |
| Cross-process | Native (stdio, HTTP) | Requirements may proxy remotely; capabilities and overrides remain in-process in the default model; future embeddings may add `postMessage` / WebSocket framing |

MCP’s transports are chosen for **process isolation** and **language neutrality**: JSON-RPC over stdio or HTTP allows servers written in arbitrary languages. wMCP’s default assumes **shared JavaScript execution** in the browser for **capability invocation and override**, avoiding per-call serialization when passing structured data between module and host adapters. **`host:requires`** deliberately mirrors the older “capability hint” story: each requirement can be backed by a server-side function (e.g., a server action holding API credentials), a client-side HTTP adapter, or an in-process handler—fine-grained control over which bindings run on which side of the rendering boundary. Cross-origin or iframe-based embeddings may motivate future transports that reintroduce explicit message framing while preserving the manifest contract.

## 6. Capability Negotiation

### MCP

Negotiation is **bidirectional** during the `initialize` handshake (and related capability structures in the specification):

- **Server capabilities** may include tools, resources, prompts, logging, and other advertised features.
- **Client capabilities** may include sampling, roots, elicitation, and other host-side behaviors servers may rely on.

Once established for a session, these capabilities are treated as fixed for that session’s lifetime unless the specification allows explicit renegotiation in a given transport profile.

### wMCP

Negotiation is **bidirectional** relative to the static manifest:

- The manifest declares **`module:capabilities`**, **`host:requires`**, **`module:events`**, **`module:listeners`**, and **`host:config`**.
- The **module** registers implementations for **`module:capabilities`** (and subscribes to **`module:listeners`**).
- The **host** binds **`host:requires`**, optionally **overrides** **`module:capabilities`**, wires **`module:events`**, and delivers **`module:listeners`**.
- At **connect/mount**, validation ensures **every required `host:requires` entry is bound** and **every `module:capability` is registered** (and related consistency rules), so neither direction is left dangling.

The module may still query **optional** requirement support (e.g., `has()`-style checks) before relying on a non-required entry.

### Rationale

In MCP, both the LLM-side client and the tool server are **active participants** with complementary advertised surfaces. wMCP’s **bidirectional** contract mirrors that split along different axes: the **module** advertises **capabilities** (host calls) and **consumes** **requirements** (module calls), while **events** and **listeners** carry notifications each way. Trust remains asymmetric in the web sense—the **host** retains authority over auth, routing, and policy—but the **protocol surface** is no longer “only module initiates RPC.”

## 7. Security Model

| Aspect | MCP | wMCP |
|--------|-----|------|
| Core principle | User consent and control | API key isolation; host authority over requirements and overrides |
| Credential handling | Server may have its own credentials | Sub-module MUST NOT hold host secrets; `host:requires` implementations may mix SSR server actions (secrets) with CSR adapters |
| Authorization | User approves tool invocations | Host proxy injects auth transparently; host chooses when to call module capabilities |
| Data isolation | Servers can't see full conversation or other servers | Sub-modules can't access auth, keys, or other modules without host policy |
| Trust model | Tools treated as arbitrary code execution | Manifest validates declared names and shapes; module code runs in-app—host overrides can enforce logging, validation, or policy around capability entry points |

MCP’s threat model acknowledges that invoking tools can approximate **arbitrary code execution** from the model’s perspective; user approval, visibility, and client policy mitigate risk. Servers may hold their own API keys and secrets separate from the host.

wMCP’s model pushes **secrets and tokens into the host** (and its backend adapters) for **`host:requires`**. The module sees requirement functions, not raw credentials. **`module:capabilities`** are **module-defined entry points** the host calls; **overrides** let the host wrap those entry points for auditing or policy without forking the module. The host validates that runtime wiring matches the **manifest schema**, reducing ambiguity about what may be invoked from either side. Isolation goals include preventing one module from reading another module’s state or auth material without explicit host policy.

## 8. AI-Friendliness

### MCP

MCP is **designed for AI at runtime**. Tool names, descriptions, and JSON Schemas are first-class inputs to the model’s planning and tool-choice behavior. The LLM is the **active agent** that decides when to call which tool with which arguments. Integration quality depends heavily on schema clarity and description writing for model consumption.

### wMCP

wMCP is **designed to be AI-friendly at development time** and **legible for orchestration**. The manifest is **machine-readable** so automated tools and AI assistants can generate host adapters, proxy routes, **override** wrappers, and documentation. **Hints** on **`host:requires`** suggest HTTP mappings without mandating them. At runtime, the default “agent” is application code (host and module), not an LLM loop—though nothing prevents a host from driving **`host.call()`** from an AI layer if product requirements demand it.

### Philosophical distinction

**MCP places AI at runtime** as the orchestrator of external capabilities advertised by servers. **wMCP places AI at development time** (and optional host orchestration) as an accelerator for correct, repeatable integration against a **bidirectional static** contract. The two are complementary: a product might use wMCP for modular UI and MCP elsewhere for agent tooling.

## 9. Lifecycle Comparison

| Phase | MCP | wMCP |
|-------|-----|------|
| Discovery | Client discovers server capabilities via initialize RPC | Host reads static manifest; module registers capability handlers |
| Negotiation | Bidirectional capability exchange | Host binds **`host:requires`**, optional **overrides** for **`module:capabilities`**; validate all requirements bound and capabilities registered |
| Active session | Stateful JSON-RPC session | Bidirectional runtime: **`wmcpClient.call()`** (requirements), **`host.call()`** (capabilities), **emit/listen** for events both ways |
| Streaming | SSE transport or stdio line protocol | AsyncGenerator from stream handlers where manifest defines stream mode |
| Notifications | Bidirectional JSON-RPC notifications | **`module:events`** (module→host) and **`module:listeners`** (host→module) |
| Teardown | Client sends shutdown, server exits | Host destroys client, unsubscribes events, releases listener wiring |

**Discovery.** MCP discovery is tied to session establishment and RPCs. wMCP discovery is a file read and parse step plus module-side registration of **`module:capabilities`** before full mount.

**Active operation.** MCP maintains conversational and protocol state across many round trips. wMCP emphasizes stateless **per-call** semantics for RPC-style surfaces; persistent state is an application concern. **Both sides** may initiate calls and notifications per the manifest.

**Teardown.** MCP expects orderly shutdown of transports and processes. wMCP expects the host to detach subscriptions and release **`WmcpClient`** resources when a module instance is destroyed.

## 10. When to Use Which

### Use MCP when:

- Connecting AI/LLM applications to external tools, files, and data services.
- The **consumer** of capabilities is an AI model making **runtime** decisions.
- You require **cross-process** or **remote** communication (subprocess, HTTP server).
- Building IDE extensions, AI chat clients, or **agentic** workflows where standardized tool calling is central.

### Use wMCP when:

- Embedding **web UI modules** into a host web application.
- You need **bidirectional** integration: host calls **module capabilities**, module calls **host requirements**, and **events/listeners** cross the boundary both ways.
- Modules need **backend API access** that must flow through the host’s **authentication and authorization** layer.
- You want **framework-agnostic** encapsulated components with a clear boundary and optional **host overrides** with **`superFn`** semantics.
- You want **AI-assisted** generation of host integration code from a **static manifest**.
- Building **SaaS** or **platform** products with **pluggable** feature modules and strict credential isolation.

## 11. Convergence Potential

Both protocols share **capability-based contracts**, **negotiation or validation** across directions, and **isolation** as design themes. Reasonable convergence directions include:

- A **wMCP sub-module** acting as a thin client to an **MCP server**, exposing selected MCP tools as **`module:capabilities`** or satisfying **`host:requires`** via MCP-backed adapters while keeping secrets on a backend.
- An **MCP tool server** that uses **wMCP** internally to compose or configure administrative UI served alongside tools.
- A **unified meta-protocol** or shared schema layer that maps manifest concepts to MCP tool/resource metadata for organizations that operate both agent surfaces and embedded web modules.

Such bridges would preserve the distinct trust boundaries—runtime model orchestration versus browser module embedding—while reducing duplicate specification work.

## References

- Model Context Protocol Specification (2025-11-25): https://modelcontextprotocol.io/specification/2025-11-25
- MCP Architecture: https://modelcontextprotocol.io/specification/2025-11-25/architecture
- Language Server Protocol: https://microsoft.github.io/language-server-protocol/
- JSON-RPC 2.0: https://www.jsonrpc.org/specification
