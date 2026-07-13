import { Component } from '@geajs/core'
import '@views/components/form-field/form-field.css'
import type { DailyPlanTask, DailyPlanStatus, DailyPlanPriority } from '@views/types/types'
import { createDateField, type DateField } from '@views/components/datepicker/datepicker'
import ProjectSelect from '@views/components/project-select/project-select'
import { showRemindModal } from '@views/screens/reminders/components/remind-modal'
import { FORM_STATUSES, PRIORITIES, sanitizeSlug } from '@views/screens/daily-plan/daily-plan.store'
import { state } from '@views/state/spine'
import { findProjectById } from '@views/catalog/catalog'
import { buildTagPicker } from './tag-picker'
import store from './task-form.store'

// gea create/edit task form body, mounted into the @views overlay by openTaskForm.
// The inputs are UNCONTROLLED (read from the DOM at commit) and the imperative
// widgets (two DateFields + the keyboard-driven tag picker) are embedded into host
// divs in onAfterRender. This is deliberate: a reactive store write per keystroke
// would re-render the template and wipe the injected widgets, so the form updates
// its hints imperatively and never writes a reactive field — keeping a single
// render. Property refs (`ref={this.el}`) are gea's wiring mechanism; the elements
// are assigned before onAfterRender runs. Inline `.field` rows + inline `<select>`
// per §5.9. Self-contained — no @ui (§2.7).
export default class TaskForm extends Component {
  titleInput: HTMLTextAreaElement | null = null
  descInput: HTMLTextAreaElement | null = null
  projSel: HTMLSelectElement | null = null
  statusSel: HTMLSelectElement | null = null
  prioSel: HTMLSelectElement | null = null
  slugInput: HTMLInputElement | null = null
  slugHint: HTMLDivElement | null = null
  dateHost: HTMLDivElement | null = null
  dueHost: HTMLDivElement | null = null
  tagMount: HTMLDivElement | null = null

  private dateField: DateField | null = null
  private dueField: DateField | null = null
  private tagHost: HTMLDivElement | null = null
  private selectedTagIds: string[] = []

  created(): void {
    this.dateField = createDateField({ mode: 'date', value: store.existing?.date ?? store.selectedDate })
    this.dueField = createDateField({ mode: 'date', value: store.existing?.dueDate ?? '' })
    this.selectedTagIds = [...(store.existing?.tagIds ?? [])]
    const tagHost = document.createElement('div')
    tagHost.className = 'daily-plan-tag-picker'
    buildTagPicker(tagHost, this.selectedTagIds)
    this.tagHost = tagHost
  }

  // Embed the imperative widgets + seed the hints once after the template mounts.
  // No reactive store write occurs while editing, so this runs once (the appends
  // are guarded against a defensive re-run regardless).
  onAfterRender(): void {
    if (this.dateHost && this.dateField && !this.dateHost.firstChild) this.dateHost.appendChild(this.dateField)
    if (this.dueHost && this.dueField && !this.dueHost.firstChild) this.dueHost.appendChild(this.dueField)
    if (this.tagMount && this.tagHost && !this.tagMount.firstChild) this.tagMount.appendChild(this.tagHost)
    // Seed the slug input imperatively: a `value=` JSX binding would make gea treat
    // the input as controlled and reset it to the bound value on every keystroke.
    if (this.slugInput && !this.slugInput.value) this.slugInput.value = store.existing?.worktreeSlug ?? ''
    this.updateSlugHint()
  }

  private updateSlugHint = (): void => {
    if (!this.slugHint) return
    const slug = sanitizeSlug(this.slugInput?.value ?? '')
    if (!slug) {
      this.slugHint.textContent = ''
      return
    }
    const id = this.projSel?.value
    const p = id ? findProjectById(state.tree, id) : null
    const keyPreview = store.existing?.issueKey ?? (p?.issueKeyPrefix?.trim() ? `${p.issueKeyPrefix.trim()}-#` : 'KEY')
    this.slugHint.textContent = `Worktree: ${keyPreview}-${slug}`
  }

  // The shared dropdown owns the select; the form keeps the element to validate it
  // (field-invalid) and to read the picked project on commit.
  private onProjectSelectRef = (el: HTMLSelectElement): void => {
    this.projSel = el
  }

  private onProjectChange = (id: string): void => {
    if (id) this.projSel?.classList.remove('field-invalid')
    this.updateSlugHint()
  }

