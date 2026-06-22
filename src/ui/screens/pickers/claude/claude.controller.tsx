import { overlayModal, makeSearchInput } from '../shared'
import { UITexts } from '@texts'
import {
  collectSessions,
  filterSessions,
  makeSessionRowClick,
  loadAccounts,
  filterAccounts,
  makeAccountRowClick,
  loadResumeSessions,
  filterResumeSessions,
  resumeSession
} from './claude.state'
import { claudeSessionRow } from './components/claude-session-row'
import { accountRow } from './components/account-row'
import { resumeSessionRow } from './components/resume-session-row'

// Owns the live Claude sessions dashboard: builds the modal, keeps the list in
// sync on a 1s timer while open, and tears down on Escape / outside click.
export class ClaudeDashboardController {
  private readonly close: () => void
  private readonly search: HTMLInputElement
  private readonly list: HTMLDivElement
  private readonly timer: number

  constructor() {
    const { overlay, modal, close } = overlayModal('picker-modal')
    this.close = close

    const h = (<h2>{UITexts.Pickers.claude.sessionsHeading}</h2>) as HTMLHeadingElement
    this.search = makeSearchInput('Search sessions…', () => this.render())
    this.list = (<div class="pick-list picker-list" />) as HTMLDivElement
    modal.append(h, this.search, this.list)

    this.timer = window.setInterval(this.render, 1000) // live status while open
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) this.done()
    })
    document.addEventListener('keydown', this.onKey, true)
  }

  open(): void {
    this.render()
  }

  private render = (): void => {
    this.list.replaceChildren()
    const sessions = collectSessions()
    if (!sessions.length) {
      this.list.appendChild((<div class="empty-hint">No Claude sessions</div>) as HTMLDivElement)
      return
    }
    const shown = filterSessions(sessions, this.search.value)
    if (!shown.length) {
      this.list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    shown.forEach((s) => {
      this.list.appendChild(claudeSessionRow(s, makeSessionRowClick(s.paneId, this.done)))
    })
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.done()
  }

  private done = (): void => {
    clearInterval(this.timer)
    document.removeEventListener('keydown', this.onKey, true)
    this.close()
  }
}

// ---- Switch Claude account: run the user's `claude-switch-*` zsh commands ----
// Discovers any `claude-switch-<name>` alias/function (e.g. `cswap --switch-to N`)
// and runs the chosen one in a new terminal. New Claude terminals then use it.
export class ClaudeAccountSwitcherController {
  private close!: () => void
  private accounts: Awaited<ReturnType<typeof loadAccounts>> = []
  private search!: HTMLInputElement
  private list!: HTMLDivElement

  async open(): Promise<void> {
    this.accounts = await loadAccounts()
    const { modal, close } = overlayModal('list-modal')
    this.close = close

    const h = (<h2>{UITexts.Pickers.claude.switchAccountHeading}</h2>) as HTMLHeadingElement
    modal.appendChild(h)

    if (!this.accounts.length) {
      const hint = (
        <div class="empty-hint" innerHTML="No <code>claude-switch-*</code> commands found in your zsh config." />
      ) as HTMLDivElement
      modal.appendChild(hint)
      return
    }

    this.search = makeSearchInput('Search accounts…', this.render)
    this.list = (<div class="pick-list" />) as HTMLDivElement
    modal.append(this.search, this.list)

    this.render()
    this.search.focus()
  }

  private render = (): void => {
    const items = filterAccounts(this.accounts, this.search.value)
    this.list.replaceChildren()
    if (!items.length) {
      this.list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    items.forEach((a) => {
      this.list.appendChild(accountRow(a, makeAccountRowClick(a.name, a.label, this.close)))
    })
  }
}

// ---- Resume Claude session: list ~/.claude history, search, open with --resume ----

export class ClaudeSessionResumeController {
  private close!: () => void
  private sessions: Awaited<ReturnType<typeof loadResumeSessions>> = []
  private input!: HTMLInputElement
  private list!: HTMLDivElement
  private sel = 0

  async open(): Promise<void> {
    this.sessions = await loadResumeSessions()
    const { modal, close } = overlayModal('picker-modal picker-modal-wide')
    this.close = close

    const h = (<h2>{UITexts.Pickers.claude.resumeHeading}</h2>) as HTMLHeadingElement
    this.input = (
      <input
        class="search-box-input"
        type="text"
        placeholder={UITexts.Pickers.claude.resumePlaceholder}
      />
    ) as HTMLInputElement
    this.input.spellcheck = false
    this.list = (<div class="pick-list picker-list" />) as HTMLDivElement
    modal.append(h, this.input, this.list)

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
        if (items[this.sel]) this.resume(items[this.sel])
      }
    })

    this.render()
    this.input.focus()
  }

  private filtered = (): typeof this.sessions => filterResumeSessions(this.sessions, this.input.value)

  private resume = (s: (typeof this.sessions)[number]): void => resumeSession(s, this.close)

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
      this.list.insertAdjacentHTML(
        'beforeend',
        `<div class="empty-hint">${this.sessions.length ? UITexts.Pickers.common.noMatches : UITexts.Pickers.claude.noSessions}</div>`
      )
      return
    }
    items.slice(0, 400).forEach((s, i) => {
      this.list.appendChild(
        resumeSessionRow(
          s,
          i === this.sel,
          () => this.resume(s),
          () => {
            this.sel = i
            this.highlight()
          }
        )
      )
    })
  }
}
