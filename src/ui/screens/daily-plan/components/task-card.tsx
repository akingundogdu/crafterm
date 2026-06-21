import type { DailyPlanTask } from '@ui/types/types'
import { dailyTaskRepo } from '@repositories'
import { promptConfirm } from '@ui/components/dialog/dialog'
import { showRemindModal } from '../../reminders/reminders'
import { parseYmd, shiftDays } from '../task-helpers'
import {
  todayKey,
  shortDue,
  dueInfo,
  tagById,
  sanitizeSlug,
  worktreeBranchForTask
} from '../daily-plan.state'

export interface TaskCardProps {
  task: DailyPlanTask
  rerender: () => void
  // The current board scope; drives the per-card day label in multi-day views.
  // A getter so the card reads the live value at build time.
  getSelectedRange: () => 'day' | '3d' | '7d'
  // Open a Claude terminal seeded with this task (owned by the board).
  openTaskInTerminal: (task: DailyPlanTask, onChange: () => void, useWorktree?: boolean) => void
  // Open the create/edit task form for this task (owned by the board).
  showTaskForm: (existing: DailyPlanTask, onSaved: () => void) => void
}

// Draggable task card: priority dot, branch/issue chip, review/test badge, action
// icons (run / remind / edit / delete), due-date + day labels, description, tags.
// Business actions are injected so the card stays a pure DOM factory.
export function renderCard({
  task,
  rerender,
  getSelectedRange,
  openTaskInTerminal,
  showTaskForm
}: TaskCardProps): HTMLElement {
  const selectedRange = getSelectedRange()

  // Searchable text for the per-column filter (title + description + issue key + slug).
  const searchText =
    `${task.title} ${task.description ?? ''} ${task.issueKey ?? ''} ${task.worktreeSlug ?? ''}`.toLowerCase()

  const top = (<div class="daily-plan-card-top" />) as HTMLDivElement

  const dot = (
    <span
      class={`daily-plan-priority-dot priority-${task.priority}`}
      title={`${task.priority[0].toUpperCase() + task.priority.slice(1)} priority`}
    />
  ) as HTMLSpanElement
  top.appendChild(dot)

  // When the task carries a worktree slug, show its full worktree branch name
  // (issue key + slug) as a branch chip; otherwise fall back to the plain issue
  // key chip.
  if (task.worktreeSlug) {
    top.appendChild(
      (
        <span class="daily-plan-card-branch" title="Worktree branch">
          {`⑂ ${task.issueKey ? worktreeBranchForTask(task, task.issueKey) : sanitizeSlug(task.worktreeSlug)}`}
        </span>
      ) as HTMLSpanElement
    )
  } else if (task.issueKey) {
    top.appendChild((<span class="daily-plan-card-key">{task.issueKey}</span>) as HTMLSpanElement)
  }

  // Review/Test tasks share the In Progress column, so a small badge sets them apart.
  if (task.status === 'review') {
    top.appendChild((<span class="daily-plan-card-review">Review</span>) as HTMLSpanElement)
  } else if (task.status === 'test') {
    top.appendChild((<span class="daily-plan-card-test">Test</span>) as HTMLSpanElement)
  }

  const cardActions = (
    <div class="daily-plan-card-actions">
      <button
        class="daily-plan-card-icon"
        title="Open in Claude terminal"
        onClick={(e: MouseEvent) => {
          e.stopPropagation()
          void openTaskInTerminal(task, rerender)
        }}
      >
        ▶
      </button>
      <button
        class="daily-plan-card-icon"
        title="Remind me"
        onClick={(e: MouseEvent) => {
          e.stopPropagation()
          showRemindModal(task.title, task.title, { kind: 'dailyTask', taskId: task.id })
        }}
      >
        ⏰
      </button>
      <button
        class="daily-plan-card-icon"
        title="Edit"
        onClick={(e: MouseEvent) => {
          e.stopPropagation()
          showTaskForm(task, rerender)
        }}
      >
        ✎
      </button>
      <button
        class="daily-plan-card-icon"
        title="Delete"
        onClick={async (e: MouseEvent) => {
          e.stopPropagation()
          const ok = await promptConfirm({
            title: 'Delete task',
            message: `Delete "${task.title}"?`,
            confirmText: 'Delete'
          })
          if (!ok) return
          dailyTaskRepo.remove(task.id)
          rerender()
        }}
      >
        ×
      </button>
    </div>
  ) as HTMLDivElement
  top.appendChild(cardActions)

  // The title is rendered below the meta row as a full-width block (appended
  // after `top`), so long titles read on their own line instead of being
  // squeezed between the key chip and the action icons.
  const title = (<div class="daily-plan-card-title">{task.title}</div>) as HTMLDivElement

  const card = (
    <div class={`daily-plan-card priority-${task.priority}`} dataset={{ taskId: task.id, search: searchText }}>
      {top}
      {title}
    </div>
  ) as HTMLDivElement
  card.draggable = true

  card.addEventListener('dragstart', (e) => {
    card.classList.add('dragging')
    e.dataTransfer?.setData('text/plain', task.id)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  })
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging')
  })

  // Due date: show the time left (or overdue) for unfinished tasks; finished
  // ones just show the date so the urgency colours don't linger.
  if (task.dueDate) {
    const due = document.createElement('div')
    due.className = 'daily-plan-card-due'
    if (task.status === 'done') {
      due.classList.add('done')
      due.textContent = `Due ${shortDue(task.dueDate)}`
    } else {
      const info = dueInfo(task.dueDate)
      due.classList.add(info.cls)
      due.textContent = info.label
    }
    card.appendChild(due)
  }

  // In a multi-day range view, surface which day each card belongs to.
  if (selectedRange !== 'day') {
    const d = parseYmd(task.date)
    const today = todayKey()
    const dateLabel =
      task.date === today
        ? 'Today'
        : task.date === shiftDays(today, -1)
          ? 'Yesterday'
          : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    card.appendChild((<div class="daily-plan-card-date">{dateLabel}</div>) as HTMLDivElement)
  }

  if (task.description && task.description.trim()) {
    card.appendChild(
      (<div class="daily-plan-card-desc">{task.description.trim()}</div>) as HTMLDivElement
    )
  }

  if (task.tagIds.length) {
    const tagRow = (<div class="daily-plan-card-tags" />) as HTMLDivElement
    for (const tagId of task.tagIds) {
      const tag = tagById(tagId)
      if (!tag) continue
      tagRow.appendChild(
        (
          <span class="daily-plan-tag-chip" style={{ backgroundColor: tag.color }}>
            {tag.name}
          </span>
        ) as HTMLSpanElement
      )
    }
    card.appendChild(tagRow)
  }

  card.addEventListener('click', () => showTaskForm(task, rerender))

  return card
}
