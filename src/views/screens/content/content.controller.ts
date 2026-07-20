import type { LayoutNode } from '@views/types/types'
import {
  panes,
  browsers,
  docs,
  sqlPanes,
  diffPanes,
  filePanes,
  codePanes,
  state,
  poppedOut
} from '@views/state/spine'
import { buildContentBox } from './content-nodes'
import { findTab, firstPaneOf } from '@views/tree/tree'
import { mountPanes } from '@views/pane/pane'
import {
  tabContainers,
  layoutSig,
  makePopoutFocus,
  persistResizedLayout,
  isSideBySide,
  sideBySideTabs
} from './content.store'
import { buildPoppedOutPlaceholder } from './components/popped-out-placeholder'
import { buildAgentComposer, refreshAgentComposer } from './components/agent-composer'
import { buildSideBySideBar } from './components/side-by-side-bar'

const contentEl = document.getElementById('content')!

// Global content-area refresher. `renderContent` rebuilds the active tab's pane
// tree (only when its layout signature changes), and `updatePaneHighlight`
// toggles the active outline. Both are stateless refreshers over the shared
// singletons, so they live as arrow methods on one module-level instance and
// are re-exported as thin wrappers.
class ContentController {
  // Built on first use, then kept in the DOM and toggled — the draft and the
  // selections it holds survive the whole session.
  private composerEl: HTMLElement | null = null
  private sideBySideEl: HTMLElement | null = null

  // No tab is active (fresh launch, every tab closed, Cmd+Shift+N): show the agent
  // composer instead of a blank area.
  private toggleComposer = (visible: boolean): void => {
    if (!visible) {
      if (this.composerEl) this.composerEl.style.display = 'none'
      return
    }
    if (!this.composerEl) {
      this.composerEl = buildAgentComposer()
      contentEl.appendChild(this.composerEl)
    } else {
      // Shown again: the sidebar's projects may have changed since.
      refreshAgentComposer()
    }
    this.composerEl.style.display = 'flex'
  }

  // A pane shown in a separate pop-out window leaves this placeholder behind.
  private buildPlaceholder = (paneId: string): HTMLElement => {
    return buildPoppedOutPlaceholder({
      title: panes.get(paneId)?.title || 'Terminal',
      onFocusClick: makePopoutFocus(paneId)
    })
  }

  private buildNode = (node: LayoutNode): HTMLElement => {
    if (node.type === 'leaf') {
      if (poppedOut.has(node.paneId)) {
        const ph = this.buildPlaceholder(node.paneId)
        ph.style.flexGrow = ''
        ph.style.flexShrink = ''
        ph.style.flexBasis = ''
        return ph
      }
      let leafEl =
        panes.get(node.paneId)?.el ??
        browsers.get(node.paneId)?.el ??
        docs.get(node.paneId)?.el ??
        sqlPanes.get(node.paneId)?.el ??
        diffPanes.get(node.paneId)?.el ??
        filePanes.get(node.paneId)?.el ??
        codePanes.get(node.paneId)?.el
      if (!leafEl) {
        leafEl = buildContentBox('pane-box')
      }
      // clear stale flex sizing left over from a previous split; a split parent
      // re-applies it below, while a sole/root pane falls back to CSS flex:1.
      leafEl.style.flexGrow = ''
      leafEl.style.flexShrink = ''
      leafEl.style.flexBasis = ''
      return leafEl
    }
    const container = buildContentBox('split ' + node.dir)
    node.children.forEach((child, i) => {
      const childEl = this.buildNode(child)
      childEl.style.flexGrow = String(node.sizes[i] ?? 1)
      childEl.style.flexShrink = '1'
      childEl.style.flexBasis = '0'
      container.appendChild(childEl)
      if (i < node.children.length - 1) {
        const rz = buildContentBox('resizer ' + node.dir)
        this.attachResizer(rz, container, node, i)
        container.appendChild(rz)
      }
    })
    return container
  }

