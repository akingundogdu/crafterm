import type { ProjectCommand, ProjectNode, Application, BrowserPane } from '@views/types/types'
import type { DropZoneName, PaneMenuEntry } from './pane.types'
import { panes, paneActions, state } from '@views/state/spine'
import { findTabByPane, panesInLayout } from '@views/tree/tree'
import { findProjectById, findApp, flattenProjects } from '@views/catalog/catalog'
import { terminalService, fsService, notebookService, appService, shellService } from '@services'
import { sshConnectionRepo } from '@repositories'
import { PANE_BG_PALETTE, setPaneBackground } from '../terminal/terminal'
import { openNotePanel } from './components/note-panel.store'

// ---- Drag-to-rearrange geometry --------------------------------------------
// Which edge-zone of rect `r` the point (x,y) is nearest to.
export function dropZoneAt(x: number, y: number, r: DOMRect): DropZoneName {
  const fx = (x - r.left) / r.width
  const fy = (y - r.top) / r.height
  const d = { left: fx, right: 1 - fx, top: fy, bottom: 1 - fy }
  return (Object.keys(d) as DropZoneName[]).reduce((a, b) => (d[b] < d[a] ? b : a))
}

// The visible terminal pane-box under the cursor (skips pop-out placeholders,
// which carry no data-pane-id).
export function paneBoxAt(x: number, y: number): HTMLElement | null {
  const boxes = document.querySelectorAll<HTMLElement>('#content .pane-box[data-pane-id]')
  for (const el of boxes) {
    const r = el.getBoundingClientRect()
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el
  }
  return null
}

export function clearDropZones(): void {
  document.querySelectorAll<HTMLElement>('.pane-drop').forEach((o) => (o.dataset.zone = ''))
}

// header mousedown handler: begins a pointer-driven drag (NOT HTML5 DnD, which is
// unreliable over xterm canvases), hit-tests the pane-box under the cursor each
// move, and re-lays-out the active tab on drop.
export function makePaneDragMousedown(id: string): (e: MouseEvent) => void {
  return (e) => {
    if (e.button !== 0) return
    // leave the header controls (⋯, ×) and inline rename alone
    if ((e.target as HTMLElement).closest('.pane-btn, .pane-close, .pane-rename')) return
    const startX = e.clientX
    const startY = e.clientY
    let dragging = false

    const onMove = (ev: MouseEvent): void => {
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 5) return
        dragging = true
        document.body.classList.add('dragging-pane')
      }
      clearDropZones()
      const targetBox = paneBoxAt(ev.clientX, ev.clientY)
      if (targetBox && targetBox.dataset.paneId !== id) {
        const drop = targetBox.querySelector<HTMLElement>('.pane-drop')
        if (drop) drop.dataset.zone = dropZoneAt(ev.clientX, ev.clientY, targetBox.getBoundingClientRect())
      }
    }
    const onUp = (ev: MouseEvent): void => {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('mouseup', onUp, true)
      if (dragging) {
        const targetBox = paneBoxAt(ev.clientX, ev.clientY)
        const targetId = targetBox?.dataset.paneId
        if (targetId && targetId !== id) {
          paneActions.movePane(id, targetId, dropZoneAt(ev.clientX, ev.clientY, targetBox!.getBoundingClientRect()))
        }
      }
      document.body.classList.remove('dragging-pane')
      clearDropZones()
    }
    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('mouseup', onUp, true)
  }
}

