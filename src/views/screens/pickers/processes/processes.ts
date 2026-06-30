import { el } from '@views/lib/dom'
import { overlayModal, makeSearchInput } from '../shared'
import { UITexts } from '@texts'
import { processRow } from './components/process-row'
import { deviceAppRow } from './components/device-app-row'
import {
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
  const list = el('div', { class: 'pick-list picker-list' })

  const render = (): void => {
    const items = filterProcesses(sortedProcesses(), search.value)
    list.replaceChildren()
    if (!items.length) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No background processes</div>')
      return
    }
    items.forEach((c) => {
      list.appendChild(
        processRow({
          item: c,
          onView: makeViewClick(c.proc.stableId, close),
          onKill: makeKillClick(c.proc.stableId, render)
        })
      )
    })
  }

  modal.appendChild(el('h2', null, UITexts.Pickers.processes.heading))
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
  const list = el('div', { class: 'pick-list picker-list' })

  const render = (): void => {
    const groups = groupRunningDevices()
    list.replaceChildren()
    let shown = 0
    for (const g of groups.values()) {
      const items = filterDeviceItems(g, search.value)
      if (!items.length) continue
      shown += items.length

      list.appendChild(el('div', { class: 'proc-group-header' }, `${g.name} (${g.kind})`))

      items.forEach((c) => {
        list.appendChild(deviceAppRow({ item: c, onStop: makeStopAppClick(c, render) }))
      })
    }
    if (!shown) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No apps running on a device</div>')
    }
  }

  modal.appendChild(el('h2', null, UITexts.Pickers.processes.devicesHeading))
  modal.append(search, list)
  render()
  search.focus()
}
