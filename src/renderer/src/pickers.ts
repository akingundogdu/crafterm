import type { DirEntry } from '../../preload/api'
import type { SshConnection, ProjectNode, Application } from './types'
import { settings, commandHistory, panes, state, saveSoon, persistNow, uid } from './state'
import {
  openTerminalInDir,
  openProject,
  newTab,
  selectPane,
  openTerminalRunning,
  createWorktreeFromPane,
  openMarkdownFile,
  resumeClaudeSession,
  splitProjectRight,
  splitActivePane,
  runApplications,
  createFeature,
  resolveAppPath,
  openLink,
  openNote
} from './commands'
import { allTabs, panesInLayout, ancestorFolders } from './tree'
import { flattenProjects } from './catalog'
import { paneStatus, buildPaneMenu } from './pane'
import { actionMenuSearchEntries } from './sidebar'
import { promptForm, promptConfirm, makeCloseButton } from './dialog'
import { collectBackgroundProcesses, killProcess, openProcessView } from './bgproc'
import type { CollectedProcess } from './bgproc'

export function overlayModal(extraClass = ''): { overlay: HTMLElement; modal: HTMLElement; close: () => void } {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal ' + extraClass
  overlay.appendChild(modal)
  const close = (): void => overlay.remove()
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  modal.appendChild(makeCloseButton(close))
  document.body.appendChild(overlay)
  return { overlay, modal, close }
}

// Shared "contains" search box for list modals. `onInput` re-renders the list.
export function makeSearchInput(placeholder: string, onInput: () => void): HTMLInputElement {
  const input = document.createElement('input')
  input.className = 'picker-input'
  input.type = 'text'
  input.placeholder = placeholder
  input.spellcheck = false
  input.addEventListener('input', onInput)
  return input
}

// ---- Plans: list ~/.claude/plans and open one in the Markdown app ----

export async function showPlansModal(): Promise<void> {
  const plans = await window.crafterm.listPlans()
  const { modal, close } = overlayModal('list-modal')

  const h = document.createElement('h2')
  h.textContent = 'Plans'
  modal.appendChild(h)

  if (!plans.length) {
    const hint = document.createElement('div')
    hint.className = 'empty-hint'
    hint.textContent = 'No plans in ~/.claude/plans'
    modal.appendChild(hint)
    return
  }

  const input = document.createElement('input')
  input.className = 'picker-input'
  input.type = 'text'
  input.placeholder = 'Filter plans…  (↑↓ move · ⏎ open)'
  input.spellcheck = false
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(input, list)

  const title = (p: (typeof plans)[number]): string => p.name.replace(/\.(md|mdx|mdc)$/i, '')
  let sel = 0

  const filtered = (): typeof plans => {
    const q = input.value.trim().toLowerCase()
    if (!q) return plans
    return plans.filter((p) => title(p).toLowerCase().includes(q))
  }

  const choose = (p: (typeof plans)[number]): void => {
    openMarkdownFile(p.path)
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
    items.forEach((p, i) => {
      const row = document.createElement('button')
      row.className = 'pick-row' + (i === sel ? ' active' : '')
      row.textContent = title(p)
      row.addEventListener('click', () => choose(p))
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
      if (items[sel]) choose(items[sel])
    }
  })

  render()
  setTimeout(() => input.focus(), 0)
}

// ---- Worktree dashboard: list the active repo's worktrees, act on them ----

function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}
function baseName(p: string): string {
  return p.replace(/\/+$/, '').split('/').pop() || p
}

export async function showWorktreeDashboard(): Promise<void> {
  const cwd = state.activePaneId ? panes.get(state.activePaneId)?.cwd ?? undefined : undefined
  const listing = await window.crafterm.listWorktrees(cwd)
  const { modal, close } = overlayModal('picker-modal')

  const h = document.createElement('h2')
  h.textContent = 'Worktrees'
  modal.appendChild(h)

  if (!listing.root) {
    const hint = document.createElement('div')
    hint.className = 'empty-hint'
    hint.textContent = 'Open a terminal inside a git repo first.'
    modal.appendChild(hint)
    return
  }

  const root = document.createElement('div')
  root.className = 'picker-path'
  root.textContent = listing.root
  modal.appendChild(root)

  const addBtn = document.createElement('button')
  addBtn.className = 'settings-inline-btn'
  addBtn.textContent = '+ New worktree'
  addBtn.addEventListener('click', () => {
    close()
    if (state.activePaneId) void createWorktreeFromPane(state.activePaneId)
  })
  modal.appendChild(addBtn)

  const search = makeSearchInput('Search worktrees…', () => renderWt())
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(search, list)

  const renderWt = (): void => {
    const q = search.value.trim().toLowerCase()
    const items = listing.worktrees.filter(
      (w) => !q || `${baseName(w.path)} ${w.branch ?? ''} ${w.path}`.toLowerCase().includes(q)
    )
    list.replaceChildren()
    if (!items.length) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    items.forEach((w) => {
      const row = document.createElement('div')
      row.className = 'pick-row wt-row'
      const main = document.createElement('div')
      main.className = 'claude-main'
      const title = document.createElement('span')
      title.className = 'claude-title'
      title.textContent = baseName(w.path)
      const sub = document.createElement('span')
      sub.className = 'claude-sub'
      sub.textContent = [w.branch, w.path].filter(Boolean).join(' · ')
      main.append(title, sub)

      const claudeBtn = document.createElement('button')
      claudeBtn.className = 'wt-act'
      claudeBtn.textContent = 'Claude'
      claudeBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        void openProject({ name: baseName(w.path), path: w.path, command: 'claude' }, null)
        close()
      })
      const rmBtn = document.createElement('button')
      rmBtn.className = 'wt-act wt-remove'
      rmBtn.textContent = 'Remove'
      rmBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        void openTerminalRunning(
          `git -C ${shq(listing.root as string)} worktree remove ${shq(w.path)}`,
          'worktree remove'
        )
        close()
      })

      row.append(main, claudeBtn, rmBtn)
      row.addEventListener('click', () => {
        void openTerminalInDir(w.path)
        close()
      })
      list.appendChild(row)
    })
  }
  renderWt()
  search.focus()
}

// ---- Running processes: every tracked background shell, view/kill -------
//
// Surfaces the hidden background processes (iOS build/run, worktree
// create/remove, …) tracked across all worktrees/projects. "View" attaches a
// transient pane to the still-running PTY; "Kill" terminates it for good.

const PROC_STATUS_LABEL: Record<string, string> = {
  running: 'running',
  done: 'done',
  idle: 'idle',
  waiting: 'waiting',
  archived: 'archived'
}

export function showRunningProcessesDashboard(): void {
  const { modal, close } = overlayModal('picker-modal')

  const h = document.createElement('h2')
  h.textContent = 'Running processes'
  modal.appendChild(h)

  const search = makeSearchInput('Search processes…', () => render())
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(search, list)

  const render = (): void => {
    const q = search.value.trim().toLowerCase()
    // Running first, then everything else; within a group keep tree order.
    const all = collectBackgroundProcesses().sort((a, b) => {
      const ar = a.proc.status === 'running' ? 0 : 1
      const br = b.proc.status === 'running' ? 0 : 1
      return ar - br
    })
    const items = all.filter(
      (c) =>
        !q ||
        `${c.proc.title} ${c.proc.command} ${c.proc.cwd} ${c.proc.target?.name ?? ''}`
          .toLowerCase()
          .includes(q)
    )
    list.replaceChildren()
    if (!items.length) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No background processes</div>')
      return
    }
    items.forEach((c) => {
      const row = document.createElement('div')
      row.className = 'pick-row wt-row'

      const main = document.createElement('div')
      main.className = 'claude-main'
      const title = document.createElement('span')
      title.className = 'claude-title'
      title.textContent = c.proc.title
      const sub = document.createElement('span')
      sub.className = 'claude-sub'
      sub.textContent = [c.proc.target?.name, c.proc.cwd].filter(Boolean).join(' · ')
      main.append(title, sub)

      const badge = document.createElement('span')
      badge.className = 'proc-status proc-status-' + c.proc.status
      badge.textContent = PROC_STATUS_LABEL[c.proc.status] ?? c.proc.status

      const viewBtn = document.createElement('button')
      viewBtn.className = 'wt-act'
      viewBtn.textContent = 'View'
      viewBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        void openProcessView(c.proc.stableId)
        close()
      })
      const killBtn = document.createElement('button')
      killBtn.className = 'wt-act wt-remove'
      killBtn.textContent = 'Kill'
      killBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        killProcess(c.proc.stableId)
        render()
      })

      row.append(main, badge, viewBtn, killBtn)
      list.appendChild(row)
    })
  }
  render()
  search.focus()
}

