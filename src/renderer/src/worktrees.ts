// Generic worktree-as-tree-node manager. For any project with `supportWorktree`
// (or `iosApp`), this reconciles the project's git worktrees into real sidebar
// folder nodes — an auto "worktrees" container holding one folder per worktree —
// so terminals open *inside* the right worktree and persist like any other.
//
// Only nodes carrying the auto markers (`worktreeContainer` / `worktreePath`) are
// ever created or removed here; the user's own folders/tabs are never touched.

import type { ProjectNode, FolderNode, SidebarNode, WorktreeNode } from './types'
import {
  state,
  settings,
  requestSidebar,
  uid,
  pushNotification
} from './state'
import { persistence } from './services/storage/persistence.service'
import { makeFolder, allTabs, projectOf } from './tree'
import { flattenProjects } from './catalog'
import { archiveTab } from './commands'
import { runHiddenAndWait, removeProcess } from './bgproc'
import { promptForm, promptConfirm } from './dialog'
import { gitService, appService } from './services/ipc'
import { norm, baseName, shq } from './services/domain/worktree-path'

const RECONCILE_INTERVAL_MS = 20_000
let started = false

export function isWorktreeFolder(n: SidebarNode): n is WorktreeNode {
  return n.kind === 'worktree'
}
export function isWorktreeContainer(n: SidebarNode): n is FolderNode {
  return n.kind === 'folder' && !!n.worktreeContainer
}
export function worktreeProjectOf(node: SidebarNode): ProjectNode | null {
  return projectOf(state.tree, node.id)
}

function worktreeProjects(): ProjectNode[] {
  return flattenProjects(state.tree).filter((p) => (p.supportWorktree || p.iosApp) && p.path)
}

function findContainer(p: ProjectNode): FolderNode | undefined {
  return p.children.find((n): n is FolderNode => n.kind === 'folder' && !!n.worktreeContainer)
}

async function reconcileProject(p: ProjectNode): Promise<boolean> {
  let changed = false

  let container = findContainer(p)
  if (!container) {
    container = makeFolder(uid('f'), 'worktrees')
    container.worktreeContainer = true
    p.children.push(container)
    changed = true
  }

  const listing = await gitService.listWorktrees(p.path)
  // `git worktree list` reports the MAIN checkout as its first entry. The project
  // node already represents that checkout, so it must not also appear as a linked
  // worktree — drop it here so the container holds only real worktrees (and any
  // stale main-checkout node left from before this filter gets archived below).
  const root = norm(listing?.root ?? '')
  const entries = (listing?.worktrees ?? []).filter((w) => norm(w.path) !== root)
  const livePaths = new Set(entries.map((w) => norm(w.path)))

  for (const w of entries) {
    const path = norm(w.path)
    const existing = container.children.find(
      (n): n is WorktreeNode => n.kind === 'worktree' && norm(n.worktreePath) === path
    )
    if (!existing) {
      const branch = w.branch || baseName(path)
      const wt: WorktreeNode = {
        kind: 'worktree',
        id: uid('w'),
        name: branch.split('/').pop() || branch,
        color: null,
        collapsed: false,
        pinned: false,
        children: [],
        branch,
        worktreePath: path,
        status: 'idle'
      }
      container.children.push(wt)
      changed = true
    } else if (existing.status === 'archived') {
      // The git worktree came back (recreated) — un-archive the node.
      existing.status = 'idle'
      changed = true
    }
  }

  // Never delete (git 1:1): a worktree node whose git worktree is gone is
  // archived, not removed — kept recoverable in the tree. The working dir is gone,
  // so any live terminals under it are dead too — archiveWorktreeNode archives
  // them along with the node (no live-terminal guard).
  for (const n of container.children) {
    if (n.kind === 'worktree') {
      const gone = !livePaths.has(norm(n.worktreePath))
      if (gone && n.status !== 'archived') {
        archiveWorktreeNode(n)
        changed = true
      }
    }
  }
  return changed
}

// Archive a worktree node (git worktree gone): archive its descendant terminal
// sessions (their cwd no longer exists), flip the node to 'archived', and clear
// the transient `archiving` flag. The node stays recoverable under "Show archived
// items".
export function archiveWorktreeNode(wt: WorktreeNode): void {
  for (const tab of allTabs([wt])) {
    if (tab.status !== 'archived') archiveTab(tab)
  }
  wt.status = 'archived'
  wt.archiving = false
  requestSidebar()
  persistence.save()
}