// ---- Pane ⋯ menu model -----------------------------------------------------
export function buildPaneMenu(
  paneId: string,
  opts: { worktree?: boolean; bg?: boolean } = {}
): PaneMenuEntry[] {
  const out: PaneMenuEntry[] = []
  const item = (label: string, run: () => void): void => {
    out.push({ kind: 'item', label, run })
  }
  const section = (text: string): void => {
    out.push({ kind: 'label', text })
  }

  item('Split right', () => paneActions.split(paneId, 'row'))
  item('Split down', () => paneActions.split(paneId, 'col'))
  item('Split with project…', () => paneActions.splitWithProject(paneId))
  // Plan-mode: a plan this pane produced has been auto-opened — offer Clarify,
  // which runs the clarify skill in this terminal.
  if (panes.get(paneId)?.planMode && panes.get(paneId)?.claude) {
    item('Clarify plan', () => paneActions.clarify(paneId))
  }
  // Daily task: when assigned, surface a dedicated section (view detail, mark
  // done, change); otherwise a single assign entry.
  {
    const assignedId = panes.get(paneId)?.dailyTaskId
    if (assignedId) {
      section('Daily task')
      item('View ticket detail', () => paneActions.viewTicketDetail(paneId))
      const taskStatus = paneActions.dailyTaskStatus(assignedId)
      if (taskStatus !== 'review' && taskStatus !== 'done') {
        item('Mark as code review', () => paneActions.markTaskReview(paneId))
      }
      if (taskStatus !== 'test' && taskStatus !== 'done') {
        item('Mark as test', () => paneActions.markTaskTest(paneId))
      }
      if (taskStatus !== 'done') {
        item('Mark as done', () => paneActions.markTaskDone(paneId))
      }
      item('Change task…', () => paneActions.assignDailyTask(paneId))
    } else {
      item('Assign to daily task…', () => paneActions.assignDailyTask(paneId))
    }
  }
  item('Open in Finder', () => {
    const cwd = panes.get(paneId)?.cwd
    if (cwd) shellService.openPath(cwd)
  })
  item('Open URL in browser…', () => paneActions.openUrl())
  item('Track time…', () => paneActions.trackTime(paneId))
  item('Take a note', () => openNotePanel(paneId))
  if (opts.worktree !== false) item('Create worktree…', () => paneActions.createWorktree(paneId))

  // Git quick-actions (terminal panes in a repo). Each runs in a fresh split.
  if (opts.worktree !== false) {
    section('Git')
    item('Pull', () => paneActions.git(paneId, 'pull'))
    item('Commit + push…', () => paneActions.git(paneId, 'commitPush'))
    item('Commit + push + PR…', () => paneActions.git(paneId, 'commitPushPr'))
    item('New branch + PR…', () => paneActions.git(paneId, 'branchPr'))
    item('Stash changes…', () => paneActions.git(paneId, 'stash'))
    item('Stashes…', () => paneActions.stashes(paneId))
  }
  // Project / application "run commands". A command is surfaced when the pane is
  // tied to its owning project/app (`projectId`/`appId`), OR — falling back to a
  // path match — when the pane's cwd lives under the project/app working
  // directory. All matching projects/apps are listed (nested projects included).
  if (opts.bg !== false) {
    const pane = panes.get(paneId)
    const cwd = pane?.cwd ?? null
    const addCommands = (title: string, cmds?: ProjectCommand[]): void => {
      if (!cmds || !cmds.some((c) => c.command.trim())) return
      section(title)
      for (const rc of cmds) {
        const cmdStr = rc.command.trim()
        if (!cmdStr) continue
        item(rc.name || cmdStr, () => terminalService.input(paneId, cmdStr + '\r'))
      }
    }
    // cwd is under `base` (same dir or a descendant). Empty base never matches.
    const cwdUnder = (base?: string): boolean => {
      if (!cwd || !base) return false
      const b = base.replace(/\/+$/, '')
      return cwd === b || cwd.startsWith(b + '/')
    }
    // App `path` is relative to its project path (absolute or empty = project path).
    const appDir = (project: ProjectNode, app: Application): string => {
      const p = app.path?.trim()
      if (!p) return project.path
      return p.startsWith('/') ? p : `${project.path.replace(/\/+$/, '')}/${p}`
    }

    const projectIds = new Set<string>()
    const appIds = new Set<string>()
    if (pane?.projectId) {
      const proj = findProjectById(state.tree, pane.projectId)
      if (proj) {
        projectIds.add(proj.id)
        addCommands(`Commands — ${proj.name}`, proj.runCommands)
      }
    }
    if (pane?.appId) {
      const r = findApp(state.tree, pane.appId)
      if (r) {
        appIds.add(r.app.id)
        addCommands(`Commands — ${r.app.name}`, r.app.runCommands)
      }
    }
    for (const proj of flattenProjects(state.tree)) {
      if (!projectIds.has(proj.id) && cwdUnder(proj.path)) {
        projectIds.add(proj.id)
        addCommands(`Commands — ${proj.name}`, proj.runCommands)
      }
      for (const app of proj.apps ?? []) {
        if (!appIds.has(app.id) && cwdUnder(appDir(proj, app))) {
          appIds.add(app.id)
          addCommands(`Commands — ${app.name}`, app.runCommands)
        }
      }
    }

    // Applications defined on the matching projects — clicking one opens a
    // Split / New tab chooser (per environment) and launches it.
    for (const proj of flattenProjects(state.tree)) {
      if (!projectIds.has(proj.id)) continue
      const apps = proj.apps ?? []
      if (!apps.length) continue
      section(`Apps — ${proj.name}`)
      for (const app of apps) item(app.name, () => paneActions.runApp(proj, app))
    }
  }

  // SSH connections (only for terminal panes — sends the ssh command into the
  // current PTY instead of spawning a new terminal, per user request).
  if (opts.bg !== false && sshConnectionRepo.getAll().length) {
    section('SSH')
    for (const c of sshConnectionRepo.getAll()) {
      const target = c.user ? `${c.user}@${c.host}` : c.host
      const cmd = c.port ? `ssh -p ${c.port} ${target}` : `ssh ${target}`
      item(c.label || target, () => terminalService.input(paneId, cmd + '\r'))
    }
  }

  // pop-out is for plain terminal panes only (same gate as the bg swatches)
  if (opts.bg !== false) item('Pop out to window', () => paneActions.popOut(paneId))

  // per-pane background color (terminals only)
  if (opts.bg !== false) {
    section('Background')
    out.push({
      kind: 'swatch',
      label: 'Pane background: Default',
      color: null,
      run: () => setPaneBackground(paneId, null)
    })
    PANE_BG_PALETTE.forEach((c) => {
      out.push({
        kind: 'swatch',
        label: `Pane background: ${c}`,
        color: c,
        run: () => setPaneBackground(paneId, c)
      })
    })
  }
  return out
}

