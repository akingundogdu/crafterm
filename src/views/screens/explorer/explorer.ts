import './explorer.css'
import {
  explorerRoot,
  shortPath,
  searchSubPath,
  rerenderTree,
  makeAdapter,
  ensureTreeview,
  setCurrentRoot,
  loadRootStatus,
  searchMatches,
  makeSearchRowClick,
  makeRefreshClick,
  makeSearchInputHandler,
  stopPropagation
} from './explorer.store'
import { buildExplorerSearchRow } from './components/explorer-search-row'
import { buildExplorerEmpty } from './components/explorer-empty'

// File explorer screen (right panel → Files tab). Imperative widget — plain DOM
// over the @views treeview port; gea reactivity buys nothing here (§2.7
// self-contained, no @ui). The legacy entry mounts this against the static
// index.html hosts (#explorer-tree / #explorer-root / #explorer-search /
// #explorer-refresh).

function treeEl(): HTMLElement {
  return document.getElementById('explorer-tree')!
}
function rootEl(): HTMLElement {
  return document.getElementById('explorer-root')!
}
function searchEl(): HTMLInputElement {
  return document.getElementById('explorer-search') as HTMLInputElement
}

const adapter = makeAdapter(() => void renderExplorer())

// ---- Flat search view (contains-match on name across the whole root) --------

async function renderSearch(root: string, query: string): Promise<void> {
  const el2 = treeEl()
  el2.replaceChildren()
  const matches = await searchMatches(root, query)
  if (!matches.length) {
    el2.appendChild(buildExplorerEmpty('explorer-empty', 'no matches', true))
    return
  }
  for (const m of matches) {
    el2.appendChild(
      buildExplorerSearchRow({
        name: m.name,
        subPath: searchSubPath(m.path),
        fullPath: shortPath(m.path),
        onClick: makeSearchRowClick(m.path)
      })
    )
  }
}

// ---- Public render ---------------------------------------------------------

export async function renderExplorer(): Promise<void> {
  const root = explorerRoot()
  rootEl().textContent = root ? shortPath(root) : ''
  rootEl().title = root
  const el2 = treeEl()
  if (!root) {
    el2.replaceChildren()
    el2.appendChild(
      buildExplorerEmpty('notif-empty', 'No root yet. Set one in Settings → Workspace, or open a terminal.')
    )
    return
  }
  setCurrentRoot(root)
  const q = (searchEl()?.value ?? '').trim()
  if (q) {
    await renderSearch(root, q)
    return
  }
  ensureTreeview(el2, adapter)
  await loadRootStatus(root)
  rerenderTree()
}

export function initExplorer(): void {
  document.getElementById('explorer-refresh')!.addEventListener('click', makeRefreshClick(() => void renderExplorer()))
  const search = searchEl()
  search?.addEventListener('input', makeSearchInputHandler(() => void renderExplorer()))
  search?.addEventListener('keydown', stopPropagation)
}
