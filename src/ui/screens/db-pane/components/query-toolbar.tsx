import { QueryToolbarController, type QueryToolbar } from './query-toolbar.controller'

export type { QueryToolbar } from './query-toolbar.controller'

// Query bar: connection select (with engine dot), run/save buttons, and the
// editor theme picker. A pure factory — the host wires the controls.
export function createQueryToolbar(): QueryToolbar {
  return new QueryToolbarController().build()
}
