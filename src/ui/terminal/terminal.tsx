import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { Pane } from '@ui/types/types'
import { panes, settings, resolveTheme, requestSidebar } from '@ui/state/state'
import { persistence } from '@repositories/persistence.service'
import { terminalService } from '@services'
import { onPaneTitle } from './osc-title'
import { onBell } from './activity-detection'
import { refreshPaneInfo } from './pane-info'
import { setupPaneDnd } from '@ui/pane/pane'
import { createPaneHeader } from './components/pane-header'
import type { CreatePaneOptions } from './terminal.types'
import {
  pushResize,
  applyPaneTheme,
  makeLinkProvider,
  createPaneState,
  makeCustomKeyHandler,
  makeDataHandler,
  makeTaskChipClick,
  makeMenuClick,
  makeCloseClick,
  makeSelectPane
} from './terminal.state'

export type { CreatePaneOptions } from './terminal.types'
export {
  PANE_BG_PALETTE,
  setPaneBackground,
  mountPanes,
  destroyPane,
  applyAppearance,
  adjustActivePaneFontSize,
  resetActivePaneFontSize
} from './terminal.state'

export async function createPane(cwd?: string, opts?: CreatePaneOptions): Promise<string> {
  const stableId = opts?.attachId || opts?.stableId || crypto.randomUUID()
  // Exposed to the shell as CRAFTERM_PANE_ID; the renderer-supplied value wins
  // over anything the caller might have placed in opts.env.
  const env = { ...(opts?.env ?? {}), CRAFTERM_PANE_ID: stableId }
  // Attach mode: this pane is a VIEW onto an already-running background process
  // (its PTY id === the process stableId). Skip spawning — the PTY already exists
  // in main; closing this view must not kill it.
  const id = opts?.attachId ? opts.attachId : await terminalService.createPty({ cwd, env, shell: opts?.shell })

  const term = new Terminal({
    fontFamily: settings.font.family,
    fontSize: settings.font.size,
    cursorBlink: true,
    allowProposedApi: true,
    theme: resolveTheme()
  })
  const fit = new FitAddon()
  term.loadAddon(fit)

  const { header, htitle } = createPaneHeader({
    onTaskChipClick: makeTaskChipClick(id),
    onMenuClick: makeMenuClick(id),
    onCloseClick: makeCloseClick(id)
  })

  // The xterm mount target — kept imperative so xterm attaches to the exact node.
  const host = document.createElement('div')
  host.className = 'pane-term'
  const statusEl = (<div class="pane-status" style="display: none" />) as HTMLDivElement
  const el = (
    <div class="pane-box" dataset={{ paneId: id }}>
      {header}
      {host}
      {statusEl}
    </div>
  ) as HTMLDivElement
  setupPaneDnd(el, header, id)

  const pane = createPaneState({ id, stableId, term, fit, el, host, statusEl, htitle, cwd, isProcessView: !!opts?.attachId })

  term.attachCustomKeyEventHandler(makeCustomKeyHandler(id))
  term.registerLinkProvider(makeLinkProvider(term))
  term.onData(makeDataHandler(pane, id))
  term.onBell(() => onBell(pane))
  term.onTitleChange((t) => onPaneTitle(pane, t))
  el.addEventListener('mousedown', makeSelectPane(id))
  header.addEventListener('dblclick', () => startPaneRename(pane))

  const ro = new ResizeObserver(() => {
    if (!host.isConnected || host.clientWidth === 0) return
    try {
      fit.fit()
      pushResize(pane)
    } catch {
      /* ignore */
    }
  })
  ro.observe(host)
  pane.ro = ro

  panes.set(id, pane)
  applyPaneTheme(pane)
  void refreshPaneInfo(pane)
  return id
}

export function startPaneRename(pane: Pane): void {
  const header = pane.el.querySelector('.pane-header')
  if (!header) return
  const input = document.createElement('input')
  input.className = 'pane-rename'
  input.value = pane.title
  header.replaceChild(input, pane.htitle)
  input.focus()
  input.select()
  const done = (commit: boolean): void => {
    if (commit) {
      const v = input.value.trim()
      if (v) {
        pane.title = v
        pane.titleLocked = true
        pane.htitle.textContent = v
      }
    }
    if (input.parentElement === header) header.replaceChild(pane.htitle, input)
    persistence.save()
    requestSidebar()
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') done(true)
    else if (e.key === 'Escape') done(false)
  })
  input.addEventListener('blur', () => done(true))
}
