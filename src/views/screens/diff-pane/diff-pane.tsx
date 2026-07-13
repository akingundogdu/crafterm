import './diff-pane.css'
import { Component } from '@geajs/core'
import { diffPanes, paneActions, uid, pushNotification } from '@views/state/spine'
import { setupPaneDnd } from '@views/pane/pane'
import { prService } from '@services'
import { createLineSelect } from '../diff/line-select'
import { sendRef } from '../diff/pane-ref'
import { parseDiff, type FileDiff } from './parse-diff'
import { createFileSearch } from './components/file-search'
import { createCommentPopover } from './components/comment-popover'
import { createDiffHeader } from './components/diff-header'
import { createDiffNavigation } from './diff-navigation.engine'
import { createDiffKeyboard } from './diff-keyboard.engine'
import type { CreateDiffPaneOptions } from './diff-pane.types'
import { COMMENT_SVG, registerDiffCleanup, fileToLineRows, stopAnd, preventStop } from './diff-pane.store'

export type { CreateDiffPaneOptions } from './diff-pane.types'
export { destroyDiffPane } from './diff-pane.store'

// The pane-box shell for a diff pane. The header + file-search + line-select body
// are pre-built nodes appended imperatively (a pre-built node embedded via a
// `{expr}` child renders as an empty comment under gea).
class DiffPaneBox extends Component {
  private readonly paneId: string
  private readonly onSelect: () => void

  constructor(opts: { id: string; onSelect: () => void }) {
    super()
    this.paneId = opts.id
    this.onSelect = opts.onSelect
  }

  template() {
    return <div class="pane-box diff-pane" data-pane-id={this.paneId} onMouseDown={this.onSelect} />
  }
}

// The comment button that lives inside the engine's floating action cluster. The
// icon is injected via a ref in onAfterRender (gea does not honour an innerHTML
// JSX prop); the mousedown guard is wired there too.
class CommentBtnView extends Component {
  btnEl: HTMLButtonElement | null = null
  private readonly onClickFn: (e: Event) => void

  constructor(opts: { onClick: (e: Event) => void }) {
    super()
    this.onClickFn = opts.onClick
  }

  onAfterRender(): void {
    if (!this.btnEl) return
    this.btnEl.innerHTML = COMMENT_SVG
    this.btnEl.addEventListener('mousedown', preventStop)
  }

  template() {
    return (
      <button
        class="diff-act diff-act-comment"
        title="Comment on these lines in the GitHub PR"
        onClick={this.onClickFn}
        ref={this.btnEl}
      />
    )
  }
}

function createCommentBtn(onClick: (e: Event) => void): HTMLButtonElement {
  const host = document.createElement('div')
  new CommentBtnView({ onClick }).render(host)
  return host.firstElementChild as HTMLButtonElement
}

// A read-only PR diff pane. Shows one file at a time (prev/next + searchable file
// list). Selection + the floating "+" ref live in the shared diff/line-select
// engine; the comment popover and file-search dropdown are local children. The
// inline "+" pastes a `path:line[-line]` reference into a terminal; the comment
// button posts a GitHub PR review comment on the selected range. Transient.
export function createDiffPane(opts: CreateDiffPaneOptions): string {
  const id = uid('df')

  const boxHost = document.createElement('div')
  new DiffPaneBox({ id, onSelect: () => paneActions.select(id) }).render(boxHost)
  const box = boxHost.firstElementChild as HTMLDivElement

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
  const commentBtn = createCommentBtn(stopAnd(() => commentPopover.open()))

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

  box.append(header.el, fileSearch.el, view.body)
  setupPaneDnd(box, header.el, id)

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
    el: box,
    cwd: opts.cwd,
    prNumber: opts.prNumber,
    targetPaneId: opts.targetPaneId,
    setFont: view.setFont,
    resetFont: view.resetFont
  })

  void load()
  return id
}
