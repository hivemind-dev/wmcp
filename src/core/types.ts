/**
 * wMCP — Web Module Connection Protocol
 * Core type definitions
 */

// ============================================
// Manifest Schema
// ============================================

export interface WmcpManifest {
  /** Protocol version (e.g. "1.0") */
  wmcp: string;

  /** Module identity */
  module: WmcpModuleInfo;

  /** How the module mounts into the DOM */
  mount: WmcpMountConfig;

  /** Capabilities the module provides (callable and overridable by the host) */
  'module:capabilities': Record<string, WmcpCapability>;

  /** Events the module emits to the host */
  'module:events'?: Record<string, WmcpEvent>;

  /** Events the module listens for from the host */
  'module:listeners'?: Record<string, WmcpEvent>;

  /** Capabilities the module requires from the host */
  'host:requires'?: Record<string, WmcpCapability>;

  /** Configuration the host supplies at mount time */
  'host:config'?: Record<string, WmcpConfigParam>;
}

export interface WmcpModuleInfo {
  /** Package name (e.g. "@aurorah/wmcp-rich-editor") */
  name: string;

  /** Semver version */
  version: string;

  /** Human-readable description */
  description?: string;
}

export interface WmcpMountConfig {
  /** Entry point file relative to package root */
  entry: string;

  /** CSS file to load */
  styles?: string;

  /** Default container element ID */
  defaultElementId?: string;
}

// ============================================
// Capabilities
// ============================================

export interface WmcpCapability {
  /** Human-readable description (useful for AI and docs) */
  description: string;

  /** Whether this capability is optional. Default: false (required) */
  optional?: boolean;

  /** Request/response mode */
  mode: 'request' | 'stream';

  /** Parameter definitions */
  params?: Record<string, WmcpParamDef>;

  /** Return type definition */
  returns?: WmcpTypeDef;

  /** Advisory HTTP mapping hint (primarily useful on host:requires entries) */
  hint?: WmcpHint;
}

export interface WmcpParamDef {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'blob';
  required?: boolean;
  description?: string;
  enum?: unknown[];
}

export interface WmcpTypeDef {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'void' | 'blob';
  description?: string;
}

export interface WmcpHint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
}

// ============================================
// Events
// ============================================

export interface WmcpEvent {
  /** Human-readable description */
  description: string;

  /** Data shape emitted with the event */
  data: Record<string, WmcpTypeDef>;
}

// ============================================
// Config
// ============================================

export interface WmcpConfigParam {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  default?: unknown;
  enum?: unknown[];
  description?: string;
}

// ============================================
// Runtime Types
// ============================================

/** Handler function for a capability (module default or host:requires implementation) */
export type CapabilityHandler = (
  params: Record<string, unknown>,
) => Promise<unknown> | AsyncIterable<unknown>;

/**
 * Override handler the host provides to replace a module capability.
 * Receives the invocation params and a reference to the module's default
 * implementation (superFn) so the host can wrap, extend, or fully replace
 * the behaviour while retaining access to the original.
 */
export type OverrideHandler = (
  params: Record<string, unknown>,
  superFn: CapabilityHandler,
) => Promise<unknown> | AsyncIterable<unknown>;

/** Callback for event subscriptions */
export type EventCallback = (data: unknown) => void;

/** Adapter definition used by WmcpHost to map host:requires to HTTP endpoints (CSR) */
export interface CapabilityAdapter {
  /** Resolves params into an HTTP request shape */
  resolve: (params: Record<string, unknown>) => {
    method: string;
    path: string;
    body?: unknown;
    query?: Record<string, string>;
  };
  /** If true, the response is treated as an SSE stream */
  stream?: boolean;
}

/**
 * A host:requires binding can be either:
 * - A CapabilityAdapter object (CSR: resolved to HTTP fetch through proxy)
 * - A CapabilityHandler function (SSR: direct server action or in-memory handler)
 */
export type CapabilityBinding = CapabilityAdapter | CapabilityHandler;

/** Static headers or a sync/async function that returns headers per request */
export type HeadersProvider =
  | Record<string, string>
  | (() => Record<string, string>)
  | (() => Promise<Record<string, string>>);

/** Configuration for WmcpHost */
export interface WmcpHostConfig {
  /** Base URL for HTTP-backed host:requires requests (typically a same-origin proxy) */
  baseUrl?: string;

  /**
   * Headers to inject into HTTP-backed host:requires requests.
   * Can be a static object or a sync/async function for per-request headers.
   *
   * IMPORTANT: This is intended for SSR / server-side proxy contexts where
   * credentials stay on the server. In browser (CSR) code, use a same-origin
   * proxy route instead — the proxy injects auth server-side so secrets never
   * reach the client.
   */
  headers?: HeadersProvider;

  /** Custom fetch implementation (defaults to globalThis.fetch) */
  fetch?: typeof globalThis.fetch;
}

/** Mount options passed to the sub-module's mount function */
export interface WmcpMountOptions {
  /** Runtime configuration values */
  config?: Record<string, unknown>;
}
