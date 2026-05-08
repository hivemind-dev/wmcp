# Changelog

All notable changes to `@aurorah/wmcp` are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-05-08

### Added

- `WmcpClient._requireReadiness()` — opt in to readiness gating for host->module events. Should be called early in the module's lifecycle, typically right after `new WmcpClient(manifest)` in the module constructor.
- `WmcpClient._setReady()` — module signals it has finished mounting; replays buffered host->module events in FIFO order and emits the reserved `wmcp:ready` event. Idempotent.
- Reserved protocol event `wmcp:ready` — emitted by the module-side runtime exactly once per mount after `_setReady()` fires. Hosts subscribe via `host.on("wmcp:ready", cb)` to coordinate post-mount work.
- Specification additions: §7.5 "Module Readiness Gating", §7.6 "Reserved Events", and a new step 8 in the §7 lifecycle list.

### Changed

- `WmcpClient._emitToModule()` now buffers host->module events (FIFO) when the module has opted in to gating and is not yet ready; replays them on `_setReady()`. Pass-through behavior is unchanged for modules that do not call `_requireReadiness()`.
- `WmcpClient.destroy()` resets the readiness gate (`ready = true`) and clears the pending buffer so a re-mounted instance starts fresh.
- Every in-repo example (`examples/counter`, `rich-text-editor`, `analytics-dashboard`, `file-manager`, `kanban-board`, `media-player`) and `demo/nextjs` now use `_requireReadiness()` + `_setReady()` as the canonical pattern. Host-apps subscribe to `wmcp:ready` so the gate firing is visible in demo output.
- `docs/[4]-GETTING-STARTED.md` Steps 2 and 3 teach the readiness pattern as the recommended default for new modules.
- `README.md` Quick start mentions the optional readiness contract and links to the new spec section.

### Notes

- **Backward compatible.** Default `ready = true` in the constructor; existing modules and hosts that never call `_requireReadiness()` are unaffected. New modules opt in explicitly.
- `host:requires` invocations (`call()` / `stream()`) and module->host `emit()` are not gated — gating those would deadlock modules that self-invoke during initialization.
- Solves the host-emit-before-module-ready race observed by `@aurorah/epub-studio` (Part A of `studio_mount_race_fix_4f59c4dd.plan.md`). Studio Part B bumps its `@aurorah/wmcp` peer dep `^1.0.3 -> ^1.1.0` and calls `_requireReadiness()` + `_setReady()` from its `mount()`.

## [1.0.3]

Prior to this changelog. See git history.
