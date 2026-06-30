import { selectPane } from '@views/commands/commands'
import { promptConfirm } from '@views/components/dialog/confirm'
import { terminalService, gitService } from '@services'
import { UITexts } from '@texts'
import type { Stash } from './git.types'

// Run a git command in the pane's own terminal so its output is visible.
export function runInPane(paneId: string, cmd: string): void {
  selectPane(paneId)
  terminalService.input(paneId, cmd + '\r')
}

export function loadStashes(paneId: string): Promise<Stash[]> {
  return gitService.stashList(paneId)
}

export function filterStashes(all: Stash[], query: string): Stash[] {
  const q = query.trim().toLowerCase()
  return all.filter((s) => !q || `${s.ref} ${s.description}`.toLowerCase().includes(q))
}

// Apply handler: restore the stash into the pane's repo, then close.
export function makeStashApplyClick(paneId: string, ref: string, close: () => void): (e: Event) => void {
  return (e) => {
    e.stopPropagation()
    runInPane(paneId, `git stash apply '${ref}'`)
    close()
  }
}

// Drop handler: confirm, drop the stash, then refresh the list after git runs.
export function makeStashDropClick(paneId: string, ref: string, reload: () => void): (e: Event) => Promise<void> {
  return async (e) => {
    e.stopPropagation()
    const ok = await promptConfirm({
      title: 'Drop stash',
      message: `Drop ${ref}? This cannot be undone.`,
      confirmText: UITexts.Pickers.git.dropConfirm
    })
    if (!ok) return
    runInPane(paneId, `git stash drop '${ref}'`)
    window.setTimeout(() => void reload(), 500) // refresh after git runs
  }
}

export function loadBranches(paneId: string): Promise<string[]> {
  return gitService.branches(paneId)
}

export function filterBranches(branches: string[], query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return branches
  return branches.filter((b) => b.toLowerCase().includes(q))
}

// Checkout the chosen branch in the pane, then close.
export function checkoutBranch(paneId: string, branch: string, close: () => void): void {
  runInPane(paneId, `git checkout '${branch}'`)
  close()
}

// Quick-action chip handler: fire a command into the pane, then close.
export function makeQuickRun(paneId: string, cmd: string, close: () => void): () => void {
  return () => {
    runInPane(paneId, cmd)
    close()
  }
}

export function disableSpellcheck(el: HTMLInputElement): void {
  el.spellcheck = false
}
