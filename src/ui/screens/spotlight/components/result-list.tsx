// Spotlight result list: owns the `.spot-list` element, the current entries, the
// selection index, and row rendering. The badge label resolver is injected so
// the component pulls no business/IPC modules and renders in isolation.

import { UITexts } from '@texts'
import type { SpotEntry, SpotSource, ResultListHandle } from './result-list.types'
import { makeRowChoose, clampSelection } from './result-list.state'

export type { SpotSource, SpotEntry, ResultListHandle } from './result-list.types'

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
    sel = clampSelection(sel, items.length)
    el.replaceChildren()
    if (!items.length) {
      el.insertAdjacentHTML('beforeend', `<div class="empty-hint">${UITexts.Spotlight.noMatches}</div>`)
      return
    }
    items.forEach((e, i) => {
      const row = (
        <button class={'pick-row spot-row' + (i === sel ? ' active' : '')}>
          {showBadge && <span class={'gs-badge gs-' + e.source}>{opts.badgeFor(e.source)}</span>}
          <span class="gs-label">{e.label}</span>
          {e.detail && <span class="gs-detail">{e.detail}</span>}
        </button>
      ) as HTMLButtonElement
      row.addEventListener('click', makeRowChoose(opts.onChoose, e))
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
      sel = clampSelection(sel + delta, items.length)
      highlight()
    },
    selected: () => items[sel]
  }
}
