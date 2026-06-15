import { filePanes, panes, state, paneActions, uid } from './state'
import { setupPaneDnd } from './pane'
import { terminalService, fsService } from './services/ipc'

// A read-only file viewer pane opened from the Files panel. Shows one plain file
// with line numbers; click / click-drag / shift-click selects a contiguous line
// range, and a floating "+" on the selection pastes a `path:line[-line]`
// reference into a terminal so the user can ask Claude about that exact spot.
// Transient — never persisted.

const DEFAULT_FONT = 12
const MIN_FONT = 8
const MAX_FONT = 28

// Per-pane teardown for document-level listeners (removed on close).
const cleanups = new Map<string, () => void>()

// Display path with the home dir collapsed to `~`.
function shortPath(p: string): string {
  return p.replace(/^\/(Users|home)\/[^/]+/, '~')
}

// Path to paste into the terminal: relative to the target terminal's cwd when the
// file lives under it (matches the PR-diff repo-relative style), else absolute.
function refPath(absPath: string, cwd: string | null): string {
  if (cwd) {
    const base = cwd.endsWith('/') ? cwd : cwd + '/'
    if (absPath.startsWith(base)) return absPath.slice(base.length)
  }
  return absPath
}

// Resolve the terminal to paste into: the captured target if it still exists,
// else the active pane when it is a terminal.
function resolveTarget(targetPaneId: string | null): string | null {
  if (targetPaneId && panes.has(targetPaneId)) return targetPaneId
  if (state.activePaneId && panes.has(state.activePaneId)) return state.activePaneId
  return null
}

