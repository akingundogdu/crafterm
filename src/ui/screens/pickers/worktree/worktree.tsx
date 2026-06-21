import { state, panes } from '@ui/state/state'
import { UITexts } from '@texts'
import { gitService } from '@services'
import { overlayModal, makeSearchInput } from '../shared'
import {
  worktreeMatches,
  makeAddWorktree,
  makeOpenClaude,
  makeRemoveWorktree,
  makeOpenDir
} from './worktree.state'
import { worktreeRow } from './components/worktree-row'

// ---- Worktree dashboard: list the active repo's worktrees, act on them ----

export async function showWorktreeDashboard(): Promise<void> {
  const cwd = state.activePaneId ? panes.get(state.activePaneId)?.cwd ?? undefined : undefined
  const listing = await gitService.listWorktrees(cwd)
  const { modal, close } = overlayModal('picker-modal')

  modal.appendChild(<h2>{UITexts.Pickers.worktree.heading}</h2>)

  if (!listing.root) {
    modal.appendChild(<div class="empty-hint">Open a terminal inside a git repo first.</div>)
    return
  }
  const root = listing.root

  modal.appendChild(<div class="picker-path">{root}</div>)
  modal.appendChild(
    <button class="settings-inline-btn" onClick={makeAddWorktree(close)}>
      + New worktree
    </button>
  )

  const search = makeSearchInput('Search worktrees…', () => renderWt())
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  modal.append(search, list)

  const renderWt = (): void => {
    const items = listing.worktrees.filter((w) => worktreeMatches(w, search.value))
    list.replaceChildren()
    if (!items.length) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    items.forEach((w) => {
      list.appendChild(
        worktreeRow({
          worktree: w,
          onOpenClaude: makeOpenClaude(w.path, close),
          onRemove: makeRemoveWorktree(root, w.path, close),
          onRowClick: makeOpenDir(w.path, close)
        })
      )
    })
  }
  renderWt()
  search.focus()
}
