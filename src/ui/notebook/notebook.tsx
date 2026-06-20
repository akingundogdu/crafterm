import type { NbNode } from '@services/notebook/notebook.types'
import { openNote, openMarkdownFile } from '@ui/commands/commands'
import { promptText } from '@ui/components/dialog/dialog'
import { showFileFinder } from '../screens/pickers/finders/finders'
import { settings, state } from '@ui/state/state'
import { persistence } from '@repositories/persistence.service'
import { flattenProjects } from '@ui/catalog/catalog'
import { createTreeView, type TreeAdapter, type TreeView, type DropPos } from '@ui/components'
import { type ContextMenuItem } from '@ui/components'
import { showRemindModal } from '../screens/reminders/reminders'
import { renderDailyCompact } from '../screens/daily-plan/daily-plan'
import { renderMeetingNotes } from '../screens/meeting-notes/meeting-notes'
import './notebook.css'
import { fsService, notebookService, plansService, shellService } from '@services'
import type { NbSubTab, PlanItem } from './notebook.types'
import {
  FOLDER_SVG,
  NOTE_SVG,
  LINK_SVG,
  MD_RE,
  basename,
  parentOf,
  joinPath,
  moveColor,
  filterPlans,
  groupPlansByProject,
  stopAnd
} from './notebook.state'

export type { NbSubTab } from './notebook.types'

let container: HTMLElement | null = null
let planItems: PlanItem[] = []
let linkedHost: HTMLElement | null = null
let treeHost: HTMLElement | null = null
let treeview: TreeView<NbNode> | null = null
const expanded = new Set<string>()
let selectedPath: string | null = null
// The currently open note — gets the `.active` highlight, like the open terminal.
let openPath: string | null = null
let nbQuery = ''

// ---- TreeView adapter -------------------------------------------------------

const adapter: TreeAdapter<NbNode> = {
  id: (n) => n.path,
  label: (n) => (n.kind === 'file' ? n.name.replace(MD_RE, '') : n.name),
  icon: (n) => (n.kind === 'dir' ? FOLDER_SVG : NOTE_SVG),
  isContainer: (n) => n.kind === 'dir',
  children: (n) => n.children ?? [],
  collapsed: (n) => !expanded.has(n.path),
  rowClass: (n) => (n.path === openPath ? 'active' : ''),
  color: (n) => settings.notebookColors[n.path] ?? null,
  onColor: (n, c) => {
    if (c) settings.notebookColors[n.path] = c
    else delete settings.notebookColors[n.path]
    persistence.save()
    void refresh()
  },
  renamable: () => true,
  draggable: () => true,
  onToggle: (n) => toggleDir(n.path),
  onActivate: (n) => {
    if (n.kind === 'file') open(n.path)
  },
  onSelect: (n) => {
    selectedPath = n ? n.path : null
  },
  onRename: (n, name) => void doRename(n, name),
  onMove: (dragId, targetId, pos) => void doMove(dragId, targetId, pos),
  menu: (n) => buildMenu(n),
  hoverActions: (n) => buildActions(n)
}

function buildMenu(n: NbNode): ContextMenuItem[] {
  const items: ContextMenuItem[] = []
  if (n.kind === 'dir') {
    items.push({ label: 'New note', run: () => void addNote(n.path) })
    items.push({ label: 'New folder', run: () => void addFolder(n.path) })
  }
  items.push({ label: 'Show in Finder', run: () => notebookService.reveal(n.path) })
  items.push({
    label: 'Remind me…',
    run: () =>
      showRemindModal(
        n.kind === 'file' ? n.name.replace(MD_RE, '') : n.name,
        `Notebook: ${n.kind === 'file' ? n.name.replace(MD_RE, '') : n.name}`,
        { kind: 'notebook', path: n.path }
      )
  })
  items.push({ label: 'Rename', run: () => void renamePath(n.path, n.name) })
  items.push({ label: 'Delete', run: () => void deleteNode(n), danger: true })
  return items
}

