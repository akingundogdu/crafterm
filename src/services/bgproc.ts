// Background processes ("hidden shells"): a worktree-owned PTY that runs a
// one-shot command (e.g. an iOS build/run) without occupying a visible pane. It
// is surfaced as a small sub-row under its worktree and viewable on demand — the
// view is a transient pane attached to the still-running PTY (close ≠ kill).
import { panes, state, requestSidebar, uid } from '@ui/state'
import { persistence } from './storage/persistence.service'
import { createPane } from '@ui/pane'
import { renderContent } from '@ui/screens/content/content'
import { allTabs, layoutContains, splitInLayout } from '@ui/tree'
import type {
  WorktreeNode,
  ProjectNode,
  BackgroundProcess,
  TabNode,
  SidebarNode,
  PaneRole
} from '@ui/types'
import { terminalService } from '@services'

// A node that can own hidden background shells: a worktree (iOS build/run) or a
// project (e.g. a `git worktree add` before the worktree node exists).
export type ProcHolder = WorktreeNode | ProjectNode

function holderCwd(holder: ProcHolder): string {
  return holder.kind === 'worktree' ? holder.worktreePath : holder.path
}

interface ProcLocation {
  holder: ProcHolder
  proc: BackgroundProcess
}

// One background process with its holder and the enclosing project (carries the
// iOS build config needed to terminate a run on its target). project is null for
// processes owned by a project node directly or with no project ancestor.
export interface CollectedProcess {
  proc: BackgroundProcess
  holder: ProcHolder
  project: ProjectNode | null
}

// Walk the whole tree and gather every tracked background process across all
// worktrees/projects, tagging each with its enclosing project for iOS stop.
export function collectBackgroundProcesses(): CollectedProcess[] {
  const out: CollectedProcess[] = []
  const walk = (nodes: SidebarNode[], project: ProjectNode | null): void => {
    for (const n of nodes) {
      const ownProject = n.kind === 'project' ? n : project
      if (n.kind === 'worktree' || n.kind === 'project') {
        for (const proc of n.processes ?? []) {
          out.push({ proc, holder: n, project: n.kind === 'project' ? n : project })
        }
      }
      if (n.kind === 'folder' || n.kind === 'project' || n.kind === 'worktree') {
        walk(n.children, ownProject)
      }
    }
  }
  walk(state.tree, null)
  return out
}

export function findProcess(stableId: string): ProcLocation | null {
  let hit: ProcLocation | null = null
  const walk = (nodes: SidebarNode[]): void => {
    for (const n of nodes) {
      if (n.kind === 'worktree' || n.kind === 'project') {
        const proc = n.processes?.find((p) => p.stableId === stableId)
        if (proc) {
          hit = { holder: n, proc }
          return
        }
      }
      if (n.kind === 'folder' || n.kind === 'project' || n.kind === 'worktree') walk(n.children)
      if (hit) return
    }
  }
  walk(state.tree)
  return hit
}

// Start a hidden process under a holder (worktree/project) and track it in
// holder.processes[]. Returns the stableId so callers can await its exit.
export async function startBackgroundProcess(
  holder: ProcHolder,
  spec: {
    title: string
    command: string
    role?: PaneRole
    cwd?: string
    target?: BackgroundProcess['target']
  }
): Promise<string> {
  const stableId = crypto.randomUUID()
  const cwd = spec.cwd ?? holderCwd(holder)
  if (!holder.processes) holder.processes = []
  holder.processes.push({
    stableId,
    title: spec.title,
    role: spec.role ?? 'build',
    status: 'running',
    command: spec.command,
    cwd,
    target: spec.target
  })
  await terminalService.procStart({ stableId, command: spec.command, cwd })
  requestSidebar()
  persistence.save()
  return stableId
}

// Pending one-shot waiters keyed by stableId, resolved by onProcessExit(code).
const exitWaiters = new Map<string, (code: number) => void>()

// Start a hidden process and resolve with its exit code when the PTY exits.
// Used by worktree create/remove so the UI can react on completion (not a timer).
export async function runHiddenAndWait(
  holder: ProcHolder,
  spec: { title: string; command: string; role?: PaneRole; cwd?: string }
): Promise<{ stableId: string; code: number }> {
  const stableId = await startBackgroundProcess(holder, spec)
  const code = await new Promise<number>((resolve) => exitWaiters.set(stableId, resolve))
  return { stableId, code }
}

// Drop a tracked process from its holder (e.g. a finished one-shot create/remove
// shell whose row should not linger).
export function removeProcess(stableId: string): void {
  const found = findProcess(stableId)
  if (found?.holder.processes) {
    found.holder.processes = found.holder.processes.filter((p) => p.stableId !== stableId)
    requestSidebar()
    persistence.save()
  }
}

// Open (or focus) a transient view onto a running background process. The view is
// a normal pane attached to the existing PTY; its scrollback is seeded by
// replaying the buffered output captured while nothing was watching.
export async function openProcessView(stableId: string): Promise<void> {
  const open = panes.get(stableId)
  if (open) {
    const t = allTabs(state.tree).find((tt) => layoutContains(tt.root, stableId))
    if (t) {
      state.activeTabId = t.id
      state.activePaneId = stableId
      requestSidebar()
      renderContent()
      open.term.focus()
    }
    return
  }
  const found = findProcess(stableId)
  if (!found) return
  const id = await createPane(found.proc.cwd, { attachId: stableId })
  const p = panes.get(id)
  if (p) p.role = found.proc.role
  terminalService.procAttach(stableId)
  const buffer = await terminalService.procBuffer(stableId)
  if (buffer && p) p.term.write(buffer)

  // Open as a split beside the active terminal — NOT a standalone Free tab.
  const activeId = state.activePaneId
  const activeTab = activeId ? allTabs(state.tree).find((t) => layoutContains(t.root, activeId)) : null
  if (activeTab && activeId) {
    activeTab.root = splitInLayout(activeTab.root, activeId, id, 'row')
    state.activeTabId = activeTab.id
    state.activePaneId = id
    requestSidebar()
    renderContent()
    p?.term.focus()
    return
  }
  // Fallback (no active terminal): a tab under the owning node, not Free.
  const tab: TabNode = {
    kind: 'tab',
    id: uid('t'),
    title: found.proc.title,
    titleLocked: true,
    color: null,
    pinned: false,
    root: { type: 'leaf', paneId: id }
  }
  found.holder.children.push(tab)
  state.activeTabId = tab.id
  state.activePaneId = id
  requestSidebar()
  renderContent()
  p?.term.focus()
}

// Stop a background process for good: kill its PTY (clears the buffer in main) and
// drop it from the worktree's process list.
export function killProcess(stableId: string): void {
  terminalService.kill(stableId)
  const found = findProcess(stableId)
  if (found && found.holder.processes) {
    found.holder.processes = found.holder.processes.filter((p) => p.stableId !== stableId)
    requestSidebar()
    persistence.save()
  }
}

// The process exited (main → proc:exit): mark it done and resolve any waiter.
export function onProcessExit(stableId: string, code = 0): void {
  const waiter = exitWaiters.get(stableId)
  if (waiter) {
    exitWaiters.delete(stableId)
    waiter(code)
  }
  const found = findProcess(stableId)
  if (found) {
    found.proc.status = 'done'
    requestSidebar()
    persistence.save()
  }
}
