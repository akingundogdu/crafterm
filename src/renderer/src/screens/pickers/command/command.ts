import { commandHistory, panes, state } from '../../../state'
import { selectPane } from '../../../commands'
import { allTabs, panesInLayout, ancestorFolders } from '../../../tree'
import { paneStatus } from '../../../pane'
import { terminalService, appService } from '../../../services/ipc'
import { paletteCommandRepo } from '../../../services/storage/repositories'
import { overlayModal } from '../shared'

// ---- Command palette: zsh + user categories (predefined / cheatsheets) ----

// zsh alias/function lookup spawns an interactive shell (~seconds), so cache it
// for the session — the first open pays the cost, the rest are instant.
let zshCmdCache: { name: string; value: string }[] | null = null
export async function loadZshCommands(): Promise<{ name: string; value: string }[]> {
  if (!zshCmdCache) zshCmdCache = await appService.zshCommands()
  return zshCmdCache
}

export async function showCommandPalette(): Promise<void> {
  const { modal, close } = overlayModal('picker-modal picker-modal-wide')

  const h = document.createElement('h2')
  h.textContent = 'Commands'
  const input = document.createElement('input')
  input.className = 'picker-input'
  input.type = 'text'
  input.placeholder = 'Search commands…  (⏎ insert into active terminal)'
  input.spellcheck = false
  const chips = document.createElement('div')
  chips.className = 'md-filters palette-chips'
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(h, input, chips, list)

  interface Cmd {
    category: string
    name: string
    value: string
  }
  const zsh = await loadZshCommands()
  const all: Cmd[] = [
    ...zsh.map((c) => ({ category: 'zsh', name: c.name, value: c.value })),
    ...paletteCommandRepo.getAll().map((c) => ({ category: c.category, name: c.name, value: c.command }))
  ]
  // Categories in first-seen order, with zsh guaranteed first.
  const categories: string[] = ['zsh']
  for (const c of all) if (!categories.includes(c.category)) categories.push(c.category)

  const active = new Set<string>(['zsh']) // multi-select chips; zsh is the default

  let sel = 0
  const filtered = (): Cmd[] => {
    const q = input.value.trim().toLowerCase()
    return all.filter(
      (c) => active.has(c.category) && (!q || (c.name + ' ' + c.value).toLowerCase().includes(q))
    )
  }
  // Insert (don't run) the command into the active terminal so the user can edit it.
  const insert = (c: Cmd): void => {
    const id = state.activePaneId
    if (id) {
      selectPane(id)
      terminalService.input(id, c.value)
    }
    close()
  }
  const highlight = (): void => {
    list.querySelectorAll<HTMLElement>('.palette-row').forEach((el, i) => {
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
    items.slice(0, 500).forEach((c, i) => {
      const row = document.createElement('div')
      row.className = 'pick-row palette-row' + (i === sel ? ' active' : '')
      const name = document.createElement('span')
      name.className = 'palette-name'
      name.textContent = c.name
      row.appendChild(name)
      if (c.value && c.value !== c.name) {
        const v = document.createElement('span')
        v.className = 'palette-val'
        v.textContent = c.value
        row.appendChild(v)
      }
      const tag = document.createElement('span')
      tag.className = 'palette-cat'
      tag.textContent = c.category
      row.appendChild(tag)
      row.addEventListener('click', () => insert(c))
      row.addEventListener('mouseenter', () => {
        sel = i
        highlight()
      })
      list.appendChild(row)
    })
  }
  const renderChips = (): void => {
    chips.replaceChildren()
    categories.forEach((cat) => {
      const chip = document.createElement('button')
      chip.className = 'md-chip' + (active.has(cat) ? ' active' : '')
      chip.textContent = cat
      chip.addEventListener('click', () => {
        if (active.has(cat)) {
          if (active.size > 1) active.delete(cat) // keep at least one category active
        } else {
          active.add(cat)
        }
        sel = 0
        renderChips()
        render()
      })
      chips.appendChild(chip)
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
      if (items[sel]) insert(items[sel])
    }
  })
  renderChips()
  render()
  input.focus()
}



// ---- Terminal switcher: list every open terminal/pane, search, jump to one ----

export function showTerminalSwitcher(): void {
  const { modal, close } = overlayModal('picker-modal picker-modal-wide')

  const h = document.createElement('h2')
  h.textContent = 'Open terminals'
  const input = document.createElement('input')
  input.className = 'picker-input'
  input.type = 'text'
  input.placeholder = 'Search terminals…  (↑↓ move · ⏎ focus)'
  input.spellcheck = false
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(h, input, list)

  interface Term {
    paneId: string
    title: string
    group: string
    status: string
    cwd: string | null
    branch: string | null
    claude: boolean
  }
  const all: Term[] = []
  for (const tab of allTabs(state.tree)) {
    const trail = ancestorFolders(state.tree, tab.id)
    const group = trail && trail.length ? trail.map((f) => f.name).join(' / ') : ''
    for (const pid of panesInLayout(tab.root)) {
      const p = panes.get(pid)
      if (!p) continue
      all.push({
        paneId: pid,
        title: tab.title,
        group,
        status: paneStatus(p),
        cwd: p.cwd,
        branch: p.branch,
        claude: p.claude
      })
    }
  }

  let sel = 0
  const filtered = (): Term[] => {
    const q = input.value.trim().toLowerCase()
    if (!q) return all
    return all.filter((t) =>
      `${t.title} ${t.group} ${t.branch ?? ''} ${t.cwd ?? ''}`.toLowerCase().includes(q)
    )
  }
  const focusTerm = (t: Term): void => {
    selectPane(t.paneId)
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
        `<div class="empty-hint">${all.length ? 'No matches' : 'No open terminals'}</div>`
      )
      return
    }
    items.forEach((t, i) => {
      const row = document.createElement('div')
      row.className = 'pick-row claude-row' + (i === sel ? ' active' : '')
      const dot = document.createElement('span')
      dot.className = 'status-dot ' + t.status
      const main = document.createElement('div')
      main.className = 'claude-main'
      const title = document.createElement('span')
      title.className = 'claude-title'
      title.textContent = (t.claude ? '↺ ' : '') + (t.group ? `${t.title}  ·  ${t.group}` : t.title)
      const sub = document.createElement('span')
      sub.className = 'claude-sub'
      sub.textContent = [t.branch, t.cwd].filter(Boolean).join(' · ') || t.status
      main.append(title, sub)
      row.append(dot, main)
      row.addEventListener('click', () => focusTerm(t))
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
      if (items[sel]) focusTerm(items[sel])
    }
  })
  render()
  input.focus()
}

