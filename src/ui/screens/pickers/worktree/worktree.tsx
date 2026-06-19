import { state, panes } from '../../../state'
import {
  openProject,
  openTerminalRunning,
  openTerminalInDir,
  createWorktreeFromPane
} from '../../../commands'
import { gitService } from '@services'
import { overlayModal, makeSearchInput, baseName } from '../shared'

// ---- Worktree dashboard: list the active repo's worktrees, act on them ----

function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

export async function showWorktreeDashboard(): Promise<void> {
  const cwd = state.activePaneId ? panes.get(state.activePaneId)?.cwd ?? undefined : undefined
  const listing = await gitService.listWorktrees(cwd)
  const { modal, close } = overlayModal('picker-modal')

  const h = (<h2>Worktrees</h2>) as HTMLHeadingElement
  modal.appendChild(h)

  if (!listing.root) {
    const hint = (<div class="empty-hint">Open a terminal inside a git repo first.</div>) as HTMLDivElement
    modal.appendChild(hint)
    return
  }

  const root = (<div class="picker-path">{listing.root}</div>) as HTMLDivElement
  modal.appendChild(root)

  const addBtn = (
    <button
      class="settings-inline-btn"
      onClick={() => {
        close()
        if (state.activePaneId) void createWorktreeFromPane(state.activePaneId)
      }}
    >
      + New worktree
    </button>
  ) as HTMLButtonElement
  modal.appendChild(addBtn)

  const search = makeSearchInput('Search worktrees…', () => renderWt())
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  modal.append(search, list)

  const renderWt = (): void => {
    const q = search.value.trim().toLowerCase()
    const items = listing.worktrees.filter(
      (w) => !q || `${baseName(w.path)} ${w.branch ?? ''} ${w.path}`.toLowerCase().includes(q)
    )
    list.replaceChildren()
    if (!items.length) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    items.forEach((w) => {
      const main = (
        <div class="claude-main">
          <span class="claude-title">{baseName(w.path)}</span>
          <span class="claude-sub">{[w.branch, w.path].filter(Boolean).join(' · ')}</span>
        </div>
      ) as HTMLDivElement

      const claudeBtn = (
        <button
          class="wt-act"
          onClick={(e: MouseEvent) => {
            e.stopPropagation()
            void openProject({ name: baseName(w.path), path: w.path, command: 'claude' }, null)
            close()
          }}
        >
          Claude
        </button>
      ) as HTMLButtonElement
      const rmBtn = (
        <button
          class="wt-act wt-remove"
          onClick={(e: MouseEvent) => {
            e.stopPropagation()
            void openTerminalRunning(
              `git -C ${shq(listing.root as string)} worktree remove ${shq(w.path)}`,
              'worktree remove'
            )
            close()
          }}
        >
          Remove
        </button>
      ) as HTMLButtonElement

      const row = (<div class="pick-row wt-row" />) as HTMLDivElement
      row.append(main, claudeBtn, rmBtn)
      row.addEventListener('click', () => {
        void openTerminalInDir(w.path)
        close()
      })
      list.appendChild(row)
    })
  }
  renderWt()
  search.focus()
}
