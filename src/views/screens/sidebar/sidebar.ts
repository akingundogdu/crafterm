import type { SidebarNode } from '@views/types/types'
import { state } from '@views/state/spine'
import { createTreeView } from '@views/components/treeview/treeview'
import { renderDatabase, dbApplyQuery } from '@ui/screens/database/database'
import { renderDocker, dockerApplyQuery } from '@ui/screens/docker/docker'
import { renderAccounts, accountsApplyQuery } from '@ui/screens/accounts/accounts'
import { moveNode } from '@views/commands/commands'
import { renderNotebook, nbClearQuery } from '@views/notebook/notebook'
import './sidebar.css'
import type { SidebarMode } from './sidebar.types'
import { isArchivedTab, hasArchivedDescendant } from './sidebar.state'
import { wireSearchInput, focusSearch as focusSearchImpl } from './components/search-input'
import { wireCollapseToggle } from './components/collapse-toggle'
import { wireActionsMenu, actionMenuSearchEntries } from './components/actions-menu'
import { wireModeTabs } from './components/sidebar-mode-tabs'
import { buildAdapter } from './components/tree-adapter'
import { buildSections } from './components/sections-builder'
import {
  focusList as focusListImpl,
  scrollSelectedIntoView as scrollSelectedIntoViewImpl,
  activateRowByNumber as activateRowByNumberImpl,
  wireListKeyboard
} from './components/keyboard-nav'
import { applyTabDisplay, tabMeta } from './components/tab-display-control'
import { createSidebarVisibility } from './components/sidebar-visibility'

export { actionMenuSearchEntries }
export { applyTabDisplay, tabMeta }

const appEl = document.getElementById('app')!
const sidebarEl = document.getElementById('sidebar')!
const tabListEl = document.getElementById('tab-list')!
const searchInputEl = document.getElementById('search-input') as HTMLInputElement

const tabTerminalEl = document.getElementById('tab-terminal')!
const tabNotebookEl = document.getElementById('tab-notebook')!
const tabDatabaseEl = document.getElementById('tab-database')!
const tabDockerEl = document.getElementById('tab-docker')!
const tabAccountsEl = document.getElementById('tab-accounts')!

let sidebarMode: SidebarMode = 'terminal'
let searchQuery = ''
let showArchivedView = false

// ---------------------------------------------------------------------------
// Shared helpers used by the extracted pieces (kept in the shell because they
// read the live mutable flags / element caches).
// ---------------------------------------------------------------------------

function focusList(): void {
  focusListImpl(tabListEl)
}

function scrollSelectedIntoView(center = false): void {
  scrollSelectedIntoViewImpl(tabListEl, center)
}

// Archived-view filtering (never-delete model).
function passesArchiveFilter(n: SidebarNode): boolean {
  if (showArchivedView) {
    if (n.kind === 'tab') return isArchivedTab(n)
    if (n.kind === 'worktree') return n.status === 'archived' || hasArchivedDescendant(n)
    return hasArchivedDescendant(n)
  }
  // Normal view: hide archived sessions and archived (removed) worktrees.
  if (n.kind === 'tab') return !isArchivedTab(n)
  if (n.kind === 'worktree') return n.status !== 'archived'
  return true
}

export function toggleArchivedView(): void {
  showArchivedView = !showArchivedView
  renderSidebar()
}

// ---------------------------------------------------------------------------
// The terminal TreeView
// ---------------------------------------------------------------------------

const adapter = buildAdapter({
  passesArchiveFilter,
  focusList,
  beginRename: (id) => tree.beginRename(id),
  isArchivedView: () => showArchivedView,
  toggleArchivedView,
  renderSidebar: () => renderSidebar()
})

const tree = createTreeView<SidebarNode>(tabListEl, adapter)

// Drop on empty sidebar space -> move to root.
tabListEl.addEventListener('dragover', (e) => e.preventDefault())
tabListEl.addEventListener('drop', (e) => {
  const dragId = e.dataTransfer?.getData('text/plain')
  if (dragId) moveNode(dragId, null, 'into')
})

// ---------------------------------------------------------------------------
// Search box + buttons + mode tabs + keyboard wiring
// ---------------------------------------------------------------------------