async function runReconcilePass(): Promise<void> {
  let changed = false
  for (const p of worktreeProjects()) {
    changed = (await reconcileProject(p)) || changed
  }
  if (changed) {
    requestSidebar()
    persistence.save()
  }
}

// The pass currently executing, and a single coalesced follow-up pass for callers
// that arrive while one is running.
let active: Promise<void> | null = null
let queued: Promise<void> | null = null

// Reconcile, coalescing concurrent callers. A caller that arrives mid-pass needs
// state reflecting changes (e.g. a worktree it just added) the in-flight pass may
// have started *before* — so instead of a no-op return, it awaits the current
// pass and then a guaranteed fresh one. All such waiters share that single
// follow-up so we never stack redundant passes.
export function reconcileWorktrees(): Promise<void> {
  if (!active) {
    active = runReconcilePass().finally(() => {
      active = null
    })
    return active
  }
  if (!queued) {
    queued = active.then(() => {
      queued = null
      active = runReconcilePass().finally(() => {
        active = null
      })
      return active
    })
  }
  return queued
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

// Run once on load and then on a slow interval (only mutates when the git set
// actually changed).
export function startWorktreeReconcile(): void {
  if (started) return
  started = true
  void reconcileWorktrees()
  window.setInterval(() => void reconcileWorktrees(), RECONCILE_INTERVAL_MS)
}

// Find a materialized worktree node by its absolute path.
function findWorktreeNodeByPath(path: string): WorktreeNode | null {
  const target = norm(path)
  let hit: WorktreeNode | null = null
  const walk = (nodes: SidebarNode[]): void => {
    for (const n of nodes) {
      if (n.kind === 'worktree' && norm(n.worktreePath) === target) {
        hit = n
        return
      }
      if (n.kind === 'folder' || n.kind === 'project' || n.kind === 'worktree') walk(n.children)
      if (hit) return
    }
  }
  walk(state.tree)
  return hit
}

// Find the linked worktree (node + owning project) that contains `cwd`, or null
// when cwd is not inside any managed worktree (e.g. the main checkout). Matches
// the worktree root or any subdirectory of it. Used by the close-pane flow to
// offer deleting the worktree a terminal lives in.
export function worktreeForCwd(
  cwd: string
): { project: ProjectNode; node: WorktreeNode; path: string } | null {
  const target = norm(cwd)
  let best: WorktreeNode | null = null
  const walk = (nodes: SidebarNode[]): void => {
    for (const n of nodes) {
      if (n.kind === 'worktree' && n.status !== 'archived') {
        const root = norm(n.worktreePath)
        if (target === root || target.startsWith(root + '/')) {
          if (!best || root.length > norm(best.worktreePath).length) best = n
        }
      }
      if (n.kind === 'folder' || n.kind === 'project' || n.kind === 'worktree') walk(n.children)
    }
  }
  walk(state.tree)
  if (!best) return null
  const node: WorktreeNode = best
  const project = worktreeProjectOf(node)
  if (!project) return null
  return { project, node, path: node.worktreePath }
}

// Ensure a worktree exists for `branch` (creating it off main when absent), then
// return its path + materialized node id. Awaits creation. Used by "Run in
// worktree" for a daily ticket — branch == issue key (todo6).
export async function ensureWorktreeForBranch(
  p: ProjectNode,
  branch: string
): Promise<{ path: string; nodeId: string | null } | null> {
  if (!p.path) return null
  const repo = norm(p.path)
  const worktreesDir = norm(
    p.iosConfig?.worktreesDir?.trim() || `${repo.split('/').slice(0, -1).join('/')}/worktrees`
  )
  const path = `${worktreesDir}/${branch}`
  const listing = await gitService.listWorktrees(repo)
  const exists = (listing?.worktrees ?? []).some((w) => norm(w.path) === path)
  if (!exists) {
    const ok = await gitService.worktreeAdd(repo, path, branch, 'main')
    if (!ok) return null
  }
  // Wait deterministically for the node to materialize: reconcile, then poll
  // (git's worktree listing can lag a fresh add). Bounded so a failure can't hang
  // the "Run in worktree" action — caller falls back to the project root.
  let node = findWorktreeNodeByPath(path)
  const deadline = Date.now() + 3000
  while (!node && Date.now() < deadline) {
    await reconcileWorktrees()
    node = findWorktreeNodeByPath(path)
    if (node) break
    await delay(50)
  }
  return { path, nodeId: node?.id ?? null }
}

// Find the worktree node for a branch (e.g. an issue key) within a project, for
// the "delete worktree on done?" prompt (todo7).
export function worktreeNodeForBranch(p: ProjectNode, branch: string): WorktreeNode | null {
  let hit: WorktreeNode | null = null
  const walk = (nodes: SidebarNode[]): void => {
    for (const n of nodes) {
      if (n.kind === 'worktree' && n.branch === branch) {
        hit = n
        return
      }
      if (n.kind === 'folder' || n.kind === 'project' || n.kind === 'worktree') walk(n.children)
      if (hit) return
    }
  }
  walk(p.children)
  return hit
}

// Create a new worktree for a project: `git worktree add` runs as a hidden
// background shell under the project node (a "creating…" row, no visible
// terminal); on success a reconcile materializes the new worktree node.
export async function newWorktree(p: ProjectNode): Promise<void> {
  if (!p.path) return
  const values = await promptForm({
    title: 'New worktree',
    fields: [
      { key: 'branch', label: 'Branch / feature name', placeholder: 'feature-x' },
      { key: 'base', label: 'Base branch', value: 'main', placeholder: 'main' }
    ],
    confirmText: 'Create'
  })
  const branch = (values?.branch || '').trim()
  if (!branch) return
  const base = (values?.base || 'main').trim() || 'main'
  const repo = norm(p.path)
  const worktreesDir = norm(p.iosConfig?.worktreesDir?.trim() || `${repo.split('/').slice(0, -1).join('/')}/worktrees`)
  const wtPath = `${worktreesDir}/${branch}`
  const { stableId, code } = await runHiddenAndWait(p, {
    title: `creating ${branch}…`,
    command: `git worktree add ${shq(wtPath)} -b ${shq(branch)} ${shq(base)}`,
    cwd: repo,
    role: 'shell'
  })
  removeProcess(stableId)
  if (code === 0) {
    await reconcileWorktrees()
  } else {
    pushNotification(
      '',
      'Worktree create failed',
      'worktree',
      `git worktree add for "${branch}" exited with code ${code}.`
    )
  }
}

// Remove a worktree (the branch is kept). `git worktree remove` runs as a hidden
// background shell under the worktree node, which shows struck-through + a
// spinner (`archiving`) while it runs; on success the node + its dead terminals
// are archived (hidden from the list). On failure the visual reverts + a notice.
export async function removeWorktree(
  p: ProjectNode,
  worktreePath: string,
  opts?: { force?: boolean; skipConfirm?: boolean }
): Promise<boolean> {
  if (!p.path) return false
  if (!opts?.skipConfirm) {
    const ok = await promptConfirm({
      title: 'Remove worktree',
      message: `Remove the worktree at ${worktreePath}? (the branch is kept)`,
      confirmText: 'Remove'
    })
    if (!ok) return false
  }
  const wt = findWorktreeNodeByPath(worktreePath)
  if (wt) {
    wt.archiving = true
    requestSidebar()
  }
  const repo = norm(p.path)
  const { stableId, code } = await runHiddenAndWait(wt ?? p, {
    title: `removing ${baseName(worktreePath)}…`,
    command: `git worktree remove ${opts?.force ? '--force ' : ''}${shq(worktreePath)}`,
    cwd: repo,
    role: 'shell'
  })
  removeProcess(stableId)
  if (code === 0) {
    if (wt) archiveWorktreeNode(wt)
    else void reconcileWorktrees()
    return true
  }
  if (wt) {
    wt.archiving = false
    requestSidebar()
  }
  pushNotification(
    '',
    'Worktree remove failed',
    'worktree',
    `git worktree remove exited with code ${code}. The worktree may have uncommitted changes (use a clean tree or remove it manually).`
  )
  // Distinct error sound so a failed removal is audibly different from the
  // regular notification chime.
  if (settings.notifSound) appService.playSound('Basso')
  return false
}

// Stop managing worktrees for a project (toggle off): drop the auto container
// only when it holds no live terminals, so nothing the user has open is lost.
export function purgeWorktrees(p: ProjectNode): void {
  const container = findContainer(p)
  if (!container) return
  if (allTabs([container]).length === 0) {
    p.children = p.children.filter((n) => n !== container)
    requestSidebar()
    persistence.save()
  }
}
