import type { DailyPlanTask } from '@views/types/types'
import { dailyTaskRepo } from '@repositories'
import { el } from '@views/lib/dom'
import { promptConfirm } from '@views/components/dialog/confirm'
import { showRemindModal } from '@views/screens/reminders/components/remind-modal'
import { parseYmd, shiftDays } from '@views/screens/daily-plan/task-helpers'
import {
  todayKey,
  shortDue,
  dueInfo,
  tagById,
  sanitizeSlug,
  worktreeBranchForTask
} from '@views/screens/daily-plan/daily-plan.state'

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

// Draggable task card for the compact (Notebook) view: priority dot, branch/issue
// chip, review/test badge, action icons (run / remind / edit / delete), due-date +
// day labels, description, tags. Plain-DOM port of the legacy imperative card;
// business actions are injected so the card stays a pure DOM factory. The board
// uses the reactive gea TaskCard; this builder serves the compact view's
// independent (non-store) scope. Self-contained — no @ui (§2.7).
export function renderCard({ task, rerender, getSelectedRange, openTaskInTerminal, showTaskForm }: TaskCardProps): HTMLElement {
  const selectedRange = getSelectedRange()

  // Searchable text for the per-column filter (title + description + issue key + slug).
  const searchText =
    `${task.title} ${task.description ?? ''} ${task.issueKey ?? ''} ${task.worktreeSlug ?? ''}`.toLowerCase()

  const top = el('div', { class: 'daily-plan-card-top' })

  top.appendChild(
    el('span', {
      class: `daily-plan-priority-dot priority-${task.priority}`,
      title: `${task.priority[0].toUpperCase() + task.priority.slice(1)} priority`
    })
  )

  // When the task carries a worktree slug, show its full worktree branch name
  // (issue key + slug) as a branch chip; otherwise fall back to the plain issue
  // key chip.
  if (task.worktreeSlug) {
    top.appendChild(
      el(
        'span',
        { class: 'daily-plan-card-branch', title: 'Worktree branch' },
        `⑂ ${task.issueKey ? worktreeBranchForTask(task, task.issueKey) : sanitizeSlug(task.worktreeSlug)}`
      )
    )
  } else if (task.issueKey) {
    top.appendChild(el('span', { class: 'daily-plan-card-key' }, task.issueKey))
  }

  // Review/Test tasks share the In Progress column, so a small badge sets them apart.
  if (task.status === 'review') {
    top.appendChild(el('span', { class: 'daily-plan-card-review' }, 'Review'))
  } else if (task.status === 'test') {
    top.appendChild(el('span', { class: 'daily-plan-card-test' }, 'Test'))
  }

  const cardActions = el(
    'div',
    { class: 'daily-plan-card-actions' },
    el(
      'button',
      {
        class: 'daily-plan-card-icon',
        title: 'Open in Claude terminal',
        onClick: (e: MouseEvent) => {
          e.stopPropagation()
          void openTaskInTerminal(task, rerender)
        }
      },
      '▶'
    ),
    el(
      'button',
      {
        class: 'daily-plan-card-icon',
        title: 'Remind me',
        onClick: (e: MouseEvent) => {
          e.stopPropagation()
          showRemindModal(task.title, task.title, { kind: 'dailyTask', taskId: task.id })
        }
      },
      '⏰'
    ),
    el(
      'button',
      {
        class: 'daily-plan-card-icon',
        title: 'Edit',
        onClick: (e: MouseEvent) => {
          e.stopPropagation()
          showTaskForm(task, rerender)
        }
      },
      '✎'
    ),
    el(
      'button',
      {
        class: 'daily-plan-card-icon',
        title: 'Delete',
        onClick: async (e: MouseEvent) => {
          e.stopPropagation()
          const ok = await promptConfirm({ title: 'Delete task', message: `Delete "${task.title}"?`, confirmText: 'Delete' })
          if (!ok) return
          dailyTaskRepo.remove(task.id)
          rerender()
        }
      },
      '×'
    )
  )
  top.appendChild(cardActions)

  // The title is rendered below the meta row as a full-width block so long titles
  // read on their own line instead of being squeezed between chip and icons.
  const title = el('div', { class: 'daily-plan-card-title' }, task.title)

  const card = el('div', { class: `daily-plan-card priority-${task.priority}` }, top, title)
  card.dataset.taskId = task.id
  card.dataset.search = searchText
  card.draggable = true

  card.addEventListener('dragstart', (e) => {
    card.classList.add('dragging')
    e.dataTransfer?.setData('text/plain', task.id)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  })
  card.addEventListener('dragend', () => card.classList.remove('dragging'))

  // Due date: time left (or overdue) for unfinished tasks; finished ones just show
  // the date so the urgency colours don't linger.
  if (task.dueDate) {
    if (task.status === 'done') {
      card.appendChild(el('div', { class: 'daily-plan-card-due done' }, `Due ${shortDue(task.dueDate)}`))
    } else {
      const info = dueInfo(task.dueDate)
      card.appendChild(el('div', { class: `daily-plan-card-due ${info.cls}` }, info.label))
    }
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
    card.appendChild(el('div', { class: 'daily-plan-card-date' }, dateLabel))
  }

  if (task.description && task.description.trim()) {
    card.appendChild(el('div', { class: 'daily-plan-card-desc' }, task.description.trim()))
  }

  if (task.tagIds.length) {
    const tagRow = el('div', { class: 'daily-plan-card-tags' })
    for (const tag of task.tagIds.map((id) => tagById(id)).filter((t): t is NonNullable<typeof t> => !!t)) {
      const chip = el('span', { class: 'daily-plan-tag-chip' }, tag.name)
      chip.style.backgroundColor = tag.color
      tagRow.appendChild(chip)
    }
    card.appendChild(tagRow)
  }

  card.addEventListener('click', () => showTaskForm(task, rerender))

  return card
}
