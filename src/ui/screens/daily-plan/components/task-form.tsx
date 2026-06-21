import type {
  DailyPlanTask,
  DailyPlanStatus,
  DailyPlanPriority
} from '@ui/types/types'
import { uid } from '@ui/state/state'
import { dailyTaskRepo } from '@repositories'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import { showRemindModal } from '../../reminders/reminders'
import { createDateField, createOverlay } from '@ui/components'
import {
  FORM_STATUSES,
  PRIORITIES,
  assignIssueKey,
  sanitizeSlug,
  projectTree,
  nextOrder
} from '../daily-plan.state'
import { buildTagPicker } from './tag-picker'

export interface TaskFormProps {
  existing: DailyPlanTask | null
  onSaved: () => void
  defaultStatus?: DailyPlanStatus
  // The board's selected day; defaults new tasks' date and the unset-date
  // fallback. A getter so the form reads the live value at open time.
  getSelectedDate: () => string
  // Open a Claude terminal seeded with this task (owned by the board).
  openTaskInTerminal: (task: DailyPlanTask, onChange: () => void, useWorktree?: boolean) => void
}

// The create / edit task modal: title, description, tags, project, status,
// priority, date, due date, worktree slug — plus Save / Remind / Run actions.
export function showTaskForm({
  existing,
  onSaved,
  defaultStatus = 'todo',
  getSelectedDate,
  openTaskInTerminal
}: TaskFormProps): void {
  const selectedDate = getSelectedDate()

  const { overlay, mount, close, onClose } = createOverlay()
  overlay.classList.add('daily-plan-form-overlay')

  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  }
  onClose(() => document.removeEventListener('keydown', onKey, true))
  document.addEventListener('keydown', onKey, true)

  // Title
  const titleInput = (<textarea class="daily-plan-title-input" placeholder="What needs doing?" />) as HTMLTextAreaElement
  titleInput.rows = 2
  titleInput.value = existing?.title ?? ''
  const titleField = (
    <div class="field daily-plan-text-field">
      <label>Title</label>
      {titleInput}
    </div>
  ) as HTMLDivElement

  // Description (optional)
  const descInput = (<textarea class="daily-plan-desc-input" placeholder="Notes, links, context…" />) as HTMLTextAreaElement
  descInput.rows = 3
  descInput.value = existing?.description ?? ''
  const descField = (
    <div class="field daily-plan-text-field">
      <label>
        Description <span class="field-hint">(optional)</span>
      </label>
      {descInput}
    </div>
  ) as HTMLDivElement

  // Tags
  const tagPicker = (<div class="daily-plan-tag-picker" />) as HTMLDivElement
  const tagField = (
    <div class="field">
      <label>Tags</label>
      {tagPicker}
    </div>
  ) as HTMLDivElement

  const selectedTagIds: string[] = [...(existing?.tagIds ?? [])]
  buildTagPicker(tagPicker, selectedTagIds)

  // Project (required) — provides the terminal cwd and the issue-key prefix used
  // to assign the task's stable issue key immediately on save.
  const projSel = document.createElement('select')
  const noneOpt = document.createElement('option')
  noneOpt.value = ''
  noneOpt.textContent = '— Select a project —'
  projSel.appendChild(noneOpt)
  const projectList = projectTree()
  const projects = projectList.map((x) => x.p)
  for (const { p, depth } of projectList) {
    const o = document.createElement('option')
    o.value = p.id
    const label = p.issueKeyPrefix ? `${p.name} (${p.issueKeyPrefix})` : p.name
    // Indent sub-projects so the project hierarchy reads in the dropdown (todo5).
    o.textContent = '   '.repeat(depth) + (depth ? '└ ' : '') + label
    projSel.appendChild(o)
  }
  projSel.value = existing?.projectId ?? ''
  const projHint = (<div class="daily-plan-proj-hint" />) as HTMLDivElement
  const updateProjHint = (): void => {
    const p = projSel.value ? projects.find((x) => x.id === projSel.value) : null
    projHint.textContent = p ? p.path : ''
  }
  projSel.addEventListener('change', () => {
    updateProjHint()
    if (projSel.value) projSel.classList.remove('field-invalid')
  })
  updateProjHint()
  // Wrap the select + path hint in a column so the select keeps the same width
  // as the other fields and the hint sits beneath it (not squeezed beside it).
  const projField = (
    <div class="field">
      <label>Project</label>
      <div class="field-control-col">
        {projSel}
        {projHint}
      </div>
    </div>
  ) as HTMLDivElement

  // Status
  const statusSel = document.createElement('select')
  for (const s of FORM_STATUSES) {
    const o = document.createElement('option')
    o.value = s.id
    o.textContent = s.label
    statusSel.appendChild(o)
  }
  statusSel.value = existing?.status ?? defaultStatus
  const statusField = (
    <div class="field">
      <label>Status</label>
      {statusSel}
    </div>
  ) as HTMLDivElement

  // Priority
  const prioSel = document.createElement('select')
  for (const p of PRIORITIES) {
    const o = document.createElement('option')
    o.value = p.id
    o.textContent = p.label
    prioSel.appendChild(o)
  }
  prioSel.value = existing?.priority ?? 'medium'
  const prioField = (
    <div class="field">
      <label>Priority</label>
      {prioSel}
    </div>
  ) as HTMLDivElement

  // Date
  const dateInput = createDateField({ mode: 'date', value: existing?.date ?? selectedDate })
  const dateField = (
    <div class="field">
      <label>Date</label>
      {dateInput}
    </div>
  ) as HTMLDivElement

  // Due date (optional) — when set, cards show the time left / overdue.
  const dueInput = createDateField({ mode: 'date', value: existing?.dueDate ?? '' })
  const dueField = (
    <div class="field">
      <label>
        Due date <span class="field-hint">(optional)</span>
      </label>
      {dueInput}
    </div>
  ) as HTMLDivElement

  // Worktree slug (optional) — when set, it's appended to the issue key for the
  // worktree branch/name (e.g. CRF-12 → CRF-12-fix-login). Empty → the worktree is
  // named by the issue key alone.
  const slugInput = (<input type="text" placeholder="e.g. fix-login" />) as HTMLInputElement
  slugInput.value = existing?.worktreeSlug ?? ''
  const slugHint = (<div class="daily-plan-proj-hint" />) as HTMLDivElement
  const updateSlugHint = (): void => {
    const slug = sanitizeSlug(slugInput.value)
    if (!slug) {
      slugHint.textContent = ''
      return
    }
    const p = projSel.value ? projects.find((x) => x.id === projSel.value) : null
    const keyPreview =
      existing?.issueKey ?? (p?.issueKeyPrefix?.trim() ? `${p.issueKeyPrefix.trim()}-#` : 'KEY')
    slugHint.textContent = `Worktree: ${keyPreview}-${slug}`
  }
  slugInput.addEventListener('input', updateSlugHint)
  projSel.addEventListener('change', updateSlugHint)
  updateSlugHint()
  const slugField = (
    <div class="field">
      <label>
        Worktree slug <span class="field-hint">(optional)</span>
      </label>
      <div class="field-control-col">
        {slugInput}
        {slugHint}
      </div>
    </div>
  ) as HTMLDivElement

  // Persist the form into a task (updating `existing` or creating a new one) and
  // return it; null when the title is empty. Shared by Save and Remind.
  const commit = (): DailyPlanTask | null => {
    const title = titleInput.value.trim()
    if (!title) {
      titleInput.focus()
      return null
    }
    // Project is required so every task gets a stable issue key assigned the
    // moment it's created (the key derives from the project's prefix).
    if (!projSel.value) {
      projSel.classList.add('field-invalid')
      projSel.focus()
      return null
    }
    const now = Date.now()
    const description = descInput.value.trim()
    if (existing) {
      existing.title = title
      existing.description = description || undefined
      existing.status = statusSel.value as DailyPlanStatus
      existing.priority = prioSel.value as DailyPlanPriority
      existing.date = dateInput.value || selectedDate
      existing.dueDate = dueInput.value || undefined
      existing.tagIds = selectedTagIds.slice()
      existing.projectId = projSel.value || undefined
      existing.worktreeSlug = sanitizeSlug(slugInput.value) || undefined
      existing.updatedAt = now
      assignIssueKey(existing)
      dailyTaskRepo.upsert(existing)
      return existing
    }
    const newTask: DailyPlanTask = {
      id: uid('task'),
      title,
      description: description || undefined,
      date: dateInput.value || selectedDate,
      dueDate: dueInput.value || undefined,
      status: statusSel.value as DailyPlanStatus,
      priority: prioSel.value as DailyPlanPriority,
      tagIds: selectedTagIds.slice(),
      projectId: projSel.value || undefined,
      worktreeSlug: sanitizeSlug(slugInput.value) || undefined,
      order: nextOrder(dateInput.value || selectedDate, statusSel.value as DailyPlanStatus),
      createdAt: now,
      updatedAt: now
    }
    dailyTaskRepo.upsert(newTask)
    // Assign the stable issue key immediately on creation (idempotent — it stays
    // fixed for the task's lifetime).
    assignIssueKey(newTask)
    return newTask
  }

  // Actions
  const save = (<button class="button-primary">Save</button>) as HTMLButtonElement
  save.addEventListener('click', () => {
    if (!commit()) return
    close()
    onSaved()
  })
  const actions = (
    <div class="modal-actions">
      <button onClick={() => close()}>Cancel</button>
      <button
        title="Save and set a reminder for this task"
        onClick={() => {
          const task = commit()
          if (!task) return
          close()
          onSaved()
          showRemindModal(task.title, task.title, { kind: 'dailyTask', taskId: task.id })
        }}
      >
        ⏰ Remind…
      </button>
      <button
        title="Save and open a Claude session seeded with this task"
        onClick={() => {
          const task = commit()
          if (!task) return
          close()
          onSaved()
          void openTaskInTerminal(task, onSaved)
        }}
      >
        ▶ Run in claude session
      </button>
      <button
        title="Create a worktree (branch = issue key) and run the Claude session there"
        onClick={() => {
          const task = commit()
          if (!task) return
          close()
          onSaved()
          void openTaskInTerminal(task, onSaved, true)
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
      {titleField}
      {descField}
      {tagField}
      {projField}
      {statusField}
      {prioField}
      {dateField}
      {dueField}
      {slugField}
      {actions}
    </div>
  ) as HTMLDivElement
  overlay.appendChild(modal)

  mount()
  titleInput.focus()
  titleInput.select()
}
