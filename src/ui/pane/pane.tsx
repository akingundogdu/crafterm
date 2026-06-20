import type { BrowserPane } from '@ui/types/types'
import { renderMarkdown } from '@ui/markdown/markdown'
import { browsers, docs, uid } from '@ui/state/state'
import type { PaneMenuEntry } from './pane.types'
import {
  makePaneDragMousedown,
  buildPaneMenu,
  makeSelectPane,
  makeCloseClick,
  makeBrowserReload,
  makeBrowserExternal,
  makeBrowserTitleUpdate,
  makeDocCopyPath,
  makeDocReveal,
  makeSaveDoc,
  readDoc,
  makeDocMention,
  makeDocCopyMention,
  makeDocAddToChat,
  preventStopMousedown
} from './pane.state'

export type { PaneMenuEntry } from './pane.types'
export { buildPaneMenu } from './pane.state'
// Re-exported for external callers that still import them from '@ui/pane/pane'
// (main.ts, pickers/commands/spotlight/sidebar/time/dailyPlan/content/settings) —
// homes now in terminal/.
export { markBusy, paneStatus } from '../terminal/activity-detection'
export { updatePaneStatus } from '../terminal/status-bar'
export {
  isPlanOwnedByPane,
  refreshPanePlans,
  refreshClaudeStatus,
  applyClaudeSessionTitle,
  refreshPaneInfo,
  refreshPaneDailyTask
} from '../terminal/pane-info'
export {
  createPane,
  mountPanes,
  destroyPane,
  setPaneBackground,
  applyAppearance,
  adjustActivePaneFontSize,
  resetActivePaneFontSize
} from '../terminal/terminal'

// Drag-to-rearrange: the header is the handle. Uses pointer events (NOT HTML5
// drag-and-drop, which is unreliable over xterm canvases) and hit-tests the
// pane-box under the cursor each move; dropping re-lays-out the active tab.
export function setupPaneDnd(box: HTMLElement, header: HTMLElement, id: string): void {
  const grip = (
    <span class="pane-grip" title="Drag to move this pane">
      ⠿
    </span>
  ) as HTMLSpanElement
  // Sit the grip just after the daily-task chip (when present) so the issue key
  // shows to the LEFT of the drag handle; otherwise right after the title.
  const anchor = header.querySelector('.pane-daily-chip') ?? header.querySelector('.pane-title')
  if (anchor) anchor.insertAdjacentElement('afterend', grip)
  else header.prepend(grip)

  // visual-only drop indicator (its ::after draws the highlighted zone)
  const overlay = (<div class="pane-drop" />) as HTMLDivElement
  box.appendChild(overlay)

  header.addEventListener('mousedown', makePaneDragMousedown(id))
}

// Per-pane options menu (anchored under the ⋯ button). Exported so the terminal
// module's createPane can wire the ⋯ button without a circular value import.
export function showPaneMenu(
  anchor: HTMLElement,
  paneId: string,
  opts: { worktree?: boolean; bg?: boolean } = {}
): void {
  document.querySelector('.context-menu')?.remove()
  const menu = (<div class="context-menu" />) as HTMLDivElement
  const r = anchor.getBoundingClientRect()
  menu.style.left = Math.min(r.left, window.innerWidth - 220) + 'px'
  menu.style.top = r.bottom + 4 + 'px'

  // Consecutive swatch entries share a single color-swatches row.
  let swatchRow: HTMLElement | null = null
  for (const e of buildPaneMenu(paneId, opts)) {
    if (e.kind === 'swatch') {
      if (!swatchRow) {
        swatchRow = (<div class="context-menu-swatches" />) as HTMLDivElement
        menu.appendChild(swatchRow)
      }
      const s = (
        <button
          class={'context-menu-swatch' + (e.color === null ? ' context-menu-swatch-none' : '')}
          onClick={() => {
            menu.remove()
            e.run()
          }}
        />
      ) as HTMLButtonElement
      if (e.color) s.style.background = e.color
      else s.title = 'Default'
      swatchRow.appendChild(s)
      continue
    }
    swatchRow = null
    if (e.kind === 'label') {
      const lab = (<div class="context-menu-label">{e.text}</div>) as HTMLDivElement
      menu.appendChild(lab)
      continue
    }
    const b = (
      <button
        onClick={() => {
          menu.remove()
          e.run()
        }}
      >
        {e.label}
      </button>
    ) as HTMLButtonElement
    menu.appendChild(b)
  }

  document.body.appendChild(menu)
  const onDown = (ev: MouseEvent): void => {
    if (!menu.contains(ev.target as Node)) {
      menu.remove()
      document.removeEventListener('mousedown', onDown, true)
    }
  }
  setTimeout(() => document.addEventListener('mousedown', onDown, true))
}

