import { el } from '@views/lib/dom'
import { shortPath } from '../file-pane.state'

export interface FilePaneHeaderProps {
  path: string
  onCopyPath: (e: MouseEvent) => void
  onReveal: (e: MouseEvent) => void
  onReload: (e: MouseEvent) => void
  onClose: (e: MouseEvent) => void
}

// Plain-DOM el() port of the file-pane header (path · copy · reveal · reload ·
// close). Self-contained (§2.7) — no @ui; buttons are built inline rather than
// via a component factory.
export function createFilePaneHeader(props: FilePaneHeaderProps): HTMLDivElement {
  const hbtn = (text: string, title: string, onClick: (e: MouseEvent) => void, extra?: string) =>
    el('button', { class: extra ? `diff-hbtn ${extra}` : 'diff-hbtn', title, onClick }, text)

  const copyBtn = hbtn('⧉', 'Copy full path', props.onCopyPath)
  const revealBtn = hbtn('⌕', 'Show in Finder', props.onReveal)
  const reload = hbtn('⟳', 'Reload file', props.onReload)
  const close = hbtn('×', 'Close', props.onClose, 'diff-hclose')

  return el(
    'div',
    { class: 'pane-header diff-header' },
    el('div', { class: 'diff-hcenter' }, el('span', { class: 'diff-path', title: props.path }, shortPath(props.path))),
    copyBtn,
    revealBtn,
    reload,
    close
  ) as HTMLDivElement
}
