// Spotlight result list: owns the `.spot-list` element, the current entries, the
// selection index, and row rendering. The badge label resolver is injected so
// the component pulls no business/IPC modules and renders in isolation.

import type { SpotEntry, SpotSource, ResultListHandle } from './result-list.types'
import { clampSelection } from './result-list.state'
import { createResultRow } from './result-row'
import { showEmptyHint } from './spot-empty'
import { moveSelection, applyHighlight } from './result-list.navigator'

export interface ResultListOptions {
  onChoose: (e: SpotEntry) => void
  badgeFor: (source: SpotSource) => string
}

export class ResultListController {
  private readonly opts: ResultListOptions
  private readonly el: HTMLDivElement

  private items: SpotEntry[] = []
  private showBadge = false
  private sel = 0

  constructor(opts: ResultListOptions) {
    this.opts = opts
    this.el = (<div class="pick-list picker-list spot-list" />) as HTMLDivElement
  }

  private highlight = (): void => applyHighlight(this.el, this.sel)

  private render = (): void => {
    this.sel = clampSelection(this.sel, this.items.length)
    this.el.replaceChildren()
    if (!this.items.length) {
      showEmptyHint(this.el, 'no-matches')
      return
    }
    this.items.forEach((e, i) => {
      this.el.appendChild(
        createResultRow({
          entry: e,
          index: i,
          selected: i === this.sel,
          showBadge: this.showBadge,
          badgeFor: this.opts.badgeFor,
          onChoose: this.opts.onChoose,
          onHover: (idx) => {
            this.sel = idx
            this.highlight()
          }
        })
      )
    })
  }

  build = (): ResultListHandle => ({
    el: this.el,
    setItems: (next, badge) => {
      this.items = next
      this.showBadge = badge
      this.sel = 0
      this.render()
    },
    setLoading: () => {
      this.items = []
      showEmptyHint(this.el, 'loading')
    },
    move: (delta) => {
      this.sel = moveSelection(this.sel, delta, this.items.length)
      this.highlight()
    },
    selected: () => this.items[this.sel]
  })
}