function buildActions(n: NbNode): HTMLElement {
  const actions = (<span class="nb-actions" />) as HTMLSpanElement
  if (n.kind === 'dir') {
    actions.append(
      actBtn('＋', 'New note', stopAnd(() => void addNote(n.path))),
      actBtn('🗀', 'New folder', stopAnd(() => void addFolder(n.path)))
    )
  }
  actions.append(
    actBtn('⤴', 'Show in Finder', stopAnd(() => notebookService.reveal(n.path))),
    actBtn('✎', 'Rename', stopAnd(() => void renamePath(n.path, n.name))),
    actBtn('✕', 'Delete', stopAnd(() => void deleteNode(n)))
  )
  return actions
}

function actBtn(text: string, title: string, fn: (e: Event) => void): HTMLButtonElement {
  return (
    <button class="nb-act" title={title} onClick={fn}>
      {text}
    </button>
  ) as HTMLButtonElement
}

// ---- rendering --------------------------------------------------------------

let nbSubTab: NbSubTab = 'notes'
export function notebookSubTab(): NbSubTab {
  return nbSubTab
}

// Hide the notes-only chrome (search box + footer) when the Daily Plan or
// Meeting Notes sub-tab is active.
function applySubTabChrome(): void {
  const app = document.getElementById('app')
  if (!app) return
  app.classList.toggle('nb-sub-notes', nbSubTab === 'notes')
  app.classList.toggle('nb-sub-other', nbSubTab !== 'notes')
}

export async function renderNotebook(host: HTMLElement): Promise<void> {
  container = host
  host.replaceChildren()

  const subtabs = (<div class="nb-subtabs" />) as HTMLDivElement
  const mk = (key: NbSubTab, label: string): void => {
    const b = (
      <button
        class={'nb-subtab' + (nbSubTab === key ? ' active' : '')}
        onClick={() => {
          if (nbSubTab === key) return
          nbSubTab = key
          void renderNotebook(host)
        }}
      >
        {label}
      </button>
    ) as HTMLButtonElement
    subtabs.appendChild(b)
  }
  mk('notes', 'Notes')
  mk('plans', 'Plans')
  mk('daily', 'Daily Plan')
  mk('meeting', 'Meeting Notes')
  host.appendChild(subtabs)

  const body = (<div class="nb-subtab-body" />) as HTMLDivElement
  host.appendChild(body)
  applySubTabChrome()

  if (nbSubTab === 'plans') {
    await renderPlansTab(body)
    return
  }
  if (nbSubTab === 'daily') {
    renderDailyCompact(body)
    return
  }
  if (nbSubTab === 'meeting') {
    renderMeetingNotes(body)
    return
  }

  // Notes: in-page search (same position as the other sub-tabs) + scrollable tree.
  const search = (
    <input
      type="text"
      class="nb-subtab-search"
      placeholder="Search notes…"
      onKeydown={(e: KeyboardEvent) => {
        e.stopPropagation()
        if (e.key === 'Escape' && nbQuery) {
          search.value = ''
          nbApplyQuery('')
        }
      }}
      onInput={() => nbApplyQuery(search.value)}
    />
  ) as HTMLInputElement
  search.value = nbQuery
  body.appendChild(search)

  linkedHost = (<div />) as HTMLDivElement
  treeHost = (<div class="nb-tree" />) as HTMLDivElement
  const scroll = (
    <div class="nb-notes-scroll">
      {linkedHost}
      {treeHost}
    </div>
  ) as HTMLDivElement
  body.appendChild(scroll)
  treeview = createTreeView<NbNode>(treeHost, adapter)
  treeview.setFilter(nbQuery)
  await refresh()
}

async function refresh(): Promise<void> {
  if (!treeview || !linkedHost) return
  const tree = await notebookService.tree()
  renderLinked(linkedHost)
  treeview.render(tree)
  if (openPath) highlightActive()
}

// ---- "Plans" tab: every docs/plans markdown, grouped by project ---------------

// Dedicated in-page search query for the Plans tab (independent of the Notes
// shared search box).
let plansQuery = ''

