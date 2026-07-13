import { z } from 'zod'

// Account / secret — mirrors `AccountEntry` + `AccountField` in types.ts exactly
// (HR-1). Secret-flagged field values live in Electron safeStorage, NOT in this
// object (resolved at access time via IPC) — modeled the same way here.

export const accountFieldSchema = z.object({
  key: z.string(),
  value: z.string().optional(), // only for non-secret fields
  secret: z.boolean().optional()
})

export const accountEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(['account', 'secret']),
  service: z.string().optional(),
  label: z.string(),
  login: z.string().optional(),
  url: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()),
  fields: z.array(accountFieldSchema),
  createdAt: z.number(),
  updatedAt: z.number()
})

export type AccountField = z.infer<typeof accountFieldSchema>
export type AccountEntry = z.infer<typeof accountEntrySchema>

export function makeAccountEntry(
  p: Partial<AccountEntry> & Pick<AccountEntry, 'kind' | 'label'>
): AccountEntry {
  const now = Date.now()
  return accountEntrySchema.parse({
    id: crypto.randomUUID(),
    tags: [],
    fields: [],
    createdAt: now,
    updatedAt: now,
    ...p
  })
}

// Live collection (the credential ledger). Persisted into the single
// crafterm-state.json; accountRepo operates on this array (stable reference).
export const accounts: AccountEntry[] = []

export function setAccounts(next: AccountEntry[]): void {
  accounts.length = 0
  accounts.push(...next)
}
