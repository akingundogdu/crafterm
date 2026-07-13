import { createOverlay } from '@views/components/overlay/overlay'
import type { AccountEntry } from '@views/types/types'
import store from './account-form.store'
import AccountForm from './account-form'

// Opens the gea account/secret add-edit form: a @views overlay backdrop with the
// gea AccountForm body mounted inside. Secret field values never round-trip
// through the draft/JSON — they go to safeStorage via the secrets service on save.
// `onSaved` re-renders the list after upsert. Self-contained — no @ui (§2.7).
export function openAccountForm(
  existing?: AccountEntry,
  defaultKind: 'account' | 'secret' = 'account',
  onSaved: () => void = () => {}
): void {
  const ov = createOverlay({ closeOnBackdrop: true })
  store.open(existing, defaultKind, onSaved, () => ov.close())
  new AccountForm().render(ov.overlay)
  ov.mount()
  // Focus the Label field (the first text input), matching the pilot forms.
  ;(ov.overlay.querySelector('.accounts-form input[type="text"]') as HTMLInputElement | null)?.focus()
}
