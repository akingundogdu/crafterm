import { Component } from '@geajs/core'
import { LINK_SVG, MD_RE, stopAnd } from '../notebook.state'

// A single linked-file row with its hover actions. gea Component: the action
// handlers are injected so this module stays free of IPC/command imports. The
// row is static (no store), so it is safe for the caller to insert the returned
// root into its own list container (rebuilt wholesale on refresh).

interface LinkedFile {
  path: string
  name: string
}

interface LinkedFileRowActions {
  onOpen: (path: string) => void
  onReveal: (path: string) => void
  onUnlink: (path: string) => void
}

class LinkedFileRow extends Component {
  private readonly file: LinkedFile
  private readonly actions: LinkedFileRowActions

  // Data via the constructor into plain fields — a gea Component only populates
  // `this.props` when rendered from a parent template, not from a manual `new X()`.
  constructor(file: LinkedFile, actions: LinkedFileRowActions) {
    super()
    this.file = file
    this.actions = actions
  }

  template() {
    const f = this.file
    const a = this.actions
    return (
      <div class="tab-item nb-linked-row" title={f.path} onClick={() => a.onOpen(f.path)}>
        <div class="tab-row">
          <span class="folder-icon" innerHTML={LINK_SVG} />
          <span class="tab-title">{MD_RE.test(f.name) ? f.name.replace(MD_RE, '') : f.name}</span>
          <span class="nb-actions">
            <button
              class="notebook-action"
              title="Show in Finder"
              onClick={stopAnd(() => a.onReveal(f.path.slice(0, f.path.lastIndexOf('/')) || f.path))}
            >
              ⤴
            </button>
            <button class="notebook-action" title="Unlink" onClick={stopAnd(() => a.onUnlink(f.path))}>
              ✕
            </button>
          </span>
        </div>
      </div>
    )
  }
}

export function buildLinkedFileRow(f: LinkedFile, a: LinkedFileRowActions): HTMLElement {
  const host = document.createElement('div')
  new LinkedFileRow(f, a).render(host)
  return host.firstElementChild as HTMLElement
}
