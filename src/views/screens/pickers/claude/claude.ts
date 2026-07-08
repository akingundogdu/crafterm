import { overlayModal } from '../shared'
import { UITexts } from '@texts'
import {
  loadAccounts,
  loadResumeSessions,
  filterResumeSessions,
  resumeSession
} from './claude.state'
import dashboardStore from './claude-dashboard.store'
import accountsStore from './claude-accounts.store'
import resumeStore from './claude-resume.store'
import ClaudeDashboardView from './components/claude-dashboard-view'
import ClaudeAccountsView from './components/claude-accounts-view'
import ClaudeResumeView, { type ClaudeResumeDeps } from './components/claude-resume-view'

// ---- Claude sessions dashboard: list all Claude panes, jump to one ----
// Opens the live dashboard overlay, seeds claude-dashboard.store and keeps it in
// sync on a 1s timer while open. The reactive DOM lives in ClaudeDashboardView
// reading the store; this entry owns only the mount, the live refresh timer and the
// teardown (no separate controller). The timer + document keydown listener are torn
// down in `done`, so closing the overlay (Escape / outside click / X) leaks neither.
export function showClaudeDashboard(): void {
  const { overlay, modal, close } = overlayModal('picker-modal')
  dashboardStore.reset()

  let timer = 0
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') done()
  }
  const done = (): void => {
    clearInterval(timer)
    document.removeEventListener('keydown', onKey, true)
    close()
  }

  new ClaudeDashboardView({ done }).render(modal)

  timer = window.setInterval(() => dashboardStore.refresh(), 1000) // live status while open
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) done()
  })
  document.addEventListener('keydown', onKey, true)

  dashboardStore.refresh()
}

// ---- Switch Claude account: run the user's `claude-switch-*` zsh commands ----
// Discovers any `claude-switch-<name>` alias/function (e.g. `cswap --switch-to N`)
// and runs the chosen one in a new terminal. New Claude terminals then use it. The
// reactive DOM lives in ClaudeAccountsView reading claude-accounts.store; this entry
// owns only the async load + close plumbing (no separate controller).
export async function showClaudeAccountSwitcher(): Promise<void> {
  const accounts = await loadAccounts()
  const { modal, close } = overlayModal('list-modal')
  accountsStore.setSearch('')
  accountsStore.setAccounts(accounts)
  new ClaudeAccountsView({ close }).render(modal)
  ;(modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
}

// ---- Resume Claude session: list ~/.claude history, search, open with --resume ----
// Opens the resume overlay, seeds claude-resume.store and drives keyboard navigation
// via the store's selection index. The reactive DOM lives in ClaudeResumeView reading
// the store; this entry owns only the async load, keynav and resume/close settle (no
// separate controller).
export async function showClaudeSessionResume(): Promise<void> {
  const sessions = await loadResumeSessions()
  const { modal, close } = overlayModal('picker-modal picker-modal-wide')
  resumeStore.setSessions(sessions)

  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    const items = filterResumeSessions(resumeStore.sessions, resumeStore.search)
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      resumeStore.setSel(Math.min(items.length - 1, resumeStore.sel + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      resumeStore.setSel(Math.max(0, resumeStore.sel - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const s = items[resumeStore.sel]
      if (s) resumeSession(s, close)
    }
  }

  const deps: ClaudeResumeDeps = {
    placeholder: UITexts.Pickers.claude.resumePlaceholder,
    onSelect: (s) => resumeSession(s, close),
    onHover: (i) => resumeStore.setSel(i),
    onKeyDown: onKey
  }
  new ClaudeResumeView(deps).render(modal)
  ;(modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
}