async function renderPlansTab(host: HTMLElement): Promise<void> {
  host.replaceChildren()
  host.classList.add('nb-plans-tab')

  const listHost = (<div class="nb-plans-list" />) as HTMLDivElement
  const search = (
    <input
      type="text"
      class="nb-subtab-search"
      placeholder="Search plans…"
      onKeydown={(e: KeyboardEvent) => e.stopPropagation()}
      onInput={() => {
        plansQuery = search.value
        renderPlansGroups(listHost)
      }}
    />
  ) as HTMLInputElement
  search.value = plansQuery
  host.appendChild(search)
  host.appendChild(listHost)

  // Scan once per render; the file watcher (onPlansChanged) drives refreshes.
  const paths = flattenProjects(state.tree)
    .map((p) => p.path)
    .filter((p): p is string => !!p && p.trim().length > 0)
  try {
    planItems = await plansService.scan(paths)
  } catch {
    planItems = []
  }

  renderPlansGroups(listHost)
}

// Render the plans grouped by project (newest-first within each group).
function renderPlansGroups(host: HTMLElement): void {
  host.replaceChildren()
  const items = filterPlans(planItems, plansQuery)

  if (!items.length) {
    const empty = (
      <div class="nb-plans-empty">{plansQuery.trim() ? 'No matching plans' : 'No plans yet'}</div>
    ) as HTMLDivElement
    host.appendChild(empty)
    return
  }

  for (const [project, plans] of groupPlansByProject(items)) {
    const section = (
      <div class="nb-plans-group">
        <div class="nb-linked-head">{`${project} · ${plans.length}`}</div>
        {plans.map((p) => renderPlanRow(p))}
      </div>
    ) as HTMLDivElement
    host.appendChild(section)
  }
}

function renderPlanRow(p: PlanItem): HTMLElement {
  const actions = (<span class="nb-actions" />) as HTMLSpanElement
  actions.append(
    actBtn(
      '⏰',
      'Remind me',
      stopAnd(() => showRemindModal(p.name.replace(MD_RE, ''), `Plan: ${p.name}`, { kind: 'plan', path: p.path }))
    ),
    actBtn('⤴', 'Show in Finder', stopAnd(() => shellService.revealPath(p.path)))
  )
  const row = (
    <div class="tab-item nb-linked-row" title={p.path} onClick={() => openMarkdownFile(p.path)}>
      <div class="tab-row">
        <span class="folder-icon" innerHTML={NOTE_SVG} />
        <span class="tab-title">{p.name.replace(MD_RE, '')}</span>
        {actions}
      </div>
    </div>
  ) as HTMLDivElement
  return row
}

// ---- search (driven by the shared sidebar search bar) -----------------------

export function nbApplyQuery(q: string): void {
  nbQuery = q
  if (nbSubTab !== 'notes') return // shared search box only applies to the Notes tree
  treeview?.setFilter(q)
  if (linkedHost) renderLinked(linkedHost)
}
export function nbClearQuery(): void {
  nbQuery = ''
}
export function notebookSelectFirst(): void {
  treeview?.selectFirst()
}

// ---- "Linked files" section (external files outside the notebook folder) -----

function openLinked(path: string): void {
  if (MD_RE.test(path)) openMarkdownFile(path)
  else shellService.openPath(path)
}

function unlink(path: string): void {
  settings.linkedFiles = settings.linkedFiles.filter((f) => f.path !== path)
  persistence.save()
  void refresh()
}

function renderLinked(host: HTMLElement): void {
  host.replaceChildren()
  const q = nbQuery.trim().toLowerCase()
  const items = q
    ? settings.linkedFiles.filter((f) => f.name.toLowerCase().includes(q))
    : settings.linkedFiles
  if (!items.length) return
  const section = (
    <div class="nb-linked">
      <div class="nb-linked-head">Linked files</div>
    </div>
  ) as HTMLDivElement
  for (const f of items) {
    const actions = (<span class="nb-actions" />) as HTMLSpanElement
    actions.append(
      actBtn(
        '⤴',
        'Show in Finder',
        stopAnd(() => shellService.openPath(f.path.slice(0, f.path.lastIndexOf('/')) || f.path))
      ),
      actBtn('✕', 'Unlink', stopAnd(() => unlink(f.path)))
    )
    const row = (
      <div class="tab-item nb-linked-row" title={f.path} onClick={() => openLinked(f.path)}>
        <div class="tab-row">
          <span class="folder-icon" innerHTML={LINK_SVG} />
          <span class="tab-title">{MD_RE.test(f.name) ? f.name.replace(MD_RE, '') : f.name}</span>
          {actions}
        </div>
      </div>
    ) as HTMLDivElement
    section.appendChild(row)
  }
  host.appendChild(section)
}

