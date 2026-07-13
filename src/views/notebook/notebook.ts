import type { NbNode } from '@services/notebook/notebook.types'
import { buildNbDiv, buildNbText, buildNbSpan, buildNbButton, buildNbInput } from './notebook-nodes'
import { openNote, openMarkdownFile } from '@views/commands/commands'
import { promptText } from '@views/components/dialog/prompt-text'
import { showFileFinder } from '@views/screens/pickers/finders/finders'
import { settings, state } from '@views/state/spine'
import { persistence } from '@repositories/persistence.service'
import { flattenProjects } from '@views/catalog/catalog'
import { createTreeView, type TreeAdapter, type TreeView, type DropPos } from '@views/components/treeview/treeview'
import { type ContextMenuItem } from '@views/components/context-menu/context-menu'
import { showRemindModal } from '@views/screens/reminders/components/remind-modal'
import { renderDailyCompact } from '@views/screens/daily-plan/daily-plan.entry'
import { renderMeetingNotes } from '@views/screens/meeting-notes/meeting-notes'
import './notebook.css'
import { fsService, notebookService, plansService, shellService } from '@services'
import type { NbSubTab, PlanItem } from './notebook.types'
import {
  FOLDER_SVG,
  NOTE_SVG,
  MD_RE,
  basename,
  parentOf,
  joinPath,
  moveColor,
  filterPlans,
  groupPlansByProject,
  stopAnd
} from './notebook.store'
import { buildSubtabsHeader } from './components/subtabs-header'
import { buildPlanRow } from './components/plan-row'
import { buildLinkedFileRow } from './components/linked-file-row'

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
  const actions = buildNbSpan('nb-actions')
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
  return buildNbButton('notebook-action', text, title, fn)
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

  const subtabs = buildSubtabsHeader(nbSubTab, (key) => {
    nbSubTab = key
    void renderNotebook(host)
  })
  host.appendChild(subtabs)

  const body = buildNbDiv('nb-subtab-body')
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
  const search = buildNbInput({
    cls: 'nb-subtab-search',
    placeholder: 'Search notes…',
    onKeyDown: (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Escape' && nbQuery) {
        search.value = ''
        nbApplyQuery('')
      }
    },
    onInput: () => nbApplyQuery(search.value)
  })
  search.value = nbQuery
  body.appendChild(search)

  linkedHost = buildNbDiv()
  treeHost = buildNbDiv('nb-tree')
  const scroll = buildNbDiv('nb-notes-scroll')
  scroll.append(linkedHost, treeHost)
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

  const listHost = buildNbDiv('nb-plans-list')
  const search = buildNbInput({
    cls: 'nb-subtab-search',
    placeholder: 'Search plans…',
    onKeyDown: (e: KeyboardEvent) => e.stopPropagation(),
    onInput: () => {
      plansQuery = search.value
      renderPlansGroups(listHost)
    }
  })
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
    const empty = buildNbText('nb-plans-empty', plansQuery.trim() ? 'No matching plans' : 'No plans yet')
    host.appendChild(empty)
    return
  }

  for (const [project, plans] of groupPlansByProject(items)) {
    const section = buildNbDiv('nb-plans-group')
    section.append(
      buildNbText('nb-linked-head', `${project} · ${plans.length}`),
      ...plans.map((p) =>
        buildPlanRow(p, {
          onOpen: (path) => openMarkdownFile(path),
          onRemind: (item) =>
            showRemindModal(item.name.replace(MD_RE, ''), `Plan: ${item.name}`, { kind: 'plan', path: item.path }),
          onReveal: (path) => shellService.revealPath(path)
        })
      )
    )
    host.appendChild(section)
  }
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
  const section = buildNbDiv('nb-linked')
  section.appendChild(buildNbText('nb-linked-head', 'Linked files'))
  for (const f of items) {
    section.appendChild(
      buildLinkedFileRow(f, {
        onOpen: (path) => openLinked(path),
        onReveal: (path) => shellService.openPath(path),
        onUnlink: (path) => unlink(path)
      })
    )
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
