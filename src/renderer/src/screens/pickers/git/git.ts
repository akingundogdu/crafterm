import { selectPane } from '../../../commands'
import { promptConfirm } from '../../../dialog'
import { terminalService, gitService } from '../../../services/ipc'
import { overlayModal, makeSearchInput } from '../shared'

// ---- Git stash manager: list stashes, apply or drop, for a pane's repo ----

export async function showStashManager(paneId: string): Promise<void> {
  const { modal, close } = overlayModal('picker-modal')

  const h = document.createElement('h2')
  h.textContent = 'Git stashes'
  const search = makeSearchInput('Search stashes…', () => renderList())
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(h, search, list)

  // Run a git command in the pane's own terminal so its output is visible.
  const runInPane = (cmd: string): void => {
    selectPane(paneId)
    terminalService.input(paneId, cmd + '\r')
  }

  let allStashes: { ref: string; description: string }[] = []
  const reload = async (): Promise<void> => {
    allStashes = await gitService.stashList(paneId)
    renderList()
  }
  const renderList = (): void => {
    const q = search.value.trim().toLowerCase()
    const stashes = allStashes.filter((s) => !q || `${s.ref} ${s.description}`.toLowerCase().includes(q))
    list.replaceChildren()
    if (!stashes.length) {
      list.insertAdjacentHTML(
        'beforeend',
        `<div class="empty-hint">${allStashes.length ? 'No matches' : 'No stashes'}</div>`
      )
      return
    }
    stashes.forEach((s) => {
      const row = document.createElement('div')
      row.className = 'pick-row stash-row'
      const main = document.createElement('div')
      main.className = 'claude-main'
      const title = document.createElement('span')
      title.className = 'claude-title'
      title.textContent = s.description || s.ref
      const sub = document.createElement('span')
      sub.className = 'claude-sub'
      sub.textContent = s.ref
      main.append(title, sub)
      const actions = document.createElement('div')
      actions.className = 'stash-actions'
      const applyBtn = document.createElement('button')
      applyBtn.className = 'settings-inline-btn'
      applyBtn.textContent = 'Apply'
      applyBtn.title = 'Restore this stash (keeps it in the list)'
      applyBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        runInPane(`git stash apply '${s.ref}'`)
        close()
      })
      const dropBtn = document.createElement('button')
      dropBtn.className = 'improve-cancel'
      dropBtn.textContent = 'Drop'
      dropBtn.title = 'Delete this stash'
      dropBtn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const ok = await promptConfirm({
          title: 'Drop stash',
          message: `Drop ${s.ref}? This cannot be undone.`,
          confirmText: 'Drop'
        })
        if (!ok) return
        runInPane(`git stash drop '${s.ref}'`)
        window.setTimeout(() => void reload(), 500) // refresh after git runs
      })
      actions.append(applyBtn, dropBtn)
      row.append(main, actions)
      list.appendChild(row)
    })
  }

  void reload()
}

// ---- Branch checkout: search the pane's repo branches, checkout the chosen one ----

export async function showBranchCheckout(paneId: string): Promise<void> {
  const branches = await gitService.branches(paneId)
  const { modal, close } = overlayModal('picker-modal')

  const h = document.createElement('h2')
  h.textContent = 'Branch'
  modal.append(h)

  // Quick chips: fire common git commands into the pane without leaving the modal.
  const actions = document.createElement('div')
  actions.className = 'git-quick-actions'
  const runInPane = (cmd: string): void => {
    selectPane(paneId)
    terminalService.input(paneId, cmd + '\r')
    close()
  }
  const addChip = (label: string, cmd: string, title: string): void => {
    const b = document.createElement('button')
    b.className = 'git-quick-chip'
    b.type = 'button'
    b.textContent = label
    b.title = title
    b.addEventListener('click', () => runInPane(cmd))
    actions.appendChild(b)
  }
  addChip('Fetch', 'git fetch --all --prune', 'git fetch --all --prune')
  addChip('Pull', 'git pull', 'git pull')
  addChip('Status', 'git status', 'git status')
  modal.append(actions)

  const sub = document.createElement('div')
  sub.className = 'git-quick-sub'
  sub.textContent = 'Checkout'
  modal.append(sub)

  const input = document.createElement('input')
  input.className = 'picker-input'
  input.type = 'text'
  input.placeholder = 'Search branches…  (↑↓ move · ⏎ checkout)'
  input.spellcheck = false
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(input, list)

  if (!branches.length) {
    list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No branches (not a git repo?)</div>')
    return
  }

  let sel = 0
  const filtered = (): string[] => {
    const q = input.value.trim().toLowerCase()
    if (!q) return branches
    return branches.filter((b) => b.toLowerCase().includes(q))
  }
  const checkout = (branch: string): void => {
    selectPane(paneId)
    terminalService.input(paneId, `git checkout '${branch}'\r`)
    close()
  }
  const highlight = (): void => {
    list.querySelectorAll<HTMLElement>('.pick-row').forEach((el, i) => {
      el.classList.toggle('active', i === sel)
    })
  }
  const render = (): void => {
    const items = filtered()
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    list.replaceChildren()
    if (!items.length) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    items.forEach((b, i) => {
      const row = document.createElement('div')
      row.className = 'pick-row' + (i === sel ? ' active' : '')
      const name = document.createElement('span')
      name.className = 'picker-name'
      name.textContent = b
      row.appendChild(name)
      row.addEventListener('click', () => checkout(b))
      row.addEventListener('mouseenter', () => {
        sel = i
        highlight()
      })
      list.appendChild(row)
    })
  }
  input.addEventListener('input', () => {
    sel = 0
    render()
  })
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    const items = filtered()
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      sel = Math.min(items.length - 1, sel + 1)
      highlight()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      sel = Math.max(0, sel - 1)
      highlight()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[sel]) checkout(items[sel])
    }
  })
  render()
  input.focus()
}
