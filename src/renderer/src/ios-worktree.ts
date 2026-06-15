// iOS add-on for the worktree tree nodes. The generic worktree manager
// (worktrees.ts) materializes worktrees as folder nodes; this layer adds, for an
// "iOS app" project, a live status dot + ▶/⋯ build-run actions on each worktree
// node. Build/run/etc. open a terminal *inside* the worktree folder node.

import type { SidebarNode, ProjectNode, WorktreeNode } from './types'
import type { IosWorktreeStatus } from '../../preload/api'
import { requestSidebar } from './state'
import { persistence } from './services/storage/persistence.service'
import { flattenProjects } from './catalog'
import { state } from './state'
import { showContextMenu, type ContextMenuItem } from '@crafterm/ui'
import { isWorktreeFolder, worktreeProjectOf } from './worktrees'
import { startBackgroundProcess } from './bgproc'
import { findById, ancestorFolders } from './tree'
import { iosService } from './services/ipc'

type RunTarget = { kind: 'device' | 'simulator'; name: string; udid: string; scheme?: string }

const IOS_POLL_MS = 5000
const BUILD_MAX_AGE = 15 * 60 * 1000

// Live status keyed by worktree absolute path (no trailing slash).
const statusByPath = new Map<string, IosWorktreeStatus>()
const building = new Map<string, number>() // worktree path -> started-at ms
let scriptPath = ''
let started = false

function norm(p: string): string {
  return p.replace(/\/+$/, '')
}
function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

function iosProjects(): ProjectNode[] {
  return flattenProjects(state.tree).filter((p) => p.iosApp && p.path)
}

function envPrefix(p: ProjectNode): string {
  const cfg = p.iosConfig
  const env: string[] = [`IOSWT_REPO_ROOT=${shq(p.path)}`]
  const add = (k: string, v?: string): void => {
    if (v && v.trim()) env.push(`${k}=${shq(v.trim())}`)
  }
  add('IOSWT_PROJECT', cfg?.project)
  add('IOSWT_SCHEME', cfg?.scheme)
  add('IOSWT_BUNDLE_ID', cfg?.baseBundleId)
  add('IOSWT_DISPLAY_PREFIX', cfg?.displayPrefix)
  add('IOSWT_SIMULATOR', cfg?.defaultSimulator)
  add('IOSWT_WORKTREES_DIR', cfg?.worktreesDir)
  if (cfg?.copyFiles?.length) add('IOSWT_COPY_FILES', cfg.copyFiles.join(':'))
  return env.join(' ')
}

// The same iOS build env as a map (for terminal env injection), plus the absolute
// path to the bundled build script.
function iosEnvMap(p: ProjectNode, scriptPath: string): Record<string, string> {
  const cfg = p.iosConfig
  const env: Record<string, string> = { CRAFTERM_IOS_SCRIPT: scriptPath, IOSWT_REPO_ROOT: p.path }
  const add = (k: string, v?: string): void => {
    if (v && v.trim()) env[k] = v.trim()
  }
  add('IOSWT_PROJECT', cfg?.project)
  add('IOSWT_SCHEME', cfg?.scheme)
  add('IOSWT_BUNDLE_ID', cfg?.baseBundleId)
  add('IOSWT_DISPLAY_PREFIX', cfg?.displayPrefix)
  add('IOSWT_SIMULATOR', cfg?.defaultSimulator)
  add('IOSWT_WORKTREES_DIR', cfg?.worktreesDir)
  if (cfg?.copyFiles?.length) env.IOSWT_COPY_FILES = cfg.copyFiles.join(':')
  return env
}

// Env to inject into a terminal opened inside an iOS worktree (node id), so any
// command — including the /run-on-device skill — can build it: CRAFTERM_IOS_SCRIPT
// + IOSWT_*. Null when the node isn't (under) an iOS worktree. (todo23)
export async function iosWorktreeEnvFor(parentId: string): Promise<Record<string, string> | null> {
  const r = findById(state.tree, parentId)
  if (!r) return null
  let wt: WorktreeNode | null = isWorktreeFolder(r.node) ? r.node : null
  if (!wt) {
    const trail = ancestorFolders(state.tree, parentId) ?? []
    for (const n of trail) if (isWorktreeFolder(n)) wt = n
  }
  if (!wt) return null
  const p = worktreeProjectOf(wt)
  if (!p || !p.iosApp) return null
  return iosEnvMap(p, await ensureScript())
}

