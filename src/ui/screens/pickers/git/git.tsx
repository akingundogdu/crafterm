import { selectPane } from '../../../commands'
import { promptConfirm } from '../../../dialog'
import { terminalService, gitService } from '@services'
import { overlayModal, makeSearchInput } from '../shared'

// ---- Git stash manager: list stashes, apply or drop, for a pane's repo ----

export async function showStashManager(paneId: string): Promise<void> {
  const { modal, close } = overlayModal('picker-modal')

  const h = (<h2>Git stashes</h2>) as HTMLHeadingElement
  const search = makeSearchInput('Search stashes…', () => renderList())
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
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
      const applyBtn = (
        <button class="settings-inline-btn" title="Restore this stash (keeps it in the list)">
          Apply
        </button>
      ) as HTMLButtonElement
      applyBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        runInPane(`git stash apply '${s.ref}'`)
        close()
      })
      const dropBtn = (
        <button class="improve-cancel" title="Delete this stash">
          Drop
        </button>
      ) as HTMLButtonElement
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
      const row = (
        <div class="pick-row stash-row">
          <div class="claude-main">
            <span class="claude-title">{s.description || s.ref}</span>
            <span class="claude-sub">{s.ref}</span>
          </div>
          <div class="stash-actions">
            {applyBtn}
            {dropBtn}
          </div>
        </div>
      ) as HTMLDivElement
      list.appendChild(row)
    })
  }

  void reload()
}

// ---- Branch checkout: search the pane's repo branches, checkout the chosen one ----

export async function showBranchCheckout(paneId: string): Promise<void> {
  const branches = await gitService.branches(paneId)
  const { modal, close } = overlayModal('picker-modal')

  const h = (<h2>Branch</h2>) as HTMLHeadingElement
  modal.append(h)

  // Quick chips: fire common git commands into the pane without leaving the modal.
  const actions = (<div class="git-quick-actions" />) as HTMLDivElement
  const runInPane = (cmd: string): void => {
    selectPane(paneId)
    terminalService.input(paneId, cmd + '\r')
    close()
  }
  const addChip = (label: string, cmd: string, title: string): void => {
    const b = (
      <button class="git-quick-chip" type="button" title={title}>
        {label}
      </button>
    ) as HTMLButtonElement
    b.addEventListener('click', () => runInPane(cmd))
    actions.appendChild(b)
  }
  addChip('Fetch', 'git fetch --all --prune', 'git fetch --all --prune')
  addChip('Pull', 'git pull', 'git pull')
  addChip('Status', 'git status', 'git status')
  modal.append(actions)

  const sub = (<div class="git-quick-sub">Checkout</div>) as HTMLDivElement
  modal.append(sub)

  const input = (
    <input
      class="search-box-input"
      type="text"
      placeholder="Search branches…  (↑↓ move · ⏎ checkout)"
      ref={(el: HTMLInputElement) => {
        el.spellcheck = false
      }}
    />
  ) as HTMLInputElement
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
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
      const row = (
        <div class={'pick-row' + (i === sel ? ' active' : '')}>
          <span class="picker-name">{b}</span>
        </div>
      ) as HTMLDivElement
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
