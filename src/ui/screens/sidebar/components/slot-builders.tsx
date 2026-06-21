import type { SidebarNode, WorktreeNode, ProjectNode } from '@ui/types/types'
import { UITexts } from '@texts'
import { panes, settings } from '@ui/state/state'
import { allTabs, panesInLayout } from '@ui/tree/tree'
import { iosWorktreeTrailing } from '../../ios-worktree/ios-worktree'
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
} from '../sidebar.state'

function pinBadge(): HTMLElement {
  return (
    <span class="pin-badge" title={UITexts.Sidebar.pinnedTitle}>
      ●
    </span>
  ) as HTMLSpanElement
}

// leading slot: a terminal's detail chevron (if expandable).
export function buildLeading(node: SidebarNode): HTMLElement | null {
  if (node.kind !== 'tab') return null
  if (!tabExpandable(node)) return null
  const tri = (
    <span
      class={'treeview-chevron' + (node.detailsOpen ? ' expanded' : '')}
      innerHTML={CHEVRON_SVG}
      title={node.detailsOpen ? UITexts.Sidebar.hideDetails : UITexts.Sidebar.showDetails}
      onClick={makeToggleDetails(node)}
    />
  ) as HTMLSpanElement
  return (<span class="tab-leading">{tri}</span>) as HTMLSpanElement
}

// below slot: background-process sub-rows under a worktree (the "hidden shells").
function buildWorktreeProcesses(wt: WorktreeNode | ProjectNode): HTMLElement | null {
  // Respect the node's collapse state — like plan rows, hide the process
  // sub-rows when the node is collapsed.
  if (wt.collapsed) return null
  const procs = (wt.processes ?? []).filter((p) => p.status !== 'archived')
  if (!procs.length) return null
  const rows = procs.map(
    (proc) =>
      (
        <div class="tab-pane-row" onClick={makeProcessRowClick(proc.stableId)}>
          <span class="tab-pane-title">{(proc.status === 'done' ? '✓ ' : '') + proc.title}</span>
          <button class="tab-proc-kill" title={UITexts.Sidebar.stopProcess} onClick={makeKillProcess(proc.stableId)}>
            ×
          </button>
        </div>
      ) as HTMLDivElement
  )
  return (
    <div class="tab-below">
      <div class="tab-panes">{rows}</div>
    </div>
  ) as HTMLDivElement
}

export function buildBelow(node: SidebarNode): HTMLElement | null {
  if (node.kind === 'worktree' || node.kind === 'project') return buildWorktreeProcesses(node)
  if (node.kind !== 'tab') return null
  const frag = document.createElement('div')
  frag.className = 'tab-below'
  const detail = tabDetail(node)
  const paneIds = panesInLayout(node.root)
  const showPanes = settings.sidebar.details.paneList && paneIds.length > 1

  if (node.detailsOpen) {
    if (detail) {
      frag.appendChild((<div class="tab-sub">{detail}</div>) as HTMLDivElement)
    }
    if (showPanes) {
      const prows = paneIds.map((id) => {
        const p = panes.get(id)
        return (
          <div class="tab-pane-row" onClick={makePaneRowClick(id)}>
            <span class="tab-pane-title">{p?.title || 'terminal'}</span>
          </div>
        ) as HTMLDivElement
      })
      frag.appendChild((<div class="tab-panes">{prows}</div>) as HTMLDivElement)
    }
  }

  // Plan files for this terminal's branch. Only shown when the user has
  // expanded the tab's detail line, so plans don't sit between rows and get
  // mis-clicked as a terminal.
  if (node.detailsOpen) {
    const plans = plansForTab(node)
    if (plans.length) {
      const prows = plans.map(
        (plan) =>
          (
            <div
              class="tab-plan-row"
              title={plan.path}
              onMouseDown={(e: MouseEvent) => e.stopPropagation()}
              onClick={makePlanRowClick(plan.path)}
            >
              <span class="tab-plan-icon" innerHTML={PLAN_SVG} />
              <span class="tab-plan-title">{plan.slug || plan.name.replace(/\.(md|mdx|mdc)$/i, '')}</span>
            </div>
          ) as HTMLDivElement
      )
      frag.appendChild((<div class="tab-plans">{prows}</div>) as HTMLDivElement)
    }
  }

  return frag.childElementCount ? frag : null
}

// trailing slot: Claude status pill + folder child-count badge + pin badge.
export function buildTrailing(node: SidebarNode): HTMLElement | null {
  const wrap = document.createElement('span')
  // iOS worktree folder → ▶/⋯ build-run actions.
  const iosActions = iosWorktreeTrailing(node)
  if (iosActions) wrap.appendChild(iosActions)
  // Worktrees container → quick "+ new worktree".
  if (isWorktreeContainer(node)) {
    const proj = worktreeProjectOf(node)
    if (proj) {
      wrap.appendChild(
        (
          <button class="ios-wt-act" title={UITexts.Sidebar.newWorktreeTitle} onClick={makeNewWorktreeClick(proj)}>
            +
          </button>
        ) as HTMLButtonElement
      )
    }
  }
  if (node.kind === 'tab') {
    // A code-review/test task overrides the Claude status pill with its badge.
    const taskBadge = tabTaskBadge(node)
    if (taskBadge) {
      wrap.appendChild(
        (
          <span
            class={'claude-status claude-' + taskBadge}
            title={taskBadge === 'review' ? 'Ticket is in code review' : 'Ticket is in test'}
          >
            {taskBadge}
          </span>
        ) as HTMLSpanElement
      )
    } else {
      const cs = claudeStatusOfTab(node)
      if (cs) {
        wrap.appendChild(
          (
            <span class={'claude-status claude-' + cs} title={CLAUDE_STATUS_TITLE[cs]}>
              {CLAUDE_STATUS_LABEL[cs]}
            </span>
          ) as HTMLSpanElement
        )
      }
    }
  }
  if (node.kind === 'folder' || node.kind === 'project') {
    wrap.appendChild((<span class="tab-badge">{String(allTabs([node]).length)}</span>) as HTMLSpanElement)
  }
  if (node.pinned) wrap.appendChild(pinBadge())
  return wrap.childElementCount ? wrap : null
}
