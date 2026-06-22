import type { DetailModalOptions } from './detail-modal.types'
import { DetailModalController } from './detail-modal.controller'

// Open the rich detail modal. Containers get Inspect/Logs/Terminal (Terminal
// only when running); images/volumes/networks get Inspect only.
export function showDetailModal(opts: DetailModalOptions): void {
  new DetailModalController(opts).open()
}
