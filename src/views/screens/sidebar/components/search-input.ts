import type { SidebarNode } from '@views/types/types'
import type { TreeView } from '@views/components/treeview/treeview'
import type { SidebarMode } from '../sidebar.types'
import { dbApplyQuery } from '@views/screens/database/database'
import { dockerApplyQuery } from '@views/screens/docker/docker'
import { accountsApplyQuery } from '@views/screens/accounts/accounts'
import { nbApplyQuery, notebookSelectFirst } from '@views/notebook/notebook'

// Collaborators the search box needs from the shell.
export interface SearchInputContext {
  searchInputEl: HTMLInputElement
  tree: TreeView<SidebarNode>
  getMode: () => SidebarMode
  setSearchQuery: (q: string) => void
  focusList: () => void
}

// Wire the shared search box: dispatch the query to the active view, and handle
// ESC (clear/blur) + ArrowDown (step into the result list).
export function wireSearchInput(ctx: SearchInputContext): void {
  const { searchInputEl, tree, getMode, setSearchQuery, focusList } = ctx
  searchInputEl.addEventListener('input', () => {
    const sidebarMode = getMode()
    if (sidebarMode === 'notebook') nbApplyQuery(searchInputEl.value)
    else if (sidebarMode === 'database') dbApplyQuery(searchInputEl.value)
    else if (sidebarMode === 'docker') dockerApplyQuery(searchInputEl.value)
    else if (sidebarMode === 'accounts') accountsApplyQuery(searchInputEl.value)
    else {
      setSearchQuery(searchInputEl.value)
      tree.setFilter(searchInputEl.value)
    }
  })
  searchInputEl.addEventListener('keydown', (e) => {
    e.stopPropagation()
    const sidebarMode = getMode()
    if (e.key === 'Escape') {
      searchInputEl.value = ''
      if (sidebarMode === 'notebook') nbApplyQuery('')
      else if (sidebarMode === 'database') dbApplyQuery('')
      else if (sidebarMode === 'docker') dockerApplyQuery('')
      else if (sidebarMode === 'accounts') accountsApplyQuery('')
      else {
        setSearchQuery('')
        tree.setFilter('')
      }
      searchInputEl.blur()
    } else if (e.key === 'ArrowDown') {
      // step from the search box into the result list
      e.preventDefault()
      focusList()
      if (sidebarMode === 'notebook') notebookSelectFirst()
      else tree.selectFirst()
    }
  })
}

export function focusSearch(searchInputEl: HTMLInputElement): void {
  searchInputEl.focus()
  searchInputEl.select()
}
