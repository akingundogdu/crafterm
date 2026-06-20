import type { AccountEntry } from '@ui/types/types'
import { uid } from '@ui/state/state'
import { accountRepo } from '@repositories'
import { secretsService } from '@services'
import type { PendingField } from './account-form.types'

// Working draft committed to the repo only on Save. Clones existing entries so
// edits stay local until then; new entries seed a `value` field for secrets.
export function createAccountDraft(
  existing: AccountEntry | undefined,
  kind: 'account' | 'secret'
): AccountEntry {
  return existing
    ? { ...existing, tags: existing.tags.slice(), fields: existing.fields.map((f) => ({ ...f })) }
    : {
        id: uid('acc'),
        kind,
        label: '',
        tags: [],
        fields: kind === 'secret' ? [{ key: 'value', value: '', secret: true }] : [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
}

export function initialPending(draft: AccountEntry, existing: AccountEntry | undefined): PendingField[] {
  return draft.fields.map((f) => ({ key: f.key, rawValue: '', secret: !!f.secret, existed: !!existing }))
}

// Save handler: normalizes fields, drops stale secret plaintext from the draft,
// persists secret values via safeStorage IPC (skipping untouched ones), upserts,
// then closes + re-renders. No-op if the label is empty.
export function makeSaveAccount(
  draft: AccountEntry,
  pending: PendingField[],
  close: () => void,
  rerender: () => void
): () => Promise<void> {
  return async () => {
    if (!draft.label.trim()) return
    // Sync the secret flag onto the stored field; for secrets, drop any stale
    // plaintext from `value` so we never round-trip it through JSON.
    draft.fields = pending.map((p, i) => ({
      key: p.key.trim() || `field_${i + 1}`,
      secret: p.secret,
      value: p.secret ? undefined : draft.fields[i]?.value ?? ''
    }))
    draft.updatedAt = Date.now()
    // Persist secret values via safeStorage IPC. Skip if no new value typed —
    // keeps the existing stored secret intact.
    for (const p of pending) {
      if (!p.secret) continue
      if (!p.rawValue) continue
      const key = p.key.trim()
      if (!key) continue
      await secretsService.set(draft.id, key, p.rawValue)
    }
    accountRepo.upsert(draft)
    close()
    rerender()
  }
}
