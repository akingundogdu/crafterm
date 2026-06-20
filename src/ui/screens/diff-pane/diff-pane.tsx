import './diff-pane.css'
import { diffPanes, state, paneActions, uid, pushNotification } from '@ui/state/state'
import { setupPaneDnd } from '@ui/pane/pane'
import { prService } from '@services'
import { createButton } from '@ui/components'
import { createLineSelect } from '../diff/line-select'
import { sendRef } from '../diff/pane-ref'
import { parseDiff, type FileDiff } from './parse-diff'
import { createFileSearch } from './components/file-search'
import { createCommentPopover } from './components/comment-popover'
import type { CreateDiffPaneOptions } from './diff-pane.types'
import {
  SEARCH_SVG,
  COMMENT_SVG,
  registerDiffCleanup,
  destroyDiffPane,
  fileToLineRows,
  stopAnd,
  preventStop
} from './diff-pane.state'

export type { CreateDiffPaneOptions } from './diff-pane.types'
export { destroyDiffPane } from './diff-pane.state'

// A read-only PR diff pane. Shows one file at a time (prev/next + searchable file
// list). Selection + the floating "+" ref live in the shared diff/line-select
// engine; the comment popover and file-search dropdown are local children. The
// inline "+" pastes a `path:line[-line]` reference into a terminal; the comment
// button posts a GitHub PR review comment on the selected range. Transient.
export function createDiffPane(opts: CreateDiffPaneOptions): string {
  const id = uid('df')

  const el = (<div class="pane-box diff-pane" dataset={{ paneId: id }} />) as HTMLDivElement

  let files: FileDiff[] = []
  let activeIdx = 0

  // ---- header: prev · search | path · counter | reload · next · close ----
  const prev = createButton({
    className: 'diff-nav',
    text: '‹',
    title: 'Previous file',
    onClick: stopAnd(() => showFile(activeIdx - 1))
  })
  const searchBtn = createButton({
    className: 'diff-hbtn',
    title: 'Find a file in this diff',
    onClick: stopAnd(() => fileSearch.toggle())
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
    onClick: stopAnd(() => void load())
  })
  const next = createButton({
    className: 'diff-nav',
    text: '›',
    title: 'Next file',
    onClick: stopAnd(() => showFile(activeIdx + 1))
  })
  const close = createButton({
    className: 'diff-hbtn diff-hclose',
    text: '×',
    title: 'Close',
    onClick: stopAnd(() => paneActions.close(id))
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
    onClick: stopAnd(() => commentPopover.open())
  })
  commentBtn.innerHTML = COMMENT_SVG
  commentBtn.addEventListener('mousedown', preventStop)

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
    view.setRows(fileToLineRows(files[activeIdx]))
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
  registerDiffCleanup(id, () => {
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
