import { createButton } from '@ui/components'
import type { RowOptions } from './row.types'
import { makeRowActionClick } from './row.state'

export type { RowAction } from './row.types'

// DOM builders for the Docker list rows. Action handlers are injected via
// RowAction.run, so this module carries no IPC/state imports.
export function makeRow(opts: RowOptions): HTMLElement {
  const badge = opts.badge ? (
    <span class={'docker-badge ' + opts.badge.cls}>{opts.badge.text}</span>
  ) : null

  const main = (
    <div class="docker-row-main">
      <div class="docker-row-title">
        {badge}
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

  const acts = (
    <div class="docker-row-actions">
      {opts.actions.map((a) =>
        createButton({
          className: 'docker-act' + (a.cls ? ' ' + a.cls : ''),
          text: a.label,
          title: a.label,
          onClick: makeRowActionClick(a.run)
        })
      )}
    </div>
  )

  return (
    <div class="docker-row" dataset={{ search: opts.search.toLowerCase() }}>
      {main}
      {acts}
    </div>
  )
}

export function fillEmpty(list: HTMLElement, label: string): void {
  list.replaceChildren()
  list.appendChild(<div class="docker-empty-row">{label}</div>)
}
