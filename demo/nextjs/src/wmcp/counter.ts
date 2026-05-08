import { WmcpClient, type WmcpManifest, type WmcpMountOptions } from "@aurorah/wmcp";

export const counterManifest: WmcpManifest = {
  wmcp: "1.0",
  module: {
    name: "@demo/counter",
    version: "1.0.0",
    description: "Simple counter module for CSR/SSR demonstration",
  },
  mount: { entry: "index.ts" },
  "module:capabilities": {
    "counter:get": {
      description: "Get the current counter value",
      mode: "request",
      returns: { type: "object", description: "{ value: number }" },
    },
    "counter:increment": {
      description: "Increment the counter",
      mode: "request",
      params: { amount: { type: "number", required: false } },
      returns: { type: "object", description: "{ value: number }" },
    },
    "counter:decrement": {
      description: "Decrement the counter",
      mode: "request",
      params: { amount: { type: "number", required: false } },
      returns: { type: "object", description: "{ value: number }" },
    },
    "counter:reset": {
      description: "Reset the counter to zero",
      mode: "request",
      returns: { type: "object", description: "{ value: number }" },
    },
  },
  "module:events": {
    "counter:changed": {
      description: "Fired when the counter value changes",
      data: { value: { type: "number" } },
    },
  },
  "module:listeners": {},
  "host:requires": {
    "persist:load": {
      description: "Load saved counter value from backend",
      mode: "request",
      returns: { type: "object", description: "{ value: number }" },
      hint: { method: "GET", path: "/api/counter" },
    },
    "persist:save": {
      description: "Save counter value to backend",
      mode: "request",
      params: { value: { type: "number", required: true } },
      returns: { type: "object", description: "{ value: number }" },
      hint: { method: "POST", path: "/api/counter" },
    },
  },
  "host:config": {},
};

export class CounterModule {
  public readonly wmcpClient: WmcpClient;
  private value = 0;

  constructor() {
    this.wmcpClient = new WmcpClient(counterManifest);
    this.wmcpClient._requireReadiness();

    this.wmcpClient._registerCapabilities({
      "counter:get": async () => ({ value: this.value }),

      "counter:increment": async (params) => {
        this.value += (params.amount as number) ?? 1;
        await this.wmcpClient.call("persist:save", { value: this.value });
        this.wmcpClient.emit("counter:changed", { value: this.value });
        return { value: this.value };
      },

      "counter:decrement": async (params) => {
        this.value -= (params.amount as number) ?? 1;
        await this.wmcpClient.call("persist:save", { value: this.value });
        this.wmcpClient.emit("counter:changed", { value: this.value });
        return { value: this.value };
      },

      "counter:reset": async () => {
        this.value = 0;
        await this.wmcpClient.call("persist:save", { value: 0 });
        this.wmcpClient.emit("counter:changed", { value: 0 });
        return { value: 0 };
      },
    });
  }

  async mount(_options?: WmcpMountOptions): Promise<void> {
    const saved = await this.wmcpClient.call<{ value: number }>("persist:load");
    this.value = saved.value;

    this.wmcpClient._setReady();
  }

  getValue(): number {
    return this.value;
  }
}