// ---- Running devices: Crafterm iOS runs grouped by target, stop the app --
//
// A Crafterm "build & run" is tracked as a background process carrying its run
// target (simulator/device). This groups those by target and lets you terminate
// the running app on a target: iosWorktreeStop terminates the variant on the
// simulator, then killProcess clears the run PTY + row.

export function showRunningDevicesDashboard(): void {
  const { modal, close } = overlayModal('picker-modal')

  const h = document.createElement('h2')
  h.textContent = 'Running devices'
  modal.appendChild(h)

  const search = makeSearchInput('Search devices…', () => render())
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(search, list)

  const stopApp = async (c: CollectedProcess): Promise<void> => {
    await window.crafterm.iosWorktreeStop(c.proc.cwd, c.project?.iosConfig)
    killProcess(c.proc.stableId)
    render()
  }

  const render = (): void => {
    const q = search.value.trim().toLowerCase()
    const runs = collectBackgroundProcesses().filter((c) => c.proc.target)
    // Group by target (kind + name); preserve first-seen order.
    const groups = new Map<string, { name: string; kind: string; items: CollectedProcess[] }>()
    for (const c of runs) {
      const t = c.proc.target!
      const key = `${t.kind}:${t.name}`
      let g = groups.get(key)
      if (!g) {
        g = { name: t.name, kind: t.kind, items: [] }
        groups.set(key, g)
      }
      g.items.push(c)
    }

    list.replaceChildren()
    let shown = 0
    for (const g of groups.values()) {
      const items = g.items.filter(
        (c) => !q || `${g.name} ${c.proc.title} ${c.proc.cwd}`.toLowerCase().includes(q)
      )
      if (!items.length) continue
      shown += items.length

      const header = document.createElement('div')
      header.className = 'proc-group-header'
      header.textContent = `${g.name} (${g.kind})`
      list.appendChild(header)

      items.forEach((c) => {
        const row = document.createElement('div')
        row.className = 'pick-row wt-row'
        const main = document.createElement('div')
        main.className = 'claude-main'
        const title = document.createElement('span')
        title.className = 'claude-title'
        title.textContent = c.proc.title
        const sub = document.createElement('span')
        sub.className = 'claude-sub'
        sub.textContent = c.proc.cwd
        main.append(title, sub)

        const stopBtn = document.createElement('button')
        stopBtn.className = 'wt-act wt-remove'
        stopBtn.textContent = 'Stop app'
        stopBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          void stopApp(c)
        })

        row.append(main, stopBtn)
        list.appendChild(row)
      })
    }
    if (!shown) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No apps running on a device</div>')
    }
  }
  render()
  search.focus()
}

// ---- SSH connections: saved hosts, connect in a new terminal ----
//
// Connections live in settings.sshConnections (persisted to crafterm-state.json).
// Passwords are stored as plaintext (the user's explicit choice) and are never
// auto-typed: connecting just runs `ssh [...]`, and the saved password is only
// surfaced via a "Copy pwd" button for manual paste at the prompt.

function sshTarget(c: SshConnection): string {
  return (c.user ? `${c.user}@` : '') + c.host
}

function sshCommand(c: SshConnection): string {
  const parts = ['ssh']
  if (c.port) parts.push('-p', String(c.port))
  parts.push(sshTarget(c))
  return parts.join(' ')
}

// Add or edit one connection via the shared form modal (host is required).
async function editSshConnection(existing?: SshConnection): Promise<void> {
  const values = await promptForm({
    title: existing ? 'Edit SSH connection' : 'New SSH connection',
    fields: [
      { key: 'host', label: 'Host', value: existing?.host, placeholder: 'example.com or 1.2.3.4' },
      { key: 'user', label: 'User', value: existing?.user, placeholder: 'root' },
      { key: 'port', label: 'Port', value: existing?.port ? String(existing.port) : '', placeholder: '22' },
      { key: 'label', label: 'Label', value: existing?.label, placeholder: 'My server (optional)' },
      {
        key: 'password',
        label: 'Password',
        value: existing?.password,
        placeholder: '(optional · stored as plaintext)'
      }
    ],
    confirmText: existing ? 'Save' : 'Add'
  })
  if (!values) return // cancelled, or host left empty (the required first field)
  const port = parseInt(values.port, 10)
  const conn: SshConnection = {
    id: existing?.id ?? uid('ssh'),
    host: values.host,
    user: values.user || undefined,
    port: Number.isFinite(port) && port > 0 ? port : undefined,
    label: '',
    password: values.password || undefined
  }
  conn.label = values.label || sshTarget(conn)
  if (existing) {
    const i = settings.sshConnections.findIndex((x) => x.id === existing.id)
    if (i >= 0) settings.sshConnections[i] = conn
  } else {
    settings.sshConnections.push(conn)
  }
  saveSoon()
}

export function showSshConnections(): void {
  const { modal, close } = overlayModal('picker-modal')

  const h = document.createElement('h2')
  h.textContent = 'My SSH connections'
  modal.appendChild(h)

  const addBtn = document.createElement('button')
  addBtn.className = 'settings-inline-btn'
  addBtn.textContent = '+ New connection'
  addBtn.addEventListener('click', () => void editSshConnection().then(render))
  modal.appendChild(addBtn)

  const search = makeSearchInput('Search connections…', () => render())
  modal.appendChild(search)

  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.appendChild(list)

  const render = (): void => {
    list.replaceChildren()
    if (!settings.sshConnections.length) {
      const hint = document.createElement('div')
      hint.className = 'empty-hint'
      hint.textContent = 'No saved connections yet.'
      list.appendChild(hint)
      return
    }
    const q = search.value.trim().toLowerCase()
    const conns = settings.sshConnections.filter(
      (c) => !q || `${c.label ?? ''} ${sshTarget(c)}`.toLowerCase().includes(q)
    )
    if (!conns.length) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    conns.forEach((c) => {
      const row = document.createElement('div')
      row.className = 'pick-row wt-row'
      const main = document.createElement('div')
      main.className = 'claude-main'
      const title = document.createElement('span')
      title.className = 'claude-title'
      title.textContent = c.label || sshTarget(c)
      const sub = document.createElement('span')
      sub.className = 'claude-sub'
      sub.textContent = sshTarget(c) + (c.port ? `:${c.port}` : '')
      main.append(title, sub)
      row.appendChild(main)

      if (c.password) {
        const copyBtn = document.createElement('button')
        copyBtn.className = 'wt-act'
        copyBtn.textContent = 'Copy pwd'
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          void navigator.clipboard.writeText(c.password as string)
          copyBtn.textContent = 'Copied'
          setTimeout(() => (copyBtn.textContent = 'Copy pwd'), 1200)
        })
        row.appendChild(copyBtn)
      }

      const editBtn = document.createElement('button')
      editBtn.className = 'wt-act'
      editBtn.textContent = 'Edit'
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        void editSshConnection(c).then(render)
      })
      row.appendChild(editBtn)

      const rmBtn = document.createElement('button')
      rmBtn.className = 'wt-act wt-remove'
      rmBtn.textContent = 'Delete'
      rmBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        void promptConfirm({
          title: 'Delete connection?',
          message: `Remove "${c.label || sshTarget(c)}" from saved connections?`,
          confirmText: 'Delete'
        }).then((ok) => {
          if (!ok) return
          settings.sshConnections = settings.sshConnections.filter((x) => x.id !== c.id)
          saveSoon()
          render()
        })
      })
      row.appendChild(rmBtn)

      row.addEventListener('click', () => {
        void openTerminalRunning(sshCommand(c), c.label || sshTarget(c))
        close()
      })
      list.appendChild(row)
    })
  }

  render()
}

