import type { CollectedProcess } from '@services/bgproc'

export interface DeviceGroup {
  name: string
  kind: string
  items: CollectedProcess[]
}
