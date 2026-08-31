import { buildBrowserPaneBox, buildDocPaneBox } from './pane-box'
import type { BrowserPane } from '@views/types/types'
import { browsers, docs, uid } from '@views/state/spine'
import { makeSelectPane, makeDocMention } from './pane.store'
import { showPaneMenu } from './components/pane-menu'
import { createBrowserPaneHeader } from './components/browser-pane'
import { createDocPaneHeader, createDocSelectionMenu } from './components/doc-pane'
import { setupPaneDnd } from './components/pane-drag.engine'
import { createMarkdownPreview } from './components/markdown-preview'
import { createDocEditor } from './components/doc-editor'
import { setupEditorLifecycle } from './components/editor-lifecycle.engine'
import { setupBrowserEvents } from './components/browser-events.engine'

export type { PaneMenuEntry } from './pane.types'
export { buildPaneMenu } from './pane.store'
export { showPaneMenu } from './components/pane-menu'
// Re-exported for external callers that still import them from the pane entry
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

export { setupPaneDnd } from './components/pane-drag.engine'

// An embedded browser pane that loads `url` in a <webview>.
export function createBrowserPane(url: string): string {
  const id = uid('b')

  const { header, htitle, reload, ext, webview } = createBrowserPaneHeader(id, url, (menuAnchor) =>
    showPaneMenu(menuAnchor, id, { worktree: false, bg: false })
  )

  const box = buildBrowserPaneBox(id, makeSelectPane(id))
  box.append(header, webview)
  setupPaneDnd(box, header, id)

  const bp: BrowserPane = { id, el: box, webview, url }
  setupBrowserEvents({ bp, webview, htitle, reload, ext })

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

  const preview = createMarkdownPreview()
  const editor = createDocEditor()

  const box = buildDocPaneBox(id, makeSelectPane(id))
  box.append(header, preview, editor)
  setupPaneDnd(box, header, id)

  setupEditorLifecycle({ source, absolute, preview, editor, refreshBtn, editBtn })

  // ---- floating selection actions (Cursor-style): select text in the preview,
  // then Copy / Add to Chat send an `@path:start-end` reference. Mirrors the code
  // editor pane. Only for real disk files (absolute), where the path means
  // something to Claude.
  if (absolute) {
    const mention = makeDocMention(preview, source, id)
    const menu = createDocSelectionMenu(id, mention)
    box.appendChild(menu)

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

  docs.set(id, { id, el: box, relPath: source, absolute })
  return id
}

export function destroyDocPane(id: string): void {
  docs.delete(id)
}
