import { Component } from '@geajs/core'
import { overlayModal } from '../shared'
import { UITexts } from '@texts'
import type { CollectedProcess } from '@services/bgproc'
import {
  filterProcesses,
  filterDeviceItems,
  makeViewClick,
  makeKillClick,
  makeStopAppClick
} from './processes.store'
import store from './processes.store'
import ProcessRow from './components/process-row'
import DeviceAppRow from './components/device-app-row'

type PickerMode = 'processes' | 'devices'

// One flat entry in the devices list: a group header or one running-app row. The
// grouped view is flattened into a single keyed list so headers and rows stay flat
// siblings inside `.pick-list` (a per-group wrapper would break its flex gap).
type DeviceEntry =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'row'; key: string; item: CollectedProcess }

// Reactive body of the running-processes dashboard: heading, search box and the
// live-filtered process list. Rendered as a JSX child of ProcessesPicker so gea
// tracks its store reads and re-renders it on every keystroke AND after a kill —
// the ssh-picker board pattern. A top-level, imperatively mounted component does
// not re-subscribe on store writes, so all reactive markup lives here. Self-
// contained — no @ui.
class ProcessesList extends Component {
  declare props: { close: () => void }

  private refresh = (): void => store.reloadProcesses()

  template({ close }: this['props']) {
    // Read the reactive store fields (the mirrored list + the search) so this child
    // re-renders on any keystroke AND after a kill reassigns store.procs.
    const items = filterProcesses(store.procs, store.search)

    return (
      <div class="processes-picker">
        <h2>{UITexts.Pickers.processes.heading}</h2>
        <input
          class="search-box-input"
          type="text"
          spellcheck="false"
          placeholder="Search processes…"
          value={store.search}
          onInput={(e: Event) => store.setSearch((e.target as HTMLInputElement).value)}
        />
        <div class="pick-list picker-list">
          {items.map((c) => (
            <ProcessRow
              key={c.proc.stableId}
              item={c}
              onView={makeViewClick(c.proc.stableId, close)}
              onKill={makeKillClick(c.proc.stableId, this.refresh)}
            />
          ))}
          {items.length === 0 && <div class="empty-hint">No background processes</div>}
        </div>
      </div>
    )
  }
}

// Reactive body of the running-devices dashboard: heading, search box and the
// live-filtered, target-grouped app list. Mirrors ProcessesList; the group headers
// and app rows are flattened into one keyed list so they remain flat siblings.
class DevicesList extends Component {
  private refresh = (): void => store.reloadDevices()

  private buildEntries(): DeviceEntry[] {
    const entries: DeviceEntry[] = []
    for (const g of store.groups) {
      const items = filterDeviceItems(g, store.search)
      if (!items.length) continue
      entries.push({ kind: 'header', key: `h:${g.kind}:${g.name}`, label: `${g.name} (${g.kind})` })
      for (const c of items) entries.push({ kind: 'row', key: c.proc.stableId, item: c })
    }
    return entries
  }

  template() {
    // Read the reactive store fields (the mirrored groups + the search) so this
    // child re-renders on any keystroke AND after a stop-app reassigns store.groups.
    const entries = this.buildEntries()

    return (
      <div class="processes-picker">
        <h2>{UITexts.Pickers.processes.devicesHeading}</h2>
        <input
          class="search-box-input"
          type="text"
          spellcheck="false"
          placeholder="Search devices…"
          value={store.search}
          onInput={(e: Event) => store.setSearch((e.target as HTMLInputElement).value)}
        />
        <div class="pick-list picker-list">
          {entries.map((e) =>
            e.kind === 'header' ? (
              <div key={e.key} class="proc-group-header">
                {e.label}
              </div>
            ) : (
              <DeviceAppRow key={e.key} item={e.item} onStop={makeStopAppClick(e.item, this.refresh)} />
            )
          )}
          {entries.length === 0 && <div class="empty-hint">No apps running on a device</div>}
        </div>
      </div>
    )
  }
}

// Thin shell for both process dashboards, mounted imperatively into the shared
// overlay modal. Data (the mode + the modal's close fn) arrives via the constructor
// into plain fields — a gea Component only populates `this.props` when rendered from
// a parent template, not from a manual `new X()`. The reactive markup lives in the
// ProcessesList / DevicesList JSX child selected by mode (fixed per instance, so the
// root stays stable).
export default class ProcessesPicker extends Component {
  private readonly mode: PickerMode
  private readonly closeFn: () => void

  constructor(opts: { mode: PickerMode; close: () => void }) {
    super()
    this.mode = opts.mode
    this.closeFn = opts.close
  }

  template() {
    return this.mode === 'processes' ? <ProcessesList close={this.closeFn} /> : <DevicesList />
  }
}

// ---- Running processes: every tracked background shell, view/kill -------
//
// Surfaces the hidden background processes (iOS build/run, worktree
// create/remove, …) tracked across all worktrees/projects. "View" attaches a
// transient pane to the still-running PTY; "Kill" terminates it for good.
export function showRunningProcessesDashboard(): void {
  store.reloadProcesses()
  store.setSearch('')
  const { modal, close } = overlayModal('picker-modal')
  new ProcessesPicker({ mode: 'processes', close }).render(modal)
  ;(modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
}

// ---- Running devices: Crafterm iOS runs grouped by target, stop the app --
//
// A Crafterm "build & run" is tracked as a background process carrying its run
// target (simulator/device). This groups those by target and lets you terminate
// the running app on a target: iosWorktreeStop terminates the variant on the
// simulator, then killProcess clears the run PTY + row.
export function showRunningDevicesDashboard(): void {
  store.reloadDevices()
  store.setSearch('')
  const { modal, close } = overlayModal('picker-modal')
  new ProcessesPicker({ mode: 'devices', close }).render(modal)
  ;(modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
}
