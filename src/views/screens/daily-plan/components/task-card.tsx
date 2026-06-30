import { Component } from '@geajs/core'
import type { DailyPlanTask } from '@views/types/types'
import { promptConfirm } from '@views/components/dialog/confirm'
import { showRemindModal } from '@views/screens/reminders/components/remind-modal'
import { parseYmd, shiftDays } from '@views/screens/daily-plan/task-helpers'
import { todayKey, shortDue, dueInfo, tagById, sanitizeSlug, worktreeBranchForTask, taskById } from '@views/screens/daily-plan/daily-plan.state'
import { showTaskForm, openTaskInTerminal } from '@ui/screens/daily-plan/daily-plan'
import store from '../daily-plan.store'

// gea port of the draggable task card. The legacy card is an imperative
// createElement factory wired with addEventListener; here the markup is a gea
// template and actions either mutate the reactive store (delete) or reuse the
// legacy modal/terminal flows (run/remind/edit) via co-existence.
export default class TaskCard extends Component {
  declare props: { task: DailyPlanTask }

  private reload = (): void => store.reload()

  // The `task` prop is a gea reactive proxy. Legacy flows that MUTATE the task
  // (openTaskInTerminal sets status; the form edits fields) must receive the raw
  // repo object — assigning through the proxy from outside a store throws
  // ("Cannot redefine property: Symbol(...)"). taskById returns the raw object.
  private raw = (): DailyPlanTask => taskById(this.props.task.id) ?? this.props.task

  private onDelete = async (e: MouseEvent): Promise<void> => {
    e.stopPropagation()
    const task = this.props.task
    const ok = await promptConfirm({ title: 'Delete task', message: `Delete "${task.title}"?`, confirmText: 'Delete' })
    if (ok) store.removeTask(task.id)
  }

  template({ task }: this['props']) {
    const searchText =
      `${task.title} ${task.description ?? ''} ${task.issueKey ?? ''} ${task.worktreeSlug ?? ''}`.toLowerCase()
    const multiDay = store.selectedRange !== 'day'
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
        onClick={() => showTaskForm(this.raw(), this.reload)}
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
                void openTaskInTerminal(this.raw(), this.reload)
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
                showTaskForm(this.raw(), this.reload)
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
