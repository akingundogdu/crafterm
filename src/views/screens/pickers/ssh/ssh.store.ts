import { Store } from '@geajs/core'
import { sshConnectionRepo } from '@repositories'
import type { SshConnection } from '@views/types/types'

// Reactive state for the SSH connections picker. Both `conns` (the saved list,
// mirrored from the repo) and `search` are read directly in the list view's
// template(), so gea re-renders it on every keystroke AND after an add / edit /
// delete mutation — the daily-plan.store pattern (a bare rev counter read via
// `void store.rev` is NOT tracked by the gea compiler, so the mutated list must be
// a real reactive field the template actually reads).
class SshStore extends Store {
  conns: SshConnection[] = []
  search = ''

  reload(): void {
    this.conns = [...sshConnectionRepo.getAll()]
  }

  setSearch(search: string): void {
    this.search = search
  }
}

export default new SshStore()
