import type { BrowserPane } from '@ui/types/types'
import { renderMarkdown } from '@ui/markdown/markdown'
import { browsers, docs, uid } from '@ui/state/state'
import {
  makePaneDragMousedown,
  makeSelectPane,
  makeBrowserReload,
  makeBrowserExternal,
  makeBrowserTitleUpdate,
  makeSaveDoc,
  readDoc,
  makeDocMention
} from './pane.state'
import { createPaneGrip, createPaneDropOverlay } from './components/pane-drag'
import { showPaneMenu } from './components/pane-menu'
import { createBrowserPaneHeader } from './components/browser-pane'
import { createDocPaneHeader, createDocSelectionMenu } from './components/doc-pane'

export type { PaneMenuEntry } from './pane.types'
export { buildPaneMenu } from './pane.state'
export { showPaneMenu } from './components/pane-menu'
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
  const grip = createPaneGrip()
  // Sit the grip just after the daily-task chip (when present) so the issue key
  // shows to the LEFT of the drag handle; otherwise right after the title.
  const anchor = header.querySelector('.pane-daily-chip') ?? header.querySelector('.pane-title')
  if (anchor) anchor.insertAdjacentElement('afterend', grip)
  else header.prepend(grip)

  const overlay = createPaneDropOverlay()
  box.appendChild(overlay)

  header.addEventListener('mousedown', makePaneDragMousedown(id))
}

// An embedded browser pane that loads `url` in a <webview>.
export function createBrowserPane(url: string): string {
  const id = uid('b')

  const { header, htitle, reload, ext, webview } = createBrowserPaneHeader(id, url, (menuAnchor) =>
    showPaneMenu(menuAnchor, id, { worktree: false, bg: false })
  )

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

  const { header, refreshBtn, editBtn } = createDocPaneHeader(id, source, absolute)

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
    const menu = createDocSelectionMenu(id, mention)
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
