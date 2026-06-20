import { overlayModal, makeSearchInput } from '../shared'
import { UITexts } from '@texts'
import {
  PROC_STATUS_LABEL,
  sortedProcesses,
  filterProcesses,
  groupRunningDevices,
  filterDeviceItems,
  makeViewClick,
  makeKillClick,
  makeStopAppClick
} from './processes.state'

// ---- Running processes: every tracked background shell, view/kill -------
//
// Surfaces the hidden background processes (iOS build/run, worktree
// create/remove, …) tracked across all worktrees/projects. "View" attaches a
// transient pane to the still-running PTY; "Kill" terminates it for good.
export function showRunningProcessesDashboard(): void {
  const { modal, close } = overlayModal('picker-modal')

  const search = makeSearchInput('Search processes…', () => render())
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement

  const render = (): void => {
    const items = filterProcesses(sortedProcesses(), search.value)
    list.replaceChildren()
    if (!items.length) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No background processes</div>')
      return
    }
    items.forEach((c) => {
      const row = (
        <div class="pick-row worktree-row">
          <div class="claude-main">
            <span class="claude-title">{c.proc.title}</span>
            <span class="claude-sub">{[c.proc.target?.name, c.proc.cwd].filter(Boolean).join(' · ')}</span>
          </div>
          <span class={'proc-status proc-status-' + c.proc.status}>
            {PROC_STATUS_LABEL[c.proc.status] ?? c.proc.status}
          </span>
          <button class="worktree-action" onClick={makeViewClick(c.proc.stableId, close)}>
            View
          </button>
          <button class="worktree-action worktree-remove" onClick={makeKillClick(c.proc.stableId, render)}>
            Kill
          </button>
        </div>
      ) as HTMLDivElement
      list.appendChild(row)
    })
  }

  modal.appendChild((<h2>{UITexts.Pickers.processes.heading}</h2>) as HTMLHeadingElement)
  modal.append(search, list)
  render()
  search.focus()
}

// ---- Running devices: Crafterm iOS runs grouped by target, stop the app --
//
// A Crafterm "build & run" is tracked as a background process carrying its run
// target (simulator/device). This groups those by target and lets you terminate
// the running app on a target: iosWorktreeStop terminates the variant on the
// simulator, then killProcess clears the run PTY + row.
export function showRunningDevicesDashboard(): void {
  const { modal } = overlayModal('picker-modal')

  const search = makeSearchInput('Search devices…', () => render())
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement

  const render = (): void => {
    const groups = groupRunningDevices()
    list.replaceChildren()
    let shown = 0
    for (const g of groups.values()) {
      const items = filterDeviceItems(g, search.value)
      if (!items.length) continue
      shown += items.length

      list.appendChild((<div class="proc-group-header">{`${g.name} (${g.kind})`}</div>) as HTMLDivElement)

      items.forEach((c) => {
        const row = (
          <div class="pick-row worktree-row">
            <div class="claude-main">
              <span class="claude-title">{c.proc.title}</span>
              <span class="claude-sub">{c.proc.cwd}</span>
            </div>
            <button class="worktree-action worktree-remove" onClick={makeStopAppClick(c, render)}>
              Stop app
            </button>
          </div>
        ) as HTMLDivElement
        list.appendChild(row)
      })
    }
    if (!shown) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No apps running on a device</div>')
    }
  }

  modal.appendChild((<h2>{UITexts.Pickers.processes.devicesHeading}</h2>) as HTMLHeadingElement)
  modal.append(search, list)
  render()
  search.focus()
}