export function createFilePane(opts: { path: string; targetPaneId: string | null }): string {
  const id = uid('fp')

  const el = document.createElement('div')
  el.className = 'pane-box diff-pane'
  el.dataset.paneId = id

  // ---- header: path · close ----
  const header = document.createElement('div')
  header.className = 'pane-header diff-header'
  const center = document.createElement('div')
  center.className = 'diff-hcenter'
  const htitle = document.createElement('span')
  htitle.className = 'diff-path'
  htitle.textContent = shortPath(opts.path)
  htitle.title = opts.path
  center.append(htitle)
  const copyBtn = document.createElement('button')
  copyBtn.className = 'diff-hbtn'
  copyBtn.textContent = '⧉'
  copyBtn.title = 'Copy full path'
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    void navigator.clipboard.writeText(opts.path)
    const prev = copyBtn.textContent
    copyBtn.textContent = '✓'
    setTimeout(() => (copyBtn.textContent = prev), 1000)
  })
  const revealBtn = document.createElement('button')
  revealBtn.className = 'diff-hbtn'
  revealBtn.textContent = '⌕'
  revealBtn.title = 'Show in Finder'
  revealBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    fsService.revealPath(opts.path)
  })
  const reload = document.createElement('button')
  reload.className = 'diff-hbtn'
  reload.textContent = '⟳'
  reload.title = 'Reload file'
  const close = document.createElement('button')
  close.className = 'diff-hbtn diff-hclose'
  close.textContent = '×'
  close.title = 'Close'
  close.addEventListener('click', (e) => {
    e.stopPropagation()
    paneActions.close(id)
  })
  header.append(center, copyBtn, revealBtn, reload, close)

  const body = document.createElement('div')
  body.className = 'diff-body'

  // Floating action cluster anchored to the first selected row (left side).
  const actions = document.createElement('div')
  actions.className = 'diff-actions'
  actions.style.display = 'none'
  const plus = document.createElement('button')
  plus.className = 'diff-act diff-act-term'
  plus.textContent = '+'
  plus.title = 'Send this reference to the terminal'
  actions.append(plus)

  el.append(header, body)
  setupPaneDnd(el, header, id)
  el.addEventListener('mousedown', () => paneActions.select(id))

  // ---- state ----
  let fontSize = DEFAULT_FONT
  const rows: HTMLElement[] = [] // selectable rows, in order
  let anchor = -1
  let selStart = -1
  let selEnd = -1
  let dragging = false

  const applyFont = (): void => {
    body.style.fontSize = fontSize + 'px'
  }

  const currentRef = (): string | null => {
    if (selStart < 0) return null
    const cwd = panes.get(resolveTarget(opts.targetPaneId) ?? '')?.cwd ?? null
    const file = refPath(opts.path, cwd)
    const a = Number(rows[selStart].dataset.line)
    const b = Number(rows[selEnd].dataset.line)
    return a === b ? `${file}:${a}` : `${file}:${a}-${b}`
  }

  const send = (): void => {
    const ref = currentRef()
    if (!ref) return
    const target = resolveTarget(opts.targetPaneId)
    if (!target) {
      plus.classList.add('warn')
      plus.title = 'Open a terminal first'
      return
    }
    terminalService.input(target, ref + ' ')
    paneActions.select(target)
    panes.get(target)?.term.focus()
  }
  plus.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  plus.addEventListener('click', (e) => {
    e.stopPropagation()
    send()
  })

  // Anchor the action cluster to the first selected row (rides scroll because
  // it's a child of that row).
  const positionPlus = (): void => {
    if (selStart < 0) {
      actions.style.display = 'none'
      if (actions.parentElement) actions.remove()
      return
    }
    rows[selStart].appendChild(actions)
    plus.classList.remove('warn')
    plus.title = 'Send this reference to the terminal'
    actions.style.display = ''
  }

  const refreshSelection = (): void => {
    rows.forEach((r, i) => r.classList.toggle('selected', i >= selStart && i <= selEnd))
    positionPlus()
  }

  const setSelection = (a: number, b: number): void => {
    selStart = Math.min(a, b)
    selEnd = Math.max(a, b)
    refreshSelection()
  }

  const clearSelection = (): void => {
    anchor = selStart = selEnd = -1
    refreshSelection()
  }

  // ---- render the file ----
  const renderLines = (text: string): void => {
    body.replaceChildren()
    rows.length = 0
    clearSelection()
    const lines = text.split('\n')
    // A trailing newline yields a final empty element; drop it so the gutter
    // count matches the editor's line count.
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
    lines.forEach((line, i) => {
      const row = document.createElement('div')
      row.className = 'diff-row ctx'
      const gutter = document.createElement('span')
      gutter.className = 'diff-gutter'
      gutter.textContent = String(i + 1)
      const span = document.createElement('span')
      span.className = 'diff-text'
      span.textContent = line
      row.append(gutter, span)
      row.dataset.line = String(i + 1)
      const idx = rows.length
      rows.push(row)
      row.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        paneActions.select(id)
        if (e.shiftKey && anchor >= 0) {
          setSelection(anchor, idx)
        } else {
          anchor = idx
          dragging = true
          setSelection(idx, idx)
        }
      })
      row.addEventListener('mouseenter', () => {
        if (dragging && anchor >= 0) setSelection(anchor, idx)
      })
      body.appendChild(row)
    })
  }

  // drag ends anywhere
  const onUp = (): void => {
    dragging = false
  }
  document.addEventListener('mouseup', onUp)
  cleanups.set(id, () => {
    document.removeEventListener('mouseup', onUp)
  })

  // ---- load ----
  const load = async (): Promise<void> => {
    body.textContent = 'Loading file…'
    const res = await fsService.readText(opts.path)
    if (!res.ok) {
      body.textContent = res.error || 'Failed to load file.'
      return
    }
    applyFont()
    renderLines(res.text ?? '')
    body.scrollTop = 0
  }

  reload.addEventListener('click', (e) => {
    e.stopPropagation()
    void load()
  })

  filePanes.set(id, {
    id,
    el,
    path: opts.path,
    targetPaneId: opts.targetPaneId,
    setFont: (delta: number) => {
      fontSize = Math.max(MIN_FONT, Math.min(MAX_FONT, fontSize + delta))
      applyFont()
    },
    resetFont: () => {
      fontSize = DEFAULT_FONT
      applyFont()
    }
  })

  void load()
  return id
}

export function destroyFilePane(id: string): void {
  cleanups.get(id)?.()
  cleanups.delete(id)
  filePanes.delete(id)
}
