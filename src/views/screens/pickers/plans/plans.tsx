import { Component } from '@geajs/core'
import './plans.css'
import { plansService } from '@services'
import type { DirEntry } from '@services/fs/fs.types'
import { UITexts } from '@texts'
import { overlayModal } from '../shared'
import { filterPlans, makeChoosePlan } from './plans.store'
import store from './plans.store'
import PlansRow from './components/plans-row'

// ---- Plans: list ~/.claude/plans and open one in the Markdown app ----

// Reactive body of the plans picker: heading, search box, and the live-filtered,
// keyboard-navigable plan list. Rendered as a JSX child of PlansPicker so gea tracks
// its store reads (plans / search / selected) and re-renders it on every keystroke,
// arrow move, or hover — the board pattern. A top-level, imperatively mounted
// component (PlansPicker) does not re-subscribe on store writes, so all reactive
// markup lives here. Self-contained — no @ui.
class PlansList extends Component {
  declare props: { close: () => void }

  private choose = (plan: DirEntry): void => makeChoosePlan<DirEntry>(this.props.close)(plan)

  private onInput = (e: Event): void => {
    store.setSearch((e.target as HTMLInputElement).value)
    store.setSelected(0)
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    e.stopPropagation()
    const items = filterPlans(store.plans, store.search)
    if (e.key === 'Escape') this.props.close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      store.setSelected(Math.min(items.length - 1, store.selected + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      store.setSelected(Math.max(0, store.selected - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const picked = items[store.selected]
      if (picked) this.choose(picked)
    }
  }

  template() {
    // Read the reactive store fields (the loaded list + the search + selection) so
    // this child re-renders on any keystroke, arrow move, or hover.
    const all = store.plans
    const items = filterPlans(all, store.search)
    const sel = store.selected >= items.length ? Math.max(0, items.length - 1) : store.selected

    return (
      <div class="plans-picker">
        <h2>{UITexts.Pickers.plans.heading}</h2>
        {all.length === 0 && <div class="empty-hint">No plans in ~/.claude/plans</div>}
        {all.length > 0 && (
          <input
            class="search-box-input"
            type="text"
            spellcheck="false"
            placeholder={UITexts.Pickers.plans.placeholder}
            value={store.search}
            onInput={this.onInput}
            onKeyDown={this.onKeyDown}
          />
        )}
        {all.length > 0 && (
          <div class="pick-list picker-list">
            {items.map((plan, i) => (
              <PlansRow
                key={plan.path}
                plan={plan}
                isActive={i === sel}
                onChoose={() => this.choose(plan)}
                onHover={() => store.setSelected(i)}
              />
            ))}
            {items.length === 0 && <div class="empty-hint">No matches</div>}
          </div>
        )}
      </div>
    )
  }
}

// Thin shell for the plans picker, mounted imperatively into the shared overlay
// modal. Data (the modal's close fn) arrives via the constructor into a plain field
// — a gea Component only populates `this.props` when rendered from a parent
// template, not from a manual `new X()`. The reactive markup lives in the PlansList
// JSX child.
class PlansPicker extends Component {
  private readonly closeFn: () => void

  constructor(opts: { close: () => void }) {
    super()
    this.closeFn = opts.close
  }

  template() {
    return <PlansList close={this.closeFn} />
  }
}

export async function showPlansModal(): Promise<void> {
  const plans = await plansService.list()
  const { modal, close } = overlayModal('list-modal')
  store.load(plans)
  new PlansPicker({ close }).render(modal)
  setTimeout(() => (modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus(), 0)
}
