# Web Module Connection Protocol (wMCP) Specification

Version: 1.0 (Draft)

## Abstract

This document defines the Web Module Connection Protocol (wMCP), a standardized bidirectional protocol for connecting encapsulated web user-interface modules to host applications through a manifest-driven architecture. The design draws conceptual inspiration from the Model Context Protocol (MCP) for artificial-intelligence and large-language-model integration; wMCP adapts analogous patterns to the web frontend domain.

In this model, the **module** is the frontend or sub-project: it owns domain logic and default implementations analogous to a base class. The **host** is the backend or top-project: it may call, override, and extend module behavior analogous to a derived class. wMCP connects them with named **capabilities** the module provides (overridable by the host), **requirements** the module needs from the host, and bidirectional **events**. The manifest declares these surfaces; bind-time validation and transport boundaries preserve security and early failure detection.

## Status

This document specifies a prototype protocol. It is intended for implementation feedback, interoperability experiments, and revision. Normative requirements herein are subject to change in future drafts. Implementers SHOULD treat this version as non-final.

## Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals, as shown here.

Manifest keys that contain a colon (for example `module:capabilities`) are literal string keys in the JSON object. They MUST appear exactly as specified, including the colon character.

## 1. Introduction

Web applications increasingly compose independent UI fragments, micro-frontends, and third-party widgets. Without a common contract, each integration is ad hoc: hosts pass opaque props, modules embed environment-specific assumptions, and credentials leak across trust boundaries.

wMCP addresses this by requiring each module to publish a machine-readable manifest that describes what the module **provides** (`module:capabilities`), what it **requires** from the host (`host:requires`), notifications from module to host (`module:events`), notifications from host to module (`module:listeners`), mount metadata, and optional mount-time configuration (`host:config`). The host binds handlers for requirements, optionally overrides module capabilities, subscribes to module events, and arranges delivery of host-originated events to the module.

The goals of wMCP are:

- To separate module interface declaration from host implementation and transport details.
- To enable bind-time validation so missing required `host:requires` handlers and missing registrations for declared `module:capabilities` are detected early.
- To keep authentication material and host-specific configuration out of module code and bundles.
- To support unary request/response and streaming interactions where appropriate, including bidirectional event channels.
- To remain extensible for additional transports and vendor-specific manifest fields without breaking conforming implementations.

This specification does not define a particular programming language or framework; it describes abstract data shapes, runtime behavior, and security obligations that language-specific implementations SHALL satisfy.

## 2. Terminology and Definitions

The following terms have the meanings assigned below for the purpose of this document.

**Module**  
An encapsulated web UI unit (frontend or sub-project) integrated into a host application. The module owns domain logic and default implementations for its declared `module:capabilities`. It exposes and consumes its contract through a wMCP manifest and the runtime APIs described in this specification.

**Host Application**  
The application (backend or top-project) that loads, binds, and mounts one or more modules. The host provides handlers for `host:requires`, MAY override `module:capabilities`, subscribes to `module:events`, and MAY emit `module:listeners` events toward the module.

**Manifest**  
A structured document (typically JSON) associated with a module that declares protocol version, module identity, mount instructions, `module:capabilities`, optional `module:events`, optional `module:listeners`, optional `host:requires`, and optional `host:config`.

**Capability**  
A named operation the **module provides** with a default implementation. The host MAY invoke it and MAY replace it with an **override**. Capabilities are declared under the manifest key `module:capabilities`.

**Requirement**  
A named operation the **module requires** from the host, declared under `host:requires`. Each requirement entry uses the same structural shape as a capability declaration; the host MUST supply an implementation for every non-optional requirement at bind time.

**Override**  
A host-provided function that replaces the module's default implementation for a declared `module:capabilities` entry. Its normative signature and behavior are defined in Section 5.4.

**Listener**  
An event channel declared under `module:listeners` that the module can receive from the host. It is the host-to-module counterpart of `module:events`.

**Config**  
Host-supplied values described by `host:config`, passed when mounting or initializing the module. Config shapes parameters that the host controls; they MUST NOT be used to smuggle secrets into the module if those secrets are also available to untrusted code in the same execution context.

