/**
 * wMCP — Web Module Connection Protocol
 * WmcpHost — used by the host application.
 *
 * The host binds host:requires handlers (things the module needs), can call
 * module:capabilities, override them with super() access, subscribe to
 * module:events, and emit module:listeners events.
 */

import type {
  WmcpHostConfig,
  CapabilityAdapter,
  CapabilityBinding,
  CapabilityHandler,
  OverrideHandler,
  HeadersProvider,
  EventCallback,
} from './types.js';
import { WmcpApiError, WmcpOverrideError } from './errors.js';
import { WmcpClient } from './client.js';
import { parseSSE } from '../utils/stream.js';

export class WmcpHost {
  private client: WmcpClient;
  private config: WmcpHostConfig;
  private fetchFn: typeof globalThis.fetch;
  private unsubscribes: Array<() => void> = [];
  private pendingOverrides: Array<{ name: string; handler: OverrideHandler }> = [];

  constructor(client: WmcpClient, config: WmcpHostConfig = {}) {
    this.client = client;
    this.config = config;
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  // ------------------------------------------------------------------
  // Bind host:requires handlers
  // ------------------------------------------------------------------

  /**
   * Bind host:requires implementations.
   *
   * Each entry can be either:
   * - A CapabilityAdapter object (CSR): resolved to HTTP fetch against a
   *   same-origin proxy — credentials are injected server-side by the proxy,
   *   NOT in browser code.
   * - A CapabilityHandler function (SSR): called directly on the server.
   */
  connect(bindings: Record<string, CapabilityBinding>): void {
    const handlers: Record<string, CapabilityHandler> = {};

    for (const [capability, binding] of Object.entries(bindings)) {
      if (typeof binding === 'function') {
        handlers[capability] = binding;
      } else {
        handlers[capability] = (params) => this.createHttpHandler(binding, params);
      }
    }

    for (const ov of this.pendingOverrides) {
      this.client._override(ov.name, ov.handler);
    }
    this.pendingOverrides = [];

    this.client._bindRequires(handlers);
  }

  /**
   * Convenience: bind all host:requires as direct functions.
   */
  connectDirect(handlers: Record<string, CapabilityHandler>): void {
    for (const ov of this.pendingOverrides) {
      this.client._override(ov.name, ov.handler);
    }
    this.pendingOverrides = [];

    this.client._bindRequires(handlers);
  }

  // ------------------------------------------------------------------
  // Call module:capabilities
  // ------------------------------------------------------------------

  /** Call a module:capabilities entry (respects override chain). */
  async call<T = unknown>(
    capability: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    return this.client.call<T>(capability, params);
  }

  /** Stream a module:capabilities entry. */
  async *stream<T = unknown>(
    capability: string,
    params: Record<string, unknown> = {},
  ): AsyncGenerator<T> {
    yield* this.client.stream<T>(capability, params);
  }

  // ------------------------------------------------------------------
  // Override module:capabilities
  // ------------------------------------------------------------------

  /**
   * Override a module capability.  The handler receives (params, superFn)
   * where superFn is the module's default implementation.
   *
   * Must be called before connect()/connectDirect().
   */
  override(capability: string, handler: OverrideHandler): void {
    const caps = this.client.manifest['module:capabilities'];
    if (!caps[capability]) {
      throw new WmcpOverrideError(capability);
    }
    this.pendingOverrides.push({ name: capability, handler });
  }

  // ------------------------------------------------------------------
  // Events: module:events (host listens)
  // ------------------------------------------------------------------

  /** Subscribe to an event emitted by the module. Returns an unsubscribe function. */
  on(event: string, callback: EventCallback): () => void {
    const unsub = this.client._on(event, callback);
    this.unsubscribes.push(unsub);
    return unsub;
  }

  // ------------------------------------------------------------------
  // Events: module:listeners (host emits)
  // ------------------------------------------------------------------

  /** Emit an event to the module (module:listeners). */
  emit(event: string, data: unknown): void {
    this.client._emitToModule(event, data);
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  destroy(): void {
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];
  }

  // ------------------------------------------------------------------
  // HTTP adapter internals (for host:requires with CapabilityAdapter)
  // ------------------------------------------------------------------

  private async resolveHeaders(provider?: HeadersProvider): Promise<Record<string, string>> {
    if (!provider) return {};
    if (typeof provider === 'function') {
      return await provider();
    }
    return provider;
  }

  private async createHttpHandler(
    adapter: CapabilityAdapter,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const { method, path, body, query } = adapter.resolve(params);

    let url = `${this.config.baseUrl ?? ''}${path}`;
    if (query) {
      const qs = new URLSearchParams(query).toString();
      if (qs) url += `?${qs}`;
    }

    const resolved = await this.resolveHeaders(this.config.headers);
    const headers: Record<string, string> = { ...resolved };

    const init: RequestInit = { method, headers };

    if (body !== undefined) {
      if (body instanceof Blob || body instanceof ArrayBuffer) {
        init.body = body as BodyInit;
      } else {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
    }

    const response = await this.fetchFn(url, init);

    if (adapter.stream) {
      return parseSSE(response);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new WmcpApiError(response.status, errorBody);
    }

    const contentType = response.headers.get('Content-Type') ?? '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    if (contentType.includes('application/octet-stream') || contentType.includes('blob')) {
      return response.blob();
    }
    return response.text();
  }
}
