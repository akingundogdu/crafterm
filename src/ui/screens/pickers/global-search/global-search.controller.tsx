import { UITexts } from '@texts'
import { overlayModal } from '../shared'
import type { GsEntry } from './global-search.types'
import { buildGlobalSearchIndex, filterEntries, makeChoose } from './global-search.state'
import { globalSearchRow } from './components/global-search-row'

// Owns the Spotlight global-search overlay: builds the modal, drives the
// list/selection orchestration (selection index, highlight, render) and key
// navigation. The methods close over this instance's entries + selection, which
// is why they live here rather than in the stateless global-search.state.
export class GlobalSearchController {
  private entries: GsEntry[] = []
  private input!: HTMLInputElement
  private list!: HTMLDivElement
  private close!: () => void
  private choose!: (entry: GsEntry) => void
  private sel = 0

  async open(): Promise<void> {
    this.entries = await buildGlobalSearchIndex()
    const { modal, close } = overlayModal('picker-modal')
    this.close = close
    this.choose = makeChoose(close)

    const h = (<h2>{UITexts.Pickers.globalSearch.heading}</h2>) as HTMLHeadingElement
    modal.appendChild(h)
    this.input = (
      <input
        class="search-box-input"
        type="text"
        placeholder={UITexts.Pickers.globalSearch.placeholder}
      />
    ) as HTMLInputElement
    this.input.spellcheck = false
    this.list = (<div class="pick-list picker-list" />) as HTMLDivElement
    modal.append(this.input, this.list)

    this.wireEvents()

    this.render()
    setTimeout(() => this.input.focus(), 0)
  }

  private filtered = (): GsEntry[] => filterEntries(this.entries, this.input.value)

  private highlight = (): void => {
    this.list.querySelectorAll<HTMLElement>('.pick-row').forEach((el, i) => {
      el.classList.toggle('active', i === this.sel)
    })
  }

  private render = (): void => {
    const items = this.filtered()
    if (this.sel >= items.length) this.sel = Math.max(0, items.length - 1)
    this.list.replaceChildren()
    if (!items.length) {
      this.list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    items.forEach((e, i) => {
      this.list.appendChild(
        globalSearchRow({
          entry: e,
          isActive: i === this.sel,
          onChoose: () => this.choose(e),
          onHover: () => {
            this.sel = i
            this.highlight()
          }
        })
      )
    })
  }

  private wireEvents = (): void => {
    this.input.addEventListener('input', () => {
      this.sel = 0
      this.render()
    })
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      const items = this.filtered()
      if (e.key === 'Escape') this.close()
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        this.sel = Math.min(items.length - 1, this.sel + 1)
        this.highlight()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        this.sel = Math.max(0, this.sel - 1)
        this.highlight()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (items[this.sel]) this.choose(items[this.sel])
      }
    })
  }
}
