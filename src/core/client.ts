/**
 * wMCP — Web Module Connection Protocol
 * WmcpClient — lives inside the sub-module.
 *
 * The module registers its own capability handlers (default implementations).
 * The host may override those handlers and must provide handlers for
 * host:requires entries.  The client dispatches calls through the override
 * chain (override → module default) for module:capabilities and directly
 * to host-provided handlers for host:requires.
 */

import type {
  WmcpManifest,
  CapabilityHandler,
  OverrideHandler,
  EventCallback,
} from './types.js';
import { WmcpError, WmcpBindError } from './errors.js';
import { validateParams } from './validator.js';
import { isAsyncIterable } from '../utils/stream.js';

export class WmcpClient {
  public readonly manifest: WmcpManifest;

  /** Module's own default implementations for module:capabilities */
  private moduleHandlers = new Map<string, CapabilityHandler>();

  /** Host overrides for module:capabilities (receives superFn) */
  private overrideHandlers = new Map<string, OverrideHandler>();

  /** Host-provided implementations for host:requires */
  private requiresHandlers = new Map<string, CapabilityHandler>();

  /** module:events — module emits, host listens */
  private hostEventListeners = new Map<string, Set<EventCallback>>();

  /** module:listeners — host emits, module listens */
  private moduleEventListeners = new Map<string, Set<EventCallback>>();

  private bound = false;

  constructor(manifest: WmcpManifest) {
    this.manifest = manifest;
  }

  // ------------------------------------------------------------------
  // Module-side registration
  // ------------------------------------------------------------------

  /**
   * Called by the module to register default implementations for every
   * capability declared in module:capabilities.
   */
  _registerCapabilities(handlers: Record<string, CapabilityHandler>): void {
    for (const [name, handler] of Object.entries(handlers)) {
      this.moduleHandlers.set(name, handler);
    }
  }

  // ------------------------------------------------------------------
  // Host-side binding (called via WmcpHost)
  // ------------------------------------------------------------------

  /**
   * Called by the host to bind host:requires handlers.
   * Validates that all required (non-optional) host:requires have handlers
   * and that all module:capabilities have module-side registrations.
   */
  _bindRequires(handlers: Record<string, CapabilityHandler>): void {
    const requires = this.manifest['host:requires'] ?? {};

    for (const [name, cap] of Object.entries(requires)) {
      if (!cap.optional && !handlers[name]) {
        throw new WmcpBindError(name, 'host');
      }
    }

    for (const [name, handler] of Object.entries(handlers)) {
      this.requiresHandlers.set(name, handler);
    }

    const capabilities = this.manifest['module:capabilities'];
    for (const name of Object.keys(capabilities)) {
      if (!this.moduleHandlers.has(name)) {
        throw new WmcpBindError(name, 'module');
      }
    }

    this.bound = true;
  }

  /**
   * Called by the host to override a module capability.
   * The override receives (params, superFn) where superFn is the module's
   * default handler.
   */
  _override(name: string, handler: OverrideHandler): void {
    this.overrideHandlers.set(name, handler);
  }

  // ------------------------------------------------------------------
  // Capability invocation (used by both module and host via WmcpHost)
  // ------------------------------------------------------------------

  /**
   * Invoke a capability (module:capabilities or host:requires).
   * Dispatch: if the name matches a module capability, the override chain
   * applies (override → module default).  If it matches a host:requires
   * entry, the host-provided handler runs directly.
   */
  async call<T = unknown>(
    capability: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    this.ensureBound();
    const handler = this.resolveHandler(capability);

    const cap =
      this.manifest['module:capabilities'][capability] ??
      this.manifest['host:requires']?.[capability];

    if (cap) {
      validateParams(capability, cap, params);
    }

    return (await handler(params)) as T;
  }

  /**
   * Invoke a stream-mode capability, returning an async generator.
   */
  async *stream<T = unknown>(
    capability: string,
    params: Record<string, unknown> = {},
  ): AsyncGenerator<T> {
    this.ensureBound();
    const handler = this.resolveHandler(capability);

    const cap =
      this.manifest['module:capabilities'][capability] ??
      this.manifest['host:requires']?.[capability];

    if (cap) {
      validateParams(capability, cap, params);
    }

    const result = handler(params);

    if (isAsyncIterable(result)) {
      for await (const chunk of result) {
        yield chunk as T;
      }
    } else {
      yield (await result) as T;
    }
  }

  /**
   * Check whether a capability or host:requires entry has a handler bound.
   */
  has(capability: string): boolean {
    return (
      this.moduleHandlers.has(capability) ||
      this.requiresHandlers.has(capability)
    );
  }

  // ------------------------------------------------------------------
  // Events: module:events (module → host)
  // ------------------------------------------------------------------

  /** Module emits an event to the host. */
  emit(event: string, data: unknown): void {
    const listeners = this.hostEventListeners.get(event);
    if (listeners) {
      for (const cb of listeners) {
        try {
          cb(data);
        } catch (err) {
          console.error(`[wMCP] Error in host event listener for "${event}":`, err);
        }
      }
    }
  }

  /** Host subscribes to module:events.  Returns an unsubscribe function. */
  _on(event: string, callback: EventCallback): () => void {
    if (!this.hostEventListeners.has(event)) {
      this.hostEventListeners.set(event, new Set());
    }
    this.hostEventListeners.get(event)!.add(callback);
    return () => {
      this.hostEventListeners.get(event)?.delete(callback);
    };
  }

  // ------------------------------------------------------------------
  // Events: module:listeners (host → module)
  // ------------------------------------------------------------------

  /** Module subscribes to events emitted by the host. */
  on(event: string, callback: EventCallback): () => void {
    if (!this.moduleEventListeners.has(event)) {
      this.moduleEventListeners.set(event, new Set());
    }
    this.moduleEventListeners.get(event)!.add(callback);
    return () => {
      this.moduleEventListeners.get(event)?.delete(callback);
    };
  }

  /** Host emits an event to the module (called by WmcpHost). */
  _emitToModule(event: string, data: unknown): void {
    const listeners = this.moduleEventListeners.get(event);
    if (listeners) {
      for (const cb of listeners) {
        try {
          cb(data);
        } catch (err) {
          console.error(`[wMCP] Error in module listener for "${event}":`, err);
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  destroy(): void {
    this.moduleHandlers.clear();
    this.overrideHandlers.clear();
    this.requiresHandlers.clear();
    this.hostEventListeners.clear();
    this.moduleEventListeners.clear();
    this.bound = false;
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  private resolveHandler(capability: string): CapabilityHandler {
    if (this.requiresHandlers.has(capability)) {
      return this.requiresHandlers.get(capability)!;
    }

    const moduleHandler = this.moduleHandlers.get(capability);
    if (!moduleHandler) {
      throw new WmcpError(`Capability not available: "${capability}"`);
    }

    const override = this.overrideHandlers.get(capability);
    if (override) {
      return (params) => override(params, moduleHandler) as Promise<unknown>;
    }

    return moduleHandler;
  }

  private ensureBound(): void {
    if (!this.bound) {
      throw new WmcpError(
        'WmcpClient is not bound. The host must call _bindRequires() before invoking capabilities.',
      );
    }
  }
}