**Hint**  
An optional advisory object on a capability or requirement suggesting HTTP method and path. Hints are not normative; the host MAY ignore them and map invocations differently.

**Bind**  
The phase in which the host attaches handlers for `host:requires`, optionally registers **overrides** for `module:capabilities`, and the runtime validates that required requirements are satisfied and that every declared `module:capabilities` entry has a registered module-side handler.

**Mount**  
The phase in which the host invokes the module's entry logic with configuration derived from `host:config` and host policy, after a successful bind, causing the module to attach its UI to the host-provided container.

**Transport**  
The mechanism by which **requirement** invocations (`host:requires`) reach host code: in-process function calls, HTTP fetch with optional SSE parsing, or mixed bindings. Invocations of **module capabilities** by the host and host-to-module events are in-process in this version. Future mechanisms MAY include `postMessage` or WebSocket.

## 3. Architecture

### 3.1 Module

A module is an encapsulated web UI component that declares its contract through a manifest and implements default behavior for `module:capabilities`.

A module MUST ship a manifest conforming to Section 4.

A module MUST register handlers for every key in `module:capabilities` before bind completes (typically via an internal registration API such as `_registerCapabilities()`).

A module MUST NOT import, embed, or reference authentication credentials, API keys, tokens, or host-specific configuration intended to grant privileged backend access. Such data SHALL reside only in the host or proxy layer.

### 3.2 Host Application

The host integrates one or more modules and supplies the runtime with handlers for `host:requires`.

The host MUST provide handlers for every `host:requires` entry where `optional` is false or omitted (see Section 5.1).

The host MAY call module capabilities through the protocol runtime (for example `wmcpClient.call()`), which applies **dynamic dispatch** through the override chain when an override is present.

The host SHOULD inject authentication and authorization headers (or equivalent transport credentials) through the proxy or transport layer for requirement invocations rather than exposing them to module source code.

### 3.3 Proxy Layer

