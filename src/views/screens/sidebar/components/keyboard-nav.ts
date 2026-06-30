import type { SidebarNode } from '@views/types/types'
import type { TreeView } from '@views/components/treeview/treeview'
import type { SidebarMode } from '../sidebar.types'
import { state } from '@views/state/spine'
import { selectTab, selectNode, toggleCollapse } from '@views/commands/commands'
import { databaseHandleKey } from '@views/screens/database/database'
import { dockerHandleKey } from '@views/screens/docker/docker'
import { handleNotebookKey } from '@views/notebook/notebook'

export function focusList(tabListEl: HTMLElement): void {
  tabListEl.focus()
}

export function scrollSelectedIntoView(tabListEl: HTMLElement, center = false): void {
  if (!state.selectedNodeId) return
  const el = tabListEl.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(state.selectedNodeId)}"]`)
  if (!el) return
  if (!center) {
    el.scrollIntoView({ block: 'nearest' })
    return
  }
  // Only scroll when the selected row is off-screen; if it's already visible,
  // leave the scroll position alone. When hidden, center it in the list.
  const elRect = el.getBoundingClientRect()
  const contRect = tabListEl.getBoundingClientRect()
  if (elRect.top < contRect.top || elRect.bottom > contRect.bottom) {
    el.scrollIntoView({ block: 'center' })
  }
}

// Cmd+1..9 (and clicking a number) jump to the Nth visible row: focus a terminal,
// or select + reveal a folder.
export function activateRowByNumber(
  n: number,
  tree: TreeView<SidebarNode>,
  tabListEl: HTMLElement
): void {
  const node = tree.visibleNodes()[n - 1]
  if (!node) return
  if (node.kind === 'tab') {
    selectTab(node.id)
  } else {
    selectNode(node.id)
    if (node.collapsed) toggleCollapse(node.id)
    focusList(tabListEl)
    scrollSelectedIntoView(tabListEl)
  }
}

// Delegate sidebar list keydowns to the active view's tree / handler.
export function wireListKeyboard(
  tabListEl: HTMLElement,
  tree: TreeView<SidebarNode>,
  getMode: () => SidebarMode
): void {
  tabListEl.tabIndex = 0
  tabListEl.addEventListener('keydown', (e) => {
    const sidebarMode = getMode()
    if (sidebarMode === 'database') {
      databaseHandleKey(e)
      return
    }
    if (sidebarMode === 'docker') {
      dockerHandleKey(e)
      return
    }
    if (sidebarMode === 'notebook') {
      handleNotebookKey(e)
      return
    }
    tree.handleKey(e)
  })
}
