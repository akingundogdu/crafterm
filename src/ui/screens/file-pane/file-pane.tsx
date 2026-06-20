import { filePanes, paneActions, uid } from '@ui/state/state'
import { setupPaneDnd } from '@ui/pane/pane'
import { fsService , shellService } from '@services'
import { createButton } from '@ui/components'
import { createLineSelect, type LineRow } from '../diff/line-select'
import { sendRef, targetCwd } from '../diff/pane-ref'

// A read-only file viewer pane opened from the Files panel. Shows one plain file
// with line numbers; click / click-drag / shift-click selects a contiguous line
// range, and a floating "+" on the selection pastes a `path:line[-line]`
// reference into a terminal so the user can ask Claude about that exact spot.
// Selection + ref logic lives in the shared diff/line-select engine. Transient —
// never persisted.

// Per-pane teardown for the line-select engine (run on close).
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

export function createFilePane(opts: { path: string; targetPaneId: string | null }): string {
  const id = uid('fp')

  // ---- header: path · copy · reveal · reload · close ----
  const copyBtn = createButton({
    className: 'diff-hbtn',
    text: '⧉',
    title: 'Copy full path',
    onClick: (e) => {
      e.stopPropagation()
      void navigator.clipboard.writeText(opts.path)
      const prev = copyBtn.textContent
      copyBtn.textContent = '✓'
      setTimeout(() => (copyBtn.textContent = prev), 1000)
    }
  })
  const revealBtn = createButton({
    className: 'diff-hbtn',
    text: '⌕',
    title: 'Show in Finder',
    onClick: (e) => {
      e.stopPropagation()
      shellService.revealPath(opts.path)
    }
  })
  const reload = createButton({
    className: 'diff-hbtn',
    text: '⟳',
    title: 'Reload file',
    onClick: (e) => {
      e.stopPropagation()
      void load()
    }
  })
  const close = createButton({
    className: 'diff-hbtn diff-hclose',
    text: '×',
    title: 'Close',
    onClick: (e) => {
      e.stopPropagation()
      paneActions.close(id)
    }
  })
  const header = (
    <div class="pane-header diff-header">
      <div class="diff-hcenter">
        <span class="diff-path" title={opts.path}>
          {shortPath(opts.path)}
        </span>
      </div>
      {copyBtn}
      {revealBtn}
      {reload}
      {close}
    </div>
  ) as HTMLDivElement

  const view = createLineSelect({
    refFile: () => refPath(opts.path, targetCwd(opts.targetPaneId)),
    sendRef: (ref) => sendRef(opts.targetPaneId, ref),
    onRowSelect: () => paneActions.select(id)
  })

  const el = (
    <div class="pane-box diff-pane" dataset={{ paneId: id }}>
      {header}
      {view.body}
    </div>
  ) as HTMLDivElement
  setupPaneDnd(el, header, id)
  el.addEventListener('mousedown', () => paneActions.select(id))

  // ---- load ----
  const load = async (): Promise<void> => {
    view.setMessage('Loading file…')
    const res = await fsService.readText(opts.path)
    if (!res.ok) {
      view.setMessage(res.error || 'Failed to load file.')
      return
    }
    const lines = (res.text ?? '').split('\n')
    // A trailing newline yields a final empty element; drop it so the gutter
    // count matches the file's line count.
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
    const descs: LineRow[] = lines.map((line, i) => ({
      className: 'diff-row ctx',
      gutter: String(i + 1),
      text: line,
      line: i + 1
    }))
    view.setRows(descs)
    view.body.scrollTop = 0
  }

  cleanups.set(id, view.destroy)

  filePanes.set(id, {
    id,
    el,
    path: opts.path,
    targetPaneId: opts.targetPaneId,
    setFont: view.setFont,
    resetFont: view.resetFont
  })

  void load()
  return id
}

export function destroyFilePane(id: string): void {
  cleanups.get(id)?.()
  cleanups.delete(id)
  filePanes.delete(id)
}
