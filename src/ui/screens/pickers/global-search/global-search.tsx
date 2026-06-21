import './global-search.css'
import { UITexts } from '@texts'
import { overlayModal } from '../shared'
import type { GsEntry } from './global-search.types'
import { SOURCE_LABEL, buildGlobalSearchIndex, filterEntries, makeChoose } from './global-search.state'
import { globalSearchRow } from './components/global-search-row'

export type { GsEntry } from './global-search.types'
export { SOURCE_LABEL, buildGlobalSearchIndex } from './global-search.state'

// Spotlight global-search picker view. The list/selection orchestration is
// closure-bound (selection index, highlight, render); the index builder, filter,
// and row activation come from state.
export async function showGlobalSearch(): Promise<void> {
  const entries = await buildGlobalSearchIndex()
  const { modal, close } = overlayModal('picker-modal')
  const choose = makeChoose(close)

  const h = (<h2>{UITexts.Pickers.globalSearch.heading}</h2>) as HTMLHeadingElement
  modal.appendChild(h)
  const input = (
    <input
      class="search-box-input"
      type="text"
      placeholder={UITexts.Pickers.globalSearch.placeholder}
    />
  ) as HTMLInputElement
  input.spellcheck = false
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  modal.append(input, list)

  let sel = 0
  const filtered = (): GsEntry[] => filterEntries(entries, input.value)

  const highlight = (): void => {
    list.querySelectorAll<HTMLElement>('.pick-row').forEach((el, i) => {
      el.classList.toggle('active', i === sel)
    })
  }

  const render = (): void => {
    const items = filtered()
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    list.replaceChildren()
    if (!items.length) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    items.forEach((e, i) => {
      list.appendChild(
        globalSearchRow({
          entry: e,
          isActive: i === sel,
          onChoose: () => choose(e),
          onHover: () => {
            sel = i
            highlight()
          }
        })
      )
    })
  }

  input.addEventListener('input', () => {
    sel = 0
    render()
  })
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    const items = filtered()
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      sel = Math.min(items.length - 1, sel + 1)
      highlight()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      sel = Math.max(0, sel - 1)
      highlight()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[sel]) choose(items[sel])
    }
  })

  render()
  setTimeout(() => input.focus(), 0)
}
