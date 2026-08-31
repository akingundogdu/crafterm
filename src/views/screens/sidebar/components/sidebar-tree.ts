import type { SidebarNode, TabNode, WorktreeNode, ProjectNode } from '@views/types/types'
import type { TreeView, TreeSection } from '@views/components/treeview/treeview'
import { UITexts } from '@texts'
import { state, settings, panes } from '@views/state/spine'
import { allTabs, panesInLayout, findById, isContainer } from '@views/tree/tree'
import { toggleCollapse, toggleTabDetails, setNodeGroup } from '@views/commands/commands'
import { isWorktreeContainer, worktreeProjectOf } from '@services/worktrees'
import {
  tabExpandable,
  tabDetail,
  plansForTab,
  claudeStatusOfTab,
  tabTaskBadge,
  folderCrumb,
  isMultiSelected,
  CLAUDE_STATUS_LABEL,
  CLAUDE_STATUS_TITLE,
  makeProcessRowClick,
  makeKillProcess,
  makePaneRowClick,
  makePlanRowClick,
  makeNewWorktreeClick
} from '../sidebar.store'
import { buildAdapter, type AdapterContext } from './tree-adapter'
import { mountTree } from '@views/components/tree/tree'
import type { TreeRow, TreeSectionData, DetailRow, Badge, RowAction, TreeIcon } from '@views/components/tree/tree'

// The bridge from the sidebar's `SidebarNode` model to the modern, data-driven
// `components/tree`. It builds each node's row DATA (icon / badges / detail /
// colour) — mirroring the legacy `slot-builders.ts`, but returning plain data
// instead of `HTMLElement`s — and reuses the existing `tree-adapter` for row
// BEHAVIOUR (select / activate / click / rename / move / colour / menu). The
// returned handle implements the same `TreeView<SidebarNode>` surface the legacy
// tree exposed, so `sidebar.ts` / `search-input` / `keyboard-nav` need no change
// beyond choosing which tree to mount.

function iconOf(n: SidebarNode): TreeIcon {
  if (n.kind === 'project') return 'project'
  if (n.kind === 'worktree') return 'worktree'
  if (n.kind === 'folder') return n.feature ? 'worktree' : 'folder'
  return 'terminal'
}

// Trailing badges: Claude/task status pill, folder child-count, pin dot.
function badgesOf(n: SidebarNode): Badge[] {
  const out: Badge[] = []
  if (n.kind === 'tab') {
    const task = tabTaskBadge(n)
    if (task) {
      out.push({
        kind: 'status',
        text: task,
        tone: task,
        title: task === 'review' ? 'Ticket is in code review' : 'Ticket is in test'
      })
    } else {
      const cs = claudeStatusOfTab(n)
      if (cs) out.push({ kind: 'status', text: CLAUDE_STATUS_LABEL[cs], tone: cs, title: CLAUDE_STATUS_TITLE[cs] })
    }
  }
  if (n.kind === 'folder' || n.kind === 'project') {
    out.push({ kind: 'count', text: String(allTabs([n]).length), title: 'terminals in here' })
  }
  if (n.pinned) out.push({ kind: 'pin', title: UITexts.Sidebar.pinnedTitle })
  return out
}

// Hover actions: a worktrees container's quick "+ new worktree".
function actionsOf(n: SidebarNode): RowAction[] {
  if (!isWorktreeContainer(n)) return []
  const proj = worktreeProjectOf(n)
  if (!proj) return []
  return [{ glyph: '+', title: UITexts.Sidebar.newWorktreeTitle, run: makeNewWorktreeClick(proj) }]
}

// Sub-rows for a worktree/project: its background processes (when expanded).
function processDetail(n: WorktreeNode | ProjectNode): DetailRow[] {
  if (n.collapsed) return []
  const procs = (n.processes ?? []).filter((p) => p.status !== 'archived')
  return procs.map((proc) => ({
    id: 'proc:' + proc.stableId,
    kind: 'process' as const,
    label: proc.title,
    done: proc.status === 'done',
    onClick: makeProcessRowClick(proc.stableId),
    onKill: makeKillProcess(proc.stableId)
  }))
}

// Sub-rows for a terminal tab (when its detail is expanded): info line, panes, plans.
function tabDetailRows(n: TabNode): DetailRow[] {
  if (!n.detailsOpen) return []
  const out: DetailRow[] = []
  const info = tabDetail(n)
  if (info) out.push({ id: 'info:' + n.id, kind: 'text', label: info })

  const paneIds = panesInLayout(n.root)
  if (settings.sidebar.details.paneList && paneIds.length > 1) {
    for (const id of paneIds) {
      out.push({ id: 'pane:' + id, kind: 'pane', label: panes.get(id)?.title || 'terminal', onClick: makePaneRowClick(id) })
    }
  }
  for (const plan of plansForTab(n)) {
    out.push({
      id: 'plan:' + plan.path,
      kind: 'plan',
      label: plan.slug || plan.name.replace(/\.(md|mdx|mdc)$/i, ''),
      title: plan.path,
      onClick: makePlanRowClick(plan.path)
    })
  }
  return out
}

