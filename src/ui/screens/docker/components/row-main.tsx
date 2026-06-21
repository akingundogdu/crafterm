import type { RowOptions } from './row.types'
import { rowBadge } from './row-badge'

export function rowMain(opts: RowOptions): HTMLElement {
  return (
    <div class="docker-row-main">
      <div class="docker-row-title">
        {rowBadge(opts.badge)}
        <span class="docker-row-name" title={opts.title}>
          {opts.title}
        </span>
      </div>
      <div class="docker-row-sub" title={opts.sub}>
        {opts.sub}
      </div>
      {opts.meta ? <div class="docker-row-meta">{opts.meta}</div> : null}
    </div>
  )
}
