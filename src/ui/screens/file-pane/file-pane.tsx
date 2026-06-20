import { filePanes, uid } from '@ui/state/state'
import { setupPaneDnd } from '@ui/pane/pane'
import { fsService } from '@services'
import { createButton } from '@ui/components'
import { createLineSelect } from '../diff/line-select'
import type { CreateFilePaneOptions } from './file-pane.types'
import {
  registerFilePaneCleanup,
  shortPath,
  buildLineRows,
  makeRefFile,
  makeSendRef,
  makeSelectPane,
  makeCopyPathClick,
  makeRevealClick,
  makeReloadClick,
  makeCloseClick
} from './file-pane.state'

export type { CreateFilePaneOptions } from './file-pane.types'
export { destroyFilePane } from './file-pane.state'

// A read-only file viewer pane opened from the Files panel. Shows one plain file
// with line numbers; click / click-drag / shift-click selects a contiguous line
// range, and a floating "+" on the selection pastes a `path:line[-line]`
// reference into a terminal so the user can ask Claude about that exact spot.
// Selection + ref logic lives in the shared diff/line-select engine. Transient —
// never persisted.
export function createFilePane(opts: CreateFilePaneOptions): string {
  const id = uid('fp')

  // ---- header: path · copy · reveal · reload · close ----
  const copyBtn = createButton({
    className: 'diff-hbtn',
    text: '⧉',
    title: 'Copy full path',
    onClick: makeCopyPathClick(opts.path)
  })
  const revealBtn = createButton({
    className: 'diff-hbtn',
    text: '⌕',
    title: 'Show in Finder',
    onClick: makeRevealClick(opts.path)
  })
  const reload = createButton({
    className: 'diff-hbtn',
    text: '⟳',
    title: 'Reload file',
    onClick: makeReloadClick(() => void load())
  })
  const close = createButton({
    className: 'diff-hbtn diff-hclose',
    text: '×',
    title: 'Close',
    onClick: makeCloseClick(id)
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
    refFile: makeRefFile(opts.path, opts.targetPaneId),
    sendRef: makeSendRef(opts.targetPaneId),
    onRowSelect: makeSelectPane(id)
  })

  const el = (
    <div class="pane-box diff-pane" dataset={{ paneId: id }}>
      {header}
      {view.body}
    </div>
  ) as HTMLDivElement
  setupPaneDnd(el, header, id)
  el.addEventListener('mousedown', makeSelectPane(id))

  // ---- load ----
  const load = async (): Promise<void> => {
    view.setMessage('Loading file…')
    const res = await fsService.readText(opts.path)
    if (!res.ok) {
      view.setMessage(res.error || 'Failed to load file.')
      return
    }
    view.setRows(buildLineRows(res.text ?? ''))
    view.body.scrollTop = 0
  }

  registerFilePaneCleanup(id, view.destroy)

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
