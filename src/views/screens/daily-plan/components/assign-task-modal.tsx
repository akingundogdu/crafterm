import { Component } from '@geajs/core'
import type { DailyPlanTask } from '@views/types/types'
import { createOverlay } from '@views/components/overlay/overlay'
import { UITexts } from '@texts'
import { STATUS_LABEL } from '../daily-plan.store'
import store from './assign-task-modal.store'

// Modal to assign (or change / clear) the daily task a terminal pane works on.
// Picking a task assigns it and opens the task form so its status can be updated.
// Reactive body: the search box writes store.query, the candidate rows are rendered
// unconditionally with an empty-hint sibling, and the current-assignment row shows
// only when the pane already has a task. The close button is inlined (byte-identical
// to makeCloseButton) so it stays a direct child of `.modal`. State + persistence
// live in the store. Self-contained — no @ui (§2.7).
class AssignTaskModal extends Component {
  template() {
    return (
      <div class="modal modal-prompt daily-assign-modal">
        <button
          class="modal-close"
          type="button"
          aria-label="Close"
          title="Close (Esc)"
          onClick={() => store.close()}
        >
          ×
        </button>
        <h2>{UITexts.DailyPlan.assignTitle}</h2>
        {store.current ? (
          <div class="daily-assign-current">
            <span>{store.currentLabel}</span>
            <button class="daily-plan-secondary-btn" onClick={() => store.assign(null)}>
              Clear
            </button>
          </div>
        ) : null}
        <input
          type="text"
          class="daily-assign-search"
          placeholder={UITexts.DailyPlan.searchTasks}
          onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
          onInput={(e: Event) => (store.query = (e.target as HTMLInputElement).value)}
        />
        <div class="daily-assign-list">
          {store.items.map((t: DailyPlanTask) => (
            <button key={t.id} class="daily-assign-row" onClick={() => store.assign(t.id)}>
              <span class="daily-assign-row-title">{`${t.issueKey ? t.issueKey + ' · ' : ''}${t.title}`}</span>
              <span class="daily-assign-row-meta">{`${STATUS_LABEL[t.status]} · ${t.date}`}</span>
            </button>
          ))}
          {store.items.length === 0 ? <div class="daily-assign-empty">No matching tasks</div> : null}
        </div>
      </div>
    )
  }
}

export interface AssignTaskModalProps {
  paneId: string
  // Open the edit form for the just-assigned task (owned by the board, so it can
  // wire the board re-render).
  openTaskForm: (task: DailyPlanTask) => void
}

// Opens the gea assign-task modal: a @views overlay backdrop with the gea
// AssignTaskModal body mounted inside. Signature preserved so the daily-plan.shell
// consumer resolves unchanged. Aborts (no overlay mounted) when the pane is gone.
export function assignPaneToTask(props: AssignTaskModalProps): void {
  const ov = createOverlay()
  if (!store.open(props.paneId, props.openTaskForm, () => ov.close())) return
  ov.overlay.classList.add('daily-plan-form-overlay')

  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') ov.close()
  }
  ov.onClose(() => document.removeEventListener('keydown', onKey, true))
  document.addEventListener('keydown', onKey, true)

  new AssignTaskModal().render(ov.overlay)
  ov.mount()
  ;(ov.overlay.querySelector('.daily-assign-search') as HTMLInputElement | null)?.focus()
}
