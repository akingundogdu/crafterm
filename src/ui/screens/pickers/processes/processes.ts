import { collectBackgroundProcesses, killProcess, openProcessView } from '../../../services/bgproc'
import type { CollectedProcess } from '../../../services/bgproc'
import { iosService } from '@services'
import { overlayModal, makeSearchInput } from '../shared'

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
    await iosService.worktreeStop(c.proc.cwd, c.project?.iosConfig)
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