When HTTP is used for `host:requires`, a proxy layer (which MAY be implemented as part of the host's backend or a dedicated gateway) translates invocations into HTTP requests toward origin APIs.

The proxy layer MUST inject authentication credentials required by those APIs.

The proxy layer MUST NOT forward raw credentials to the module's execution context or include them in responses visible to the module beyond what the security model explicitly allows (ideally, none).

### 3.4 Protocol Relationship

wMCP is a **bidirectional** protocol: module-to-host capability calls (requirements), host-to-module capability calls (with optional overrides), module-to-host events (`module:events`), and host-to-module events (`module:listeners`) together form the interaction surface. The conceptual relationship parallels class inheritance: the module supplies defaults; the host may wrap them with `superFn` (Section 5.4).

## 4. Manifest Schema

The manifest is a JSON object. Field names are case-sensitive. Unless stated otherwise, omitted OPTIONAL fields have the default values described in the relevant subsection.

### 4.1 `wmcp` (REQUIRED)

- **Type:** string  
- **Semantics:** Protocol version identifier.  
- **Requirements:** The value MUST be a version supported by the implementation. For this draft, the only defined value is `"1.0"`. Implementations receiving an unsupported value MUST NOT proceed with bind without explicit error or version negotiation outside the scope of this document.

### 4.2 `module` (REQUIRED)

- **Type:** object  
- **Fields:**
  - `name` (REQUIRED): string. Logical package or module name. It SHOULD follow npm package naming conventions (lowercase, URL-safe, scoped names allowed with `/`).
  - `version` (REQUIRED): string. MUST be a valid semantic version string per the Semantic Versioning specification as commonly applied in JavaScript ecosystems.
  - `description` (OPTIONAL): string. Human-readable summary.

### 4.3 `mount` (REQUIRED)

- **Type:** object  
- **Fields:**
  - `entry` (REQUIRED): string. Path or URL to the module's JavaScript (or equivalent) entry point relative to the package root or as resolved by the host's bundler.
  - `styles` (OPTIONAL): string. Path or URL to a CSS file associated with the module.
  - `defaultElementId` (OPTIONAL): string. Identifier of a DOM element, if any, that the host SHOULD create or reserve as the default mount container when the host does not override it.

### 4.4 `module:capabilities` (REQUIRED)

- **Type:** object whose keys are capability names and values are Capability objects (`Record<string, Capability>`).  
- **Semantics:** Operations the **module provides** with a default implementation. The host MAY invoke them and MAY override them.  
- **Key conventions:** Names SHOULD use the form `namespace:action` (e.g., `doc:save`, `fs:list`) to reduce collisions across vendors and domains.

Each **Capability** object has the following members:

| Member        | Presence   | Type / Values | Semantics |
|---------------|------------|---------------|-----------|
| `description` | REQUIRED   | string        | Human-readable explanation of the capability. |
| `mode`        | REQUIRED   | `"request"` \| `"stream"` | Unary call versus streaming response. |
| `optional`    | OPTIONAL   | boolean       | Default `false`. When applied to a **module-provided** capability, semantics are defined by the implementation (for example, whether the host may omit calling it); for **requirements** (`host:requires`), see Section 5.1. |
| `params`      | OPTIONAL   | `Record<string, ParamDef>` | Named parameters. |
| `returns`     | OPTIONAL   | TypeDef       | Declared result type for request mode; for stream mode, implementations MAY interpret as element type of the stream. |
| `hint`        | OPTIONAL   | object        | Advisory HTTP mapping; primarily useful on `host:requires` entries; see below. |

The **hint** object, when present, SHOULD contain:

- `method`: string (e.g., HTTP method name in uppercase).  
- `path`: string (e.g., URL template or path).

Hints are advisory only; the host MAY ignore them entirely.

Each **ParamDef** object:

| Member        | Presence   | Type / Values | Semantics |
|---------------|------------|---------------|-----------|
| `type`        | REQUIRED   | `"string"` \| `"number"` \| `"boolean"` \| `"object"` \| `"array"` \| `"blob"` | Parameter type classification. |
| `required`    | OPTIONAL   | boolean       | Default `false`. If `true`, the parameter MUST be present and satisfy type and enum constraints when the operation is invoked. |
| `description` | OPTIONAL   | string        | Documentation. |
| `enum`        | OPTIONAL   | array         | If present, the value MUST be one of the listed elements after coercion rules defined by the implementation. |

Each **TypeDef** object:

| Member        | Presence   | Type / Values | Semantics |
|---------------|------------|---------------|-----------|
| `type`        | REQUIRED   | `"string"` \| `"number"` \| `"boolean"` \| `"object"` \| `"array"` \| `"void"` \| `"blob"` | Declared type. |
| `description` | OPTIONAL | string        | Documentation. |

### 4.5 `host:requires` (OPTIONAL)

- **Type:** `Record<string, Capability>` (same object shape as Section 4.4).  
- **Semantics:** Operations the **module requires** the host to implement. Invocations from the module toward these names use the transport bindings supplied at `connect()` / `connectDirect()` (Section 6).

If `optional` is false or omitted on a requirement, the host MUST register a handler before bind completes.

### 4.6 `module:events` (OPTIONAL)

- **Type:** `Record<string, Event>`.  
- **Semantics:** Notifications emitted **from the module toward the host**.

Each **Event** object:

| Member        | Presence   | Type | Semantics |
|---------------|------------|------|-----------|
| `description` | REQUIRED   | string | Human-readable description of when the event fires. |
| `data`        | REQUIRED   | `Record<string, TypeDef>` | Named fields of the event payload and their types. |

### 4.7 `module:listeners` (OPTIONAL)

- **Type:** `Record<string, Event>` (same shape as Section 4.6).  
- **Semantics:** Notifications the **host may emit toward the module**. The module subscribes via the same subscription API used for host-side `module:events` listeners, as defined by the implementation (for example `on()`).

### 4.8 `host:config` (OPTIONAL)

- **Type:** `Record<string, ConfigParam>`.

Each **ConfigParam** object:

| Member        | Presence   | Type / Values | Semantics |
|---------------|------------|---------------|-----------|
| `type`        | REQUIRED   | `"string"` \| `"number"` \| `"boolean"` \| `"array"` \| `"object"` | Configuration value kind. |
| `required`    | OPTIONAL   | boolean       | Default `false`. If `true`, the host MUST supply a value at mount or initialization unless a `default` is defined. |
| `default`     | OPTIONAL   | any JSON value compatible with `type` | Default if the host omits the key. |
| `enum`        | OPTIONAL   | array         | Allowed values when applicable. |
| `description` | OPTIONAL   | string        | Documentation. |

## 5. Requirements, Capabilities, Overrides, and Binding

### 5.1 Required vs Optional `host:requires`

If `optional` on a `host:requires` entry is false or undefined, the requirement is **required**. The host MUST register a handler for every required requirement before the module invokes that requirement through the client.

If the host fails to provide a handler for a required requirement, the runtime MUST throw **WmcpBindError** (Section 8.2) at bind time.

If `optional` is true, the host MAY omit a handler. The module MUST use runtime introspection (e.g., `client.has(requirementName)`) before relying on optional requirements.

### 5.2 `module:capabilities` Registration

For every key declared in `module:capabilities`, the module MUST register a default implementation before bind validation succeeds. If a declared capability has no registered module handler at bind time, the runtime MUST throw **WmcpBindError** (Section 8.2) identifying the missing registration.

### 5.3 Bind-time Validation

Validation MUST occur when `connect()`, `connectDirect()`, or the implementation's equivalent bind API is invoked.

The runtime MUST verify:

- Every required `host:requires` entry has a host handler.  
- Every `module:capabilities` key has a registered module handler.

Additional validation (parameter schemas, event names) MAY occur at bind time or at first use; implementations SHOULD document their behavior.

### 5.4 Override Semantics

The host MAY replace a module's default implementation for a name declared in `module:capabilities` by registering an **override** after constructing **WmcpHost** and before or during bind, as specified by the implementation (for example `override(name, fn)`).

The override function MUST conform to the following contract:

- **Signature:** `(params, superFn) => result` (or the language-appropriate async equivalent returning a Promise for `mode: "request"`, or an async iterable for `mode: "stream"`).  
- **params:** The invocation parameters supplied by the host (or runtime) when the capability is called.  
- **superFn:** A callable reference to the **module's default implementation** for the same capability.

The host override MAY call `superFn` with the same or modified parameters, MAY modify the return value, or MAY skip calling `superFn` entirely.

**Dynamic dispatch:** When the host (or module-exposed client) invokes a capability through the protocol entry point (for example `wmcpClient.call(name, params)`), the implementation MUST route the call through the override chain: if an override exists, it runs and receives `superFn`; otherwise the module default runs directly.

Direct calls to module methods (for example `this.someMethod()`) on the module instance bypass the override chain unless the implementation explicitly wires them through the client; conforming modules SHOULD document which entry points participate in dynamic dispatch.

**Chaining depth:** This specification defines a **single** level: module default plus at most one host override. Multi-level override chains (override of an override) are NOT REQUIRED and MAY be rejected by implementations.

If the host attempts to override a name not declared in `module:capabilities`, the runtime MUST throw **WmcpOverrideError** (Section 8.3).

### 5.5 Graceful Degradation

A module MAY call `client.has(name)` (or equivalent) before invoking an optional `host:requires` entry.

If the requirement is unavailable, the module SHOULD degrade gracefully (e.g., disable UI affordances, use local-only behavior, or show an explanatory state) rather than assuming the handler exists.

## 6. Transport

### 6.1 `host:requires`: In-process Function Calls

The `connect()` API accepts **mixed bindings**: each requirement name MAY be bound as either a **CapabilityAdapter** (HTTP-oriented; suitable for client-side request routing / CSR) or a direct **CapabilityHandler** function (in-process; suitable for SSR or server actions). The runtime distinguishes bindings as follows: if the binding is a function, it is treated as a direct handler; if the binding is an object with a `resolve` property, it is treated as an HTTP adapter. The `connectDirect()` API remains a convenience shorthand for the case where every binding is a function (all in-process handlers).

This transport MUST support handlers that return synchronously and handlers that return Promises or otherwise conform to the host language's async model.

The runtime MUST invoke requirement handlers with arguments derived from the module's `call()` or `stream()` parameters after validation as described in Section 9.3.

### 6.2 `host:requires`: HTTP Fetch

The host MAY supply **CapabilityAdapter** objects (or equivalent) that map requirement names to HTTP request construction: URL, method, headers template, and body serialization from `params`.

The host MUST ensure that required authentication and standard headers (including `Content-Type` where applicable) are applied on the outgoing request path visible to the backend, without exposing secrets to the module.

The runtime MUST use the `fetch` function (or configured equivalent) provided by the host or environment for HTTP-backed invocations, so that testing, interceptors, and corporate proxies can be honored.

**HeadersProvider:** The host configuration's `headers` field MAY be a static `Record<string, string>`, a synchronous function returning the same shape, or an asynchronous function returning a `Promise` of that shape. This allows per-request credential resolution (for example, reading API keys from the environment, refreshing tokens, or extracting session cookies in SSR contexts). The runtime MUST resolve `headers` before each HTTP request.

### 6.3 Server-Sent Events (SSE)

For requirements with `mode: "stream"`, the in-process handler MUST return an **AsyncIterable** (or language-appropriate async sequence) of chunks.

When the stream is obtained over HTTP, the runtime SHOULD parse payloads in SSE form: lines beginning with `data:`, and a conventional end-of-stream marker such as `[DONE]` where used by the backend, unless the implementation documents a different framing.

### 6.4 Mixed Binding for `host:requires`

The host MAY mix direct handlers and HTTP adapters in a single `connect()` invocation.

Each entry in the bindings map is a **CapabilityBinding**: either a **CapabilityHandler** (a function) or a **CapabilityAdapter** (an object with a `resolve` property).

This enables SSR/CSR-selectable fulfillment: security-sensitive requirements MAY be bound as server-side functions (such as Next.js server actions with `'use server'`), while less sensitive requirements MAY use client-side HTTP adapters.

The module is unaware of which transport backs each requirement; the same `call()` and `stream()` API applies regardless of binding type.

### 6.5 `module:capabilities` and Host-to-module Events

Invocations of `module:capabilities` by the host through the protocol runtime MUST be **in-process** in this version: the host calls into the module in the same runtime.

Delivery of `module:listeners` events from host to module MUST be **in-process** in this version.

### 6.6 Future Transports

The protocol MAY be extended with:

- **postMessage** transport for iframe-isolated modules communicating with a parent browsing context.  
- **WebSocket** transport for bidirectional real-time channels.

Such extensions MUST preserve the manifest semantics for requirements, capabilities, and events and MUST NOT weaken the credential isolation requirements in Section 9.1 unless a revised security analysis is published with the extension.

## 7. Lifecycle

The following sequence reflects the normative initialization and teardown order:

1. The module constructs **WmcpClient** (or equivalent) bound to the parsed manifest.  
2. The module registers default handlers for every `module:capabilities` key (e.g., via `_registerCapabilities()` or equivalent).  
3. The host constructs **WmcpHost** (or equivalent) with the client.  
4. The host MAY register overrides for `module:capabilities` names (Section 5.4).  
5. The host calls `connect()` or `connectDirect()` to bind `host:requires` handlers; this step triggers bind-time validation (Section 5.3).  
6. The host subscribes to `module:events` via `on()` (or equivalent); the module subscribes to `module:listeners` via `on()` (or equivalent).  
7. The host **mounts** the module (Section 2, **Mount**).  
8. **Runtime:** bidirectional requirement calls, capability calls (with dynamic dispatch), and events.  
9. **Teardown:** the host calls `destroy()` (or equivalent) on the host/client when the module is removed or the host navigates away.

Steps 5 and 6 MAY be reordered only if the implementation guarantees that no event is emitted before listeners are registered, or if the implementation buffers events; otherwise, subscribers SHOULD register before mount.

### 7.1 Mount

After a successful bind, the host invokes the module's **mount** function (or triggers the entry module's default export) with configuration options derived from `host:config` and host policy.

