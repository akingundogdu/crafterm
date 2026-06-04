// iOS worktree manager rendered inline under an "iOS app" project node in the
// sidebar. Each git worktree becomes a status row (dot + name + primary action +
// overflow menu). Live state comes from `iosWorktree:report`, polled while any
// iOS project is present; build/run/clean/status/device run in a visible pane.

import type { ProjectNode } from './types'
import type { IosWorktreeReport, IosWorktreeStatus } from '../../preload/api'
import { state, requestSidebar } from './state'
import { flattenProjects } from './catalog'
import { openProject, openTerminalInDir, openTerminalRunning } from './commands'
import { openSettings } from './settings'
import { promptForm, promptConfirm } from './dialog'
import { showContextMenu, type ContextMenuItem } from './contextmenu'

// Reports keyed by project id; building paths tracked locally (the report can't
// know a build is in flight until the variant launches).
const reportCache = new Map<string, IosWorktreeReport>()
const building = new Map<string, number>() // worktree path -> started-at ms
const BUILD_MAX_AGE = 15 * 60 * 1000
let scriptPath = ''
let polling = false

function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
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

async function ensureScript(): Promise<string> {
  if (!scriptPath) scriptPath = await window.crafterm.iosWorktreeScript()
  return scriptPath
}

async function fetchReport(p: ProjectNode): Promise<void> {
  const rep = await window.crafterm.iosWorktreeReport(p.path, p.iosConfig)
  if (!rep) return
  const prev = reportCache.get(p.id)
  reportCache.set(p.id, rep)
  // Drop "building" once the variant is installed/running.
  for (const w of rep.worktrees) {
    if ((w.installed || w.running) && building.has(w.path)) building.delete(w.path)
  }
  if (JSON.stringify(prev) !== JSON.stringify(rep)) requestSidebar()
}

function iosProjects(): ProjectNode[] {
  return flattenProjects(state.tree).filter((p) => p.iosApp)
}

function ensurePolling(): void {
  if (polling) return
  polling = true
  window.setInterval(() => {
    const now = Date.now()
    for (const [path, ts] of building) if (now - ts > BUILD_MAX_AGE) building.delete(path)
    for (const p of iosProjects()) void fetchReport(p)
  }, 5000)
}

// dot state, highest priority first.
function dotState(w: IosWorktreeStatus): { cls: string; title: string } {
  if (building.has(w.path)) return { cls: 'building', title: 'Building…' }
  if (w.running) return { cls: 'running', title: 'Running' }
  if (w.installed) return { cls: 'installed', title: 'Installed' }
  if (w.built) return { cls: 'built', title: 'Built' }
  return { cls: 'none', title: 'Not built' }
}

async function runIn(p: ProjectNode, wtPath: string, sub: string): Promise<void> {
  const script = await ensureScript()
  const command = `${envPrefix(p)} bash ${shq(script)} ${sub}`
  if (sub === 'run' || sub === 'device') {
    building.set(wtPath, Date.now())
    requestSidebar()
  }
  void openProject({ name: wtPath.split('/').pop() || 'worktree', path: wtPath, command }, null)
}

async function newFeature(p: ProjectNode): Promise<void> {
  const values = await promptForm({
    title: 'New iOS feature',
    fields: [
      { key: 'branch', label: 'Branch / feature name', placeholder: 'feature-x' },
      { key: 'base', label: 'Base branch', value: 'main', placeholder: 'main' }
    ],
    confirmText: 'Create'
  })
  const branch = (values?.branch || '').trim()
  if (!branch) return
  const base = (values?.base || 'main').trim() || 'main'
  const parent = p.iosConfig?.worktreesDir?.trim() || `${p.path.replace(/\/+$/, '').split('/').slice(0, -1).join('/')}/worktrees`
  const wtPath = `${parent.replace(/\/+$/, '')}/${branch}`
  void openTerminalRunning(
    `git -C ${shq(p.path)} worktree add ${shq(wtPath)} -b ${shq(branch)} ${shq(base)}`,
    `worktree ${branch}`
  )
}