// ---- Shared pane handlers --------------------------------------------------
export function makeSelectPane(id: string): () => void {
  return () => paneActions.select(id)
}

export function makeCloseClick(id: string): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    paneActions.close(id)
  }
}

// ---- Browser pane handlers -------------------------------------------------
export function makeBrowserReload(webview: HTMLElement): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    ;(webview as unknown as { reload?: () => void }).reload?.()
  }
}

export function makeBrowserExternal(bp: BrowserPane): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    appService.openExternal(bp.url)
  }
}

export function makeBrowserTitleUpdate(htitle: HTMLElement): (e: Event) => void {
  return (e) => {
    const t = (e as unknown as { title?: string }).title
    if (t) htitle.textContent = t
  }
}

// ---- Doc pane handlers + selection logic -----------------------------------
export function makeDocCopyPath(source: string): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    void navigator.clipboard.writeText(source)
    const btn = e.currentTarget as HTMLButtonElement
    const prev = btn.textContent
    btn.textContent = '✓'
    setTimeout(() => (btn.textContent = prev), 1000)
  }
}

export function makeDocReveal(source: string, absolute: boolean): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    if (absolute) shellService.revealPath(source)
    else notebookService.reveal(source)
  }
}

// Reads the doc's current content: external files via fs, notebook files via the
// notebook store.
export function readDoc(source: string, absolute: boolean): Promise<string> {
  return absolute ? fsService.readMd(source) : notebookService.read(source)
}

// External files (opened from the terminal) write back through fs:writeMd;
// notebook files go through the notebook store.
export function makeSaveDoc(source: string, absolute: boolean): (text: string) => void {
  return (text) => {
    if (absolute) void fsService.writeMd(source, text)
    else notebookService.write(source, text)
  }
}

// Target terminal: prefer a Claude session in the same tab as this doc pane,
// else the tab's first terminal, else the active terminal (matches codePane).
export function docTargetTerminal(id: string): { id: string; cwd: string | null } | null {
  const tab = findTabByPane(state.tree, id)
  if (tab) {
    const ids = panesInLayout(tab.root).filter((pid) => panes.has(pid))
    const pick = ids.find((pid) => panes.get(pid)?.claude) ?? ids[0]
    if (pick) return { id: pick, cwd: panes.get(pick)?.cwd ?? null }
  }
  if (state.activePaneId && panes.has(state.activePaneId)) {
    return { id: state.activePaneId, cwd: panes.get(state.activePaneId)?.cwd ?? null }
  }
  return null
}

// Source line of the block containing a DOM node (nearest [data-mdline]).
export function docLineOf(node: Node | null): number | null {
  const start = node instanceof HTMLElement ? node : node?.parentElement ?? null
  const block = start?.closest('[data-mdline]') as HTMLElement | null
  const v = block?.getAttribute('data-mdline')
  return v ? parseInt(v, 10) : null
}

// mousedown on a selection-action button: keep the text selection alive.
export function preventStopMousedown(e: Event): void {
  e.preventDefault()
  e.stopPropagation()
}

// "Copy" selection action: copies the `@path:start-end` mention, flashes "Copied".
export function makeDocCopyMention(mention: () => string | null): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    const m = mention()
    if (m) void navigator.clipboard.writeText(m)
    const b = e.currentTarget as HTMLButtonElement
    b.textContent = 'Copied'
    setTimeout(() => (b.textContent = 'Copy'), 1000)
  }
}

// "Add to Chat" selection action: sends the mention into the target terminal.
export function makeDocAddToChat(
  mention: () => string | null,
  id: string,
  menu: HTMLElement
): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    const m = mention()
    const tgt = docTargetTerminal(id)
    if (!m || !tgt) return
    terminalService.input(tgt.id, m + ' ')
    paneActions.select(tgt.id)
    panes.get(tgt.id)?.term.focus()
    menu.style.display = 'none'
  }
}

// The `@path:start-end` mention for the current preview selection (or null).
export function makeDocMention(preview: HTMLElement, source: string, id: string): () => string | null {
  return () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
    if (!preview.contains(sel.anchorNode) || !preview.contains(sel.focusNode)) return null
    const a = docLineOf(sel.anchorNode)
    const b = docLineOf(sel.focusNode)
    if (a == null && b == null) return null
    const lo = Math.min(a ?? b!, b ?? a!)
    const hi = Math.max(a ?? b!, b ?? a!)
    const cwd = docTargetTerminal(id)?.cwd ?? null
    let file = source
    if (cwd) {
      const base = cwd.endsWith('/') ? cwd : cwd + '/'
      if (source.startsWith(base)) file = source.slice(base.length)
    }
    const lines = lo === hi ? `${lo}` : `${lo}-${hi}`
    return `@${file}:${lines}`
  }
}