The module SHOULD initialize its user interface and load initial data using declared requirements only through the bound client.

### 7.2 Runtime Behavior

During runtime:

- The module invokes `host:requires` through `call()` for `mode: "request"` and `stream()` for `mode: "stream"`.  
- The host invokes `module:capabilities` through the protocol (e.g., `wmcpClient.call()`), respecting overrides.  
- The module emits `module:events` through `emit()` (or equivalent); the host receives them via `on()`.  
- The host emits `module:listeners` notifications toward the module according to the implementation; the module receives them via `on()`.

### 7.3 Event Handling

`module:events` and `module:listeners` form a bidirectional event channel. The module and the host MUST NOT assume a particular delivery order relative to capability or requirement completions unless the implementation explicitly documents ordering guarantees.

Callbacks SHOULD run asynchronously where possible to avoid re-entrancy issues and long blocking on the caller's stack.

### 7.4 Teardown

The host calls `destroy()` (or equivalent) when the module is removed or the host navigates away.

The runtime MUST remove requirement handlers, capability override state, and event subscriptions associated with that client instance.

The module SHOULD release DOM nodes, timers, subscriptions, and other resources when notified of teardown or when its mount root is detached.

## 8. Error Handling

### 8.1 WmcpError

**WmcpError** is the abstract base class for all errors signaled by conforming implementations.

