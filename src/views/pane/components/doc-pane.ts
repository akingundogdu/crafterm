import { el } from '@views/lib/dom'
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
  const htitle = el('span', { class: 'pane-title' }, source.split('/').pop() || source)

  const copyBtn = el(
    'button',
    { class: 'pane-btn', title: 'Copy full path', onClick: makeDocCopyPath(source) },
    '⧉'
  )
  const revealBtn = el(
    'button',
    { class: 'pane-btn', title: 'Show in Finder', onClick: makeDocReveal(source, absolute) },
    '⌕'
  )
  const refreshBtn = el('button', { class: 'pane-btn', title: 'Reload from disk' }, '⟳')
  const editBtn = el('button', { class: 'pane-btn', title: 'Edit / Preview' }, 'Edit')
  const close = el('button', { class: 'pane-close', onClick: makeCloseClick(id) }, '×')
  const header = el('div', { class: 'pane-header' }, htitle, copyBtn, revealBtn, refreshBtn, editBtn, close)

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
  const copyBtn = el(
    'button',
    {
      class: 'code-editor-button',
      onMousedown: preventStopMousedown,
      onClick: makeDocCopyMention(mention)
    },
    'Copy'
  )
  const addBtn = el(
    'button',
    {
      class: 'code-editor-button',
      onMousedown: preventStopMousedown,
      onClick: (e: MouseEvent) => makeDocAddToChat(mention, id, menu)(e)
    },
    'Add to Chat'
  )
  const menu = el(
    'div',
    { class: 'code-editor-selection-actions doc-sel-menu', style: 'display: none' },
    copyBtn,
    addBtn
  )
  return menu
}
