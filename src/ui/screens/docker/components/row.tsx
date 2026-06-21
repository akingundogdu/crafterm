import type { RowOptions } from './row.types'
import { rowShell } from './row-shell'

export type { RowAction } from './row.types'

// Thin orchestrator for the Docker list rows: composes the per-part pure
// factories in this folder. Action handlers are injected via RowAction.run,
// so this module carries no IPC/state imports.
export function makeRow(opts: RowOptions): HTMLElement {
  return rowShell(opts)
}

export function fillEmpty(list: HTMLElement, label: string): void {
  list.replaceChildren()
  list.appendChild(<div class="docker-empty-row">{label}</div>)
}