All wMCP-specific errors MUST extend `WmcpError` (or carry equivalent type discrimination in languages without class inheritance).

### 8.2 WmcpBindError

Thrown when bind-time validation fails because:

- a required `host:requires` entry has no host handler, or  
- a key in `module:capabilities` has no registered module handler.

The error object MUST identify the **name** (manifest key) and SHOULD distinguish **host**-side missing handlers from **module**-side missing registrations when the implementation supports both cases.

### 8.3 WmcpOverrideError

Thrown when the host attempts to override a capability name that is **not** declared in `module:capabilities`.

The error object MUST include the **capability name**.

### 8.4 WmcpApiError

Thrown when an HTTP-backed **requirement** invocation receives a non-success HTTP status or when the adapter treats the response as a failure.

The error object MUST include the **HTTP status code** and SHOULD include a representation of the **response body** (or a truncated safe excerpt) for diagnostics.

### 8.5 WmcpValidationError

Thrown when invocation parameters fail validation: missing required parameters, wrong `type`, or value not in `enum` when `enum` is declared.

The error SHOULD identify the parameter name and the nature of the failure.

## 9. Security Considerations

### 9.1 API Key Isolation

The host MUST NOT pass API keys, bearer tokens, cookies, or other secrets to the module as part of `host:config`, props, or global variables if the module code is not fully trusted at the same level as the host.

