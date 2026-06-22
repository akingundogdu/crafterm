import { ShowStashManagerController, ShowBranchCheckoutController } from './git.controller'

// ---- Git stash manager: list stashes, apply or drop, for a pane's repo ----

export async function showStashManager(paneId: string): Promise<void> {
  await new ShowStashManagerController(paneId).run()
}

// ---- Branch checkout: search the pane's repo branches, checkout the chosen one ----

export async function showBranchCheckout(paneId: string): Promise<void> {
  await new ShowBranchCheckoutController(paneId).run()
}
