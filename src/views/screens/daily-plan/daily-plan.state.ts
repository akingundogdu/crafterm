import { UITexts } from '@texts'
import type {
  DailyPlanTask,
  DailyPlanTag,
  DailyPlanStatus,
  DailyPlanPriority,
  ProjectNode,
  SidebarNode
} from '@views/types/types'
import { state } from '@views/state/spine'
import { dailyTaskRepo, dailyTagRepo } from '@repositories'
import { findProjectById } from '@views/catalog/catalog'
import { ymd, parseYmd, shiftDays } from './task-helpers'
import type { DailyRange } from './daily-plan.types'

// Pure logic + constants for the Daily Plan board. The view (`daily-plan.tsx`)
// owns the closure-bound render/drag/form orchestration and the module-mutable
// board state (selected date/range/filters); this module holds everything that
// derives from the repos without touching that orchestration.

// Board columns. 'review' is intentionally absent — it's an intermediate status
// whose tasks render under the In Progress (wip) column (see boardColumnOf).
export const STATUSES: { id: DailyPlanStatus; label: string }[] = [
  { id: 'backlog', label: UITexts.DailyPlan.status.backlog },
  { id: 'todo', label: UITexts.DailyPlan.status.todo },
  { id: 'wip', label: UITexts.DailyPlan.status.wip },
  { id: 'done', label: UITexts.DailyPlan.status.done }
]

// Date-range options for the board header's range picker.
export const RANGES: { val: DailyRange; label: string }[] = [
  { val: 'day', label: UITexts.DailyPlan.range.today },
  { val: '3d', label: UITexts.DailyPlan.range.last3 },
  { val: '7d', label: UITexts.DailyPlan.range.last7 },
  { val: 'all', label: UITexts.DailyPlan.range.all }
]

// Full status list for the task form's Status dropdown — includes Code Review
// and Test, which the board omits as columns.
export const FORM_STATUSES: { id: DailyPlanStatus; label: string }[] = [
  { id: 'backlog', label: UITexts.DailyPlan.status.backlog },
  { id: 'todo', label: UITexts.DailyPlan.status.todo },
  { id: 'wip', label: UITexts.DailyPlan.status.wip },
  { id: 'review', label: UITexts.DailyPlan.status.review },
  { id: 'test', label: UITexts.DailyPlan.status.test },
  { id: 'done', label: UITexts.DailyPlan.status.done }
]

export const PRIORITIES: { id: DailyPlanPriority; label: string }[] = [
  { id: 'low', label: UITexts.DailyPlan.priority.low },
  { id: 'medium', label: UITexts.DailyPlan.priority.medium },
  { id: 'high', label: UITexts.DailyPlan.priority.high }
]

const TAG_PALETTE = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b'
]

export const STATUS_LABEL: Record<DailyPlanStatus, string> = {
  backlog: UITexts.DailyPlan.status.backlog,
  todo: UITexts.DailyPlan.status.todo,
  wip: UITexts.DailyPlan.status.wip,
  review: UITexts.DailyPlan.status.review,
  test: UITexts.DailyPlan.status.test,
  done: 'Done'
}

export function nextTagColor(): string {
  const used = new Set(dailyTagRepo.getAll().map((t) => t.color))
  return TAG_PALETTE.find((c) => !used.has(c)) ?? TAG_PALETTE[dailyTagRepo.getAll().length % TAG_PALETTE.length]
}

export function todayKey(): string {
  const d = new Date()
  return ymd(d)
}

// Whole-day difference from today to a YYYY-MM-DD date (negative = in the past).
function daysUntil(dateStr: string): number {
  const ms = parseYmd(dateStr).getTime() - parseYmd(todayKey()).getTime()
  return Math.round(ms / 86400000)
}

