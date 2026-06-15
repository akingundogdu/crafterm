import type { LayoutNode } from './types'
import { panes, browsers, docs, sqlPanes, diffPanes, filePanes, codePanes, state, saveSoon, poppedOut } from './state'
import { findTab } from './tree'
import { mountPanes } from './pane'
import { terminalService } from './services/ipc'

const contentEl = document.getElementById('content')!

// A pane shown in a separate pop-out window leaves this placeholder behind.
function buildPlaceholder(paneId: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'pane-box pane-popped'
  const inner = document.createElement('div')
  inner.className = 'pane-popped-inner'
  const label = document.createElement('div')
  label.className = 'pane-popped-label'
  label.textContent = (panes.get(paneId)?.title || 'Terminal') + ' is open in a separate window'
  const btn = document.createElement('button')
  btn.className = 'settings-inline-btn'
  btn.textContent = 'Focus window'
  btn.addEventListener('click', () => terminalService.popoutFocus(paneId))
  inner.append(label, btn)
  el.appendChild(inner)
  return el
}

function buildNode(node: LayoutNode): HTMLElement {
  if (node.type === 'leaf') {
    if (poppedOut.has(node.paneId)) {
      const el = buildPlaceholder(node.paneId)
      el.style.flexGrow = ''
      el.style.flexShrink = ''
      el.style.flexBasis = ''
      return el
    }
    let el =
      panes.get(node.paneId)?.el ??
      browsers.get(node.paneId)?.el ??
      docs.get(node.paneId)?.el ??
      sqlPanes.get(node.paneId)?.el ??
      diffPanes.get(node.paneId)?.el ??
      filePanes.get(node.paneId)?.el ??
      codePanes.get(node.paneId)?.el
    if (!el) {
      el = document.createElement('div')
      el.className = 'pane-box'
    }
    // clear stale flex sizing left over from a previous split; a split parent
    // re-applies it below, while a sole/root pane falls back to CSS flex:1.
    el.style.flexGrow = ''
    el.style.flexShrink = ''
    el.style.flexBasis = ''
    return el
  }
  const container = document.createElement('div')
  container.className = 'split ' + node.dir
  node.children.forEach((child, i) => {
    const el = buildNode(child)
    el.style.flexGrow = String(node.sizes[i] ?? 1)
    el.style.flexShrink = '1'
    el.style.flexBasis = '0'
    container.appendChild(el)
    if (i < node.children.length - 1) {
      const rz = document.createElement('div')
      rz.className = 'resizer ' + node.dir
      attachResizer(rz, container, node, i)
      container.appendChild(rz)
    }
  })
  return container
}

function attachResizer(
  rz: HTMLElement,
  container: HTMLElement,
  node: Extract<LayoutNode, { type: 'split' }>,
  i: number
): void {
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
    const overlay = document.createElement('div')
    overlay.className = 'resize-overlay'
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
      // The drag mutated node.sizes and the DOM directly without a rebuild, so
      // the cached layout signature is now stale. Refresh it — otherwise a later
      // equalize/render that computes the same sig string is skipped and the
      // dragged flex sizes stay stuck on screen.
      const tab = state.activeTabId ? findTab(state.tree, state.activeTabId) : null
      const entry = tab ? tabContainers.get(tab.id) : null
      if (tab && entry) entry.sig = layoutSig(tab.root)
      saveSoon()
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize'
  })
}

export function updatePaneHighlight(): void {
  document.querySelectorAll<HTMLElement>('.pane-box').forEach((el) => {
    el.classList.toggle('active', el.dataset.paneId === state.activePaneId)
  })
}

// Each tab's layout lives in its own container that stays in the DOM; switching
// tabs only flips `display`, so panes are never detached/reattached. Detaching a
// pane resets its xterm scroll position and forces a repaint (the "jumps back /
// re-renders" feeling). A container is rebuilt only when its tab's layout
// structure or split sizes actually change.
const tabContainers = new Map<string, { el: HTMLElement; sig: string }>()

// A structural fingerprint of a layout: pane ids, split directions and sizes.
// Same signature ⇒ the DOM is already correct, so we skip the rebuild.
function layoutSig(node: LayoutNode): string {
  if (node.type === 'leaf') return poppedOut.has(node.paneId) ? 'pop:' + node.paneId : node.paneId
  return `${node.dir}[${node.sizes.join(',')}](${node.children.map(layoutSig).join(',')})`
}

export function renderContent(): void {
  // Drop containers for tabs that no longer exist (closed tabs).
  for (const [id, entry] of tabContainers) {
    if (!findTab(state.tree, id)) {
      entry.el.remove()
      tabContainers.delete(id)
    }
  }
  const tab = state.activeTabId ? findTab(state.tree, state.activeTabId) : null
  if (!tab) {
    tabContainers.forEach((e) => (e.el.style.display = 'none'))
    return
  }
  let entry = tabContainers.get(tab.id)
  if (!entry) {
    const el = document.createElement('div')
    el.className = 'tab-content'
    contentEl.appendChild(el)
    entry = { el, sig: '' }
    tabContainers.set(tab.id, entry)
  }
  const sig = layoutSig(tab.root)
  if (entry.sig !== sig) {
    entry.el.replaceChildren(buildNode(tab.root))
    entry.sig = sig
  }
  tabContainers.forEach((e, id) => {
    e.el.style.display = id === tab.id ? 'flex' : 'none'
  })
  mountPanes()
  updatePaneHighlight()
}
