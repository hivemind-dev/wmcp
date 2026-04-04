# wMCP and the Class Analogy

wMCP models the relationship between a **module** and its **host** the same way object-oriented languages model the relationship between a **base class** and a **derived class**. This document maps every wMCP concept to its OOP counterpart so developers familiar with inheritance, polymorphism, and the template-method pattern can build an immediate mental model.

---

## 1. Side-by-side mapping

| OOP Concept | wMCP Equivalent | Manifest Key | Direction |
|---|---|---|---|
| Base class | Module (sub-project) | -- | -- |
| Derived class | Host (top-project) | -- | -- |
| Concrete method (overridable) | Capability | `module:capabilities` | Host calls module |
| Abstract method (must be implemented) | Requirement | `host:requires` | Module calls host |
| Optional abstract method | Optional requirement | `host:requires` + `optional: true` | Module calls host |
| `super()` call | `superFn(params)` in override handler | -- | -- |
| Method override | `host.override(name, handler)` | -- | -- |
| Constructor args | Config | `host:config` | Host -> module at mount |
| Observer / event callback | Event | `module:events` | Module -> host |
| Parent notification | Listener | `module:listeners` | Host -> module |
| Interface / contract | Manifest | `manifest.json` | Declared by module |
| Instantiation | `new CounterModule()` + mount | -- | -- |
| Destruction | `host.destroy()` + `client.destroy()` | -- | -- |

---

## 2. The class diagram

```
  ┌─────────────────────────────────────┐
  │  CounterModule  (base class)        │
  ├─────────────────────────────────────┤
  │ - value: number                     │   private state
  ├─────────────────────────────────────┤
  │ + counter:get()        → {value}    │   concrete method
  │ + counter:increment(n) → {value}    │   concrete method (overridable)
  ├─────────────────────────────────────┤
  │ # persist:load()       → {value}    │   abstract (host must implement)
  │ # persist:save(value)  → {ok}       │   abstract (host must implement)
  │ # log:write(action)    → void       │   optional abstract
  ├─────────────────────────────────────┤
  │ ~ counter:changed  ──→  host        │   event (outbound)
  │ ~ counter:reset    ←──  host        │   listener (inbound)
  └─────────────────────────────────────┘
                    ▲
                    │  extends / overrides
                    │
  ┌─────────────────────────────────────┐
  │  HostApp  (derived class)           │
  ├─────────────────────────────────────┤
  │ + counter:increment(n, superFn)     │   override with super()
  ├─────────────────────────────────────┤
  │ # persist:load()  = db.get(...)     │   abstract impl (in-process)
  │ # persist:save(v) = db.set(...)     │   abstract impl (in-process)
  │ # log:write(a)    = logger.info(a)  │   optional impl
  └─────────────────────────────────────┘
```

---

## 3. Capabilities = concrete methods

In OOP a base class declares methods with default implementations. Subclasses can call them as-is or override them.

In wMCP the module declares `module:capabilities` and registers default handlers. The host can call them via `host.call()` or override them via `host.override()`.

**OOP:**

```typescript
class Counter {
  protected value = 0;

  increment(amount = 1): number {
    this.value += amount;
    return this.value;
  }
}
```

**wMCP:**

```typescript
this.wmcpClient._registerCapabilities({
  'counter:increment': async (params) => {
    this.value += (params.amount as number) ?? 1;
    return { value: this.value };
  },
});
```

The host calls the capability the same way calling code invokes a method:

```typescript
// OOP
const result = counter.increment(5);

// wMCP
const result = await host.call('counter:increment', { amount: 5 });
```

---

## 4. Requirements = abstract methods

In OOP a base class declares abstract methods that subclasses must implement. The base class calls them without knowing the implementation.

In wMCP the module declares `host:requires` and calls them via `wmcpClient.call()`. The host must provide implementations at bind time.

**OOP:**

```typescript
abstract class Counter {
  protected abstract persistSave(value: number): Promise<void>;

  async increment(amount = 1) {
    this.value += amount;
    await this.persistSave(this.value);   // call abstract
    return this.value;
  }
}

class AppCounter extends Counter {
  protected async persistSave(value: number) {
    await db.set('counter', value);       // concrete impl
  }
}
```

