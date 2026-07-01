import { Store } from '@geajs/core'
import { uid } from '@views/state/spine'
import { UITexts } from '@texts'
import type { AccountEntry } from '@views/types/types'
import { createAccountDraft, initialPending, makeSaveAccount } from './account-form.state'
import type { FormField, PendingField } from './account-form.types'

// Reactive state + logic for the gea account/secret add-edit form (merges the
// legacy imperative openAccountForm wiring). A singleton reset on each open (the
// improve-crafterm pattern): `open()` seeds the scalar fields + the dynamic
// field list + the close/onSaved callbacks, the component reads the reactive
// fields, and `save()` rebuilds a plain AccountEntry and hands it to the reused
// makeSaveAccount helper (which normalizes fields, persists secrets via
// safeStorage IPC, upserts, then closes + re-renders). Secret plaintext lives in
// `rawValue` and never enters the draft/JSON. Self-contained — no @ui (§2.7).
class AccountFormStore extends Store {
  kind: 'account' | 'secret' = 'account'
  isEdit = false
  label = ''
  service = ''
  login = ''
  url = ''
  tags = ''
  notes = ''
  fields: FormField[] = []

  private id = ''
  private createdAt = 0
  private onSaved: () => void = () => {}
  private closeFn: () => void = () => {}

  open(
    existing: AccountEntry | undefined,
    kind: 'account' | 'secret',
    onSaved: () => void,
    close: () => void
  ): void {
    const k = existing?.kind ?? kind
    const draft = createAccountDraft(existing, k)
    const pending = initialPending(draft, existing)
    this.kind = k
    this.isEdit = !!existing
    this.id = draft.id
    this.createdAt = draft.createdAt
    this.label = draft.label
    this.service = draft.service ?? ''
    this.login = draft.login ?? ''
    this.url = draft.url ?? ''
    this.tags = draft.tags.join(', ')
    this.notes = draft.notes ?? ''
    this.fields = pending.map((p, i) => ({
      id: uid('fld'),
      key: p.key,
      value: draft.fields[i]?.value ?? '',
      rawValue: p.rawValue,
      secret: p.secret,
      existed: p.existed
    }))
    this.onSaved = onSaved
    this.closeFn = close
  }

  get isAccount(): boolean {
    return this.kind === 'account'
  }

  get titleText(): string {
    return this.isEdit ? UITexts.Accounts.form.editTitle(this.kind) : UITexts.Accounts.form.newTitle(this.kind)
  }

  get saveLabel(): string {
    return this.isEdit ? UITexts.Accounts.form.save : UITexts.Accounts.form.add
  }

  close(): void {
    this.closeFn()
  }

  // Key/value typing mutates the row in place (no reactive re-render, so the
  // input keeps focus); structural changes below reassign `fields` to re-render.
  setKey(i: number, v: string): void {
    const f = this.fields[i]
    if (f) f.key = v
  }

  setValue(i: number, v: string): void {
    const f = this.fields[i]
    if (!f) return
    f.rawValue = v
    if (!f.secret) f.value = v
  }

  // Toggling secret clears the raw value (so stale plaintext never persists) and
  // re-renders the row: the value input swaps text <-> password.
  toggleSecret(i: number): void {
    this.fields = this.fields.map((f, idx) => (idx === i ? { ...f, secret: !f.secret, rawValue: '' } : f))
  }

  addField(): void {
    this.fields = [...this.fields, { id: uid('fld'), key: '', value: '', rawValue: '', secret: false, existed: false }]
  }

  removeField(i: number): void {
    this.fields = this.fields.filter((_, idx) => idx !== i)
  }

  save(): void {
    void this.buildAndSave()
  }

  // Reads the reactive fields into fresh plain objects (the proxy is only READ,
  // never assigned to — §5.3), then reuses makeSaveAccount for the normalize +
  // secret-persist + upsert + close + re-render sequence.
  private async buildAndSave(): Promise<void> {
    const draft: AccountEntry = {
      id: this.id,
      kind: this.kind,
      label: this.label,
      service: this.isAccount ? this.service.trim() || undefined : undefined,
      login: this.isAccount ? this.login.trim() || undefined : undefined,
      url: this.isAccount ? this.url.trim() || undefined : undefined,
      notes: this.notes.trim() || undefined,
      tags: this.tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      fields: this.fields.map((f) => ({ key: f.key, value: f.value, secret: f.secret })),
      createdAt: this.createdAt,
      updatedAt: Date.now()
    }
    const pending: PendingField[] = this.fields.map((f) => ({
      key: f.key,
      rawValue: f.rawValue,
      secret: f.secret,
      existed: f.existed
    }))
    await makeSaveAccount(draft, pending, this.closeFn, this.onSaved)()
  }
}

export default new AccountFormStore()
