import type { CraftermApi } from '@bridge/api'

// Lazy, type-safe forwarder to the namespaced preload bridge. `call('git',
// 'branches')` returns a function typed exactly as `CraftermApi['git']['branches']`
// that accesses `window.crafterm` at call time (not import time), so service
// modules are safe to import in tests where `window.crafterm` is absent. These
// `services/ipc/*` wrappers are the ONLY place that touches `window.crafterm`.

export function call<NS extends keyof CraftermApi, M extends keyof CraftermApi[NS]>(
  ns: NS,
  method: M
): CraftermApi[NS][M] {
  return ((...args: unknown[]) =>
    (window.crafterm[ns][method] as (...a: unknown[]) => unknown)(...args)) as CraftermApi[NS][M]
}
