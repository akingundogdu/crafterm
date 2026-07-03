import { overlayModal } from '../shared'
import stashStore from './stash.store'
import branchStore from './branch.store'
import StashManagerView from './components/stash-manager-view'
import BranchCheckoutView, { type BranchPickerDeps } from './components/branch-checkout-view'
import {
  loadStashes,
  loadBranches,
  filterBranches,
  checkoutBranch,
  makeQuickRun
} from './git.state'

// ---- Git stash manager: list stashes, apply or drop, for a pane's repo ----
// Owns the stash overlay: mounts the gea StashManagerView, loads the stash list into
// the reactive store and reloads it after a drop. The reactive DOM lives in
// StashManagerView / StashList reading stash.store; this controller owns the async
// load + close plumbing and pushes the result into the store.
export class ShowStashManagerController {
  private readonly paneId: string
  private readonly close: () => void

  constructor(paneId: string) {
    this.paneId = paneId
    const { modal, close } = overlayModal('picker-modal')
    this.close = close
    stashStore.reset()
    new StashManagerView({ paneId, close, reload: this.reload }).render(modal)
  }

  async run(): Promise<void> {
    await this.reload()
  }

  private reload = async (): Promise<void> => {
    stashStore.setStashes(await loadStashes(this.paneId))
  }
}

// ---- Branch checkout: search the pane's repo branches, checkout the chosen one ----
// Owns the branch overlay: mounts the gea BranchCheckoutView, loads the branch list
// into the reactive store and drives keyboard navigation via the store's selection
// index. The reactive DOM lives in BranchCheckoutView / BranchList reading
// branch.store; this controller owns the async load, selection index and checkout.
export class ShowBranchCheckoutController {
  private readonly paneId: string
  private close!: () => void

  constructor(paneId: string) {
    this.paneId = paneId
  }

  async run(): Promise<void> {
    const branches = await loadBranches(this.paneId)
    const { modal, close } = overlayModal('picker-modal')
    this.close = close
    branchStore.reset()
    branchStore.setBranches(branches)

    const deps: BranchPickerDeps = {
      onFetch: makeQuickRun(this.paneId, 'git fetch --all --prune', close),
      onPull: makeQuickRun(this.paneId, 'git pull', close),
      onStatus: makeQuickRun(this.paneId, 'git status', close),
      onSelect: this.checkout,
      onHover: (i) => branchStore.setSel(i),
      onKeyDown: this.onKey
    }
    new BranchCheckoutView(deps).render(modal)
    ;(modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
  }

  private filtered = (): string[] => filterBranches(branchStore.branches, branchStore.search)

  private checkout = (branch: string): void => checkoutBranch(this.paneId, branch, this.close)

  private onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    const items = this.filtered()
    if (e.key === 'Escape') this.close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      branchStore.setSel(Math.min(items.length - 1, branchStore.sel + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      branchStore.setSel(Math.max(0, branchStore.sel - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[branchStore.sel]) this.checkout(items[branchStore.sel])
    }
  }
}
