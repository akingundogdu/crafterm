// Spotlight result list: owns the `.spot-list` element, the current entries, the
// selection index, and row rendering. The badge label resolver is injected so
// the component pulls no business/IPC modules and renders in isolation.

import type { SpotEntry, SpotSource, ResultListHandle } from './result-list.types'
import { clampSelection } from './result-list.state'
import { createResultRow } from './result-row'
import { showEmptyHint } from './spot-empty'
import { moveSelection, applyHighlight } from './result-list.navigator'

export type { SpotSource, SpotEntry, ResultListHandle } from './result-list.types'

export function createResultList(opts: {
  onChoose: (e: SpotEntry) => void
  badgeFor: (source: SpotSource) => string
}): ResultListHandle {
  const el = (<div class="pick-list picker-list spot-list" />) as HTMLDivElement

  let items: SpotEntry[] = []
  let showBadge = false
  let sel = 0

  const highlight = (): void => applyHighlight(el, sel)

  const render = (): void => {
    sel = clampSelection(sel, items.length)
    el.replaceChildren()
    if (!items.length) {
      showEmptyHint(el, 'no-matches')
      return
    }
    items.forEach((e, i) => {
      el.appendChild(
        createResultRow({
          entry: e,
          index: i,
          selected: i === sel,
          showBadge,
          badgeFor: opts.badgeFor,
          onChoose: opts.onChoose,
          onHover: (idx) => {
            sel = idx
            highlight()
          }
        })
      )
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
      showEmptyHint(el, 'loading')
    },
    move: (delta) => {
      sel = moveSelection(sel, delta, items.length)
      highlight()
    },
    selected: () => items[sel]
  }
}
