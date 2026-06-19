import './diff-pane.css'
import { diffPanes, state, paneActions, uid, pushNotification } from '../../state'
import { setupPaneDnd } from '../../pane'
import { prService } from '@services'
import { createButton } from '@ui/components'
import { createLineSelect, type LineRow } from '../diff/line-select'
import { sendRef } from '../diff/pane-ref'
import { parseDiff, type FileDiff } from './parse-diff'
import { createFileSearch } from './components/file-search'
import { createCommentPopover } from './components/comment-popover'

// A read-only PR diff pane. Shows one file at a time (prev/next + searchable file
// list). Selection + the floating "+" ref live in the shared diff/line-select
// engine; the comment popover and file-search dropdown are local children. The
// inline "+" pastes a `path:line[-line]` reference into a terminal; the comment
// button posts a GitHub PR review comment on the selected range. Transient.

const SEARCH_SVG =
  '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M11.7 10.3a5 5 0 1 0-1.4 1.4l3 3 1.4-1.4-3-3zM7 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/></svg>'

const COMMENT_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M14 2H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2v2.2L7.6 12H14a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zM3.5 6h9v1.2h-9V6zm0 2.6h6V9.8h-6V8.6z"/></svg>'

// Per-pane teardown (engine + key listener + popover), run on close.
const cleanups = new Map<string, () => void>()

export function createDiffPane(opts: {
  cwd: string
  prNumber: number
  title: string
  targetPaneId: string | null
}): string {
  const id = uid('df')

  const el = (<div class="pane-box diff-pane" dataset={{ paneId: id }} />) as HTMLDivElement

  let files: FileDiff[] = []
  let activeIdx = 0

  // ---- header: prev · search | path · counter | reload · next · close ----
  const prev = createButton({
    className: 'diff-nav',
    text: '‹',
    title: 'Previous file',
    onClick: (e) => {
      e.stopPropagation()
      showFile(activeIdx - 1)
    }
  })
  const searchBtn = createButton({
    className: 'diff-hbtn',
    title: 'Find a file in this diff',
    onClick: (e) => {
      e.stopPropagation()
      fileSearch.toggle()
    }
  })
  searchBtn.innerHTML = SEARCH_SVG
  const htitle = (<span class="diff-path" />) as HTMLSpanElement
  const counter = (<span class="diff-counter" />) as HTMLSpanElement
  const center = (
    <div class="diff-hcenter">
      {htitle}
      {counter}
    </div>
  ) as HTMLDivElement
  const reload = createButton({
    className: 'diff-hbtn',
    text: '⟳',
    title: 'Reload diff',
    onClick: (e) => {
      e.stopPropagation()
      void load()
    }
  })
  const next = createButton({
    className: 'diff-nav',
    text: '›',
    title: 'Next file',
    onClick: (e) => {
      e.stopPropagation()
      showFile(activeIdx + 1)
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
      {prev}
      {searchBtn}
      {center}
      {reload}
      {next}
      {close}
    </div>
  ) as HTMLDivElement

  // ---- comment button (lives inside the engine's floating action cluster) ----
  const commentBtn = createButton({
    className: 'diff-act diff-act-comment',
    title: 'Comment on these lines in the GitHub PR',
    onClick: (e) => {
      e.stopPropagation()
      commentPopover.open()
    }
  })
  commentBtn.innerHTML = COMMENT_SVG
  commentBtn.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })

  const view = createLineSelect({
    refFile: () => files[activeIdx]?.path ?? null,
    sendRef: (ref) => sendRef(opts.targetPaneId, ref),
    onRowSelect: () => paneActions.select(id),
    extraActions: [commentBtn],
    onSelectionCleared: () => commentPopover.close()
  })

  const commentPopover = createCommentPopover({
    anchorRect: () => commentBtn.getBoundingClientRect(),
    getRange: () => {
      const r = view.currentRange()
      if (!r || activeIdx >= files.length) return null
      return { path: files[activeIdx].path, a: r.a, b: r.b }
    },
    submit: (range, text) =>
      prService.comment(opts.cwd, opts.prNumber, range.path, range.a, range.b, text),
    onSuccess: (range) => {
      view.clearSelection()
      pushNotification('', `Commented on ${range.path}:${range.a}`, 'pr', opts.title)
    }
  })

  const fileSearch = createFileSearch({
    getFiles: () => files,
    getActiveIdx: () => activeIdx,
    onPick: (idx) => showFile(idx)
  })

  el.append(header, fileSearch.el, view.body)
  setupPaneDnd(el, header, id)
  el.addEventListener('mousedown', () => paneActions.select(id))

  // ---- render one file ----
  const renderFile = (): void => {
    if (!files.length) {
      view.setMessage('Empty diff.')
      return
    }
    const descs: LineRow[] = files[activeIdx].rows.map((r) => ({
      className: 'diff-row ' + r.kind,
      gutter: r.line != null ? String(r.line) : '',
      text: r.text,
      line: r.line
    }))
    view.setRows(descs)
  }

  function showFile(idx: number): void {
    activeIdx = Math.max(0, Math.min(files.length - 1, idx))
    htitle.textContent = files.length ? files[activeIdx].path : ''
    htitle.title = htitle.textContent
    counter.textContent = files.length ? `${activeIdx + 1}/${files.length}` : ''
    prev.disabled = activeIdx <= 0
    next.disabled = activeIdx >= files.length - 1
    renderFile()
    view.body.scrollTop = 0
  }

  // Cmd+←/→ steps prev/next while this diff pane is the active one. Capture phase
  // so it wins before xterm or the global grid; the comment popover keeps its own
  // typing focus, so skip while it's open.
  const onKey = (e: KeyboardEvent): void => {
    if (!e.metaKey || e.altKey || e.shiftKey || commentPopover.isOpen()) return
    if (state.activePaneId !== id) return
    if (e.key === 'ArrowLeft') showFile(activeIdx - 1)
    else if (e.key === 'ArrowRight') showFile(activeIdx + 1)
    else return
    e.preventDefault()
    e.stopPropagation()
  }
  window.addEventListener('keydown', onKey, true)
  cleanups.set(id, () => {
    view.destroy()
    window.removeEventListener('keydown', onKey, true)
    commentPopover.close()
  })

  // ---- load ----
  const load = async (): Promise<void> => {
    view.setMessage('Loading diff…')
    const res = await prService.diff(opts.cwd, opts.prNumber)
    if (!res.ok) {
      view.setMessage(res.error || 'Failed to load diff.')
      return
    }
    const patch = (res.patch ?? '').trim()
    files = patch ? parseDiff(patch) : []
    showFile(0)
  }

  diffPanes.set(id, {
    id,
    el,
    cwd: opts.cwd,
    prNumber: opts.prNumber,
    targetPaneId: opts.targetPaneId,
    setFont: view.setFont,
    resetFont: view.resetFont
  })

  void load()
  return id
}

export function destroyDiffPane(id: string): void {
  cleanups.get(id)?.()
  cleanups.delete(id)
  diffPanes.delete(id)
}