// ---- Claude sessions dashboard: list all Claude panes, jump to one ----

export function showClaudeDashboard(): void {
  const { overlay, modal, close } = overlayModal('picker-modal')

  const h = document.createElement('h2')
  h.textContent = 'Claude sessions'
  const search = makeSearchInput('Search sessions…', () => render())
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
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
      const hint = document.createElement('div')
      hint.className = 'empty-hint'
      hint.textContent = 'No Claude sessions'
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
      const row = document.createElement('div')
      row.className = 'pick-row claude-row'
      const dot = document.createElement('span')
      dot.className = 'status-dot ' + s.status
      const main = document.createElement('div')
      main.className = 'claude-main'
      const title = document.createElement('span')
      title.className = 'claude-title'
      title.textContent = s.group ? `${s.title}  ·  ${s.group}` : s.title
      const sub = document.createElement('span')
      sub.className = 'claude-sub'
      sub.textContent = [s.branch, s.cwd].filter(Boolean).join(' · ') || s.status
      main.append(title, sub)
      row.append(dot, main)
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

// ---- Project picker: open a saved project (or a blank terminal) ----

export function showProjectPicker(parentFolderId: string | null, opts?: { split?: boolean }): void {
  const splitMode = !!opts?.split
  const { modal, close } = overlayModal('picker-modal')

  const h = document.createElement('h2')
  h.textContent = splitMode ? 'Split with project' : 'Open project'
  const input = document.createElement('input')
  input.className = 'picker-input'
  input.type = 'text'
  input.placeholder = splitMode
    ? 'Filter projects…  (⏎ split right)'
    : 'Filter projects…  (↑↓ move · ⏎ open · ⌘⏎ split right)'
  input.spellcheck = false
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(h, input, list)

  interface Entry {
    label: string
    sub?: string
    openTab: () => void
    openSplit: () => void
  }
  const entries: Entry[] = [
    {
      label: 'Blank terminal',
      openTab: () => void newTab(parentFolderId),
      openSplit: () => void splitActivePane('row')
    },
    ...flattenProjects(state.tree).map((p) => ({
      label: p.name,
      sub: p.command ? `${p.path} · ${p.command}` : p.path,
      // Always nest the new terminal under the picked project's node (not the
      // cmd+O context), so it's grouped with that project in the sidebar.
      openTab: () => void openProject(p),
      openSplit: () => void splitProjectRight(p)
    })),
    // run-apps entries for projects that define applications
    ...flattenProjects(state.tree)
      .filter((p) => p.apps?.length)
      .map((p) => ({
        label: `▷ ${p.name} — run apps`,
        sub: `${p.apps?.length} app${p.apps?.length === 1 ? '' : 's'}`,
        openTab: () => showRunApps(p),
        openSplit: () => showRunApps(p)
      }))
  ]
  let sel = 0

  const filtered = (): Entry[] => {
    const q = input.value.trim().toLowerCase()
    if (!q) return entries
    // match name, path and command (contains)
    return entries.filter((e) => (e.label + ' ' + (e.sub ?? '')).toLowerCase().includes(q))
  }

  // Enter (or click) opens a new tab; ⌘Enter (or split mode) splits the active pane.
  const choose = (e: Entry, split: boolean): void => {
    if (split || splitMode) e.openSplit()
    else e.openTab()
    close()
  }

  const render = (): void => {
    const items = filtered()
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    list.replaceChildren()
    items.forEach((e, i) => {
      const row = document.createElement('div')
      row.className = 'pick-row project-row' + (i === sel ? ' active' : '')
      const name = document.createElement('span')
      name.className = 'picker-name'
      name.textContent = e.label
      row.appendChild(name)
      if (e.sub) {
        const sub = document.createElement('span')
        sub.className = 'project-sub'
        sub.textContent = e.sub
        row.appendChild(sub)
      }
      row.addEventListener('click', (ev) => choose(e, ev.metaKey || ev.ctrlKey))
      row.addEventListener('mouseenter', () => {
        sel = i
        highlight()
      })
      list.appendChild(row)
    })
  }
  const highlight = (): void => {
    list.querySelectorAll<HTMLElement>('.project-row').forEach((el, i) => {
      el.classList.toggle('active', i === sel)
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
      if (items[sel]) choose(items[sel], e.metaKey || e.ctrlKey)
    }
  })
  render()
  input.focus()
}

// ---- Pick a folder (returns its path) — used by Settings to choose md folders ----

export function pickFolderPath(startDir?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const { overlay, modal, close } = overlayModal('picker-modal')

    let settled = false
    const finish = (val: string | null): void => {
      if (settled) return
      settled = true
      close()
      resolve(val)
    }

    const path = document.createElement('div')
    path.className = 'picker-path'
    const useBtn = document.createElement('button')
    useBtn.className = 'settings-inline-btn'
    useBtn.textContent = 'Use this folder'
    const input = document.createElement('input')
    input.className = 'picker-input'
    input.type = 'text'
    input.placeholder = 'Filter folders…  (↑↓ move · → enter · ← up · ⏎ pick)'
    input.spellcheck = false
    const list = document.createElement('div')
    list.className = 'pick-list picker-list'
    modal.append(path, useBtn, input, list)

    let dirs: DirEntry[] = []
    let parent: string | null = null
    let current = ''
    let sel = 0

    const filtered = (): DirEntry[] => {
      const q = input.value.trim().toLowerCase()
      return q ? dirs.filter((d) => d.name.toLowerCase().includes(q)) : dirs
    }
    const highlight = (): void => {
      list.querySelectorAll<HTMLElement>('.picker-row').forEach((el, i) => {
        el.classList.toggle('active', i === sel)
      })
    }
    const renderList = (): void => {
      const items = filtered()
      if (sel >= items.length) sel = Math.max(0, items.length - 1)
      list.replaceChildren()
      if (!items.length) {
        list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No folders</div>')
        return
      }
      items.forEach((d, i) => {
        const row = document.createElement('div')
        row.className = 'pick-row picker-row' + (i === sel ? ' active' : '')
        const name = document.createElement('span')
        name.className = 'picker-name'
        name.textContent = d.name
        const drill = document.createElement('button')
        drill.className = 'picker-drill'
        drill.textContent = '›'
        drill.title = 'Enter folder'
        drill.addEventListener('click', (e) => {
          e.stopPropagation()
          void load(d.path)
        })
        row.append(name, drill)
        row.addEventListener('click', () => finish(d.path))
        row.addEventListener('mouseenter', () => {
          sel = i
          highlight()
        })
        list.appendChild(row)
      })
    }
    const load = async (p?: string): Promise<void> => {
      const listing = await window.crafterm.listDir(p)
      dirs = listing.dirs
      parent = listing.parent
      current = listing.path
      sel = 0
      path.textContent = listing.path
      input.value = ''
      renderList()
    }

    useBtn.addEventListener('click', () => finish(current))
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) finish(null)
    })
    input.addEventListener('input', () => {
      sel = 0
      renderList()
    })
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      const items = filtered()
      if (e.key === 'Escape') finish(null)
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        sel = Math.min(items.length - 1, sel + 1)
        highlight()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        sel = Math.max(0, sel - 1)
        highlight()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (items[sel]) void load(items[sel].path)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (parent) void load(parent)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (items[sel]) finish(items[sel].path)
      }
    })

    void load(startDir ?? (settings.codeRoot || undefined))
    input.focus()
  })
}

