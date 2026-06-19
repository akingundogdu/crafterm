import { state, panes } from '../../../state'
import { allTabs, panesInLayout, ancestorFolders } from '../../../tree'
import { paneStatus } from '../../../pane'
import { selectPane, openTerminalRunning, resumeClaudeSession } from '../../../commands'
import { appService, claudeService } from '@services'
import { overlayModal, makeSearchInput } from '../shared'

// ---- Claude sessions dashboard: list all Claude panes, jump to one ----

export function showClaudeDashboard(): void {
  const { overlay, modal, close } = overlayModal('picker-modal')

  const h = (<h2>Claude sessions</h2>) as HTMLHeadingElement
  const search = makeSearchInput('Search sessions…', () => render())
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  modal.append(h, search, list)

  const render = (): void => {
    list.replaceChildren()
    interface Sess {
      paneId: string
      title: string
      group: string
      status: string
      cwd: string | null
      branch: string | null
    }
    const sessions: Sess[] = []
    for (const tab of allTabs(state.tree)) {
      const trail = ancestorFolders(state.tree, tab.id)
      const group = trail && trail.length ? trail.map((f) => f.name).join(' / ') : ''
      for (const pid of panesInLayout(tab.root)) {
        const p = panes.get(pid)
        if (p?.claude) {
          sessions.push({ paneId: pid, title: tab.title, group, status: paneStatus(p), cwd: p.cwd, branch: p.branch })
        }
      }
    }
    if (!sessions.length) {
      const hint = (<div class="empty-hint">No Claude sessions</div>) as HTMLDivElement
      list.appendChild(hint)
      return
    }
    const q = search.value.trim().toLowerCase()
    const shown = q
      ? sessions.filter((s) =>
          `${s.title} ${s.group} ${s.branch ?? ''} ${s.cwd ?? ''}`.toLowerCase().includes(q)
        )
      : sessions
    if (!shown.length) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    shown.forEach((s) => {
      const row = (
        <div class="pick-row claude-row">
          <span class={'status-dot ' + s.status} />
          <div class="claude-main">
            <span class="claude-title">{s.group ? `${s.title}  ·  ${s.group}` : s.title}</span>
            <span class="claude-sub">{[s.branch, s.cwd].filter(Boolean).join(' · ') || s.status}</span>
          </div>
        </div>
      ) as HTMLDivElement
      row.addEventListener('click', () => {
        selectPane(s.paneId)
        done()
      })
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
  const cmds = await appService.zshCommands()
  const accounts = cmds
    .filter((c) => /^claude-switch-/.test(c.name))
    .map((c) => ({ name: c.name, label: c.name.replace(/^claude-switch-/, ''), value: c.value }))
  const { modal, close } = overlayModal('list-modal')

  const h = (<h2>Switch Claude account</h2>) as HTMLHeadingElement
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
    const q = search.value.trim().toLowerCase()
    const items = accounts.filter((a) => !q || `${a.label} ${a.value ?? ''}`.toLowerCase().includes(q))
    list.replaceChildren()
    if (!items.length) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    items.forEach((a) => {
      const row = (
        <button class="pick-row project-row">
          <span class="picker-name">{a.label}</span>
          {a.value && <span class="project-sub">{a.value}</span>}
        </button>
      ) as HTMLButtonElement
      row.addEventListener('click', () => {
        void openTerminalRunning(a.name, `Claude: ${a.label}`)
        close()
      })
      list.appendChild(row)
    })
  }
  renderAcc()
  search.focus()
}

// ---- Resume Claude session: list ~/.claude history, search, open with --resume ----
function relTime(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  const m = s / 60
  if (m < 60) return `${Math.floor(m)}m ago`
  const h = m / 60
  if (h < 24) return `${Math.floor(h)}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export async function showClaudeSessionResume(): Promise<void> {
  const sessions = await claudeService.sessions()
  const { modal, close } = overlayModal('picker-modal picker-modal-wide')

  const h = (<h2>Resume Claude session</h2>) as HTMLHeadingElement
  const input = (
    <input
      class="search-box-input"
      type="text"
      placeholder="Search sessions…  (↑↓ move · ⏎ resume in a new terminal)"
    />
  ) as HTMLInputElement
  input.spellcheck = false
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  modal.append(h, input, list)

  const shortCwd = (c: string | null): string =>
    c ? c.replace(/^\/(Users|home)\/[^/]+/, '~') : '(unknown dir)'
  const titleFor = (s: (typeof sessions)[number]): string => {
    const base = s.cwd ? s.cwd.replace(/\/+$/, '').split('/').pop() || 'claude' : 'claude'
    return `↺ ${base}`
  }

  let sel = 0
  const filtered = (): typeof sessions => {
    const q = input.value.trim().toLowerCase()
    if (!q) return sessions
    return sessions.filter((s) => (s.summary + ' ' + (s.cwd ?? '')).toLowerCase().includes(q))
  }
  const resume = (s: (typeof sessions)[number]): void => {
    void resumeClaudeSession(s.id, s.cwd, titleFor(s))
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
      list.insertAdjacentHTML(
        'beforeend',
        `<div class="empty-hint">${sessions.length ? 'No matches' : 'No Claude sessions found'}</div>`
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
