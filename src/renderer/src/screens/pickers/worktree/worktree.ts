import { state, panes } from '../../../state'
import {
  openProject,
  openTerminalRunning,
  openTerminalInDir,
  createWorktreeFromPane
} from '../../../commands'
import { gitService } from '../../../services/ipc'
import { overlayModal, makeSearchInput, baseName } from '../shared'

// ---- Worktree dashboard: list the active repo's worktrees, act on them ----

function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

export async function showWorktreeDashboard(): Promise<void> {
  const cwd = state.activePaneId ? panes.get(state.activePaneId)?.cwd ?? undefined : undefined
  const listing = await gitService.listWorktrees(cwd)
  const { modal, close } = overlayModal('picker-modal')

  const h = document.createElement('h2')
  h.textContent = 'Worktrees'
  modal.appendChild(h)

  if (!listing.root) {
    const hint = document.createElement('div')
    hint.className = 'empty-hint'
    hint.textContent = 'Open a terminal inside a git repo first.'
    modal.appendChild(hint)
    return
  }

  const root = document.createElement('div')
  root.className = 'picker-path'
  root.textContent = listing.root
  modal.appendChild(root)

  const addBtn = document.createElement('button')
  addBtn.className = 'settings-inline-btn'
  addBtn.textContent = '+ New worktree'
  addBtn.addEventListener('click', () => {
    close()
    if (state.activePaneId) void createWorktreeFromPane(state.activePaneId)
  })
  modal.appendChild(addBtn)

  const search = makeSearchInput('Search worktrees…', () => renderWt())
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
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
      const row = document.createElement('div')
      row.className = 'pick-row wt-row'
      const main = document.createElement('div')
      main.className = 'claude-main'
      const title = document.createElement('span')
      title.className = 'claude-title'
      title.textContent = baseName(w.path)
      const sub = document.createElement('span')
      sub.className = 'claude-sub'
      sub.textContent = [w.branch, w.path].filter(Boolean).join(' · ')
      main.append(title, sub)

      const claudeBtn = document.createElement('button')
      claudeBtn.className = 'wt-act'
      claudeBtn.textContent = 'Claude'
      claudeBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        void openProject({ name: baseName(w.path), path: w.path, command: 'claude' }, null)
        close()
      })
      const rmBtn = document.createElement('button')
      rmBtn.className = 'wt-act wt-remove'
      rmBtn.textContent = 'Remove'
      rmBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        void openTerminalRunning(
          `git -C ${shq(listing.root as string)} worktree remove ${shq(w.path)}`,
          'worktree remove'
        )
        close()
      })

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