// ---- All markdown finder (Cmd+O in Notebook): files under the configured folders ----

export async function showAllMarkdown(): Promise<void> {
  const folders = settings.commands.mdFolders
  const { modal, close } = overlayModal('picker-modal')

  const h = document.createElement('h2')
  h.textContent = 'Open markdown file'
  const input = document.createElement('input')
  input.className = 'picker-input'
  input.type = 'text'
  input.placeholder = 'Search by file name'
  input.spellcheck = false

  const ALL = ' all'
  let folderFilter: string | null = null // null = nothing loaded yet
  let files: { path: string; name: string }[] = []

  const filterBar = document.createElement('div')
  filterBar.className = 'md-filters'
  const chips: HTMLButtonElement[] = []
  const makeChip = (label: string, value: string): void => {
    const c = document.createElement('button')
    c.className = 'md-chip'
    c.textContent = label
    c.title = value === ALL ? 'All configured folders' : value
    c.addEventListener('click', () => void load(value, c))
    filterBar.appendChild(c)
    chips.push(c)
  }
  if (folders.length) {
    makeChip('All', ALL)
    folders.forEach((f) => makeChip(baseName(f), f))
  }

  const countEl = document.createElement('div')
  countEl.className = 'md-count'
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(h, input, filterBar, countEl, list)

  const pretty = (p: string): string => p.replace(/^\/Users\/[^/]+/, '~')
  let sel = 0

  // fetch markdown for the clicked folder — or, for "All", every configured folder
  const load = async (value: string, chip: HTMLButtonElement): Promise<void> => {
    folderFilter = value
    chips.forEach((x) => x.classList.toggle('active', x === chip))
    list.replaceChildren()
    countEl.textContent = 'Loading...'
    if (value === ALL) {
      const results = await Promise.all(folders.map((f) => window.crafterm.findAllMarkdown(f)))
      const byPath = new Map<string, { path: string; name: string }>()
      results.forEach((r) => r.files.forEach((f) => byPath.set(f.path, f)))
      files = [...byPath.values()]
    } else {
      const res = await window.crafterm.findAllMarkdown(value)
      files = res.files
    }
    sel = 0
    render()
  }

  const filtered = (): typeof files => {
    if (folderFilter === null) return []
    const q = input.value.trim().toLowerCase()
    return q ? files.filter((f) => f.name.toLowerCase().includes(q)) : files
  }
  const open = (p: string): void => {
    openMarkdownFile(p)
    close()
  }
  const render = (): void => {
    const items = filtered()
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    const idle = folderFilter === null
    countEl.textContent = idle ? '' : `${items.length} file${items.length === 1 ? '' : 's'}`
    list.replaceChildren()
    if (!items.length) {
      const hint = document.createElement('div')
      hint.className = 'empty-hint'
      hint.textContent = !folders.length
        ? 'No folders configured. Add them in Settings → Commands.'
        : idle
          ? 'Pick a folder above to list its notes.'
          : 'No matches'
      list.appendChild(hint)
      return
    }
    items.slice(0, 500).forEach((f, i) => {
      const row = document.createElement('div')
      row.className = 'pick-row mdfile-row' + (i === sel ? ' active' : '')
      const name = document.createElement('span')
      name.className = 'picker-name'
      name.textContent = f.name
      const sub = document.createElement('span')
      sub.className = 'project-sub'
      sub.textContent = pretty(f.path.slice(0, f.path.length - f.name.length))
      const main = document.createElement('div')
      main.className = 'claude-main'
      main.append(name, sub)
      row.appendChild(main)
      row.addEventListener('click', () => open(f.path))
      row.addEventListener('mouseenter', () => {
        sel = i
        highlight()
      })
      list.appendChild(row)
    })
  }
  const highlight = (): void => {
    list.querySelectorAll<HTMLElement>('.mdfile-row').forEach((el, i) => {
      el.classList.toggle('active', i === sel)
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
      if (items[sel]) open(items[sel].path)
    }
  })
  render()
  input.focus()
}

// ---- Run applications: pick environment + apps, open a tiled tab ----

// Modal for one project: choose an environment, tick apps, run them together.
export function showRunApps(project: ProjectNode): void {
  const apps = project.apps ?? []
  const { modal, close } = overlayModal('picker-modal')
  const h = document.createElement('h2')
  h.textContent = `Run — ${project.name}`
  modal.append(h)

  if (!apps.length || !settings.environments.length) {
    modal.insertAdjacentHTML(
      'beforeend',
      `<div class="empty-hint">${
        apps.length ? 'No environments.' : 'No applications.'
      } Add them in Settings → Projects.</div>`
    )
    return
  }

  let env = settings.environments[0]
  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Environment</div>')
  const envBar = document.createElement('div')
  envBar.className = 'run-env-bar'
  const envBtns: HTMLButtonElement[] = []
  settings.environments.forEach((name) => {
    const b = document.createElement('button')
    b.className = 'run-env-chip' + (name === env ? ' active' : '')
    b.textContent = name
    b.addEventListener('click', () => {
      env = name
      envBtns.forEach((x) => x.classList.toggle('active', x === b))
      renderApps()
    })
    envBtns.push(b)
    envBar.appendChild(b)
  })
  modal.append(envBar)

  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Applications</div>')
  const list = document.createElement('div')
  list.className = 'run-app-list'
  modal.append(list)
  const checks = new Map<Application, HTMLInputElement>()
  const renderApps = (): void => {
    list.replaceChildren()
    checks.clear()
    apps.forEach((app) => {
      const cmd = (app.commands?.[env] ?? '').trim()
      const row = document.createElement('label')
      row.className = 'run-app-row' + (cmd ? '' : ' disabled')
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = !!cmd
      cb.disabled = !cmd
      const name = document.createElement('span')
      name.className = 'run-app-name'
      name.textContent = app.name
      const sub = document.createElement('span')
      sub.className = 'run-app-cmd'
      sub.textContent = cmd || `no command for ${env}`
      row.append(cb, name, sub)
      checks.set(app, cb)
      list.appendChild(row)
    })
  }
  renderApps()

  const actions = document.createElement('div')
  actions.className = 'modal-actions'
  const cancel = document.createElement('button')
  cancel.textContent = 'Cancel'
  cancel.addEventListener('click', close)
  const run = document.createElement('button')
  run.className = 'primary'
  run.textContent = 'Run'
  run.addEventListener('click', () => {
    const selected = apps.filter((a) => checks.get(a)?.checked)
    if (selected.length) void runApplications(project, env, selected)
    close()
  })
  actions.append(cancel, run)
  modal.append(actions)
}

// Pick a project that has applications, then open its run modal.
// Shared: pick a project that has applications, then run `onPick`.
function pickProjectWithApps(title: string, onPick: (p: ProjectNode) => void): void {
  const projects = flattenProjects(state.tree).filter((p) => p.apps?.length)
  const { modal, close } = overlayModal('picker-modal')
  const h = document.createElement('h2')
  h.textContent = title
  if (!projects.length) {
    modal.append(h)
    modal.insertAdjacentHTML(
      'beforeend',
      '<div class="empty-hint">No projects with applications. Add apps in Settings → Projects.</div>'
    )
    return
  }
  const input = makeSearchInput('Filter projects…  (↑↓ move · ⏎ select)', () => render())
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(h, input, list)
  let sel = 0
  const filtered = (): ProjectNode[] => {
    const q = input.value.trim().toLowerCase()
    return q ? projects.filter((p) => `${p.name} ${p.path}`.toLowerCase().includes(q)) : projects
  }
  const choose = (p: ProjectNode): void => {
    close()
    onPick(p)
  }
  const highlight = (): void => {
    list.querySelectorAll<HTMLElement>('.project-row').forEach((el, i) => {
      el.classList.toggle('active', i === sel)
    })
  }
  const render = (): void => {
    const items = filtered()
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    list.replaceChildren()
    items.forEach((p, i) => {
      const row = document.createElement('div')
      row.className = 'pick-row project-row' + (i === sel ? ' active' : '')
      const name = document.createElement('span')
      name.className = 'picker-name'
      name.textContent = p.name
      const sub = document.createElement('span')
      sub.className = 'project-sub'
      const n = p.apps?.length ?? 0
      sub.textContent = `${p.path} · ${n} app${n === 1 ? '' : 's'}`
      row.append(name, sub)
      row.addEventListener('click', () => choose(p))
      row.addEventListener('mouseenter', () => {
        sel = i
        highlight()
      })
      list.appendChild(row)
    })
  }
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
      if (items[sel]) choose(items[sel])
    }
  })
  render()
  input.focus()
}

