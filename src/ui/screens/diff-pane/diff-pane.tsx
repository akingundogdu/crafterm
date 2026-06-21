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
import { createDiffHeader } from './components/diff-header'
import { createDiffNavigation } from './diff-navigation.engine'
import { createDiffKeyboard } from './diff-keyboard.engine'
import type { CreateDiffPaneOptions } from './diff-pane.types'
import {
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

  const el = (
    <div
      class="pane-box diff-pane"
      dataset={{ paneId: id }}
      onMouseDown={() => paneActions.select(id)}
    />
  ) as HTMLDivElement

  let files: FileDiff[] = []

  // ---- header: prev · search | path · counter | reload · next · close ----
  const header = createDiffHeader({
    onPrev: () => nav.showFile(nav.activeIdx() - 1),
    onNext: () => nav.showFile(nav.activeIdx() + 1),
    onToggleSearch: () => fileSearch.toggle(),
    onReload: () => void load(),
    onClose: () => paneActions.close(id)
  })

  // ---- comment button (lives inside the engine's floating action cluster) ----
  const commentBtn = createButton({
    className: 'diff-act diff-act-comment',
    title: 'Comment on these lines in the GitHub PR',
    onClick: stopAnd(() => commentPopover.open())
  })
  commentBtn.innerHTML = COMMENT_SVG
  commentBtn.addEventListener('mousedown', preventStop)

  const view = createLineSelect({
    refFile: () => files[nav.activeIdx()]?.path ?? null,
    sendRef: (ref) => sendRef(opts.targetPaneId, ref),
    onRowSelect: () => paneActions.select(id),
    extraActions: [commentBtn],
    onSelectionCleared: () => commentPopover.close()
  })

  const commentPopover = createCommentPopover({
    anchorRect: () => commentBtn.getBoundingClientRect(),
    getRange: () => {
      const r = view.currentRange()
      if (!r || nav.activeIdx() >= files.length) return null
      return { path: files[nav.activeIdx()].path, a: r.a, b: r.b }
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
    getActiveIdx: () => nav.activeIdx(),
    onPick: (idx) => nav.showFile(idx)
  })

  el.append(header.el, fileSearch.el, view.body)
  setupPaneDnd(el, header.el, id)

  // ---- render one file ----
  const renderFile = (): void => {
    if (!files.length) {
      view.setMessage('Empty diff.')
      return
    }
    view.setRows(fileToLineRows(files[nav.activeIdx()]))
  }

  const nav = createDiffNavigation({
    getFiles: () => files,
    updateHeader: (path, oneBasedIndex, total) => header.update(path, oneBasedIndex, total),
    renderActive: renderFile,
    resetScroll: () => {
      view.body.scrollTop = 0
    }
  })

  const teardownKeyboard = createDiffKeyboard({
    paneId: id,
    isPopoverOpen: () => commentPopover.isOpen(),
    getActiveIdx: () => nav.activeIdx(),
    showFile: (idx) => nav.showFile(idx)
  })
  registerDiffCleanup(id, () => {
    view.destroy()
    teardownKeyboard()
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
    nav.showFile(0)
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
