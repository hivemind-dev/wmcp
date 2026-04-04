"use client";

import { useState, useEffect, useRef } from "react";
import { WmcpHost } from "@aurorah/wmcp";
import { CounterModule } from "@/wmcp/counter";
import { persistLoadAction, persistSaveAction } from "./actions";

export default function SSRPage() {
  const [value, setValue] = useState<number | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const hostRef = useRef<WmcpHost | null>(null);
  const moduleRef = useRef<CounterModule | null>(null);

  const log = (msg: string) =>
    setLogs((prev) => [
      ...prev.slice(-19),
      `[${new Date().toLocaleTimeString()}] ${msg}`,
    ]);

  useEffect(() => {
    const counter = new CounterModule();
    const host = new WmcpHost(counter.wmcpClient);

    host.connectDirect({
      "persist:load": persistLoadAction,
      "persist:save": persistSaveAction,
    });

    host.on("counter:changed", (data) => {
      const d = data as { value: number };
      setValue(d.value);
      log(`Event counter:changed -> ${d.value}`);
    });

    moduleRef.current = counter;
    hostRef.current = host;
    log("SSR bindings connected (server actions for host:requires)");

    counter.mount().then(() => {
      setValue(counter.getValue());
      log(`Mounted. Value: ${counter.getValue()}`);
    });

    return () => {
      host.destroy();
      counter.wmcpClient.destroy();
    };
  }, []);

  const invoke = async (cap: string, params?: Record<string, unknown>) => {
    const host = hostRef.current;
    if (!host) return;
    log(`host.call("${cap}")...`);
    const res = await host.call<{ value: number }>(cap, params);
    log(`${cap} -> ${res.value}`);
  };

  return (
    <div className="page-stack">
      <div>
        <h1 className="page-title">SSR Mode</h1>
        <p className="page-desc">
          Module owns counter logic. <strong>host:requires</strong> bound as{" "}
          <strong>server actions</strong> (no HTTP round-trip). Host calls{" "}
          <strong>module:capabilities</strong> via{" "}
          <code>host.call()</code>.
        </p>
      </div>

      <div className="counter-panel">
        <p className="counter-value">{value ?? "..."}</p>
        <div className="counter-buttons">
          <button onClick={() => invoke("counter:decrement")} className="btn btn-red">
            - 1
          </button>
          <button onClick={() => invoke("counter:increment")} className="btn btn-green">
            + 1
          </button>
          <button onClick={() => invoke("counter:reset")} className="btn btn-gray">
            Reset
          </button>
        </div>
      </div>

      <div className="log-panel">
        {logs.length === 0 ? (
          <span className="log-empty">waiting for events...</span>
        ) : (
          logs.map((l, i) => <div key={i}>{l}</div>)
        )}
      </div>
    </div>
  );
}
