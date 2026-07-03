import { overlayModal } from '../shared'
import { UITexts } from '@texts'
import {
  loadAccounts,
  loadResumeSessions,
  filterResumeSessions,
  resumeSession,
  type ResumeSession
} from './claude.state'
import dashboardStore from './claude-dashboard.store'
import accountsStore from './claude-accounts.store'
import resumeStore from './claude-resume.store'
import ClaudeDashboardView from './components/claude-dashboard-view'
import ClaudeAccountsView from './components/claude-accounts-view'
import ClaudeResumeView, { type ClaudeResumeDeps } from './components/claude-resume-view'

// Owns the live Claude sessions dashboard: mounts the gea view, keeps the list in
// sync on a 1s timer while open (via the store), and tears down on Escape / outside
// click. The reactive DOM lives in ClaudeDashboardView reading claude-dashboard.store.
export class ClaudeDashboardController {
  private readonly close: () => void
  private readonly timer: number

  constructor() {
    const { overlay, modal, close } = overlayModal('picker-modal')
    this.close = close
    dashboardStore.reset()
    new ClaudeDashboardView({ done: this.done }).render(modal)

    this.timer = window.setInterval(() => dashboardStore.refresh(), 1000) // live status while open
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) this.done()
    })
    document.addEventListener('keydown', this.onKey, true)
  }

  open(): void {
    dashboardStore.refresh()
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
// and runs the chosen one in a new terminal. New Claude terminals then use it. The
// reactive DOM lives in ClaudeAccountsView reading claude-accounts.store.
export class ClaudeAccountSwitcherController {
  private close!: () => void

  async open(): Promise<void> {
    const accounts = await loadAccounts()
    const { modal, close } = overlayModal('list-modal')
    this.close = close
    accountsStore.setSearch('')
    accountsStore.setAccounts(accounts)
    new ClaudeAccountsView({ close }).render(modal)
    ;(modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
  }
}

// ---- Resume Claude session: list ~/.claude history, search, open with --resume ----
// The reactive DOM lives in ClaudeResumeView reading claude-resume.store; this
// controller owns the async load, the resume/close settle, and the keyboard nav that
// drives the store's selection index.
export class ClaudeSessionResumeController {
  private close!: () => void

  async open(): Promise<void> {
    const sessions = await loadResumeSessions()
    const { modal, close } = overlayModal('picker-modal picker-modal-wide')
    this.close = close
    resumeStore.setSessions(sessions)

    const deps: ClaudeResumeDeps = {
      placeholder: UITexts.Pickers.claude.resumePlaceholder,
      onSelect: (s) => resumeSession(s, this.close),
      onHover: (i) => resumeStore.setSel(i),
      onKeyDown: this.onKey
    }
    new ClaudeResumeView(deps).render(modal)
    ;(modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
  }

  private filtered = (): ResumeSession[] => filterResumeSessions(resumeStore.sessions, resumeStore.search)

  private onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    const items = this.filtered()
    if (e.key === 'Escape') this.close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      resumeStore.setSel(Math.min(items.length - 1, resumeStore.sel + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      resumeStore.setSel(Math.max(0, resumeStore.sel - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const s = items[resumeStore.sel]
      if (s) resumeSession(s, this.close)
    }
  }
}
