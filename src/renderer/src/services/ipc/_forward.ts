import type { CraftermApi } from '../../../../preload/api'

// Lazy, type-safe forwarder to the preload bridge. `call('gitBranches')` returns
// a function typed exactly as `CraftermApi['gitBranches']` that accesses
// `window.crafterm` at call time (not import time), so service modules are safe
// to import in tests where `window.crafterm` is absent. These `services/ipc/*`
// wrappers are the ONLY place that touches `window.crafterm`.

export function call<K extends keyof CraftermApi>(method: K): CraftermApi[K] {
  return ((...args: unknown[]) =>
    (window.crafterm[method] as (...a: unknown[]) => unknown)(...args)) as CraftermApi[K]
}
