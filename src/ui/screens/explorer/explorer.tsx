import './explorer.css'
import {
  explorerRoot,
  shortPath,
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
} from './explorer.state'

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
  const el = treeEl()
  el.replaceChildren()
  const matches = await searchMatches(root, query)
  if (!matches.length) {
    el.appendChild(
      (<div class="explorer-empty" style="padding-left:6px">no matches</div>) as HTMLDivElement
    )
    return
  }
  for (const m of matches) {
    const row = (
      <div class="explorer-row file" style="padding-left:6px">
        <span class="explorer-tri" />
        <span class="explorer-name">{m.name}</span>
        <span class="explorer-sub">{shortPath(m.path.replace(/\/[^/]+$/, ''))}</span>
      </div>
    ) as HTMLDivElement
    row.addEventListener('click', makeSearchRowClick(m.path))
    el.appendChild(row)
  }
}

// ---- Public render ---------------------------------------------------------

export async function renderExplorer(): Promise<void> {
  const root = explorerRoot()
  rootEl().textContent = root ? shortPath(root) : ''
  rootEl().title = root
  const el = treeEl()
  if (!root) {
    el.replaceChildren()
    el.appendChild(
      (
        <div class="notif-empty">
          No root yet. Set one in Settings → Workspace, or open a terminal.
        </div>
      ) as HTMLDivElement
    )
    return
  }
  setCurrentRoot(root)
  const q = (searchEl()?.value ?? '').trim()
  if (q) {
    await renderSearch(root, q)
    return
  }
  ensureTreeview(el, adapter)
  await loadRootStatus(root)
  rerenderTree()
}

export function initExplorer(): void {
  document.getElementById('explorer-refresh')!.addEventListener('click', makeRefreshClick(() => void renderExplorer()))
  const search = searchEl()
  search?.addEventListener('input', makeSearchInputHandler(() => void renderExplorer()))
  search?.addEventListener('keydown', stopPropagation)
}