export function showRunAppsPicker(): void {
  pickProjectWithApps('Run applications', showRunApps)
}

export function showFeaturePicker(): void {
  pickProjectWithApps('New feature', showFeatureSetup)
}

// Project-specific named commands: a list with two run options per row —
// "Split" (drop into a split beside the active pane) and "New tab" (open as
// its own terminal under the project). Both spawn at the project's path.
export function showRunCommand(project: ProjectNode): void {
  const cmds = project.runCommands ?? []
  const { modal, close } = overlayModal('picker-modal')
  const h = document.createElement('h2')
  h.textContent = `Run command — ${project.name}`
  modal.append(h)
  if (!cmds.length) {
    modal.insertAdjacentHTML(
      'beforeend',
      '<div class="empty-hint">No run commands. Add them in Settings → Projects.</div>'
    )
    return
  }
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(list)
  for (const rc of cmds) {
    const row = document.createElement('div')
    row.className = 'pick-row project-row'
    const main = document.createElement('div')
    main.className = 'claude-main'
    const title = document.createElement('span')
    title.className = 'picker-name'
    title.textContent = rc.name
    const sub = document.createElement('span')
    sub.className = 'project-sub'
    sub.textContent = rc.command
    main.append(title, sub)
    const splitBtn = document.createElement('button')
    splitBtn.className = 'wt-act'
    splitBtn.textContent = 'Split'
    splitBtn.title = 'Run in a split beside the active pane'
    splitBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      void splitProjectRight({
        name: rc.name,
        path: project.path,
        command: rc.command,
        env: project.env,
        shell: project.shell
      })
      close()
    })
    const tabBtn = document.createElement('button')
    tabBtn.className = 'wt-act'
    tabBtn.textContent = 'New tab'
    tabBtn.title = 'Run in a new terminal tab under the project'
    tabBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      void openProject(
        {
          name: rc.name,
          path: project.path,
          command: rc.command,
          env: project.env,
          shell: project.shell
        },
        project.id
      )
      close()
    })
    row.append(main, splitBtn, tabBtn)
    list.appendChild(row)
  }
}

// Launch a single application (from the pane ⋯ menu). Lists each environment the
// app has a command for; Split runs it beside the active pane, New tab opens it in
// a fresh tab under the project. The project's startup is chained before the dev
// command, matching runApplications().
export function showRunApp(project: ProjectNode, app: Application): void {
  const envs = settings.environments.filter((e) => (app.commands?.[e] ?? '').trim())
  const { modal, close } = overlayModal('picker-modal')
  const h = document.createElement('h2')
  h.textContent = `Run ${app.name} — ${project.name}`
  modal.append(h)
  if (!envs.length) {
    modal.insertAdjacentHTML(
      'beforeend',
      '<div class="empty-hint">No commands configured for this application. Add them in Settings → Projects.</div>'
    )
    return
  }
  const appPath = resolveAppPath(project.path, app.path)
  const startup = project.startup?.trim()
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(list)
  for (const env of envs) {
    const dev = (app.commands[env] ?? '').trim()
    const command = startup ? `${startup} && ${dev}` : dev
    const row = document.createElement('div')
    row.className = 'pick-row project-row'
    const main = document.createElement('div')
    main.className = 'claude-main'
    const title = document.createElement('span')
    title.className = 'picker-name'
    title.textContent = env
    const sub = document.createElement('span')
    sub.className = 'project-sub'
    sub.textContent = dev
    main.append(title, sub)
    const target = { name: `${app.name} · ${env}`, path: appPath, command, env: project.env, shell: project.shell }
    const splitBtn = document.createElement('button')
    splitBtn.className = 'wt-act'
    splitBtn.textContent = 'Split'
    splitBtn.title = 'Run in a split beside the active pane'
    splitBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      void splitProjectRight(target)
      close()
    })
    const tabBtn = document.createElement('button')
    tabBtn.className = 'wt-act'
    tabBtn.textContent = 'New tab'
    tabBtn.title = 'Run in a new terminal tab under the project'
    tabBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      void openProject(target, project.id)
      close()
    })
    row.append(main, splitBtn, tabBtn)
    list.appendChild(row)
  }
}

// ---- Feature setup: feature name + branch + env + apps (+ per-app worktree) ----

const sanitizeBranch = (s: string): string => s.trim().replace(/\s+/g, '-')

export function showFeatureSetup(project: ProjectNode): void {
  const apps = project.apps ?? []
  const hasApps = apps.length > 0 && settings.environments.length > 0
  const { modal, close } = overlayModal('picker-modal')
  const h = document.createElement('h2')
  h.textContent = `New feature — ${project.name}`
  modal.append(h)
  if (!hasApps) {
    modal.insertAdjacentHTML(
      'beforeend',
      `<div class="empty-hint">${
        apps.length ? 'No environments configured.' : 'No applications defined for this project.'
      } The feature folder will be created without any auto-spawned terminals. Define apps in Settings → Projects to launch them automatically.</div>`
    )
  }

  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Feature name</div>')
  const nameInput = document.createElement('input')
  nameInput.className = 'reminder-input'
  nameInput.placeholder = 'maxi onboarding'
  modal.append(nameInput)

  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Branch</div>')
  const branchInput = document.createElement('input')
  branchInput.className = 'reminder-input'
  branchInput.placeholder = 'maxi-onboarding'
  modal.append(branchInput)
  let branchEdited = false
  branchInput.addEventListener('input', () => {
    branchEdited = true
  })
  nameInput.addEventListener('input', () => {
    if (!branchEdited) branchInput.value = sanitizeBranch(nameInput.value)
  })

  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Base branch</div>')
  const baseInput = document.createElement('input')
  baseInput.className = 'reminder-input'
  baseInput.value = 'main'
  modal.append(baseInput)

  let env = settings.environments[0] ?? ''
  const incl = new Map<Application, HTMLInputElement>()
  const wt = new Map<Application, HTMLInputElement>()
  if (hasApps) {
    modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Environment</div>')
    const envBar = document.createElement('div')
    envBar.className = 'run-env-bar'
    const envBtns: HTMLButtonElement[] = []
    settings.environments.forEach((name) => {
      const b = document.createElement('button')
      b.className = 'run-env-chip' + (name === env ? ' active' : '')
      b.textContent = name
      b.addEventListener('click', () => {
        env = name
        envBtns.forEach((x) => x.classList.toggle('active', x === b))
        renderApps()
      })
      envBtns.push(b)
      envBar.appendChild(b)
    })
    modal.append(envBar)

    modal.insertAdjacentHTML(
      'beforeend',
      '<div class="reminder-label">Applications (✓ include · ⑂ worktree)</div>'
    )
    const list = document.createElement('div')
    list.className = 'run-app-list'
    modal.append(list)
    const renderApps = (): void => {
      list.replaceChildren()
      incl.clear()
      wt.clear()
      apps.forEach((app) => {
        const cmd = (app.commands?.[env] ?? '').trim()
        const row = document.createElement('div')
        row.className = 'run-app-row feature-app-row' + (cmd ? '' : ' disabled')
        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.checked = !!cmd
        cb.disabled = !cmd
        cb.title = 'Include'
        const name = document.createElement('span')
        name.className = 'run-app-name'
        name.textContent = app.name
        const sub = document.createElement('span')
        sub.className = 'run-app-cmd'
        sub.textContent = cmd || `no command for ${env}`
        const wtLabel = document.createElement('label')
        wtLabel.className = 'feature-wt'
        const wtCb = document.createElement('input')
        wtCb.type = 'checkbox'
        wtCb.disabled = !cmd
        wtLabel.append(wtCb, document.createTextNode('worktree'))
        row.append(cb, name, sub, wtLabel)
        incl.set(app, cb)
        wt.set(app, wtCb)
        list.appendChild(row)
      })
    }
    renderApps()
  }

  const actions = document.createElement('div')
  actions.className = 'modal-actions'
  const cancel = document.createElement('button')
  cancel.textContent = 'Cancel'
  cancel.addEventListener('click', close)
  const create = document.createElement('button')
  create.className = 'primary'
  create.textContent = 'Create'
  create.addEventListener('click', () => {
    const branch = sanitizeBranch(branchInput.value || nameInput.value)
    if (!branch) return
    const chosen = apps
      .filter((a) => incl.get(a)?.checked)
      .map((app) => ({ app, worktree: !!wt.get(app)?.checked }))
    if (!chosen.length) return
    void createFeature(project, { branch, base: baseInput.value, env, apps: chosen })
    close()
  })
  actions.append(cancel, create)
  modal.append(actions)
  nameInput.focus()
}