// ---- Command history: filter all app-tracked commands, copy one ----

export function showCommandHistory(): void {
  const { modal, close } = overlayModal('picker-modal')

  const h = document.createElement('h2')
  h.textContent = 'Command history'
  const input = document.createElement('input')
  input.className = 'picker-input'
  input.type = 'text'
  input.placeholder = 'Filter commands…'
  input.spellcheck = false
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(h, input, list)

  const all = [...commandHistory].reverse() // most recent first

  const copy = (cmd: string, btn: HTMLElement): void => {
    void navigator.clipboard.writeText(cmd)
    const prev = btn.textContent
    btn.textContent = 'Copied'
    setTimeout(() => (btn.textContent = prev), 1000)
  }

  const render = (): void => {
    const q = input.value.trim().toLowerCase()
    const items = q ? all.filter((c) => c.toLowerCase().includes(q)) : all
    list.replaceChildren()
    if (!items.length) {
      const hint = document.createElement('div')
      hint.className = 'empty-hint'
      hint.textContent = commandHistory.length ? 'No matches' : 'No commands yet'
      list.appendChild(hint)
      return
    }
    items.slice(0, 500).forEach((cmd) => {
      const row = document.createElement('div')
      row.className = 'pick-row cmd-row'
      const text = document.createElement('span')
      text.className = 'cmd-text'
      text.textContent = cmd
      const btn = document.createElement('button')
      btn.className = 'cmd-copy'
      btn.textContent = 'Copy'
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        copy(cmd, btn)
      })
      row.append(text, btn)
      row.addEventListener('click', () => copy(cmd, btn))
      list.appendChild(row)
    })
  }

  input.addEventListener('input', render)
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  })
  render()
  input.focus()
}