**wMCP:**

```typescript
// Module calls host:requires (like calling an abstract method)
await this.wmcpClient.call('persist:save', { value: this.value });

// Host provides the implementation
host.connectDirect({
  'persist:save': async (params) => {
    await db.set('counter', params.value);
    return { success: true };
  },
});
```

Optional requirements (`optional: true`) are like optional abstract methods with a default no-op. The module checks `wmcpClient.has('log:write')` before calling, just as a base class might check whether an optional hook is implemented.

---

## 5. Override = method override with super()

In OOP a derived class overrides a method and can call `super.method()` to invoke the base implementation.

In wMCP the host calls `host.override(name, handler)` where the handler receives `(params, superFn)`. Calling `superFn(params)` delegates to the module's default.

**OOP:**

```typescript
class AppCounter extends Counter {
  increment(amount = 1): number {
    if (amount > 100) throw new Error('Too large');
    const result = super.increment(amount);   // super()
    analytics.track('increment', result);
    return result;
  }
}
```

**wMCP:**

```typescript
host.override('counter:increment', async (params, superFn) => {
  if ((params.amount as number) > 100) throw new Error('Too large');
  const result = await superFn(params);       // super()
  analytics.track('increment', result);
  return result;
});
```

### Dynamic dispatch

In OOP, if the base class internally calls `this.increment()`, the overridden version runs (virtual dispatch). wMCP works the same way: when the module internally calls `wmcpClient.call('counter:increment')`, the override chain executes. Direct private calls (`this.value += n`) bypass the override, just like calling a private method in OOP.

| Call site | OOP | wMCP |
|---|---|---|
| External (host/caller) | `obj.increment()` | `host.call('counter:increment')` |
| Internal (virtual dispatch) | `this.increment()` | `wmcpClient.call('counter:increment')` |
| Internal (bypass override) | direct field access | `this.value += n` (private) |

---

## 6. Config = constructor arguments

In OOP a derived class passes arguments to the base constructor. In wMCP the host passes `host:config` values at mount time.

**OOP:**

```typescript
class AppCounter extends Counter {
  constructor() {
    super({ initialValue: 10, step: 2 });
  }
}
```

**wMCP:**

```typescript
await counter.mount({ config: { initialValue: 10, step: 2 } });
```

---

## 7. Events and listeners = observer pattern

### module:events = outbound observer callbacks

When a base class emits state changes for external observers to react to.

**OOP:**

```typescript
class Counter extends EventEmitter {
  increment(n: number) {
    this.value += n;
    this.emit('changed', { value: this.value });
  }
}

counter.on('changed', (data) => console.log(data));
```

**wMCP:**

```typescript
// Module emits
this.wmcpClient.emit('counter:changed', { value: this.value });

// Host listens
host.on('counter:changed', (data) => console.log(data));
```

### module:listeners = inbound parent notifications

When a parent/container pushes notifications down into the object.

**OOP:**

```typescript
class Counter {
  onReset() {
    this.value = 0;
  }
}

// Parent calls
counter.onReset();
```

**wMCP:**

```typescript
// Module subscribes
this.wmcpClient.on('counter:reset', () => { this.value = 0; });

// Host emits
host.emit('counter:reset', {});
```

---

## 8. Manifest = interface / type contract

In OOP an interface declares what methods exist, their parameter types, and return types. The class implements it.

In wMCP the manifest declares capabilities, requirements, events, listeners, and config with typed parameter and return definitions. The module and host implement them.

**OOP:**

```typescript
interface ICounter {
  // provided by class
  increment(amount?: number): { value: number };
  get(): { value: number };

  // required from environment
  persistSave(value: number): { success: boolean };
  persistLoad(): { value: number };
}
```

**wMCP manifest:**

```json
{
  "module:capabilities": {
    "counter:increment": { "params": { "amount": { "type": "number" } }, "returns": { "type": "object" } },
    "counter:get": { "returns": { "type": "object" } }
  },
  "host:requires": {
    "persist:save": { "params": { "value": { "type": "number" } }, "returns": { "type": "object" } },
    "persist:load": { "returns": { "type": "object" } }
  }
}
```