async function ensureScript(): Promise<string> {
  if (!scriptPath) scriptPath = await iosService.worktreeScript()
  return scriptPath
}

async function fetchReport(p: ProjectNode): Promise<void> {
  if (!p.path) return
  const rep = await iosService.worktreeReport(p.path, p.iosConfig)
  if (!rep) return
  let changed = false
  for (const w of rep.worktrees) {
    const key = norm(w.path)
    const prev = statusByPath.get(key)
    statusByPath.set(key, w)
    if ((w.installed || w.running) && building.has(key)) building.delete(key)
    if (!prev || prev.built !== w.built || prev.installed !== w.installed || prev.running !== w.running) {
      changed = true
    }
  }
  if (changed) requestSidebar()
}

export function startIosWorktreePoll(): void {
  if (started) return
  started = true
  const tick = (): void => {
    const now = Date.now()
    for (const [k, ts] of building) if (now - ts > BUILD_MAX_AGE) building.delete(k)
    for (const p of iosProjects()) void fetchReport(p)
  }
  tick()
  window.setInterval(tick, IOS_POLL_MS)
}

// Run ANY iOS worktree subcommand (run/device/status/clean/…) as a hidden
// background process — a sub-row under the worktree, never a separate visible
// terminal. `extraEnv` carries target/scheme overrides for Build & Run.
async function runScriptBg(
  wt: WorktreeNode,
  p: ProjectNode,
  sub: string,
  title: string,
  extraEnv = ''
): Promise<void> {
  const script = await ensureScript()
  const command = `${envPrefix(p)} ${extraEnv}bash ${shq(script)} ${sub}`
  if (sub === 'run' || sub === 'device') building.set(norm(wt.worktreePath), Date.now())
  await startBackgroundProcess(wt, { title, command, role: 'build' })
  persistence.save()
}

// Resolve the iOS project owning a worktree node, or null when it isn't one.
function iosOwner(node: SidebarNode): { p: ProjectNode; wt: WorktreeNode } | null {
  if (!isWorktreeFolder(node)) return null
  const p = worktreeProjectOf(node)
  if (!p || !p.iosApp) return null
  return { p, wt: node }
}

// Run an iOS build/run as a hidden background process (todo21) targeting a
// specific simulator/device (todo20), and remember it as the worktree's last run
// (todo22). The process is surfaced as a sub-row under the worktree, not a tab.
async function runTarget(wt: WorktreeNode, p: ProjectNode, target: RunTarget | null): Promise<void> {
  const isSim = !target || target.kind === 'simulator'
  const sub = isSim ? 'run' : 'device'
  let override = target
    ? target.kind === 'simulator'
      ? `IOSWT_SIMULATOR=${shq(target.name)} `
      : `IOSWT_DEVICE_UDID=${shq(target.udid)} `
    : ''
  // The scheme (e.g. "local" / "prod") picks the API environment.
  if (target?.scheme) override += `IOSWT_SCHEME=${shq(target.scheme)} `
  const schemeSuffix = target?.scheme ? ` [${target.scheme}]` : ''
  const title = target
    ? target.kind === 'simulator'
      ? `Running on ${target.name} (simulator)${schemeSuffix}`
      : `Running on device — ${target.name}${schemeSuffix}`
    : 'Building & running (simulator)'
  if (target) wt.lastRun = target
  await runScriptBg(wt, p, sub, title, override)
}

// --- Cascading "Build & Run" menu (todo20): on device/simulator > target >
// scheme. Targets + schemes are enumerated once and cached so re-opening the
// menu is instant; each list carries a "Refresh" item that clears its cache and
// re-fetches without closing the menu (the keepOpen mechanism in contextmenu). ---
const schemeCache = new Map<string, string[]>()
type Targets = Awaited<ReturnType<typeof iosService.listTargets>>
let targetsCache: Targets | null = null

const REFRESH_LABEL = '↻ Refresh'

async function loadSchemes(p: ProjectNode): Promise<string[]> {
  const cached = schemeCache.get(p.path)
  if (cached) return cached
  const schemes = await iosService.listSchemes(p.path, p.iosConfig)
  schemeCache.set(p.path, schemes)
  return schemes
}

async function loadTargets(): Promise<Targets> {
  if (targetsCache) return targetsCache
  targetsCache = await iosService.listTargets()
  return targetsCache
}

