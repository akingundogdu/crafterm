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

// Builds the doc pane header (title + copy/reveal/refresh/edit/close buttons).
// The copy/reveal/close buttons are self-contained; the caller (createDocPane)
// wires refresh/edit listeners afterward since they close over local state.
export function createDocPaneHeader(
  id: string,
  source: string,
  absolute: boolean
): DocPaneHeader {
  const htitle = (
    <span class="pane-title">{source.split('/').pop() || source}</span>
  ) as HTMLSpanElement

  const copyBtn = (
    <button class="pane-btn" title="Copy full path" onClick={makeDocCopyPath(source)}>
      ⧉
    </button>
  ) as HTMLButtonElement
  const revealBtn = (
    <button class="pane-btn" title="Show in Finder" onClick={makeDocReveal(source, absolute)}>
      ⌕
    </button>
  ) as HTMLButtonElement
  const refreshBtn = (
    <button class="pane-btn" title="Reload from disk">
      ⟳
    </button>
  ) as HTMLButtonElement
  const editBtn = (
    <button class="pane-btn" title="Edit / Preview">
      Edit
    </button>
  ) as HTMLButtonElement
  const close = (<button class="pane-close" onClick={makeCloseClick(id)}>×</button>) as HTMLButtonElement
  const header = (
    <div class="pane-header">
      {htitle}
      {copyBtn}
      {revealBtn}
      {refreshBtn}
      {editBtn}
      {close}
    </div>
  ) as HTMLDivElement

  return { header, htitle, refreshBtn, editBtn }
}

// Builds the floating selection-actions menu (Copy / Add to Chat) for a doc
// pane. Pure view; `mention` resolves the current `@path:start-end` reference
// and the handlers come from pane.state. The caller appends it and wires the
// selection-driven show/hide/positioning.
export function createDocSelectionMenu(
  id: string,
  mention: () => string | null
): HTMLDivElement {
  const menu = (
    <div class="code-editor-selection-actions doc-sel-menu" style={{ display: 'none' }}>
      <button
        class="code-editor-button"
        onMousedown={preventStopMousedown}
        onClick={makeDocCopyMention(mention)}
      >
        Copy
      </button>
      <button
        class="code-editor-button"
        onMousedown={preventStopMousedown}
        onClick={(e: MouseEvent) => makeDocAddToChat(mention, id, menu)(e)}
      >
        Add to Chat
      </button>
    </div>
  ) as HTMLDivElement
  return menu
}
