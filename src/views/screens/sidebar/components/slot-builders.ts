import type { SidebarNode, WorktreeNode, ProjectNode } from '@views/types/types'
import { UITexts } from '@texts'
import { el } from '@views/lib/dom'
import { panes, settings } from '@views/state/spine'
import { allTabs, panesInLayout } from '@views/tree/tree'
import { iosWorktreeTrailing } from '@views/screens/ios-worktree/ios-worktree'
import { isWorktreeContainer, worktreeProjectOf } from '@services/worktrees'
import {
  CHEVRON_SVG,
  PLAN_SVG,
  CLAUDE_STATUS_LABEL,
  CLAUDE_STATUS_TITLE,
  tabDetail,
  tabExpandable,
  plansForTab,
  claudeStatusOfTab,
  tabTaskBadge,
  makeToggleDetails,
  makeProcessRowClick,
  makeKillProcess,
  makePaneRowClick,
  makePlanRowClick,
  makeNewWorktreeClick
} from '../sidebar.store'

function pinBadge(): HTMLElement {
  return el('span', { class: 'pin-badge', title: UITexts.Sidebar.pinnedTitle }, '●')
}

// leading slot: a terminal's detail chevron (if expandable).
export function buildLeading(node: SidebarNode): HTMLElement | null {
  if (node.kind !== 'tab') return null
  if (!tabExpandable(node)) return null
  const tri = el('span', {
    class: 'treeview-chevron' + (node.detailsOpen ? ' expanded' : ''),
    innerHTML: CHEVRON_SVG,
    title: node.detailsOpen ? UITexts.Sidebar.hideDetails : UITexts.Sidebar.showDetails,
    onClick: makeToggleDetails(node)
  })
  return el('span', { class: 'tab-leading' }, tri)
}

// below slot: background-process sub-rows under a worktree (the "hidden shells").
function buildWorktreeProcesses(wt: WorktreeNode | ProjectNode): HTMLElement | null {
  // Respect the node's collapse state — like plan rows, hide the process
  // sub-rows when the node is collapsed.
  if (wt.collapsed) return null
  const procs = (wt.processes ?? []).filter((p) => p.status !== 'archived')
  if (!procs.length) return null
  const rows = procs.map((proc) =>
    el(
      'div',
      { class: 'tab-pane-row', onClick: makeProcessRowClick(proc.stableId) },
      el('span', { class: 'tab-pane-title' }, (proc.status === 'done' ? '✓ ' : '') + proc.title),
      el(
        'button',
        { class: 'tab-proc-kill', title: UITexts.Sidebar.stopProcess, onClick: makeKillProcess(proc.stableId) },
        '×'
      )
    )
  )
  return el('div', { class: 'tab-below' }, el('div', { class: 'tab-panes' }, ...rows))
}

export function buildBelow(node: SidebarNode): HTMLElement | null {
  if (node.kind === 'worktree' || node.kind === 'project') return buildWorktreeProcesses(node)
  if (node.kind !== 'tab') return null
  const detail = tabDetail(node)
  const paneIds = panesInLayout(node.root)
  const showPanes = settings.sidebar.details.paneList && paneIds.length > 1

  const subBlock = node.detailsOpen && detail ? el('div', { class: 'tab-sub' }, detail) : null

  const paneBlock =
    node.detailsOpen && showPanes
      ? el(
          'div',
          { class: 'tab-panes' },
          ...paneIds.map((id) => {
            const p = panes.get(id)
            return el(
              'div',
              { class: 'tab-pane-row', onClick: makePaneRowClick(id) },
              el('span', { class: 'tab-pane-title' }, p?.title || 'terminal')
            )
          })
        )
      : null

  // Plan files for this terminal's branch. Only shown when the user has
  // expanded the tab's detail line, so plans don't sit between rows and get
  // mis-clicked as a terminal.
  const plans = node.detailsOpen ? plansForTab(node) : []
  const planBlock = plans.length
    ? el(
        'div',
        { class: 'tab-plans' },
        ...plans.map((plan) =>
          el(
            'div',
            {
              class: 'tab-plan-row',
              title: plan.path,
              onMouseDown: (e: MouseEvent) => e.stopPropagation(),
              onClick: makePlanRowClick(plan.path)
            },
            el('span', { class: 'tab-plan-icon', innerHTML: PLAN_SVG }),
            el('span', { class: 'tab-plan-title' }, plan.slug || plan.name.replace(/\.(md|mdx|mdc)$/i, ''))
          )
        )
      )
    : null

  const frag = el('div', { class: 'tab-below' }, subBlock, paneBlock, planBlock)
  return frag.childElementCount ? frag : null
}

// trailing slot: Claude status pill + folder child-count badge + pin badge.
export function buildTrailing(node: SidebarNode): HTMLElement | null {
  // iOS worktree folder → ▶/⋯ build-run actions.
  const iosActions = iosWorktreeTrailing(node)

  // Worktrees container → quick "+ new worktree".
  const worktreeProj = isWorktreeContainer(node) ? worktreeProjectOf(node) : null
  const newWorktreeBtn = worktreeProj
    ? el(
        'button',
        { class: 'ios-wt-act', title: UITexts.Sidebar.newWorktreeTitle, onClick: makeNewWorktreeClick(worktreeProj) },
        '+'
      )
    : null

  let statusPill: HTMLElement | null = null
  if (node.kind === 'tab') {
    // A code-review/test task overrides the Claude status pill with its badge.
    const taskBadge = tabTaskBadge(node)
    if (taskBadge) {
      statusPill = el(
        'span',
        {
          class: 'claude-status claude-' + taskBadge,
          title: taskBadge === 'review' ? 'Ticket is in code review' : 'Ticket is in test'
        },
        taskBadge
      )
    } else {
      const cs = claudeStatusOfTab(node)
      if (cs) {
        statusPill = el(
          'span',
          { class: 'claude-status claude-' + cs, title: CLAUDE_STATUS_TITLE[cs] },
          CLAUDE_STATUS_LABEL[cs]
        )
      }
    }
  }

  const childCountBadge =
    node.kind === 'folder' || node.kind === 'project'
      ? el('span', { class: 'tab-badge' }, String(allTabs([node]).length))
      : null

  const wrap = el(
    'span',
    null,
    iosActions,
    newWorktreeBtn,
    statusPill,
    childCountBadge,
    node.pinned ? pinBadge() : null
  )
  return wrap.childElementCount ? wrap : null
}
