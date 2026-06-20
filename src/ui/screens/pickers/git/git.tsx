import { overlayModal, makeSearchInput } from '../shared'
import { UITexts } from '@texts'
import type { Stash } from './git.types'
import {
  loadStashes,
  filterStashes,
  makeStashApplyClick,
  makeStashDropClick,
  loadBranches,
  filterBranches,
  checkoutBranch,
  makeQuickRun,
  disableSpellcheck
} from './git.state'

// ---- Git stash manager: list stashes, apply or drop, for a pane's repo ----

export async function showStashManager(paneId: string): Promise<void> {
  const { modal, close } = overlayModal('picker-modal')

  const h = (<h2>{UITexts.Pickers.git.stashesHeading}</h2>) as HTMLHeadingElement
  const search = makeSearchInput('Search stashes…', () => renderList())
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  modal.append(h, search, list)

  let allStashes: Stash[] = []
  const reload = async (): Promise<void> => {
    allStashes = await loadStashes(paneId)
    renderList()
  }
  const renderList = (): void => {
    const stashes = filterStashes(allStashes, search.value)
    list.replaceChildren()
    if (!stashes.length) {
      list.insertAdjacentHTML(
        'beforeend',
        `<div class="empty-hint">${allStashes.length ? UITexts.Pickers.common.noMatches : UITexts.Pickers.git.noStashes}</div>`
      )
      return
    }
    stashes.forEach((s) => {
      const applyBtn = (
        <button
          class="settings-inline-btn"
          title={UITexts.Pickers.git.restoreTitle}
          onClick={makeStashApplyClick(paneId, s.ref, close)}
        >
          Apply
        </button>
      ) as HTMLButtonElement
      const dropBtn = (
        <button
          class="improve-cancel"
          title={UITexts.Pickers.git.deleteStashTitle}
          onClick={makeStashDropClick(paneId, s.ref, reload)}
        >
          Drop
        </button>
      ) as HTMLButtonElement
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
  const branches = await loadBranches(paneId)
  const { modal, close } = overlayModal('picker-modal')

  const h = (<h2>{UITexts.Pickers.git.branchHeading}</h2>) as HTMLHeadingElement
  modal.append(h)

  // Quick chips: fire common git commands into the pane without leaving the modal.
  const actions = (
    <div class="git-quick-actions">
      <button class="git-quick-chip" type="button" title="git fetch --all --prune" onClick={makeQuickRun(paneId, 'git fetch --all --prune', close)}>
        Fetch
      </button>
      <button class="git-quick-chip" type="button" title="git pull" onClick={makeQuickRun(paneId, 'git pull', close)}>
        Pull
      </button>
      <button class="git-quick-chip" type="button" title="git status" onClick={makeQuickRun(paneId, 'git status', close)}>
        Status
      </button>
    </div>
  ) as HTMLDivElement
  modal.append(actions)

  const sub = (<div class="git-quick-sub">Checkout</div>) as HTMLDivElement
  modal.append(sub)

  const input = (
    <input
      class="search-box-input"
      type="text"
      placeholder={UITexts.Pickers.git.branchPlaceholder}
      ref={disableSpellcheck}
    />
  ) as HTMLInputElement
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  modal.append(input, list)

  if (!branches.length) {
    list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No branches (not a git repo?)</div>')
    return
  }

  let sel = 0
  const filtered = (): string[] => filterBranches(branches, input.value)
  const checkout = (branch: string): void => checkoutBranch(paneId, branch, close)
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
