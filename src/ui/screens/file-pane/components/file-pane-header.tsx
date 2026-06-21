import { createButton } from '@ui/components'
import { shortPath } from '../file-pane.state'

export interface FilePaneHeaderProps {
  path: string
  onCopyPath: (e: MouseEvent) => void
  onReveal: (e: MouseEvent) => void
  onReload: (e: MouseEvent) => void
  onClose: (e: MouseEvent) => void
}

export function createFilePaneHeader(props: FilePaneHeaderProps): HTMLDivElement {
  const copyBtn = createButton({ className: 'diff-hbtn', text: '⧉', title: 'Copy full path', onClick: props.onCopyPath })
  const revealBtn = createButton({ className: 'diff-hbtn', text: '⌕', title: 'Show in Finder', onClick: props.onReveal })
  const reload = createButton({ className: 'diff-hbtn', text: '⟳', title: 'Reload file', onClick: props.onReload })
  const close = createButton({ className: 'diff-hbtn diff-hclose', text: '×', title: 'Close', onClick: props.onClose })

  return (
    <div class="pane-header diff-header">
      <div class="diff-hcenter">
        <span class="diff-path" title={props.path}>
          {shortPath(props.path)}
        </span>
      </div>
      {copyBtn}
      {revealBtn}
      {reload}
      {close}
    </div>
  ) as HTMLDivElement
}
