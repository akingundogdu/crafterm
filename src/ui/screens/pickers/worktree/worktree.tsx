import { state, panes } from '@ui/state/state'
import { UITexts } from '@texts'
import { gitService } from '@services'
import { overlayModal, makeSearchInput, baseName } from '../shared'
import {
  worktreeMatches,
  makeAddWorktree,
  makeOpenClaude,
  makeRemoveWorktree,
  makeOpenDir
} from './worktree.state'

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
      const row = (
        <div class="pick-row wt-row">
          <div class="claude-main">
            <span class="claude-title">{baseName(w.path)}</span>
            <span class="claude-sub">{[w.branch, w.path].filter(Boolean).join(' · ')}</span>
          </div>
          <button class="wt-act" onClick={makeOpenClaude(w.path, close)}>
            Claude
          </button>
          <button class="wt-act wt-remove" onClick={makeRemoveWorktree(root, w.path, close)}>
            Remove
          </button>
        </div>
      ) as HTMLDivElement
      row.addEventListener('click', makeOpenDir(w.path, close))
      list.appendChild(row)
    })
  }
  renderWt()
  search.focus()
}
