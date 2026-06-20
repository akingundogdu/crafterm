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
  resumeSession,
  relTime,
  shortCwd
} from './claude.state'

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
      const row = (
        <div class="pick-row claude-row" onClick={makeSessionRowClick(s.paneId, done)}>
          <span class={'status-dot ' + s.status} />
          <div class="claude-main">
            <span class="claude-title">{s.group ? `${s.title}  ·  ${s.group}` : s.title}</span>
            <span class="claude-sub">{[s.branch, s.cwd].filter(Boolean).join(' · ') || s.status}</span>
          </div>
        </div>
      ) as HTMLDivElement
      list.appendChild(row)
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
      const row = (
        <button class="pick-row project-row" onClick={makeAccountRowClick(a.name, a.label, close)}>
          <span class="picker-name">{a.label}</span>
          {a.value && <span class="project-sub">{a.value}</span>}
        </button>
      ) as HTMLButtonElement
      list.appendChild(row)
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
      const row = (
        <div class={'pick-row project-row' + (i === sel ? ' active' : '')}>
          <span class="picker-name">{s.summary || '(no prompt)'}</span>
          <span class="project-sub">{`${shortCwd(s.cwd)} · ${relTime(s.mtimeMs)}`}</span>
        </div>
      ) as HTMLDivElement
      row.addEventListener('click', () => resume(s))
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
      if (items[sel]) resume(items[sel])
    }
  })
  render()
  input.focus()
}
