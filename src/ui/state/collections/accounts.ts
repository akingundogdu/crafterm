import type { AccountEntry } from '@ui/types/types'

// Accounts/secrets collection — extracted from `settings` (was settings.accounts).
// Persisted into the single crafterm-state.json; accountRepo operates here. Plain
// array (stable reference, mutated in place) so the repo returns raw objects.
export const accounts: AccountEntry[] = []

export function setAccounts(next: AccountEntry[]): void {
  accounts.length = 0
  accounts.push(...next)
}
