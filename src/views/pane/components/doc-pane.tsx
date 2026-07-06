import { Component } from '@geajs/core'
import {
  makeCloseClick,
  makeDocCopyPath,
  makeDocReveal,
  makeDocCopyMention,
  makeDocAddToChat,
  preventStopMousedown
} from '../pane.state'

export interface DocPaneHeader {
  header: HTMLDivElement
  htitle: HTMLSpanElement
  refreshBtn: HTMLButtonElement
  editBtn: HTMLButtonElement
}

// The doc pane header: title + copy/reveal/refresh/edit/close buttons. Data
// arrives via the constructor into plain fields — a gea Component only populates
// `this.props` when rendered from a parent template, not a manual `new X()`. The
// copy/reveal/close buttons are self-contained; the caller (createDocPane) wires
// refresh/edit listeners afterward since they close over local state.
class DocPaneHeaderView extends Component {
  private readonly paneId: string
  private readonly source: string
  private readonly absolute: boolean

  constructor(opts: { id: string; source: string; absolute: boolean }) {
    super()
    this.paneId = opts.id
    this.source = opts.source
    this.absolute = opts.absolute
  }

  template() {
    const name = this.source.split('/').pop() || this.source
    return (
      <div class="pane-header">
        <span class="pane-title">{name}</span>
        <button class="pane-btn" title="Copy full path" onClick={makeDocCopyPath(this.source)}>
          ⧉
        </button>
        <button class="pane-btn" title="Show in Finder" onClick={makeDocReveal(this.source, this.absolute)}>
          ⌕
        </button>
        <button class="pane-btn" title="Reload from disk">
          ⟳
        </button>
        <button class="pane-btn" title="Edit / Preview">
          Edit
        </button>
        <button class="pane-close" onClick={makeCloseClick(this.paneId)}>
          ×
        </button>
      </div>
    )
  }
}

export function createDocPaneHeader(id: string, source: string, absolute: boolean): DocPaneHeader {
  const host = document.createElement('div')
  new DocPaneHeaderView({ id, source, absolute }).render(host)
  const header = host.firstElementChild as HTMLDivElement
  const htitle = header.querySelector('.pane-title') as HTMLSpanElement
  const refreshBtn = header.querySelector('[title="Reload from disk"]') as HTMLButtonElement
  const editBtn = header.querySelector('[title="Edit / Preview"]') as HTMLButtonElement

  return { header, htitle, refreshBtn, editBtn }
}

// The floating selection-actions menu (Copy / Add to Chat) for a doc pane. Pure
// view; `mention` resolves the current `@path:start-end` reference and the
// handlers come from pane.state. The "Add to Chat" handler needs the menu node —
// it reads the Component's root ref (assigned by render time). The caller appends
// it and wires the selection-driven show/hide/positioning.
class DocSelectionMenuView extends Component {
  rootEl: HTMLElement | null = null
  private readonly paneId: string
  private readonly mention: () => string | null

  constructor(opts: { id: string; mention: () => string | null }) {
    super()
    this.paneId = opts.id
    this.mention = opts.mention
  }

  private addToChat = (e: MouseEvent): void => {
    if (this.rootEl) makeDocAddToChat(this.mention, this.paneId, this.rootEl)(e)
  }

  template() {
    return (
      <div class="code-editor-selection-actions doc-sel-menu" style="display: none" ref={this.rootEl}>
        <button class="code-editor-button" onMousedown={preventStopMousedown} onClick={makeDocCopyMention(this.mention)}>
          Copy
        </button>
        <button class="code-editor-button" onMousedown={preventStopMousedown} onClick={this.addToChat}>
          Add to Chat
        </button>
      </div>
    )
  }
}

export function createDocSelectionMenu(id: string, mention: () => string | null): HTMLDivElement {
  const host = document.createElement('div')
  new DocSelectionMenuView({ id, mention }).render(host)
  return host.firstElementChild as HTMLDivElement
}