// An embedded browser pane that loads `url` in a <webview>.
export function createBrowserPane(url: string): string {
  const id = uid('b')

  const htitle = (<span class="pane-title">{url}</span>) as HTMLSpanElement

  const reload = (<button class="pane-btn" title="Reload">⟳</button>) as HTMLButtonElement
  const ext = (
    <button class="pane-btn" title="Open in external browser">
      ↗
    </button>
  ) as HTMLButtonElement
  const menuBtn = (
    <button
      class="pane-btn"
      title="Pane options"
      onClick={(e: MouseEvent) => {
        e.stopPropagation()
        showPaneMenu(menuBtn, id, { worktree: false, bg: false })
      }}
    >
      ⋯
    </button>
  ) as HTMLButtonElement
  const close = (<button class="pane-close" onClick={makeCloseClick(id)}>×</button>) as HTMLButtonElement
  const header = (
    <div class="pane-header">
      {htitle}
      {reload}
      {ext}
      {menuBtn}
      {close}
    </div>
  ) as HTMLDivElement

  const webview = (
    <webview class="pane-web" src={url} allowpopups="true" />
  ) as unknown as HTMLElement

  const el = (
    <div class="pane-box browser-pane" dataset={{ paneId: id }}>
      {header}
      {webview}
    </div>
  ) as HTMLDivElement
  setupPaneDnd(el, header, id)
  el.addEventListener('mousedown', makeSelectPane(id))

  const bp: BrowserPane = { id, el, webview, url }
  reload.addEventListener('click', makeBrowserReload(webview))
  ext.addEventListener('click', makeBrowserExternal(bp))
  webview.addEventListener('page-title-updated', makeBrowserTitleUpdate(htitle))

  browsers.set(id, bp)
  return id
}

export function destroyBrowserPane(id: string): void {
  browsers.delete(id)
}

// A markdown note pane: rendered preview + raw editor + save. With
// { absolute:true } it reads any file on disk read-only (no editing).
export function createDocPane(source: string, opts?: { absolute?: boolean }): string {
  const absolute = !!opts?.absolute
  const id = uid('m')

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

  const preview = (<div class="doc-preview" />) as HTMLDivElement
  const editor = (
    <textarea
      class="doc-editor"
      style={{ display: 'none' }}
      ref={(el: HTMLTextAreaElement) => {
        el.spellcheck = false
      }}
    />
  ) as HTMLTextAreaElement

  const el = (
    <div class="pane-box doc-pane" dataset={{ paneId: id }}>
      {header}
      {preview}
      {editor}
    </div>
  ) as HTMLDivElement
  setupPaneDnd(el, header, id)
  el.addEventListener('mousedown', makeSelectPane(id))

  let editing = false
  let raw = ''
  const saveDoc = makeSaveDoc(source, absolute)
  // Re-read the file from disk and re-render (skips re-render while editing so
  // unsaved edits aren't clobbered). Used for initial load and the ⟳ button.
  const reload = async (): Promise<void> => {
    const content = await readDoc(source, absolute)
    raw = content
    if (!editing) {
      editor.value = content
      preview.innerHTML = renderMarkdown(content)
    }
  }
  void reload()
  refreshBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    void reload()
  })
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (editing) {
      // leaving edit mode -> save + re-render
      raw = editor.value
      saveDoc(raw)
      preview.innerHTML = renderMarkdown(raw)
    }
    editing = !editing
    editBtn.textContent = editing ? 'Preview' : 'Edit'
    preview.style.display = editing ? 'none' : 'block'
    editor.style.display = editing ? 'block' : 'none'
    if (editing) editor.focus()
  })
  // Cmd+S saves while editing
  editor.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.metaKey && e.key.toLowerCase() === 's') {
      e.preventDefault()
      raw = editor.value
      saveDoc(raw)
    }
  })

  // ---- floating selection actions (Cursor-style): select text in the preview,
  // then Copy / Add to Chat send an `@path:start-end` reference. Mirrors the code
  // editor pane. Only for real disk files (absolute), where the path means
  // something to Claude.
  if (absolute) {
    const mention = makeDocMention(preview, source, id)
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
    el.appendChild(menu)

    const updateFromSelection = (): void => {
      const sel = window.getSelection()
      if (!mention() || !sel) {
        menu.style.display = 'none'
        return
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      menu.style.left = `${Math.round(rect.right + 4)}px`
      menu.style.top = `${Math.round(rect.top - 4)}px`
      menu.style.display = ''
    }
    preview.addEventListener('mouseup', () => setTimeout(updateFromSelection, 0))
    preview.addEventListener('mousedown', () => {
      menu.style.display = 'none'
    })
    preview.addEventListener('scroll', () => {
      menu.style.display = 'none'
    })
  }

  docs.set(id, { id, el, relPath: source })
  return id
}

export function destroyDocPane(id: string): void {
  docs.delete(id)
}
