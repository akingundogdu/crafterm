import { el } from '@views/lib/dom'
import { plansService } from '@services'
import { overlayModal } from '../shared'
import { filterPlans, makeChoosePlan } from './plans.state'
import { appendPlansHeading } from './components/plans-heading'
import { plansInput } from './components/plans-input'
import { renderPlansList } from './components/plans-list'
import { attachListNav } from './components/list-nav'

// ---- Plans: list ~/.claude/plans and open one in the Markdown app ----

export async function showPlansModal(): Promise<void> {
  const plans = await plansService.list()
  const { modal, close } = overlayModal('list-modal')

  if (appendPlansHeading(modal, !plans.length)) return

  const input = plansInput()
  const list = el('div', { class: 'pick-list picker-list' })
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
    renderPlansList({
      container: list,
      items,
      selected: sel,
      onChoose: choose,
      onHover: (i) => {
        sel = i
        highlight()
      }
    })
  }

  input.addEventListener('input', () => {
    sel = 0
    render()
  })
  attachListNav(input, {
    getItems: filtered,
    getSelected: () => sel,
    setSelected: (i) => {
      sel = i
    },
    onHighlight: highlight,
    onChoose: choose,
    onClose: close
  })

  render()
  setTimeout(() => input.focus(), 0)
}
