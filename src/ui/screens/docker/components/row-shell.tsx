import type { RowOptions } from './row.types'
import { rowMain } from './row-main'
import { rowActions } from './row-actions'

export function rowShell(opts: RowOptions): HTMLElement {
  return (
    <div class="docker-row" dataset={{ search: opts.search.toLowerCase() }}>
      {rowMain(opts)}
      {rowActions(opts.actions)}
    </div>
  )
}
