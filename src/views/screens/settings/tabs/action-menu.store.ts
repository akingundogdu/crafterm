import { Store } from '@geajs/core'
import { actionMenuRepo } from '@repositories'
import type { ActionMenuItem } from '@views/types/types'

// Reactive state for the action-menu admin list. `items` mirrors the repo and is
// read directly in the list view's template(), so gea re-renders it after every
// add / remove / move / hide / edit mutation — the ssh.store pattern (a bare rev
// counter read via `void store.rev` is NOT tracked by the gea compiler, so the
// mutated list must be a real reactive field the template actually reads). Each
// mutation goes through action-menu.state, then callers reassign via `reload()`.
class ActionMenuStore extends Store {
  items: ActionMenuItem[] = []

  reload(): void {
    this.items = [...actionMenuRepo.getAll()]
  }
}

export default new ActionMenuStore()
