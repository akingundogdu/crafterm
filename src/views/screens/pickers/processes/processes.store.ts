import { Store } from '@geajs/core'
import type { CollectedProcess } from '@services/bgproc'
import { sortedProcesses, groupRunningDevices } from './processes.state'
import type { DeviceGroup } from './processes.types'

// Reactive state for the running-processes / running-devices dashboards. The flat
// process list (`procs`) and the device groups (`groups`) are mirrored from the
// bgproc collector into REAL reactive fields the views read directly, so gea
// re-renders on every search keystroke AND after a kill / stop-app mutation — the
// ssh.store pattern (a bare rev counter read via `void store.rev` is NOT tracked by
// the gea compiler, so each refresh REASSIGNS the list field the template actually
// reads). These dashboards don't poll; every refresh is driven by a user action, so
// the kill / stop-app handlers re-invoke reload* to reassign the mirrored field.
class ProcessesStore extends Store {
  procs: CollectedProcess[] = []
  groups: DeviceGroup[] = []
  search = ''

  reloadProcesses(): void {
    this.procs = sortedProcesses()
  }

  reloadDevices(): void {
    this.groups = [...groupRunningDevices().values()]
  }

  setSearch(search: string): void {
    this.search = search
  }
}

export default new ProcessesStore()