function rowMenu(p: ProjectNode, w: IosWorktreeStatus): ContextMenuItem[] {
  return [
    { label: 'Build & Run (simulator)', run: () => void runIn(p, w.path, 'run') },
    { label: 'Run on device', run: () => void runIn(p, w.path, 'device') },
    { label: 'Status', run: () => void runIn(p, w.path, 'status') },
    {
      label: 'Stop',
      run: () => void window.crafterm.iosWorktreeStop(w.path, p.iosConfig).then(() => fetchReport(p))
    },
    { label: 'Open terminal here', run: () => void openTerminalInDir(w.path) },
    { label: 'Clean (uninstall + remove build)', run: () => void runIn(p, w.path, 'clean') },
    {
      label: 'Remove worktree',
      danger: true,
      run: () =>
        void promptConfirm({
          title: 'Remove worktree',
          message: `Remove the worktree at ${w.path}? (the branch is kept)`,
          confirmText: 'Remove'
        }).then((ok) => {
          if (ok) {
            void openTerminalRunning(`git -C ${shq(p.path)} worktree remove ${shq(w.path)}`, 'worktree remove')
          }
        })
    }
  ]
}

function renderRow(p: ProjectNode, w: IosWorktreeStatus): HTMLElement {
  const row = document.createElement('div')
  row.className = 'ios-wt-row'

  const dot = document.createElement('span')
  const st = dotState(w)
  dot.className = `ios-wt-dot ios-wt-dot-${st.cls}`
  dot.title = st.title

  const name = document.createElement('span')
  name.className = 'ios-wt-name'
  name.textContent = w.branch || w.displayName
  name.title = `${w.bundleId}\n${w.path}`

  const run = document.createElement('button')
  run.className = 'ios-wt-act'
  run.textContent = w.running ? 'Open' : '▶'
  run.title = w.running ? 'Open Simulator' : 'Build & Run'
  run.addEventListener('click', (e) => {
    e.stopPropagation()
    void runIn(p, w.path, 'run')
  })

  const more = document.createElement('button')
  more.className = 'ios-wt-act'
  more.textContent = '⋯'
  more.addEventListener('click', (e) => {
    e.stopPropagation()
    showContextMenu(e, rowMenu(p, w))
  })

  row.append(dot, name, run, more)
  row.addEventListener('click', () => void openTerminalInDir(w.path))
  return row
}

// Build the inline iOS worktree block for an "iOS app" project (called from the
// sidebar's `below` slot). Renders from the cached report; kicks a refresh.
export function renderIosWorktrees(p: ProjectNode, host: HTMLElement): void {
  ensurePolling()
  if (!reportCache.has(p.id)) void fetchReport(p)

  const wrap = document.createElement('div')
  wrap.className = 'ios-wt'

  if (!p.iosConfig) {
    const cta = document.createElement('div')
    cta.className = 'ios-wt-cta'
    cta.textContent = 'Configure iOS app…'
    cta.addEventListener('click', (e) => {
      e.stopPropagation()
      openSettings()
    })
    wrap.appendChild(cta)
    host.appendChild(wrap)
    return
  }

  const rep = reportCache.get(p.id)
  const rows = rep?.worktrees ?? []
  if (!rep) {
    wrap.insertAdjacentHTML('beforeend', '<div class="ios-wt-empty">Loading…</div>')
  } else if (!rows.length) {
    wrap.insertAdjacentHTML('beforeend', '<div class="ios-wt-empty">No worktrees yet.</div>')
  }
  for (const w of rows) wrap.appendChild(renderRow(p, w))

  const add = document.createElement('div')
  add.className = 'ios-wt-new'
  add.textContent = '+ New feature…'
  add.addEventListener('click', (e) => {
    e.stopPropagation()
    void newFeature(p)
  })
  wrap.appendChild(add)

  host.appendChild(wrap)
}
