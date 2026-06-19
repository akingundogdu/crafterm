import { openMarkdownFile } from '../../../commands'
import { plansService } from '@services'
import { overlayModal } from '../shared'

// ---- Plans: list ~/.claude/plans and open one in the Markdown app ----

export async function showPlansModal(): Promise<void> {
  const plans = await plansService.list()
  const { modal, close } = overlayModal('list-modal')

  modal.appendChild(<h2>Plans</h2>)

  if (!plans.length) {
    modal.appendChild(<div class="empty-hint">No plans in ~/.claude/plans</div>)
    return
  }

  const input = (
    <input
      class="search-box-input"
      type="text"
      placeholder="Filter plans…  (↑↓ move · ⏎ open)"
      ref={(el: HTMLInputElement) => {
        el.spellcheck = false
      }}
    />
  ) as HTMLInputElement
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  modal.append(input, list)

  const title = (p: (typeof plans)[number]): string => p.name.replace(/\.(md|mdx|mdc)$/i, '')
  let sel = 0

  const filtered = (): typeof plans => {
    const q = input.value.trim().toLowerCase()
    if (!q) return plans
    return plans.filter((p) => title(p).toLowerCase().includes(q))
  }

  const choose = (p: (typeof plans)[number]): void => {
    openMarkdownFile(p.path)
    close()
  }

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
    items.forEach((p, i) => {
      const row = (
        <button class={'pick-row' + (i === sel ? ' active' : '')} onClick={() => choose(p)}>
          {title(p)}
        </button>
      ) as HTMLButtonElement
      row.addEventListener('mouseenter', () => {
        sel = i
        highlight()
      })
      list.appendChild(row)
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
