import './global-search.css'
import { state, panes } from '../../../state'
import { flattenProjects } from '../../../catalog'
import { allTabs, panesInLayout } from '../../../tree'
import { buildPaneMenu } from '../../../pane'
import {
  splitProjectRight,
  selectPane,
  openLink,
  openMarkdownFile,
  openNote
} from '../../../commands'
import { notebookService } from '@services'
import { bookmarkRepo, accountRepo } from '@services/storage/repositories'
import { actionMenuSearchEntries } from '../../sidebar/sidebar'
import { overlayModal } from '../shared'

// ---- Spotlight: global search across every navigable surface ---------------
// Cmd+J. Fuzzy-substring match across projects, features, open panes, notebook
// docs, bookmarks, plan files, and accounts. Hitting Enter dispatches to the
// right opener for the picked entry's source.
export interface GsEntry {
  source:
    | 'project'
    | 'feature'
    | 'pane'
    | 'notebook'
    | 'bookmark'
    | 'plan'
    | 'account'
    | 'action'
    | 'pane-action'
  label: string
  detail?: string
  open: () => void
}

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

export async function showGlobalSearch(): Promise<void> {
  const entries = await buildGlobalSearchIndex()
  const { modal, close } = overlayModal('picker-modal')
  const h = (<h2>Search Crafterm</h2>) as HTMLHeadingElement
  modal.appendChild(h)
  const input = (
    <input
      class="search-box-input"
      type="text"
      placeholder="Search projects, panes, actions, bookmarks, notes, plans…"
    />
  ) as HTMLInputElement
  input.spellcheck = false
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  modal.append(input, list)

  let sel = 0
  const filtered = (): GsEntry[] => {
    const q = input.value.trim().toLowerCase()
    if (!q) return entries.slice(0, 100)
    return entries
      .filter((e) => `${e.label} ${e.detail ?? ''} ${e.source}`.toLowerCase().includes(q))
      .slice(0, 100)
  }

  const choose = (e: GsEntry): void => {
    close()
    e.open()
  }

  const highlight = (): void => {
    list.querySelectorAll<HTMLElement>('.pick-row').forEach((el, i) => {
      el.classList.toggle('active', i === sel)
    })
  }

  const render = (): void => {
    const items = filtered()
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    list.replaceChildren()
    if (!items.length) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    items.forEach((e, i) => {
      const row = (
        <button class={'pick-row gs-row' + (i === sel ? ' active' : '')}>
          <span class={'gs-badge gs-' + e.source}>{SOURCE_LABEL[e.source]}</span>
          <span class="gs-label">{e.label}</span>
          {e.detail && <span class="gs-detail">{e.detail}</span>}
        </button>
      ) as HTMLButtonElement
      row.addEventListener('click', () => choose(e))
      row.addEventListener('mouseenter', () => {
        sel = i
        highlight()
      })
      list.appendChild(row)
    })
  }

  input.addEventListener('input', () => {
    sel = 0
    render()
  })
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    const items = filtered()
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      sel = Math.min(items.length - 1, sel + 1)
      highlight()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      sel = Math.max(0, sel - 1)
      highlight()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[sel]) choose(items[sel])
    }
  })

  render()
  setTimeout(() => input.focus(), 0)
}
