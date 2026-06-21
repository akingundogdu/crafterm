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

// ---- Claude sessions dashboard: list all Claude panes, jump to one ----

export function showClaudeDashboard(): void {
  const { overlay, modal, close } = overlayModal('picker-modal')

  const h = (<h2>{UITexts.Pickers.claude.sessionsHeading}</h2>) as HTMLHeadingElement
  const search = makeSearchInput('Search sessions…', () => render())
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  modal.append(h, search, list)

  const render = (): void => {
    list.replaceChildren()
    const sessions = collectSessions()
    if (!sessions.length) {
      list.appendChild((<div class="empty-hint">No Claude sessions</div>) as HTMLDivElement)
      return
    }
    const shown = filterSessions(sessions, search.value)
    if (!shown.length) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    shown.forEach((s) => {
      list.appendChild(claudeSessionRow(s, makeSessionRowClick(s.paneId, done)))
    })
  }

  const timer = window.setInterval(render, 1000) // live status while open
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') done()
  }
  function done(): void {
    clearInterval(timer)
    document.removeEventListener('keydown', onKey, true)
    close()
  }
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) done()
  })
  document.addEventListener('keydown', onKey, true)
  render()
}

// ---- Switch Claude account: run the user's `claude-switch-*` zsh commands ----
// Discovers any `claude-switch-<name>` alias/function (e.g. `cswap --switch-to N`)
// and runs the chosen one in a new terminal. New Claude terminals then use it.
export async function showClaudeAccountSwitcher(): Promise<void> {
  const accounts = await loadAccounts()
  const { modal, close } = overlayModal('list-modal')

  const h = (<h2>{UITexts.Pickers.claude.switchAccountHeading}</h2>) as HTMLHeadingElement
  modal.appendChild(h)

  if (!accounts.length) {
    const hint = (
      <div class="empty-hint" innerHTML="No <code>claude-switch-*</code> commands found in your zsh config." />
    ) as HTMLDivElement
    modal.appendChild(hint)
    return
  }

  const search = makeSearchInput('Search accounts…', () => renderAcc())
  const list = (<div class="pick-list" />) as HTMLDivElement
  modal.append(search, list)

  const renderAcc = (): void => {
    const items = filterAccounts(accounts, search.value)
    list.replaceChildren()
    if (!items.length) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    items.forEach((a) => {
      list.appendChild(accountRow(a, makeAccountRowClick(a.name, a.label, close)))
    })
  }
  renderAcc()
  search.focus()
}

// ---- Resume Claude session: list ~/.claude history, search, open with --resume ----

export async function showClaudeSessionResume(): Promise<void> {
  const sessions = await loadResumeSessions()
  const { modal, close } = overlayModal('picker-modal picker-modal-wide')

  const h = (<h2>{UITexts.Pickers.claude.resumeHeading}</h2>) as HTMLHeadingElement
  const input = (
    <input
      class="search-box-input"
      type="text"
      placeholder={UITexts.Pickers.claude.resumePlaceholder}
    />
  ) as HTMLInputElement
  input.spellcheck = false
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  modal.append(h, input, list)

  let sel = 0
  const filtered = (): typeof sessions => filterResumeSessions(sessions, input.value)
  const resume = (s: (typeof sessions)[number]): void => resumeSession(s, close)
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
      list.insertAdjacentHTML(
        'beforeend',
        `<div class="empty-hint">${sessions.length ? UITexts.Pickers.common.noMatches : UITexts.Pickers.claude.noSessions}</div>`
      )
      return
    }
    items.slice(0, 400).forEach((s, i) => {
      list.appendChild(
        resumeSessionRow(
          s,
          i === sel,
          () => resume(s),
          () => {
            sel = i
            highlight()
          }
        )
      )
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
      if (items[sel]) resume(items[sel])
    }
  })
  render()
  input.focus()
}
