import type {
  DailyPlanTask,
  DailyPlanStatus,
  DailyPlanPriority
} from '@ui/types/types'
import { uid } from '@ui/state/state'
import { dailyTaskRepo } from '@repositories'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import { showRemindModal } from '../../reminders/reminders'
import { createDateField, type DateField, createOverlay, FormField } from '@ui/components'
import {
  FORM_STATUSES,
  PRIORITIES,
  assignIssueKey,
  sanitizeSlug,
  projectTree,
  nextOrder
} from '../daily-plan.state'
import { buildTagPicker } from './tag-picker'
import type { TaskFormProps } from './task-form'

// The create / edit task modal: title, description, tags, project, status,
// priority, date, due date, worktree slug — plus Save / Remind / Run actions.
export class TaskFormController {
  private readonly existing: DailyPlanTask | null
  private readonly onSaved: () => void
  private readonly defaultStatus: DailyPlanStatus
  private readonly getSelectedDate: () => string
  private readonly openTaskInTerminal: (
    task: DailyPlanTask,
    onChange: () => void,
    useWorktree?: boolean
  ) => void

  private selectedDate!: string
  private titleInput!: HTMLTextAreaElement
  private descInput!: HTMLTextAreaElement
  private projSel!: HTMLSelectElement
  private projHint!: HTMLDivElement
  private statusSel!: HTMLSelectElement
  private prioSel!: HTMLSelectElement
  private dateInput!: DateField
  private dueInput!: DateField
  private slugInput!: HTMLInputElement
  private slugHint!: HTMLDivElement
  private projects: ReturnType<typeof projectTree>[number]['p'][] = []
  private readonly selectedTagIds: string[] = []

  constructor({ existing, onSaved, defaultStatus = 'todo', getSelectedDate, openTaskInTerminal }: TaskFormProps) {
    this.existing = existing
    this.onSaved = onSaved
    this.defaultStatus = defaultStatus
    this.getSelectedDate = getSelectedDate
    this.openTaskInTerminal = openTaskInTerminal
    this.selectedTagIds = [...(existing?.tagIds ?? [])]
  }

  open(): void {
    const existing = this.existing
    this.selectedDate = this.getSelectedDate()

    const { overlay, mount, close, onClose } = createOverlay()
    overlay.classList.add('daily-plan-form-overlay')

    const onKey = (e: KeyboardEvent): void => {
      e.stopPropagation()
      if (e.key === 'Escape') close()
    }
    onClose(() => document.removeEventListener('keydown', onKey, true))
    document.addEventListener('keydown', onKey, true)

    // Title
    this.titleInput = (<textarea class="daily-plan-title-input" placeholder="What needs doing?" />) as HTMLTextAreaElement
    this.titleInput.rows = 2
    this.titleInput.value = existing?.title ?? ''

    // Description (optional)
    this.descInput = (<textarea class="daily-plan-desc-input" placeholder="Notes, links, context…" />) as HTMLTextAreaElement
    this.descInput.rows = 3
    this.descInput.value = existing?.description ?? ''

    // Tags
    const tagPicker = (<div class="daily-plan-tag-picker" />) as HTMLDivElement
    buildTagPicker(tagPicker, this.selectedTagIds)

    // Project (required) — provides the terminal cwd and the issue-key prefix used
    // to assign the task's stable issue key immediately on save.
    this.projSel = document.createElement('select')
    const noneOpt = document.createElement('option')
    noneOpt.value = ''
    noneOpt.textContent = '— Select a project —'
    this.projSel.appendChild(noneOpt)
    const projectList = projectTree()
    this.projects = projectList.map((x) => x.p)
    for (const { p, depth } of projectList) {
      const o = document.createElement('option')
      o.value = p.id
      const label = p.issueKeyPrefix ? `${p.name} (${p.issueKeyPrefix})` : p.name
      // Indent sub-projects so the project hierarchy reads in the dropdown (todo5).
      o.textContent = '   '.repeat(depth) + (depth ? '└ ' : '') + label
      this.projSel.appendChild(o)
    }
    this.projSel.value = existing?.projectId ?? ''
    this.projHint = (<div class="daily-plan-proj-hint" />) as HTMLDivElement
    this.projSel.addEventListener('change', () => {
      this.updateProjHint()
      if (this.projSel.value) this.projSel.classList.remove('field-invalid')
    })
    this.updateProjHint()

    // Status
    this.statusSel = document.createElement('select')
    for (const s of FORM_STATUSES) {
      const o = document.createElement('option')
      o.value = s.id
      o.textContent = s.label
      this.statusSel.appendChild(o)
    }
    this.statusSel.value = existing?.status ?? this.defaultStatus

    // Priority
    this.prioSel = document.createElement('select')
    for (const p of PRIORITIES) {
      const o = document.createElement('option')
      o.value = p.id
      o.textContent = p.label
      this.prioSel.appendChild(o)
    }
    this.prioSel.value = existing?.priority ?? 'medium'

    // Date
    this.dateInput = createDateField({ mode: 'date', value: existing?.date ?? this.selectedDate })

    // Due date (optional) — when set, cards show the time left / overdue.
    this.dueInput = createDateField({ mode: 'date', value: existing?.dueDate ?? '' })

    // Worktree slug (optional) — when set, it's appended to the issue key for the
    // worktree branch/name (e.g. CRF-12 → CRF-12-fix-login). Empty → the worktree is
    // named by the issue key alone.
    this.slugInput = (
      <input type="text" placeholder="e.g. fix-login" onInput={() => this.updateSlugHint()} />
    ) as HTMLInputElement
    this.slugInput.value = existing?.worktreeSlug ?? ''
    this.slugHint = (<div class="daily-plan-proj-hint" />) as HTMLDivElement
    this.projSel.addEventListener('change', this.updateSlugHint)
    this.updateSlugHint()

    // Actions
    const save = (
      <button
        class="button-primary"
        onClick={() => {
          if (!this.commit()) return
          close()
          this.onSaved()
        }}
      >
        Save
      </button>
    ) as HTMLButtonElement
    const actions = (
      <div class="modal-actions">
        <button onClick={() => close()}>Cancel</button>
        <button
          title="Save and set a reminder for this task"
          onClick={() => {
            const task = this.commit()
            if (!task) return
            close()
            this.onSaved()
            showRemindModal(task.title, task.title, { kind: 'dailyTask', taskId: task.id })
          }}
        >
          ⏰ Remind…
        </button>
        <button
          title="Save and open a Claude session seeded with this task"
          onClick={() => {
            const task = this.commit()
            if (!task) return
            close()
            this.onSaved()
            void this.openTaskInTerminal(task, this.onSaved)
          }}
        >
          ▶ Run in claude session
        </button>
        <button
          title="Create a worktree (branch = issue key) and run the Claude session there"
          onClick={() => {
            const task = this.commit()
            if (!task) return
            close()
            this.onSaved()
            void this.openTaskInTerminal(task, this.onSaved, true)
          }}
        >
          ⑂ Run in worktree
        </button>
        {save}
      </div>
    ) as HTMLDivElement

    const modal = (
      <div class="modal modal-prompt daily-plan-form">
        {makeCloseButton(close)}
        <h2>{existing ? 'Edit task' : 'New task'}</h2>
        <FormField label="Title" extraClass="daily-plan-text-field">{this.titleInput}</FormField>
        <FormField label="Description" hint="(optional)" extraClass="daily-plan-text-field">{this.descInput}</FormField>
        <FormField label="Tags">{tagPicker}</FormField>
        <FormField label="Project" column>{this.projSel}{this.projHint}</FormField>
        <FormField label="Status">{this.statusSel}</FormField>
        <FormField label="Priority">{this.prioSel}</FormField>
        <FormField label="Date">{this.dateInput}</FormField>
        <FormField label="Due date" hint="(optional)">{this.dueInput}</FormField>
        <FormField label="Worktree slug" hint="(optional)" column>{this.slugInput}{this.slugHint}</FormField>
        {actions}
      </div>
    ) as HTMLDivElement
    overlay.appendChild(modal)

    mount()
    this.titleInput.focus()
    this.titleInput.select()
  }