Both serve the same purpose: a **declarative contract** that tooling, validators, and AI agents can consume without reading implementation code.

---

## 9. Lifecycle = construction, wiring, runtime, destruction

| Phase | OOP | wMCP |
|---|---|---|
| Declare contract | `interface ICounter` | `manifest.json` |
| Base implementation | `class Counter implements ICounter` | `CounterModule` + `_registerCapabilities()` |
| Subclass / extend | `class App extends Counter` | `host.override()` |
| Wire abstracts | constructor dependency injection | `host.connectDirect()` / `host.connect()` |
| Validate | compile-time type checks | bind-time validation (all requires bound) |
| Initialize | `new AppCounter(config)` | `new CounterModule()` + `counter.mount(config)` |
| Runtime | method calls + events | `host.call()` + `wmcpClient.call()` + events |
| Destruction | `dispose()` / GC | `host.destroy()` + `client.destroy()` |

---

## 10. Where the analogy breaks

wMCP is not a class system. The table below notes the intentional differences.

| OOP Feature | wMCP Behaviour | Reason |
|---|---|---|
| Multi-level inheritance | Single level: module default + host override | Keeps dispatch predictable across network/process boundaries |
| Compile-time type safety | Runtime validation at bind time | Modules and hosts may ship independently |
| Synchronous calls | All calls are async (`Promise`) | Supports HTTP, postMessage, and streaming transports |
| In-process only | Transport-agnostic (in-process, HTTP, future WebSocket) | Module and host may run in different runtimes |
| Tight coupling | Manifest as loose contract | Module is reusable across many hosts without recompilation |
| Access modifiers (private/protected) | Only `module:capabilities` is callable; internal state is opaque | Security: host cannot read module internals directly |

---

## 11. Full example side by side

### OOP version

```typescript
abstract class Counter {
  protected value = 0;

  constructor(protected config: { initialValue: number }) {
    this.value = config.initialValue;
  }

  increment(amount = 1): number {
    this.value += amount;
    this.persistSave(this.value);
    this.onChange(this.value);
    return this.value;
  }

  get(): number {
    return this.value;
  }

  protected abstract persistSave(v: number): Promise<void>;
  protected abstract persistLoad(): Promise<number>;
  protected onChange(v: number): void { /* observer hook */ }
}

class AppCounter extends Counter {
  async persistSave(v: number) { await db.set('counter', v); }
  async persistLoad() { return (await db.get('counter')) ?? 0; }

  // override
  increment(amount = 1): number {
    if (amount > 100) throw new Error('Too large');
    return super.increment(amount);
  }
}

const counter = new AppCounter({ initialValue: 0 });
counter.increment(5);
```

### wMCP version

```typescript
// --- Module (base class) ---
class CounterModule {
  private value = 0;
  public readonly wmcpClient: WmcpClient;

  constructor() {
    this.wmcpClient = new WmcpClient(manifest);
    this.wmcpClient._registerCapabilities({
      'counter:get':       async () => ({ value: this.value }),
      'counter:increment': async (p) => {
        this.value += (p.amount as number) ?? 1;
        await this.wmcpClient.call('persist:save', { value: this.value });
        this.wmcpClient.emit('counter:changed', { value: this.value });
        return { value: this.value };
      },
    });
  }
  async mount(opts?: WmcpMountOptions) {
    const saved = await this.wmcpClient.call<{value:number}>('persist:load');
    this.value = saved.value;
  }
}

// --- Host (derived class) ---
const counter = new CounterModule();
const host = new WmcpHost(counter.wmcpClient);

host.override('counter:increment', async (params, superFn) => {
  if ((params.amount as number) > 100) throw new Error('Too large');
  return superFn(params);
});

host.connectDirect({
  'persist:load': async () => ({ value: await db.get('counter') ?? 0 }),
  'persist:save': async (p) => { await db.set('counter', p.value); return { success: true }; },
});

host.on('counter:changed', (d) => console.log('changed', d));

await counter.mount({ config: { initialValue: 0 } });
await host.call('counter:increment', { amount: 5 });
```

The structure is the same: declare a contract, provide defaults, let the host extend and wire dependencies. wMCP adds transport flexibility and manifest-driven validation on top of the familiar pattern.
