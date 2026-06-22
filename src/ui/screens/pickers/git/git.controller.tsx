import { overlayModal, makeSearchInput } from '../shared'
import { UITexts } from '@texts'
import type { Stash } from './git.types'
import { stashRow } from './components/stash-row'
import { gitQuickActionChips } from './components/git-quick-action-chips'
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

export class ShowStashManagerController {
  private readonly paneId: string
  private readonly close: () => void
  private readonly search: HTMLInputElement
  private readonly list: HTMLDivElement
  private allStashes: Stash[] = []

  constructor(paneId: string) {
    this.paneId = paneId
    const { modal, close } = overlayModal('picker-modal')
    this.close = close

    const h = (<h2>{UITexts.Pickers.git.stashesHeading}</h2>) as HTMLHeadingElement
    this.search = makeSearchInput('Search stashes…', () => this.renderList())
    this.list = (<div class="pick-list picker-list" />) as HTMLDivElement
    modal.append(h, this.search, this.list)
  }

  async run(): Promise<void> {
    await this.reload()
  }

  private reload = async (): Promise<void> => {
    this.allStashes = await loadStashes(this.paneId)
    this.renderList()
  }

  private renderList = (): void => {
    const stashes = filterStashes(this.allStashes, this.search.value)
    this.list.replaceChildren()
    if (!stashes.length) {
      this.list.insertAdjacentHTML(
        'beforeend',
        `<div class="empty-hint">${this.allStashes.length ? UITexts.Pickers.common.noMatches : UITexts.Pickers.git.noStashes}</div>`
      )
      return
    }
    stashes.forEach((s) => {
      this.list.appendChild(
        stashRow({
          stash: s,
          onApply: makeStashApplyClick(this.paneId, s.ref, this.close),
          onDrop: makeStashDropClick(this.paneId, s.ref, this.reload)
        })
      )
    })
  }
}

// ---- Branch checkout: search the pane's repo branches, checkout the chosen one ----

export class ShowBranchCheckoutController {
  private readonly paneId: string
  private close!: () => void
  private input!: HTMLInputElement
  private list!: HTMLDivElement
  private branches: string[] = []
  private sel = 0

  constructor(paneId: string) {
    this.paneId = paneId
  }

  async run(): Promise<void> {
    this.branches = await loadBranches(this.paneId)
    const { modal, close } = overlayModal('picker-modal')
    this.close = close

    const h = (<h2>{UITexts.Pickers.git.branchHeading}</h2>) as HTMLHeadingElement
    modal.append(h)

    // Quick chips: fire common git commands into the pane without leaving the modal.
    const actions = gitQuickActionChips({
      onFetch: makeQuickRun(this.paneId, 'git fetch --all --prune', this.close),
      onPull: makeQuickRun(this.paneId, 'git pull', this.close),
      onStatus: makeQuickRun(this.paneId, 'git status', this.close)
    })
    modal.append(actions)

    const sub = (<div class="git-quick-sub">Checkout</div>) as HTMLDivElement
    modal.append(sub)

    this.input = (
      <input
        class="search-box-input"
        type="text"
        placeholder={UITexts.Pickers.git.branchPlaceholder}
        ref={disableSpellcheck}
      />
    ) as HTMLInputElement
    this.list = (<div class="pick-list picker-list" />) as HTMLDivElement
    modal.append(this.input, this.list)

    if (!this.branches.length) {
      this.list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No branches (not a git repo?)</div>')
      return
    }

    this.input.addEventListener('input', () => {
      this.sel = 0
      this.render()
    })
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      const items = this.filtered()
      if (e.key === 'Escape') this.close()
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        this.sel = Math.min(items.length - 1, this.sel + 1)
        this.highlight()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        this.sel = Math.max(0, this.sel - 1)
        this.highlight()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (items[this.sel]) this.checkout(items[this.sel])
      }
    })
    this.render()
    this.input.focus()
  }

  private filtered = (): string[] => filterBranches(this.branches, this.input.value)

  private checkout = (branch: string): void => checkoutBranch(this.paneId, branch, this.close)

  private highlight = (): void => {
    this.list.querySelectorAll<HTMLElement>('.pick-row').forEach((el, i) => {
      el.classList.toggle('active', i === this.sel)
    })
  }

  private render = (): void => {
    const items = this.filtered()
    if (this.sel >= items.length) this.sel = Math.max(0, items.length - 1)
    this.list.replaceChildren()
    if (!items.length) {
      this.list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    items.forEach((b, i) => {
      const row = (
        <div class={'pick-row' + (i === this.sel ? ' active' : '')} onClick={() => this.checkout(b)}>
          <span class="picker-name">{b}</span>
        </div>
      ) as HTMLDivElement
      row.addEventListener('mouseenter', () => {
        this.sel = i
        this.highlight()
      })
      this.list.appendChild(row)
    })
  }
}
