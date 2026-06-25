import { Store } from '@geajs/core'
import type { AccountEntry } from '@ui/types/types'
import { accountRepo } from '@repositories'
import { secretsService } from '@services'

type KindFilter = 'all' | 'account' | 'secret'

// Reactive state for the gea Accounts sidebar mode. accountRepo + secretsService
// stay the source of truth; this store mirrors the ledger into a reactive array.
class AccountsStore extends Store {
  items: AccountEntry[] = []
  kindFilter: KindFilter = 'all'
  query = ''

  reload(): void {
    this.items = [...accountRepo.getAll()]
  }

  // NOTE: no `.sort()` here. Calling a gea-intercepted array mutation method
  // (sort) inside a reactive getter breaks its dependency tracking on `this.items`
  // (the list then fails to re-render on add/remove). The view sorts a plain copy.
  get filtered(): AccountEntry[] {
    const q = this.query.trim().toLowerCase()
    return this.items
      .filter((a) => this.kindFilter === 'all' || a.kind === this.kindFilter)
      .filter((a) => {
        if (!q) return true
        const hay = [a.label, a.service, a.login, a.url, a.notes, a.tags.join(' '), ...(a.fields ?? []).map((f) => f.key)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
  }

  setKind(k: KindFilter): void {
    this.kindFilter = k
  }

  setQuery(q: string): void {
    this.query = q
  }

  remove(id: string): void {
    // Repo removal + reload update the list immediately; the secret-store cleanup
    // is fire-and-forget so the UI doesn't wait on the IPC round-trip.
    accountRepo.remove(id)
    void secretsService.delete(id)
    this.reload()
  }
}

export default new AccountsStore()