function detailOf(n: SidebarNode): DetailRow[] {
  if (n.kind === 'worktree' || n.kind === 'project') return processDetail(n)
  if (n.kind === 'tab') return tabDetailRows(n)
  return []
}

export interface SidebarTreeContext extends AdapterContext {
  passesArchiveFilter: (n: SidebarNode) => boolean
}

export function createSidebarTree(host: HTMLElement, ctx: SidebarTreeContext): TreeView<SidebarNode> {
  const adapter = buildAdapter(ctx)
  const nodeById = new Map<string, SidebarNode>()
  let lastRaw: TreeSection<SidebarNode>[] = []

  const node = (id: string): SidebarNode | undefined => nodeById.get(id)

  const toRow = (n: SidebarNode): TreeRow => {
    nodeById.set(n.id, n)
    const container = n.kind === 'folder' || n.kind === 'project' || n.kind === 'worktree'
    const children = container ? n.children.filter(ctx.passesArchiveFilter).map(toRow) : undefined
    return {
      id: n.id,
      label: adapter.label(n),
      icon: iconOf(n),
      isContainer: container,
      collapsed: n.kind === 'tab' ? false : n.collapsed,
      children,
      expandable: n.kind === 'tab' ? tabExpandable(n) : false,
      expanded: n.kind === 'tab' ? n.detailsOpen : false,
      active: n.kind === 'tab' && n.id === state.activeTabId,
      multiSelected: n.kind === 'tab' && isMultiSelected(n.id),
      color: n.color ?? null,
      crumb: n.pinned ? folderCrumb(n.id) : null,
      badges: badgesOf(n),
      actions: actionsOf(n),
      detail: detailOf(n),
      draggable: true,
      renamable: true,
      extraClass: n.kind === 'worktree' && n.archiving ? 'crtree-archiving' : undefined
    }
  }

  const toSections = (sections: TreeSection<SidebarNode>[]): TreeSectionData[] => {
    nodeById.clear()
    return sections.map((s, i) => {
      const header = s.header ?? null
      const group = !!header && header.classList.contains('group-header')
      const label = header ? (header.textContent ?? '') : undefined
      return {
        id: 'sec:' + i,
        label,
        group,
        ungrouped: group && label === 'Ungrouped',
        rows: s.nodes.map(toRow)
      }
    })
  }

  const panel = mountTree(host, {
    onSelect: (id) => adapter.onSelect?.(id ? node(id) ?? null : null),
    onActivate: (id) => {
      const n = node(id)
      if (n) adapter.onActivate?.(n)
    },
    onToggle: (id) => {
      const n = node(id)
      if (!n) return
      if (n.kind === 'tab') toggleTabDetails(n.id)
      else toggleCollapse(n.id)
    },
    onClick: (id, e) => {
      const n = node(id)
      return n ? adapter.onClick?.(n, e) : undefined
    },
    onRename: (id, name) => {
      const n = node(id)
      if (n) adapter.onRename?.(n, name)
    },
    onMove: (dragId, targetId, pos) => {
      if (targetId) adapter.onMove?.(dragId, targetId, pos)
    },
    onColor: (id, c) => {
      const n = node(id)
      if (n) adapter.onColor?.(n, c)
    },
    onSetGroup: (dragId, group) => {
      const r = findById(state.tree, dragId)
      if (r && isContainer(r.node)) setNodeGroup(dragId, group)
    },
    menu: (id) => {
      const n = node(id)
      return n ? adapter.menu?.(n) ?? [] : []
    },
    colorOf: (id) => {
      const n = node(id)
      return n ? adapter.color?.(n) ?? null : null
    },
    numbered: false
  })

  const rebuild = (): void => panel.setSections(toSections(lastRaw))

  return {
    get selectedId() {
      return panel.selectedId
    },
    set selectedId(id: string | null) {
      panel.selectedId = id
    },
    render(roots: SidebarNode[]) {
      lastRaw = [{ nodes: roots }]
      rebuild()
    },
    renderSections(sections: TreeSection<SidebarNode>[]) {
      lastRaw = sections
      rebuild()
    },
    setFilter(query: string) {
      panel.setFilter(query)
    },
    handleKey(e: KeyboardEvent) {
      panel.handleKey(e)
    },
    select(id: string | null) {
      panel.select(id)
    },
    selectFirst() {
      panel.selectFirst()
    },
    beginRename(id: string) {
      panel.beginRename(id)
    },
    visibleNodes() {
      return panel
        .visibleIds()
        .map((id) => nodeById.get(id))
        .filter((n): n is SidebarNode => n !== undefined)
    },
    refreshDynamic() {
      rebuild()
    }
  }
}
