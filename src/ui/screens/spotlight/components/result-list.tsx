// Spotlight result list: owns the `.spot-list` element, the current entries, the
// selection index, and row rendering. The badge label resolver is injected so
// the component pulls no business/IPC modules and renders in isolation.

import type { GsEntry } from '../../pickers/global-search/global-search'
import { UITexts } from '@texts'

export type SpotSource =
  | GsEntry['source']
  | 'file'
  | 'command'
  | 'claude'
  | 'shortcut'
  | 'app'
  | 'task'
  | 'reminder'
  | 'backlog'

export interface SpotEntry {
  source: SpotSource
  label: string
  detail?: string
  run: () => void
  altRun?: () => void // ⌘⏎ alternate action (e.g. split instead of open)
}

export interface ResultListHandle {
  el: HTMLDivElement
  setItems: (items: SpotEntry[], showBadge: boolean) => void
  setLoading: () => void
  move: (delta: number) => void
  selected: () => SpotEntry | undefined
}

export function createResultList(opts: {
  onChoose: (e: SpotEntry) => void
  badgeFor: (source: SpotSource) => string
}): ResultListHandle {
  const el = (<div class="pick-list picker-list spot-list" />) as HTMLDivElement

  let items: SpotEntry[] = []
  let showBadge = false
  let sel = 0

  const highlight = (): void => {
    el.querySelectorAll<HTMLElement>('.spot-row').forEach((row, i) => {
      row.classList.toggle('active', i === sel)
    })
  }

  const render = (): void => {
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    el.replaceChildren()
    if (!items.length) {
      el.insertAdjacentHTML('beforeend', `<div class="empty-hint">${UITexts.Spotlight.noMatches}</div>`)
      return
    }
    items.forEach((e, i) => {
      const row = (
        <button class={'pick-row spot-row' + (i === sel ? ' active' : '')}>
          {showBadge && (
            <span class={'gs-badge gs-' + e.source}>{opts.badgeFor(e.source)}</span>
          )}
          <span class="gs-label">{e.label}</span>
          {e.detail && <span class="gs-detail">{e.detail}</span>}
        </button>
      ) as HTMLButtonElement
      row.addEventListener('click', () => opts.onChoose(e))
      row.addEventListener('mouseenter', () => {
        sel = i
        highlight()
      })
      el.appendChild(row)
    })
  }

  return {
    el,
    setItems: (next, badge) => {
      items = next
      showBadge = badge
      sel = 0
      render()
    },
    setLoading: () => {
      items = []
      el.replaceChildren()
      el.insertAdjacentHTML('beforeend', `<div class="empty-hint">${UITexts.Spotlight.loading}</div>`)
    },
    move: (delta) => {
      sel = Math.min(items.length - 1, Math.max(0, sel + delta))
      highlight()
    },
    selected: () => items[sel]
  }
}