  private updateProjHint = (): void => {
    const p = this.projSel.value ? this.projects.find((x) => x.id === this.projSel.value) : null
    this.projHint.textContent = p ? p.path : ''
  }

  private updateSlugHint = (): void => {
    const slug = sanitizeSlug(this.slugInput.value)
    if (!slug) {
      this.slugHint.textContent = ''
      return
    }
    const p = this.projSel.value ? this.projects.find((x) => x.id === this.projSel.value) : null
    const keyPreview =
      this.existing?.issueKey ?? (p?.issueKeyPrefix?.trim() ? `${p.issueKeyPrefix.trim()}-#` : 'KEY')
    this.slugHint.textContent = `Worktree: ${keyPreview}-${slug}`
  }

  // Persist the form into a task (updating `existing` or creating a new one) and
  // return it; null when the title is empty. Shared by Save and Remind.
  private commit = (): DailyPlanTask | null => {
    const existing = this.existing
    const title = this.titleInput.value.trim()
    if (!title) {
      this.titleInput.focus()
      return null
    }
    // Project is required so every task gets a stable issue key assigned the
    // moment it's created (the key derives from the project's prefix).
    if (!this.projSel.value) {
      this.projSel.classList.add('field-invalid')
      this.projSel.focus()
      return null
    }
    const now = Date.now()
    const description = this.descInput.value.trim()
    if (existing) {
      existing.title = title
      existing.description = description || undefined
      existing.status = this.statusSel.value as DailyPlanStatus
      existing.priority = this.prioSel.value as DailyPlanPriority
      existing.date = this.dateInput.value || this.selectedDate
      existing.dueDate = this.dueInput.value || undefined
      existing.tagIds = this.selectedTagIds.slice()
      existing.projectId = this.projSel.value || undefined
      existing.worktreeSlug = sanitizeSlug(this.slugInput.value) || undefined
      existing.updatedAt = now
      assignIssueKey(existing)
      dailyTaskRepo.upsert(existing)
      return existing
    }
    const newTask: DailyPlanTask = {
      id: uid('task'),
      title,
      description: description || undefined,
      date: this.dateInput.value || this.selectedDate,
      dueDate: this.dueInput.value || undefined,
      status: this.statusSel.value as DailyPlanStatus,
      priority: this.prioSel.value as DailyPlanPriority,
      tagIds: this.selectedTagIds.slice(),
      projectId: this.projSel.value || undefined,
      worktreeSlug: sanitizeSlug(this.slugInput.value) || undefined,
      order: nextOrder(this.dateInput.value || this.selectedDate, this.statusSel.value as DailyPlanStatus),
      createdAt: now,
      updatedAt: now
    }
    dailyTaskRepo.upsert(newTask)
    // Assign the stable issue key immediately on creation (idempotent — it stays
    // fixed for the task's lifetime).
    assignIssueKey(newTask)
    return newTask
  }
}