// Short due-date label (e.g. "Jun 10") for already-finished tasks.
export function shortDue(dateStr: string): string {
  return parseYmd(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// "Time left" label + urgency class for a due date relative to today.
export function dueInfo(dateStr: string): { label: string; cls: 'overdue' | 'soon' | 'normal' } {
  const d = daysUntil(dateStr)
  if (d < 0) {
    const n = -d
    return { label: n === 1 ? UITexts.DailyPlan.due.overdueOne : UITexts.DailyPlan.due.overdueMany(n), cls: 'overdue' }
  }
  if (d === 0) return { label: UITexts.DailyPlan.due.today, cls: 'soon' }
  if (d === 1) return { label: UITexts.DailyPlan.due.tomorrow, cls: 'soon' }
  if (d <= 3) return { label: UITexts.DailyPlan.due.daysLeft(d), cls: 'soon' }
  return { label: UITexts.DailyPlan.due.daysLeft(d), cls: 'normal' }
}

export function formatHeader(date: string): string {
  const d = parseYmd(date)
  const weekday = d.toLocaleDateString(undefined, { weekday: 'long' })
  const month = d.toLocaleDateString(undefined, { month: 'long' })
  const today = todayKey()
  const prefix = date === today ? UITexts.DailyPlan.headerPrefix.today : date === shiftDays(today, -1) ? UITexts.DailyPlan.headerPrefix.yesterday : date === shiftDays(today, 1) ? UITexts.DailyPlan.headerPrefix.tomorrow : ''
  return `${prefix}${weekday}, ${month} ${d.getDate()}, ${d.getFullYear()}`
}

export function tasksFor(date: string): DailyPlanTask[] {
  return dailyTaskRepo.getAll().filter((t) => t.date === date)
}

export function tagById(id: string): DailyPlanTag | undefined {
  return dailyTagRepo.getAll().find((t) => t.id === id)
}

// Assign the task a stable issue key (e.g. CRF-12) from its project's prefix.
// Returns the key, or null when the task has no project / the project has no
// prefix configured. Idempotent: an already-keyed task keeps its key.
export function assignIssueKey(task: DailyPlanTask): string | null {
  if (task.issueKey) return task.issueKey
  const project = task.projectId ? findProjectById(state.tree, task.projectId) : null
  const prefix = project?.issueKeyPrefix?.trim()
  if (!prefix) return null
  const re = new RegExp(`^${prefix}-(\\d+)$`)
  let max = 0
  for (const t of dailyTaskRepo.getAll()) {
    const m = t.issueKey?.match(re)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  task.issueKey = `${prefix}-${max + 1}`
  task.updatedAt = Date.now()
  dailyTaskRepo.upsert(task)
  return task.issueKey
}

// Sanitize a user-entered slug into a git-branch-safe segment: lowercase, runs of
// non-alphanumeric characters collapsed to a single dash, leading/trailing dashes
// trimmed. Returns '' when nothing usable remains.
export function sanitizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// The worktree branch (== directory name) for a task: its issue key, optionally
// suffixed with the user-provided slug (e.g. CRF-12 → CRF-12-slug). Shared by the
// "run in worktree" and "delete worktree on done" paths so both resolve the same
// node.
export function worktreeBranchForTask(task: DailyPlanTask, key: string): string {
  const slug = sanitizeSlug(task.worktreeSlug ?? '')
  return slug ? `${key}-${slug}` : key
}

// Projects in tree order with their nesting depth (sub-projects indented), so the
// task form's project dropdown reads as a hierarchy (todo5). Folders/worktrees are
// descended into without adding a level.
export function projectTree(): { p: ProjectNode; depth: number }[] {
  const out: { p: ProjectNode; depth: number }[] = []
  const walk = (nodes: SidebarNode[], depth: number): void => {
    for (const n of nodes) {
      if (n.kind === 'project') {
        out.push({ p: n, depth })
        walk(n.children, depth + 1)
      } else if (n.kind === 'folder' || n.kind === 'worktree') {
        walk(n.children, depth)
      }
    }
  }
  walk(state.tree, 0)
  return out
}

export function taskById(id: string): DailyPlanTask | undefined {
  return dailyTaskRepo.getAll().find((t) => t.id === id)
}

export function nextOrder(date: string, status: DailyPlanStatus): number {
  const peers = dailyTaskRepo.getAll().filter((t) => t.date === date && t.status === status)
  return peers.length ? Math.max(...peers.map((t) => t.order)) + 1 : 0
}

export function findInsertBefore(body: HTMLElement, y: number): string | null {
  const cards = Array.from(body.querySelectorAll<HTMLElement>('.daily-plan-card:not(.dragging)'))
  for (const c of cards) {
    const r = c.getBoundingClientRect()
    if (y < r.top + r.height / 2) return c.dataset.taskId ?? null
  }
  return null
}

export function reorderWithin(task: DailyPlanTask, status: DailyPlanStatus, beforeId: string | null): void {
  const peers = dailyTaskRepo.getAll()
    .filter((t) => t.date === task.date && t.status === status && t.id !== task.id)
    .sort((a, b) => a.order - b.order)
  const insertIdx = beforeId == null ? peers.length : peers.findIndex((t) => t.id === beforeId)
  const idx = insertIdx < 0 ? peers.length : insertIdx
  peers.splice(idx, 0, task)
  peers.forEach((t, i) => (t.order = i))
}

// ---- Changelog report --------------------------------------------------

// Day-range options for the changelog window (filtered by task.updatedAt).
export const CHANGELOG_RANGES: { id: string; label: string }[] = [
  { id: 'today', label: UITexts.DailyPlan.range.today },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '2d', label: UITexts.DailyPlan.range.last2 },
  { id: '3d', label: UITexts.DailyPlan.range.last3 },
  { id: '4d', label: UITexts.DailyPlan.range.last4 },
  { id: '5d', label: UITexts.DailyPlan.range.last5 },
  { id: '7d', label: UITexts.DailyPlan.range.last7 },
  { id: '10d', label: UITexts.DailyPlan.range.last10 }
]

// Midnight (local) of today as a ms epoch — the anchor for changelog windows.
function startOfTodayMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// [from, to) ms window for a changelog range id, relative to today's midnight.
function changelogWindow(id: string): { from: number; to: number } {
  const start = startOfTodayMs()
  const day = 86400000
  switch (id) {
    case 'today':
      return { from: start, to: Infinity }
    case 'yesterday':
      return { from: start - day, to: start }
    default: {
      // "Last N days" = from N days ago through today (e.g. last 5 days on Jun 15
      // covers Jun 10–15).
      const span = parseInt(id, 10) || 1 // '2d' → 2, '5d' → 5
      return { from: start - span * day, to: Infinity }
    }
  }
}

// "Jun 12, 2026" for a YYYY-MM-DD key.
function fullDateLabel(dateStr: string): string {
  return parseYmd(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

// Human label for the span a changelog range covers (e.g. "Jun 8 – Jun 12, 2026").
function changelogRangeDateLabel(id: string): string {
  const today = todayKey()
  if (id === 'today') return fullDateLabel(today)
  if (id === 'yesterday') return fullDateLabel(shiftDays(today, -1))
  const span = parseInt(id, 10) || 1
  return `${shortDue(shiftDays(today, -span))} – ${fullDateLabel(today)}`
}

// Build the markdown changelog: every done task whose card day (date) OR
// last-touched time (updatedAt) falls in the window, as a single flat list
// ordered newest-first by day.
export function buildChangelogMarkdown(rangeId: string): string {
  const { from, to } = changelogWindow(rangeId)
  const inWindow = (ms: number): boolean => ms >= from && ms < to
  const done = dailyTaskRepo.getAll()
    .filter(
      (t) =>
        t.status === 'done' &&
        (inWindow(t.updatedAt) || inWindow(parseYmd(t.date).getTime()))
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt)

  const lines: string[] = [`# Changelog (${changelogRangeDateLabel(rangeId)})`, '']
  if (!done.length) {
    lines.push('_No completed tasks in this range._')
  } else {
    for (const t of done) lines.push(`- ${t.title.trim()}`)
  }
  return lines.join('\n').trim() + '\n'
}
