import { createOverlay } from '@views/components/overlay/overlay'
import type { DbConnNode, DbConnection } from '@views/types/types'
import store from './connection-form.store'
import ConnectionForm from './connection-form'

export interface ConnectionFormOptions {
  existing?: DbConnNode
  onSave: (conn: DbConnection) => void
}

// Opens the gea connection add/edit form: a @views overlay backdrop with the gea
// ConnectionForm body mounted inside. The onSave callback (supplied by database.ts)
// receives a fresh plain DbConnection and owns persistence + tree mutation.
// Self-contained — no @ui (§2.7).
export function openConnectionForm(opts: ConnectionFormOptions): void {
  const ov = createOverlay()
  store.open(opts.existing, opts.onSave, () => ov.close())
  new ConnectionForm().render(ov.overlay)
  ov.mount()
  // Focus the Name field (the first `.reminder-input`), matching the legacy form.
  ;(ov.overlay.querySelector('.db-conn-modal input.reminder-input') as HTMLInputElement | null)?.focus()
}
