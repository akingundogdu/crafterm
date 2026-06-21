import type { GridContext } from './result-grid.types'

// Result count + timing display shown above the grid.
export function buildStatusBar(ctx: GridContext): HTMLElement {
  const shown = Math.min(ctx.rows.length, 1000)
  return (
    <div
      class="db-result-status"
      innerHTML={
        `<span class="db-result-rows">${ctx.rows.length} row${ctx.rows.length === 1 ? '' : 's'}</span>` +
        (ctx.rows.length > shown ? `<span class="db-muted"> (showing ${shown})</span>` : '') +
        `<span class="db-result-ms">${ctx.ms}ms</span>`
      }
    />
  ) as HTMLDivElement
}
