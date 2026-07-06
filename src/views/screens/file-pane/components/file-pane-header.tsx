import { Component } from '@geajs/core'
import { shortPath } from '../file-pane.state'

export interface FilePaneHeaderProps {
  path: string
  onCopyPath: (e: MouseEvent) => void
  onReveal: (e: MouseEvent) => void
  onReload: (e: MouseEvent) => void
  onClose: (e: MouseEvent) => void
}

// The file-pane header (path · copy · reveal · reload · close). Mounted
// imperatively, so props arrive via the constructor into a plain field.
class FilePaneHeaderView extends Component {
  private readonly p: FilePaneHeaderProps

  constructor(opts: { props: FilePaneHeaderProps }) {
    super()
    this.p = opts.props
  }

  template() {
    const p = this.p
    return (
      <div class="pane-header diff-header">
        <div class="diff-hcenter">
          <span class="diff-path" title={p.path}>
            {shortPath(p.path)}
          </span>
        </div>
        <button class="diff-hbtn" title="Copy full path" onClick={p.onCopyPath}>
          ⧉
        </button>
        <button class="diff-hbtn" title="Show in Finder" onClick={p.onReveal}>
          ⌕
        </button>
        <button class="diff-hbtn" title="Reload file" onClick={p.onReload}>
          ⟳
        </button>
        <button class="diff-hbtn diff-hclose" title="Close" onClick={p.onClose}>
          ×
        </button>
      </div>
    )
  }
}

export function createFilePaneHeader(props: FilePaneHeaderProps): HTMLDivElement {
  const host = document.createElement('div')
  new FilePaneHeaderView({ props }).render(host)
  return host.firstElementChild as HTMLDivElement
}