// ---- Generic file finder (Notebook "Link file"): any file under the folders ----

// In-app fuzzy file search across the configured md folders. `onPick` receives
// the chosen file (used by the notebook to link external files into its tree).
export async function showFileFinder(opts: {
  title: string
  onPick: (path: string, name: string) => void
}): Promise<void> {
  const folders = settings.commands.mdFolders
  const { modal, close } = overlayModal('picker-modal')

  const h = document.createElement('h2')
  h.textContent = opts.title

  let folderFilter: string | null = null
  let files: { path: string; name: string }[] = []

  const ALL = ' all'
  const filterBar = document.createElement('div')
  filterBar.className = 'md-filters'
  const chips: HTMLButtonElement[] = []
  const makeChip = (label: string, value: string): void => {
    const c = document.createElement('button')
    c.className = 'md-chip'
    c.textContent = label
    c.title = value === ALL ? 'All configured folders' : value
    c.addEventListener('click', () => void load(value, c))
    filterBar.appendChild(c)
    chips.push(c)
  }
  if (folders.length) {
    makeChip('All', ALL)
    folders.forEach((f) => makeChip(baseName(f), f))
  }

  const countEl = document.createElement('div')
  countEl.className = 'md-count'
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  const input = makeSearchInput('Search file by name', () => {
    sel = 0
    render()
  })
  modal.append(h, input, filterBar, countEl, list)

  const pretty = (p: string): string => p.replace(/^\/Users\/[^/]+/, '~')
  let sel = 0

  const load = async (value: string, chip: HTMLButtonElement): Promise<void> => {
    folderFilter = value
    chips.forEach((x) => x.classList.toggle('active', x === chip))
    list.replaceChildren()
    countEl.textContent = 'Loading...'
    if (value === ALL) {
      const results = await Promise.all(
        folders.map((f) => window.crafterm.findFiles(f, settings.explorerExclude))
      )
      const byPath = new Map<string, { path: string; name: string }>()
      results.forEach((r) => r.files.forEach((f) => byPath.set(f.path, f)))
      files = [...byPath.values()]
    } else {
      const res = await window.crafterm.findFiles(value, settings.explorerExclude)
      files = res.files
    }
    sel = 0
    render()
  }

  const filtered = (): typeof files => {
    if (folderFilter === null) return []
    const q = input.value.trim().toLowerCase()
    return q ? files.filter((f) => f.name.toLowerCase().includes(q)) : files
  }
  const pick = (f: { path: string; name: string }): void => {
    opts.onPick(f.path, f.name)
    close()
  }
  const render = (): void => {
    const items = filtered()
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    const idle = folderFilter === null
    countEl.textContent = idle ? '' : `${items.length} file${items.length === 1 ? '' : 's'}`
    list.replaceChildren()
    if (!items.length) {
      const hint = document.createElement('div')
      hint.className = 'empty-hint'
      hint.textContent = !folders.length
        ? 'No folders configured. Add them in Settings → Commands.'
        : idle
          ? 'Pick a folder above to list its files.'
          : 'No matches'
      list.appendChild(hint)
      return
    }
    items.slice(0, 500).forEach((f, i) => {
      const row = document.createElement('div')
      row.className = 'pick-row mdfile-row' + (i === sel ? ' active' : '')
      const name = document.createElement('span')
      name.className = 'picker-name'
      name.textContent = f.name
      const sub = document.createElement('span')
      sub.className = 'project-sub'
      sub.textContent = pretty(f.path.slice(0, f.path.length - f.name.length))
      const main = document.createElement('div')
      main.className = 'claude-main'
      main.append(name, sub)
      row.appendChild(main)
      row.addEventListener('click', () => pick(f))
      row.addEventListener('mouseenter', () => {
        sel = i
        highlight()
      })
      list.appendChild(row)
    })
  }
  const highlight = (): void => {
    list.querySelectorAll<HTMLElement>('.mdfile-row').forEach((el, i) => {
      el.classList.toggle('active', i === sel)
    })
  }
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
      if (items[sel]) pick(items[sel])
    }
  })
  // auto-load the "All" set so the search box is usable immediately
  if (chips.length) void load(ALL, chips[0])
  else render()
  input.focus()
}

// ---- Command palette: zsh + user categories (predefined / cheatsheets) ----

