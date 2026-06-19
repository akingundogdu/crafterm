import { openMarkdownFile } from '../../../commands'
import { plansService } from '@services'
import { overlayModal } from '../shared'

// ---- Plans: list ~/.claude/plans and open one in the Markdown app ----

export async function showPlansModal(): Promise<void> {
  const plans = await plansService.list()
  const { modal, close } = overlayModal('list-modal')

  const h = document.createElement('h2')
  h.textContent = 'Plans'
  modal.appendChild(h)

  if (!plans.length) {
    const hint = document.createElement('div')
    hint.className = 'empty-hint'
    hint.textContent = 'No plans in ~/.claude/plans'
    modal.appendChild(hint)
    return
  }

  const input = document.createElement('input')
  input.className = 'search-box-input'
  input.type = 'text'
  input.placeholder = 'Filter plans…  (↑↓ move · ⏎ open)'
  input.spellcheck = false
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
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
      const row = document.createElement('button')
      row.className = 'pick-row' + (i === sel ? ' active' : '')
      row.textContent = title(p)
      row.addEventListener('click', () => choose(p))
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