  // Validate (title + project required) and persist; null when invalid.
  private commit(): DailyPlanTask | null {
    const title = (this.titleInput?.value ?? '').trim()
    if (!title) {
      this.titleInput?.focus()
      return null
    }
    if (!this.projSel?.value) {
      this.projSel?.classList.add('field-invalid')
      this.projSel?.focus()
      return null
    }
    return store.commit({
      title,
      description: this.descInput?.value ?? '',
      projectId: this.projSel.value,
      status: this.statusSel?.value as DailyPlanStatus,
      priority: this.prioSel?.value as DailyPlanPriority,
      slug: this.slugInput?.value ?? '',
      date: this.dateField?.value ?? '',
      dueDate: this.dueField?.value ?? '',
      tagIds: this.selectedTagIds
    })
  }

  private doSave = (): void => {
    if (!this.commit()) return
    store.close()
    store.onSaved()
  }

  private doRemind = (): void => {
    const task = this.commit()
    if (!task) return
    store.close()
    store.onSaved()
    showRemindModal(task.title, task.title, { kind: 'dailyTask', taskId: task.id })
  }

  private doRun = (useWorktree: boolean): void => {
    const task = this.commit()
    if (!task) return
    store.close()
    store.onSaved()
    void store.openTaskInTerminal(task, store.onSaved, useWorktree)
  }

  template() {
    const initialProjectId = store.existing?.projectId ?? ''
    return (
      <div
        class="modal modal-prompt daily-plan-form"
        tabIndex={-1}
        onKeyDown={(e: KeyboardEvent) => {
          e.stopPropagation()
          if (e.key === 'Escape') store.close()
        }}
      >
        <button class="modal-close" type="button" aria-label="Close" title="Close (Esc)" onClick={() => store.close()}>
          ×
        </button>
        <h2>{store.titleText}</h2>
        <div class="field daily-plan-text-field">
          <label>Title</label>
          <textarea class="daily-plan-title-input" rows={2} placeholder="What needs doing?" ref={this.titleInput}>
            {store.existing?.title ?? ''}
          </textarea>
        </div>
        <div class="field daily-plan-text-field">
          <label>
            Description <span class="field-hint">(optional)</span>
          </label>
          <textarea class="daily-plan-desc-input" rows={3} placeholder="Notes, links, context…" ref={this.descInput}>
            {store.existing?.description ?? ''}
          </textarea>
        </div>
        <div class="field">
          <label>Tags</label>
          <div ref={this.tagMount} />
        </div>
        <div class="field">
          <label>Project</label>
          <div class="field-control-col">
            <ProjectSelect
              value={initialProjectId}
              emptyLabel="— Select a project —"
              showPathHint
              onChange={this.onProjectChange}
              onSelectRef={this.onProjectSelectRef}
            />
          </div>
        </div>
        <div class="field">
          <label>Status</label>
          <select ref={this.statusSel}>
            {FORM_STATUSES.map((s) => (
              <option key={s.id} value={s.id} selected={s.id === store.initialStatus}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label>Priority</label>
          <select ref={this.prioSel}>
            {PRIORITIES.map((p) => (
              <option key={p.id} value={p.id} selected={p.id === (store.existing?.priority ?? 'medium')}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label>Date</label>
          <div ref={this.dateHost} />
        </div>
        <div class="field">
          <label>
            Due date <span class="field-hint">(optional)</span>
          </label>
          <div ref={this.dueHost} />
        </div>
        <div class="field">
          <label>
            Worktree slug <span class="field-hint">(optional)</span>
          </label>
          <div class="field-control-col">
            <input type="text" placeholder="e.g. fix-login" ref={this.slugInput} onInput={() => this.updateSlugHint()} />
            <div class="daily-plan-proj-hint" ref={this.slugHint} />
          </div>
        </div>
        <div class="modal-actions">
          <button onClick={() => store.close()}>Cancel</button>
          <button title="Save and set a reminder for this task" onClick={this.doRemind}>
            ⏰ Remind…
          </button>
          <button title="Save and open a Claude session seeded with this task" onClick={() => this.doRun(false)}>
            ▶ Run in claude session
          </button>
          <button title="Create a worktree (branch = issue key) and run the Claude session there" onClick={() => this.doRun(true)}>
            ⑂ Run in worktree
          </button>
          <button class="button-primary" onClick={this.doSave}>
            Save
          </button>
        </div>
      </div>
    )
  }
}