  private attachResizer = (
    rz: HTMLElement,
    container: HTMLElement,
    node: Extract<LayoutNode, { type: 'split' }>,
    i: number
  ): void => {
    rz.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const horizontal = node.dir === 'row'
      const rect = container.getBoundingClientRect()
      const total = horizontal ? rect.width : rect.height
      const startPos = horizontal ? e.clientX : e.clientY
      const a0 = node.sizes[i]
      const b0 = node.sizes[i + 1]
      const sum = a0 + b0
      const elA = container.children[i * 2] as HTMLElement
      const elB = container.children[i * 2 + 2] as HTMLElement
      // A <webview> captures pointer events, so once the cursor crosses into a
      // browser pane the document stops receiving mousemove/mouseup and the drag
      // freezes. A full-screen transparent overlay above the webviews keeps the
      // events flowing to the document for the duration of the drag.
      const overlay = buildContentBox('resize-overlay')
      overlay.style.cursor = horizontal ? 'col-resize' : 'row-resize'
      document.body.appendChild(overlay)

      const onMove = (ev: MouseEvent): void => {
        const pos = horizontal ? ev.clientX : ev.clientY
        let f = a0 / sum + (pos - startPos) / total
        f = Math.max(0.1, Math.min(0.9, f))
        node.sizes[i] = f * sum
        node.sizes[i + 1] = (1 - f) * sum
        elA.style.flexGrow = String(node.sizes[i])
        elB.style.flexGrow = String(node.sizes[i + 1])
      }
      const onUp = (): void => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        overlay.remove()
        document.body.style.cursor = ''
        persistResizedLayout()
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize'
    })
  }

  updatePaneHighlight = (): void => {
    document.querySelectorAll<HTMLElement>('.pane-box').forEach((box) => {
      box.classList.toggle('active', box.dataset.paneId === state.activePaneId)
    })
  }

  // The Cmd+clicked terminals, tiled in one row. Their pane elements are BORROWED
  // from their tab containers (never re-created, so the terminals keep running);
  // leaving the view rebuilds those containers from their layouts.
  private renderSideBySide = (): void => {
    const tabs = sideBySideTabs()
      .map((id) => findTab(state.tree, id))
      .filter((t): t is NonNullable<typeof t> => !!t)
    const paneIds = tabs.map((t) => firstPaneOf(t.root)).filter((id): id is string => !!id)

    tabContainers.forEach((e) => (e.el.style.display = 'none'))
    this.toggleComposer(false)

    if (!this.sideBySideEl) {
      this.sideBySideEl = buildContentBox('side-by-side')
      contentEl.appendChild(this.sideBySideEl)
    }
    const host = this.sideBySideEl
    host.style.display = 'flex'
    host.replaceChildren(buildSideBySideBar(tabs.length))

    const grid = buildContentBox('side-by-side-grid')
    for (const paneId of paneIds) {
      const paneEl = panes.get(paneId)?.el
      if (!paneEl) continue
      paneEl.style.flexGrow = '1'
      paneEl.style.flexShrink = '1'
      paneEl.style.flexBasis = '0'
      grid.appendChild(paneEl)
    }
    host.appendChild(grid)
    mountPanes()
    this.updatePaneHighlight()
  }

  renderContent = (): void => {
    // Drop containers for tabs that no longer exist (closed tabs).
    for (const [id, entry] of tabContainers) {
      if (!findTab(state.tree, id)) {
        entry.el.remove()
        tabContainers.delete(id)
      }
    }
    if (isSideBySide()) {
      this.renderSideBySide()
      return
    }
    if (this.sideBySideEl) this.sideBySideEl.style.display = 'none'
    const tab = state.activeTabId ? findTab(state.tree, state.activeTabId) : null
    if (!tab) {
      tabContainers.forEach((e) => (e.el.style.display = 'none'))
      this.toggleComposer(true)
      return
    }
    this.toggleComposer(false)
    let entry = tabContainers.get(tab.id)
    if (!entry) {
      const tabEl = buildContentBox('tab-content')
      contentEl.appendChild(tabEl)
      entry = { el: tabEl, sig: '' }
      tabContainers.set(tab.id, entry)
    }
    const sig = layoutSig(tab.root)
    if (entry.sig !== sig) {
      entry.el.replaceChildren(this.buildNode(tab.root))
      entry.sig = sig
    }
    tabContainers.forEach((e, id) => {
      e.el.style.display = id === tab.id ? 'flex' : 'none'
    })
    mountPanes()
    this.updatePaneHighlight()
  }
}

export const contentController = new ContentController()
