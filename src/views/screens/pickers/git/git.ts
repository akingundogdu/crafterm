import { overlayModal } from '../shared'
import stashStore from './stash.store'
import branchStore from './branch.store'
import StashManagerView from './components/stash-manager-view'
import BranchCheckoutView, { type BranchPickerDeps } from './components/branch-checkout-view'
import { loadStashes, loadBranches, filterBranches, checkoutBranch, makeQuickRun } from './git.state'

// ---- Git stash manager: list stashes, apply or drop, for a pane's repo ----
// Opens the stash overlay, seeds the reactive stash.store and reloads it after a
// drop. The reactive DOM lives in StashManagerView / StashList reading stash.store;
// this entry owns only the async load + close plumbing (no separate controller).
export async function showStashManager(paneId: string): Promise<void> {
  const { modal, close } = overlayModal('picker-modal')
  stashStore.reset()
  const reload = async (): Promise<void> => {
    stashStore.setStashes(await loadStashes(paneId))
  }
  new StashManagerView({ paneId, close, reload }).render(modal)
  await reload()
}

// ---- Branch checkout: search the pane's repo branches, checkout the chosen one ----
// Opens the branch overlay, seeds branch.store and drives keyboard navigation via
// the store's selection index. The reactive DOM lives in BranchCheckoutView /
// BranchList reading branch.store; this entry owns only the async load, keynav and
// checkout (no separate controller).
export async function showBranchCheckout(paneId: string): Promise<void> {
  const branches = await loadBranches(paneId)
  const { modal, close } = overlayModal('picker-modal')
  branchStore.reset()
  branchStore.setBranches(branches)

  const checkout = (branch: string): void => checkoutBranch(paneId, branch, close)

  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    const items = filterBranches(branchStore.branches, branchStore.search)
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      branchStore.setSel(Math.min(items.length - 1, branchStore.sel + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      branchStore.setSel(Math.max(0, branchStore.sel - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[branchStore.sel]) checkout(items[branchStore.sel])
    }
  }

  const deps: BranchPickerDeps = {
    onFetch: makeQuickRun(paneId, 'git fetch --all --prune', close),
    onPull: makeQuickRun(paneId, 'git pull', close),
    onStatus: makeQuickRun(paneId, 'git status', close),
    onSelect: checkout,
    onHover: (i) => branchStore.setSel(i),
    onKeyDown: onKey
  }
  new BranchCheckoutView(deps).render(modal)
  ;(modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
}