// zsh alias/function lookup spawns an interactive shell (~seconds), so cache it
// for the session — the first open pays the cost, the rest are instant.
let zshCmdCache: { name: string; value: string }[] | null = null
export async function loadZshCommands(): Promise<{ name: string; value: string }[]> {
  if (!zshCmdCache) zshCmdCache = await window.crafterm.zshCommands()
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
    ...settings.paletteCommands.map((c) => ({ category: c.category, name: c.name, value: c.command }))
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
      window.crafterm.input(id, c.value)
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

// ---- Switch Claude account: run the user's `claude-switch-*` zsh commands ----
// Discovers any `claude-switch-<name>` alias/function (e.g. `cswap --switch-to N`)
// and runs the chosen one in a new terminal. New Claude terminals then use it.
export async function showClaudeAccountSwitcher(): Promise<void> {
  const cmds = await window.crafterm.zshCommands()
  const accounts = cmds
    .filter((c) => /^claude-switch-/.test(c.name))
    .map((c) => ({ name: c.name, label: c.name.replace(/^claude-switch-/, ''), value: c.value }))
  const { modal, close } = overlayModal('list-modal')

  const h = document.createElement('h2')
  h.textContent = 'Switch Claude account'
  modal.appendChild(h)

  if (!accounts.length) {
    const hint = document.createElement('div')
    hint.className = 'empty-hint'
    hint.innerHTML = 'No <code>claude-switch-*</code> commands found in your zsh config.'
    modal.appendChild(hint)
    return
  }

  const search = makeSearchInput('Search accounts…', () => renderAcc())
  const list = document.createElement('div')
  list.className = 'pick-list'
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
      const row = document.createElement('button')
      row.className = 'pick-row project-row'
      const name = document.createElement('span')
      name.className = 'picker-name'
      name.textContent = a.label
      row.appendChild(name)
      if (a.value) {
        const v = document.createElement('span')
        v.className = 'project-sub'
        v.textContent = a.value
        row.appendChild(v)
      }
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
  const sessions = await window.crafterm.claudeSessions()
  const { modal, close } = overlayModal('picker-modal picker-modal-wide')

  const h = document.createElement('h2')
  h.textContent = 'Resume Claude session'
  const input = document.createElement('input')
  input.className = 'picker-input'
  input.type = 'text'
  input.placeholder = 'Search sessions…  (↑↓ move · ⏎ resume in a new terminal)'
  input.spellcheck = false
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
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
      const row = document.createElement('div')
      row.className = 'pick-row project-row' + (i === sel ? ' active' : '')
      const name = document.createElement('span')
      name.className = 'picker-name'
      name.textContent = s.summary || '(no prompt)'
      const sub = document.createElement('span')
      sub.className = 'project-sub'
      sub.textContent = `${shortCwd(s.cwd)} · ${relTime(s.mtimeMs)}`
      row.append(name, sub)
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

// ---- Cmd+P: browse folders from the code root, open one in a new terminal ----

export async function showFolderPicker(): Promise<void> {
  const { modal, close } = overlayModal('picker-modal')

  const path = document.createElement('div')
  path.className = 'picker-path'
  const input = document.createElement('input')
  input.className = 'picker-input'
  input.type = 'text'
  input.placeholder = 'Filter folders…  (↑↓ move · → enter · ← up · ⏎ open)'
  input.spellcheck = false
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(path, input, list)

  let dirs: DirEntry[] = []
  let parent: string | null = null
  let sel = 0

  const filtered = (): DirEntry[] => {
    const q = input.value.trim().toLowerCase()
    return q ? dirs.filter((d) => d.name.toLowerCase().includes(q)) : dirs
  }

  const renderList = (): void => {
    const items = filtered()
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    list.replaceChildren()
    if (!items.length) {
      const hint = document.createElement('div')
      hint.className = 'empty-hint'
      hint.textContent = 'No folders'
      list.appendChild(hint)
      return
    }
    items.forEach((d, i) => {
      const row = document.createElement('div')
      row.className = 'pick-row picker-row' + (i === sel ? ' active' : '')
      const name = document.createElement('span')
      name.className = 'picker-name'
      name.textContent = d.name
      const drill = document.createElement('button')
      drill.className = 'picker-drill'
      drill.textContent = '›'
      drill.title = 'Enter folder'
      drill.addEventListener('click', (e) => {
        e.stopPropagation()
        void load(d.path)
      })
      row.append(name, drill)
      row.addEventListener('click', () => openHere(d.path))
      row.addEventListener('mouseenter', () => {
        sel = i
        highlight()
      })
      list.appendChild(row)
    })
  }

  const highlight = (): void => {
    list.querySelectorAll<HTMLElement>('.picker-row').forEach((el, i) => {
      el.classList.toggle('active', i === sel)
    })
  }

  const openHere = (dir: string): void => {
    void openTerminalInDir(dir)
    close()
  }

  const load = async (p?: string): Promise<void> => {
    const listing = await window.crafterm.listDir(p)
    dirs = listing.dirs
    parent = listing.parent
    sel = 0
    path.textContent = listing.path
    input.value = ''
    renderList()
  }

  input.addEventListener('input', () => {
    sel = 0
    renderList()
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
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (items[sel]) void load(items[sel].path)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (parent) void load(parent)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[sel]) openHere(items[sel].path)
    }
  })

  await load(settings.codeRoot || undefined)
  input.focus()
}

// ---- Git stash manager: list stashes, apply or drop, for a pane's repo ----

export async function showStashManager(paneId: string): Promise<void> {
  const { modal, close } = overlayModal('picker-modal')

  const h = document.createElement('h2')
  h.textContent = 'Git stashes'
  const search = makeSearchInput('Search stashes…', () => renderList())
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(h, search, list)

  // Run a git command in the pane's own terminal so its output is visible.
  const runInPane = (cmd: string): void => {
    selectPane(paneId)
    window.crafterm.input(paneId, cmd + '\r')
  }

  let allStashes: { ref: string; description: string }[] = []
  const reload = async (): Promise<void> => {
    allStashes = await window.crafterm.gitStashList(paneId)
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
      const row = document.createElement('div')
      row.className = 'pick-row stash-row'
      const main = document.createElement('div')
      main.className = 'claude-main'
      const title = document.createElement('span')
      title.className = 'claude-title'
      title.textContent = s.description || s.ref
      const sub = document.createElement('span')
      sub.className = 'claude-sub'
      sub.textContent = s.ref
      main.append(title, sub)
      const actions = document.createElement('div')
      actions.className = 'stash-actions'
      const applyBtn = document.createElement('button')
      applyBtn.className = 'settings-inline-btn'
      applyBtn.textContent = 'Apply'
      applyBtn.title = 'Restore this stash (keeps it in the list)'
      applyBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        runInPane(`git stash apply '${s.ref}'`)
        close()
      })
      const dropBtn = document.createElement('button')
      dropBtn.className = 'improve-cancel'
      dropBtn.textContent = 'Drop'
      dropBtn.title = 'Delete this stash'
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
      actions.append(applyBtn, dropBtn)
      row.append(main, actions)
      list.appendChild(row)
    })
  }

  void reload()
}

// ---- Branch checkout: search the pane's repo branches, checkout the chosen one ----

