import { Component } from '@geajs/core'
import type { DailyPlanTask } from '@views/types/types'
import { dailyTaskRepo } from '@repositories'
import { promptConfirm } from '@views/components/dialog/confirm'
import { showRemindModal } from '@views/screens/reminders/components/remind-modal'
import { parseYmd, shiftDays } from '@views/screens/daily-plan/task-helpers'
import {
  todayKey,
  shortDue,
  dueInfo,
  tagById,
  taskById,
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

// gea port of the draggable compact-view task card: priority dot, branch/issue
// chip, review/test badge, action icons (run / remind / edit / delete), due-date +
// day labels, description, tags. Rendered as a JSX child of DailyCompact, so gea
// populates `this.props`. The business actions are injected as props (the compact
// view drives its own non-store scope, distinct from the reactive board TaskCard).
// Self-contained — no @ui (§2.7).
export default class CompactCard extends Component {
  declare props: TaskCardProps

  // The `task` prop may be a gea reactive proxy; flows that MUTATE the task
  // (openTaskInTerminal sets status; the form edits fields) must receive the raw
  // repo object — assigning through the proxy from outside a store throws.
  private raw = (): DailyPlanTask => taskById(this.props.task.id) ?? this.props.task

  private onDelete = async (e: MouseEvent): Promise<void> => {
    e.stopPropagation()
    const task = this.props.task
    const ok = await promptConfirm({ title: 'Delete task', message: `Delete "${task.title}"?`, confirmText: 'Delete' })
    if (!ok) return
    dailyTaskRepo.remove(task.id)
    this.props.rerender()
  }

  template({ task, rerender, getSelectedRange, openTaskInTerminal, showTaskForm }: this['props']) {
    const selectedRange = getSelectedRange()
    // Searchable text for the per-column filter (title + description + issue key + slug).
    const searchText =
      `${task.title} ${task.description ?? ''} ${task.issueKey ?? ''} ${task.worktreeSlug ?? ''}`.toLowerCase()
    const multiDay = selectedRange !== 'day'
    const today = todayKey()
    const dayLabel = !multiDay
      ? ''
      : task.date === today
        ? 'Today'
        : task.date === shiftDays(today, -1)
          ? 'Yesterday'
          : parseYmd(task.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    const due = dueInfo(task.dueDate ?? '')
    const tags = task.tagIds.map((id) => tagById(id)).filter((t): t is NonNullable<typeof t> => !!t)

    return (
      <div
        class={`daily-plan-card priority-${task.priority}`}
        data-task-id={task.id}
        data-search={searchText}
        draggable={true}
        onDragStart={(e: DragEvent) => {
          ;(e.currentTarget as HTMLElement).classList.add('dragging')
          e.dataTransfer?.setData('text/plain', task.id)
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={(e: DragEvent) => (e.currentTarget as HTMLElement).classList.remove('dragging')}
        onClick={() => showTaskForm(this.raw(), rerender)}
      >
        <div class="daily-plan-card-top">
          <span
            class={`daily-plan-priority-dot priority-${task.priority}`}
            title={`${task.priority[0].toUpperCase() + task.priority.slice(1)} priority`}
          />
          {task.worktreeSlug ? (
            <span class="daily-plan-card-branch" title="Worktree branch">
              {`⑂ ${task.issueKey ? worktreeBranchForTask(task, task.issueKey) : sanitizeSlug(task.worktreeSlug)}`}
            </span>
          ) : task.issueKey ? (
            <span class="daily-plan-card-key">{task.issueKey}</span>
          ) : null}
          {task.status === 'review' && <span class="daily-plan-card-review">Review</span>}
          {task.status === 'test' && <span class="daily-plan-card-test">Test</span>}
          <div class="daily-plan-card-actions">
            <button
              class="daily-plan-card-icon"
              title="Open in Claude terminal"
              onClick={(e: MouseEvent) => {
                e.stopPropagation()
                void openTaskInTerminal(this.raw(), rerender)
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
                showTaskForm(this.raw(), rerender)
              }}
            >
              ✎
            </button>
            <button class="daily-plan-card-icon" title="Delete" onClick={this.onDelete}>
              ×
            </button>
          </div>
        </div>
        <div class="daily-plan-card-title">{task.title}</div>
        {task.dueDate &&
          (task.status === 'done' ? (
            <div class="daily-plan-card-due done">{`Due ${shortDue(task.dueDate)}`}</div>
          ) : (
            <div class={`daily-plan-card-due ${due.cls}`}>{due.label}</div>
          ))}
        {multiDay && <div class="daily-plan-card-date">{dayLabel}</div>}
        {task.description && task.description.trim() && (
          <div class="daily-plan-card-desc">{task.description.trim()}</div>
        )}
        {tags.length > 0 && (
          <div class="daily-plan-card-tags">
            {tags.map((tag) => (
              <span key={tag.id} class="daily-plan-tag-chip" style={{ backgroundColor: tag.color }}>
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }
}