All credentials MUST be applied at the proxy or transport layer on the host-controlled side of the boundary. **Requirement** invocations (`host:requires`) SHOULD go through host-controlled proxies or server-side handlers so that secrets are not embedded in the module.

### 9.2 CORS

When using HTTP transport from a browser, cross-origin restrictions apply. The host's proxy SHOULD terminate or relay requests such that the browser same-origin policy is satisfied for the module's origin, or the host SHOULD use server-side fetch that is not subject to the module's CORS view.

Modules MUST NOT perform direct cross-origin fetches to privileged backend APIs unless those APIs are explicitly designed for public, unauthenticated access.

### 9.3 Input Validation

The runtime SHOULD validate `call()` and `stream()` arguments against `params` in the manifest before invoking handlers.

The host SHOULD validate and sanitize all data received from modules (including `module:events` payloads) before using it in security-sensitive operations such as database queries, file paths, or HTML injection contexts.

## 10. Extensibility

Implementations MAY define additional top-level manifest fields prefixed with `x-` (e.g., `x-vendorFeature`) for private agreements between specific hosts and modules.

Conforming implementations MUST ignore unknown top-level fields that they do not recognize, except fields explicitly reserved by a future version of this specification.

Nested extension points within standard objects SHOULD use the same `x-` prefix convention to avoid collisions with future standard keys.

---

## Informative References

- Bradner, S., "Key words for use in RFCs to Indicate Requirement Levels", BCP 14, RFC 2119, March 1997.  
- Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words", BCP 14, RFC 8174, May 2017.