// Cmd+O in Notebook: search files under the configured folders and link the
// chosen one into the tree (so out-of-project files can be opened from here).
export function notebookLinkFile(): void {
  void showFileFinder({
    title: 'Link file to notebook',
    onPick: (path, name) => {
      if (!settings.linkedFiles.some((f) => f.path === path)) {
        settings.linkedFiles.push({ path, name })
        persistence.save()
        void refresh()
      }
    }
  })
}

// ---- node operations --------------------------------------------------------

function toggleDir(path: string): void {
  if (expanded.has(path)) expanded.delete(path)
  else expanded.add(path)
  void refresh()
}

function open(path: string): void {
  openPath = path
  selectedPath = path
  treeview?.select(path)
  highlightActive()
  openNote(path)
}

function highlightActive(): void {
  treeHost?.querySelectorAll<HTMLElement>('.tab-item[data-tree-id]').forEach((el) => {
    el.classList.toggle('active', el.dataset.treeId === openPath)
  })
}

async function doMove(src: string, targetId: string, pos: DropPos): Promise<void> {
  const destDir = pos === 'inside' ? targetId : parentOf(targetId)
  if (destDir === parentOf(src) && pos !== 'inside') return // same folder, no-op
  const ok = await notebookService.move(src, destDir)
  if (!ok) return
  const newPath = joinPath(destDir, basename(src))
  moveColor(src, newPath)
  persistence.save()
  if (destDir) expanded.add(destDir)
  await refresh()
}

async function doRename(node: NbNode, rawName: string): Promise<void> {
  // Keep the file extension the label hides (the label is shown without it).
  let name = rawName
  if (node.kind === 'file' && !MD_RE.test(name)) {
    const ext = node.name.match(MD_RE)?.[0] ?? '.md'
    name = name + ext
  }
  const ok = await notebookService.rename(node.path, name)
  if (!ok) return
  const newPath = joinPath(parentOf(node.path), name)
  moveColor(node.path, newPath)
  if (openPath === node.path) openPath = newPath
  persistence.save()
  await refresh()
}

async function renamePath(path: string, current: string): Promise<void> {
  const name = await promptText({ title: 'Rename', label: 'Name', value: current, confirmText: 'Rename' })
  if (!name || name === current) return
  const ok = await notebookService.rename(path, name)
  if (!ok) return
  const newPath = joinPath(parentOf(path), name)
  moveColor(path, newPath)
  if (openPath === path) openPath = newPath
  persistence.save()
  await refresh()
}

async function deleteNode(node: NbNode): Promise<void> {
  await notebookService.delete(node.path)
  delete settings.notebookColors[node.path]
  persistence.save()
  await refresh()
}

// ---- keyboard + create shortcuts (delegated from the sidebar) ---------------

export function handleNotebookKey(e: KeyboardEvent): void {
  treeview?.handleKey(e)
}

function contextDir(): string {
  if (!selectedPath) return ''
  const nodes = treeview?.visibleNodes() ?? []
  const cur = nodes.find((n) => n.path === selectedPath)
  if (!cur) return ''
  return cur.kind === 'dir' ? cur.path : parentOf(cur.path)
}
export function notebookNewNote(): void {
  void addNote(contextDir())
}
export function notebookNewFolder(): void {
  void addFolder(contextDir())
}

export function notebookRenameSelected(): void {
  if (!selectedPath) return
  void renamePath(selectedPath, basename(selectedPath))
}

async function addFolder(parent: string): Promise<void> {
  const name = await promptText({ title: 'New folder', label: 'Name', confirmText: 'Create' })
  if (!name) return
  await notebookService.mkdir(joinPath(parent, name))
  if (parent) expanded.add(parent)
  await refresh()
}

async function addNote(parent: string): Promise<void> {
  const name = await promptText({ title: 'New note', label: 'Name', placeholder: 'note', confirmText: 'Create' })
  if (!name) return
  const rel = joinPath(parent, name)
  await notebookService.create(rel)
  if (parent) expanded.add(parent)
  const notePath = MD_RE.test(rel) ? rel : rel + '.md'
  openPath = notePath
  selectedPath = notePath
  await refresh()
  openNote(notePath)
}
