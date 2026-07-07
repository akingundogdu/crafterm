import type { GridContext } from './result-grid.types'

// Result count + timing display shown above the grid. Built with plain DOM — the
// db-pane is an imperative widget, so gea reactivity buys nothing here, and this
// returns a detached node consumed synchronously by the grid (§2.7
// self-contained, no @ui).
export function buildStatusBar(ctx: GridContext): HTMLElement {
  const shown = Math.min(ctx.rows.length, 1000)
  const div = document.createElement('div')
  div.className = 'db-result-status'
  div.innerHTML =
    `<span class="db-result-rows">${ctx.rows.length} row${ctx.rows.length === 1 ? '' : 's'}</span>` +
    (ctx.rows.length > shown ? `<span class="db-muted"> (showing ${shown})</span>` : '') +
    `<span class="db-result-ms">${ctx.ms}ms</span>`
  return div
}
