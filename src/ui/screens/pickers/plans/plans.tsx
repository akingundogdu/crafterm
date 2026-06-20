import { plansService } from '@services'
import { overlayModal } from '../shared'
import { UITexts } from '@texts'
import { planTitle, filterPlans, disableSpellcheck, makeChoosePlan } from './plans.state'

// ---- Plans: list ~/.claude/plans and open one in the Markdown app ----

export async function showPlansModal(): Promise<void> {
  const plans = await plansService.list()
  const { modal, close } = overlayModal('list-modal')

  modal.appendChild(<h2>{UITexts.Pickers.plans.heading}</h2>)

  if (!plans.length) {
    modal.appendChild(<div class="empty-hint">No plans in ~/.claude/plans</div>)
    return
  }

  const input = (
    <input
      class="search-box-input"
      type="text"
      placeholder={UITexts.Pickers.plans.placeholder}
      ref={disableSpellcheck}
    />
  ) as HTMLInputElement
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  modal.append(input, list)

  let sel = 0
  const choose = makeChoosePlan(close)
  const filtered = (): typeof plans => filterPlans(plans, input.value)

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
          {planTitle(p)}
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