wireSearchInput({
  searchInputEl,
  tree,
  getMode: () => sidebarMode,
  setSearchQuery: (q) => {
    searchQuery = q
  },
  focusList
})

export function focusSearch(): void {
  focusSearchImpl(searchInputEl)
}

wireCollapseToggle()
wireActionsMenu()
wireModeTabs(setSidebarMode)
wireListKeyboard(tabListEl, tree, () => sidebarMode)

// Cmd+1..9 (and clicking a number) jump to the Nth visible row.
export function activateRowByNumber(n: number): void {
  activateRowByNumberImpl(n, tree, tabListEl)
}

// ---------------------------------------------------------------------------
// Sidebar mode (terminal / notebook / database)
// ---------------------------------------------------------------------------

export function setSidebarMode(m: SidebarMode): void {
  sidebarMode = m
  appEl.classList.toggle('mode-notebook', m === 'notebook')
  appEl.classList.toggle('mode-database', m === 'database')
  appEl.classList.toggle('mode-docker', m === 'docker')
  appEl.classList.toggle('mode-accounts', m === 'accounts')
  tabTerminalEl.classList.toggle('active', m === 'terminal')
  tabNotebookEl.classList.toggle('active', m === 'notebook')
  tabDatabaseEl.classList.toggle('active', m === 'database')
  tabDockerEl.classList.toggle('active', m === 'docker')
  tabAccountsEl.classList.toggle('active', m === 'accounts')
  // shared search bar: reset + relabel for the active view
  searchInputEl.value = ''
  searchQuery = ''
  nbClearQuery()
  dbApplyQuery('')
  dockerApplyQuery('')
  accountsApplyQuery('')
  searchInputEl.placeholder =
    m === 'notebook'
      ? 'Search notes…'
      : m === 'database'
        ? 'Search databases…'
        : m === 'docker'
          ? 'Search docker…'
          : m === 'accounts'
            ? 'Search accounts…'
            : 'Search…'
  if (m === 'notebook') void renderNotebook(tabListEl)
  else if (m === 'database') void renderDatabase(tabListEl)
  else if (m === 'docker') void renderDocker(tabListEl)
  else if (m === 'accounts') renderAccounts()
  else {
    tree.setFilter('')
    renderSidebar()
  }
  tabListEl.focus() // enable arrow-key navigation in the chosen view
}

export function isNotebookMode(): boolean {
  return sidebarMode === 'notebook'
}

export function isDatabaseMode(): boolean {
  return sidebarMode === 'database'
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderSidebar(): void {
  if (sidebarMode !== 'terminal') return // those views own the list
  tree.selectedId = state.selectedNodeId
  tree.renderSections(buildSections(passesArchiveFilter))
}

// ---------------------------------------------------------------------------
// Light updates (no DOM rebuild — keeps interactions alive)
// ---------------------------------------------------------------------------

export function updateStatuses(): void {
  if (sidebarMode !== 'terminal') return
  tree.refreshDynamic()
}

export function updateActiveTab(): void {
  tabListEl.querySelectorAll<HTMLElement>('.tab-item[data-tree-id]').forEach((el) => {
    el.classList.toggle('active', el.dataset.treeId === state.activeTabId)
    el.classList.toggle('selected', el.dataset.treeId === state.selectedNodeId)
  })
  // Reveal the focused terminal's row: if it scrolled out of view, center it.
  scrollSelectedIntoView(true)
}

// Inline-rename the currently selected sidebar node. Used by Cmd+Shift+R.
export function renameSelected(): void {
  if (state.selectedNodeId) tree.beginRename(state.selectedNodeId)
}

// ---------------------------------------------------------------------------
// Visibility / orientation / resize / font
// ---------------------------------------------------------------------------

const visibility = createSidebarVisibility(appEl, sidebarEl)
export const {
  applySidebarCollapsed,
  toggleSidebar,
  applyOrientation,
  applySidebarFont,
  adjustSidebarFontSize,
  resetSidebarFontSize,
  sidebarHasFocus,
  applySidebarSize,
  wireSidebarResizer
} = visibility

document.getElementById('sidebar-show')!.addEventListener('click', toggleSidebar)
// #statusbar-sidebar-toggle is wired by the status bar component (mountStatusBar)
