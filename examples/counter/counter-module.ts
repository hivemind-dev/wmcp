/**
 * @aurorah/wmcp-counter — Minimal sub-module example
 *
 * The module owns the counter state and logic.  It registers capability
 * handlers for counter:get and counter:increment, emits counter:changed
 * events, listens for counter:reset from the host, and calls host:requires
 * (persist:load, persist:save, optional log:write) for backend persistence.
 */

import { WmcpClient } from '../../src/core/client.js';
import type { WmcpManifest, WmcpMountOptions } from '../../src/core/types.js';
import manifest from './manifest.json';

export class CounterModule {
  public readonly wmcpClient: WmcpClient;
  private value = 0;

  constructor() {
    this.wmcpClient = new WmcpClient(manifest as unknown as WmcpManifest);

    this.wmcpClient._registerCapabilities({
      'counter:get': async () => ({ value: this.value }),

      'counter:increment': async (params) => {
        const amount = (params.amount as number) ?? 1;
        this.value += amount;

        await this.persist();
        await this.log('increment', { amount, value: this.value });

        this.wmcpClient.emit('counter:changed', { value: this.value, source: 'user' });
        return { value: this.value };
      },
    });

    this.wmcpClient.on('counter:reset', () => {
      this.value = 0;
      this.persist();
      this.log('reset', { value: 0 });
      this.wmcpClient.emit('counter:changed', { value: 0, source: 'reset' });
    });
  }

  async mount(options?: WmcpMountOptions): Promise<void> {
    this.value = (options?.config?.initialValue as number) ?? 0;

    const saved = await this.wmcpClient.call<{ value: number }>('persist:load');
    this.value = saved.value;
    console.log(`[CounterModule] Mounted. Restored value: ${this.value}`);
  }

  getValue(): number {
    return this.value;
  }

  private async persist(): Promise<void> {
    await this.wmcpClient.call('persist:save', { value: this.value });
  }

  private async log(action: string, detail?: Record<string, unknown>): Promise<void> {
    if (this.wmcpClient.has('log:write')) {
      await this.wmcpClient.call('log:write', { action, detail });
    }
  }
}

export { manifest };