// Scheme leaf items (local/prod) for a chosen target; falls back to a single
// "default scheme" run when the project exposes none.
function schemeItems(wt: WorktreeNode, p: ProjectNode, t: RunTarget): () => Promise<ContextMenuItem[]> {
  return async () => {
    const refresh: ContextMenuItem = {
      label: REFRESH_LABEL,
      keepOpen: true,
      run: () => void schemeCache.delete(p.path)
    }
    const schemes = await loadSchemes(p)
    if (!schemes.length) {
      return [{ label: 'Run (default scheme)', run: () => void runTarget(wt, p, t) }, refresh]
    }
    return [
      ...schemes.map((scheme) => ({
        label: scheme,
        run: () => void runTarget(wt, p, { ...t, scheme })
      })),
      refresh
    ]
  }
}

// Target submenu (each simulator/device), each opening a scheme submenu.
function targetItems(wt: WorktreeNode, p: ProjectNode, kind: 'device' | 'simulator'): () => Promise<ContextMenuItem[]> {
  return async () => {
    const targets = await loadTargets()
    const list = kind === 'simulator' ? targets.simulators : targets.devices
    return [
      ...list.map((t) => ({
        label: t.name,
        children: schemeItems(wt, p, { kind, name: t.name, udid: t.udid })
      })),
      { label: REFRESH_LABEL, keepOpen: true, run: () => void (targetsCache = null) }
    ]
  }
}

function buildRunMenu(wt: WorktreeNode, p: ProjectNode): ContextMenuItem {
  return {
    label: 'Build & Run',
    children: [
      { label: 'On simulator', children: targetItems(wt, p, 'simulator') },
      { label: 'On device', children: targetItems(wt, p, 'device') }
    ]
  }
}

function dotInfo(wtPath: string): { cls: string; title: string } {
  const key = norm(wtPath)
  if (building.has(key)) return { cls: 'building', title: 'Building…' }
  const s = statusByPath.get(key)
  if (s?.running) return { cls: 'running', title: 'Running' }
  if (s?.installed) return { cls: 'installed', title: 'Installed' }
  if (s?.built) return { cls: 'built', title: 'Built' }
  return { cls: 'none', title: 'Not built' }
}

// ---- Sidebar adapter hooks (called per node) ----

export function iosWorktreeDot(node: SidebarNode): HTMLElement | null {
  const own = iosOwner(node)
  if (!own) return null
  const dot = document.createElement('span')
  const st = dotInfo(own.wt.worktreePath)
  dot.className = `ios-wt-dot ios-wt-dot-${st.cls}`
  dot.title = st.title
  return dot
}

export function iosWorktreeMenuItems(node: SidebarNode): ContextMenuItem[] {
  const own = iosOwner(node)
  if (!own) return []
  const { p, wt } = own
  const wtPath = wt.worktreePath
  return [
    buildRunMenu(wt, p),
    { label: 'Status', run: () => void runScriptBg(wt, p, 'status', 'Status') },
    {
      label: 'Stop',
      run: () => void iosService.worktreeStop(wtPath, p.iosConfig).then(() => fetchReport(p))
    },
    {
      label: 'Clean (uninstall + remove build)',
      run: () => void runScriptBg(wt, p, 'clean', 'Clean (uninstall + remove build)')
    }
  ]
}

export function iosWorktreeTrailing(node: SidebarNode): HTMLElement | null {
  const own = iosOwner(node)
  if (!own) return null
  const { p, wt } = own
  const wrap = document.createElement('span')
  wrap.className = 'ios-wt-actions'

  const run = document.createElement('button')
  run.className = 'ios-wt-act'
  run.textContent = '▶'
  if (!wt.lastRun) {
    // Disabled until the worktree has been run at least once (todo22).
    run.disabled = true
    run.title = 'Pick a target from the ⋯ menu first'
  } else {
    const last = wt.lastRun
    run.title = `Re-run: ${last.name}`
    run.addEventListener('click', (e) => {
      e.stopPropagation()
      void runTarget(wt, p, last)
    })
  }

  const more = document.createElement('button')
  more.className = 'ios-wt-act'
  more.textContent = '⋯'
  more.title = 'iOS actions'
  more.addEventListener('click', (e) => {
    e.stopPropagation()
    showContextMenu(e, iosWorktreeMenuItems(node))
  })

  wrap.append(run, more)
  return wrap
}