export async function showBranchCheckout(paneId: string): Promise<void> {
  const branches = await window.crafterm.gitBranches(paneId)
  const { modal, close } = overlayModal('picker-modal')

  const h = document.createElement('h2')
  h.textContent = 'Branch'
  modal.append(h)

  // Quick chips: fire common git commands into the pane without leaving the modal.
  const actions = document.createElement('div')
  actions.className = 'git-quick-actions'
  const runInPane = (cmd: string): void => {
    selectPane(paneId)
    window.crafterm.input(paneId, cmd + '\r')
    close()
  }
  const addChip = (label: string, cmd: string, title: string): void => {
    const b = document.createElement('button')
    b.className = 'git-quick-chip'
    b.type = 'button'
    b.textContent = label
    b.title = title
    b.addEventListener('click', () => runInPane(cmd))
    actions.appendChild(b)
  }
  addChip('Fetch', 'git fetch --all --prune', 'git fetch --all --prune')
  addChip('Pull', 'git pull', 'git pull')
  addChip('Status', 'git status', 'git status')
  modal.append(actions)

  const sub = document.createElement('div')
  sub.className = 'git-quick-sub'
  sub.textContent = 'Checkout'
  modal.append(sub)

  const input = document.createElement('input')
  input.className = 'picker-input'
  input.type = 'text'
  input.placeholder = 'Search branches…  (↑↓ move · ⏎ checkout)'
  input.spellcheck = false
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
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
    window.crafterm.input(paneId, `git checkout '${branch}'\r`)
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
      const row = document.createElement('div')
      row.className = 'pick-row' + (i === sel ? ' active' : '')
      const name = document.createElement('span')
      name.className = 'picker-name'
      name.textContent = b
      row.appendChild(name)
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

// ---------------------------------------------------------------------------
// Update Crafterm (self-update): save state, rebuild from the source repo, and
// relaunch. The build runs in the main process (progress shown here); only the
// quit → swap → relaunch step is detached so it survives the app quitting.
// ---------------------------------------------------------------------------

type UpdateStep = { done: () => void; fail: (msg: string) => void }

export async function runUpdate(): Promise<void> {
  // 1. Resolve the source repo (ask once on first use, then remember it).
  let repo = settings.repoPath.trim()
  if (!repo) {
    const picked = await pickFolderPath()
    if (!picked) return
    repo = picked
    settings.repoPath = repo
    saveSoon()
  }

  // 2. Confirm — this restarts the app.
  const ok = await promptConfirm({
    title: 'Update Crafterm',
    message:
      'Rebuild Crafterm from source and restart? Your layout, working directories, and Claude sessions are restored automatically; running processes restart.',
    confirmText: 'Update & Restart'
  })
  if (!ok) return

  // 3. Progress modal.
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal update-modal'
  modal.insertAdjacentHTML('beforeend', '<h2>Updating Crafterm</h2>')
  const list = document.createElement('div')
  list.className = 'update-steps'
  modal.appendChild(list)
  overlay.appendChild(modal)
  document.body.appendChild(overlay)

  const step = (label: string): UpdateStep => {
    const row = document.createElement('div')
    row.className = 'update-step active'
    row.innerHTML = `<span class="update-dot"></span><span class="update-label"></span>`
    row.querySelector<HTMLElement>('.update-label')!.textContent = label
    list.appendChild(row)
    return {
      done: () => {
        row.classList.remove('active')
        row.classList.add('done')
      },
      fail: (msg) => {
        row.classList.remove('active')
        row.classList.add('failed')
        const e = document.createElement('div')
        e.className = 'update-error'
        e.textContent = msg
        modal.appendChild(e)
        const btn = document.createElement('button')
        btn.className = 'primary'
        btn.style.marginTop = '12px'
        btn.textContent = 'Close'
        btn.addEventListener('click', () => overlay.remove())
        modal.appendChild(btn)
      }
    }
  }

  // Save sessions (flush synchronously) so the relaunch restores them.
  const s1 = step('Saving sessions…')
  persistNow()
  s1.done()

  // Build the new bundle (runs in main; can take a while).
  const s2 = step('Building new bundle…')
  const cmd = settings.updateCommand.trim() || 'run-crafterm-deploy'
  const res = await window.crafterm.deployBuild(repo, cmd)
  if (!res.ok) {
    s2.fail(res.error || 'Build failed. See ~/.crafterm/deploy.log for details.')
    return
  }
  s2.done()

  // Close every session and wait for each PTY to actually exit BEFORE quitting.
  // Killing PTYs during the quit teardown races node-pty's exit callbacks and
  // crashes the process; draining here, while the app is still healthy, avoids
  // that. Children that ignore SIGHUP are force-killed after 5s in the main
  // process, so this resolves promptly.
  const s3 = step('Closing sessions…')
  await window.crafterm.deployKillAllPtys()
  s3.done()

  // Swap the installed app + relaunch (detached); the app quits right after.
  step('Restarting…')
  await window.crafterm.deploySwap(repo)
}

// ---- Spotlight: global search across every navigable surface ---------------
// Cmd+J. Fuzzy-substring match across projects, features, open panes, notebook
// docs, bookmarks, plan files, and accounts. Hitting Enter dispatches to the
// right opener for the picked entry's source.
export interface GsEntry {
  source:
    | 'project'
    | 'feature'
    | 'pane'
    | 'notebook'
    | 'bookmark'
    | 'plan'
    | 'account'
    | 'action'
    | 'pane-action'
  label: string
  detail?: string
  open: () => void
}

export async function buildGlobalSearchIndex(): Promise<GsEntry[]> {
  const out: GsEntry[] = []
  // projects + their features
  for (const p of flattenProjects(state.tree)) {
    out.push({
      source: 'project',
      label: p.name,
      detail: p.path,
      open: () => void splitProjectRight(p)
    })
    if (p.features) {
      for (const f of p.features) {
        out.push({
          source: 'feature',
          label: f.name,
          detail: p.name,
          open: () => void splitProjectRight(p)
        })
      }
    }
  }
  // open panes
  for (const pane of panes.values()) {
    const tab = allTabs(state.tree).find((t) => panesInLayout(t.root).includes(pane.id))
    out.push({
      source: 'pane',
      label: pane.title || 'terminal',
      detail: [tab?.title, pane.cwd, pane.branch].filter(Boolean).join(' · '),
      open: () => selectPane(pane.id)
    })
  }
  // bookmarks
  for (const bm of settings.bookmarks) {
    out.push({
      source: 'bookmark',
      label: bm.title,
      detail: bm.type === 'link' ? bm.content : bm.tags.join(', '),
      open: () => void openLink(bm.content)
    })
  }
  // accounts
  for (const a of settings.accounts) {
    out.push({
      source: 'account',
      label: a.label,
      detail: [a.kind === 'secret' ? 'secret' : a.service, a.login].filter(Boolean).join(' · '),
      // No deep-link into Accounts mode form yet — surface by switching to the
      // sidebar tab so the user can find it.
      open: () => document.getElementById('tab-accounts')?.dispatchEvent(new MouseEvent('click'))
    })
  }
  // plan files (one per pane, deduped by path)
  const seenPlans = new Set<string>()
  for (const pane of panes.values()) {
    for (const plan of pane.plans) {
      if (seenPlans.has(plan.path)) continue
      seenPlans.add(plan.path)
      out.push({
        source: 'plan',
        label: plan.name.replace(/\.(md|mdx|mdc)$/i, ''),
        detail: plan.path,
        open: () => openMarkdownFile(plan.path)
      })
    }
  }
  // notebook tree (flat)
  try {
    const tree = await window.crafterm.nbTree()
    const walk = (nodes: typeof tree, parent: string): void => {
      for (const n of nodes) {
        const path = parent ? `${parent}/${n.name}` : n.name
        if (n.kind === 'file') {
          out.push({
            source: 'notebook',
            label: n.name.replace(/\.(md|mdx|mdc)$/i, ''),
            detail: parent,
            open: () => openNote(n.path)
          })
        }
        if (n.children) walk(n.children, path)
      }
    }
    walk(tree, '')
  } catch {
    // ignore — notebook IPC may fail in dev
  }
  // sidebar ⋯ action menu (global actions)
  for (const a of actionMenuSearchEntries()) {
    out.push({ source: 'action', label: a.label, open: a.run })
  }
  // active pane's ⋯ menu (pane-scoped actions, run commands, SSH, background)
  const apid = state.activePaneId
  if (apid && panes.has(apid)) {
    const paneTitle = panes.get(apid)?.title || 'terminal'
    for (const e of buildPaneMenu(apid)) {
      if (e.kind === 'label') continue
      out.push({ source: 'pane-action', label: e.label, detail: paneTitle, open: e.run })
    }
  }
  return out
}

export const SOURCE_LABEL: Record<GsEntry['source'], string> = {
  project: 'PROJECT',
  feature: 'FEATURE',
  pane: 'PANE',
  notebook: 'NOTE',
  bookmark: 'BOOKMARK',
  plan: 'PLAN',
  account: 'ACCOUNT',
  action: 'ACTION',
  'pane-action': 'PANE ACTION'
}

export async function showGlobalSearch(): Promise<void> {
  const entries = await buildGlobalSearchIndex()
  const { modal, close } = overlayModal('picker-modal')
  const h = document.createElement('h2')
  h.textContent = 'Search Crafterm'
  modal.appendChild(h)
  const input = document.createElement('input')
  input.className = 'picker-input'
  input.type = 'text'
  input.placeholder = 'Search projects, panes, actions, bookmarks, notes, plans…'
  input.spellcheck = false
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(input, list)

  let sel = 0
  const filtered = (): GsEntry[] => {
    const q = input.value.trim().toLowerCase()
    if (!q) return entries.slice(0, 100)
    return entries
      .filter((e) => `${e.label} ${e.detail ?? ''} ${e.source}`.toLowerCase().includes(q))
      .slice(0, 100)
  }

  const choose = (e: GsEntry): void => {
    close()
    e.open()
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
    items.forEach((e, i) => {
      const row = document.createElement('button')
      row.className = 'pick-row gs-row' + (i === sel ? ' active' : '')
      const badge = document.createElement('span')
      badge.className = 'gs-badge gs-' + e.source
      badge.textContent = SOURCE_LABEL[e.source]
      const lab = document.createElement('span')
      lab.className = 'gs-label'
      lab.textContent = e.label
      row.append(badge, lab)
      if (e.detail) {
        const sub = document.createElement('span')
        sub.className = 'gs-detail'
        sub.textContent = e.detail
        row.append(sub)
      }
      row.addEventListener('click', () => choose(e))
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
      if (items[sel]) choose(items[sel])
    }
  })

  render()
  setTimeout(() => input.focus(), 0)
}
