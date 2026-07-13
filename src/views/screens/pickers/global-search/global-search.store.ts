import { Store } from '@geajs/core'
import { state, panes } from '@views/state/spine'
import { flattenProjects } from '@views/catalog/catalog'
import { allTabs, panesInLayout } from '../lib/tree'
import { buildPaneMenu } from '@views/pane/pane'
import {
  splitProjectRight,
  selectPane,
  openLink,
  openMarkdownFile,
  openNote
} from '@views/commands/commands'
import { notebookService } from '@services'
import { bookmarkRepo, accountRepo } from '@repositories'
// Unremovable @ui dependency: the sidebar screen is not yet migrated to @views,
// so its action-menu search entries have no @views home. Repoint to the @views
// sidebar when it lands.
import { actionMenuSearchEntries } from '@views/screens/sidebar/sidebar'
import type { GsEntry } from './global-search.types'

// Reactive state for the Spotlight global-search picker. `query` (the search box
// text) and `sel` (the keyboard-navigation selection index) are the source of
// truth, read directly in the list view's template() so gea patches the list on
// every keystroke / arrow move / hover — the board pattern. The async-built entry
// index is static after open and handed to the list via props, not stored here.
// `rev` is bumped for refreshes the view didn't drive itself.
class GlobalSearchStore extends Store {
  query = ''
  sel = 0
  rev = 0

  reset(): void {
    this.query = ''
    this.sel = 0
  }

  setQuery(query: string): void {
    this.query = query
  }

  setSel(sel: number): void {
    this.sel = sel
  }

  bump(): void {
    this.rev++
  }
}

export default new GlobalSearchStore()

// ---- Spotlight: global search across every navigable surface ---------------
// Cmd+J. Fuzzy-substring match across projects, features, open panes, notebook
// docs, bookmarks, plan files, and accounts. Hitting Enter dispatches to the
// right opener for the picked entry's source.
export async function buildGlobalSearchIndex(): Promise<GsEntry[]> {
  const out: GsEntry[] = []
  // projects + their features
  for (const p of flattenProjects(state.tree)) {
    out.push({
      source: 'project',
      label: p.name,
      detail: p.path,
      open: () => void splitProjectRight(p)
    })
    if (p.features) {
      for (const f of p.features) {
        out.push({
          source: 'feature',
          label: f.name,
          detail: p.name,
          open: () => void splitProjectRight(p)
        })
      }
    }
  }
  // open panes
  for (const pane of panes.values()) {
    const tab = allTabs(state.tree).find((t) => panesInLayout(t.root).includes(pane.id))
    out.push({
      source: 'pane',
      label: pane.title || 'terminal',
      detail: [tab?.title, pane.cwd, pane.branch].filter(Boolean).join(' · '),
      open: () => selectPane(pane.id)
    })
  }
  // bookmarks
  for (const bm of bookmarkRepo.getAll()) {
    out.push({
      source: 'bookmark',
      label: bm.title,
      detail: bm.type === 'link' ? bm.content : bm.tags.join(', '),
      open: () => void openLink(bm.content)
    })
  }
  // accounts
  for (const a of accountRepo.getAll()) {
    out.push({
      source: 'account',
      label: a.label,
      detail: [a.kind === 'secret' ? 'secret' : a.service, a.login].filter(Boolean).join(' · '),
      // No deep-link into Accounts mode form yet — surface by switching to the
      // sidebar tab so the user can find it.
      open: () => document.getElementById('tab-accounts')?.dispatchEvent(new MouseEvent('click'))
    })
  }
  // plan files (one per pane, deduped by path)
  const seenPlans = new Set<string>()
  for (const pane of panes.values()) {
    for (const plan of pane.plans) {
      if (seenPlans.has(plan.path)) continue
      seenPlans.add(plan.path)
      out.push({
        source: 'plan',
        label: plan.name.replace(/\.(md|mdx|mdc)$/i, ''),
        detail: plan.path,
        open: () => openMarkdownFile(plan.path)
      })
    }
  }
  // notebook tree (flat)
  try {
    const tree = await notebookService.tree()
    const walk = (nodes: typeof tree, parent: string): void => {
      for (const n of nodes) {
        const path = parent ? `${parent}/${n.name}` : n.name
        if (n.kind === 'file') {
          out.push({
            source: 'notebook',
            label: n.name.replace(/\.(md|mdx|mdc)$/i, ''),
            detail: parent,
            open: () => openNote(n.path)
          })
        }
        if (n.children) walk(n.children, path)
      }
    }
    walk(tree, '')
  } catch {
    // ignore — notebook IPC may fail in dev
  }
  // sidebar ⋯ action menu (global actions)
  for (const a of actionMenuSearchEntries()) {
    out.push({ source: 'action', label: a.label, open: a.run })
  }
  // active pane's ⋯ menu (pane-scoped actions, run commands, SSH, background)
  const apid = state.activePaneId
  if (apid && panes.has(apid)) {
    const paneTitle = panes.get(apid)?.title || 'terminal'
    for (const e of buildPaneMenu(apid)) {
      if (e.kind === 'label') continue
      out.push({ source: 'pane-action', label: e.label, detail: paneTitle, open: e.run })
    }
  }
  return out
}

export const SOURCE_LABEL: Record<GsEntry['source'], string> = {
  project: 'PROJECT',
  feature: 'FEATURE',
  pane: 'PANE',
  notebook: 'NOTE',
  bookmark: 'BOOKMARK',
  plan: 'PLAN',
  account: 'ACCOUNT',
  action: 'ACTION',
  'pane-action': 'PANE ACTION'
}

// Substring match across label/detail/source; capped at 100 rows (all when blank).
export function filterEntries(entries: GsEntry[], query: string): GsEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries.slice(0, 100)
  return entries
    .filter((e) => `${e.label} ${e.detail ?? ''} ${e.source}`.toLowerCase().includes(q))
    .slice(0, 100)
}

// Row activation: close the picker, then run the entry's opener.
export function makeChoose(close: () => void): (e: GsEntry) => void {
  return (e) => {
    close()
    e.open()
  }
}
