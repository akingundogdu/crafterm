import { collectBackgroundProcesses, killProcess, openProcessView } from '@services/bgproc'
import type { CollectedProcess } from '@services/bgproc'
import { iosService } from '@services'
import { overlayModal, makeSearchInput } from '../shared'
import { UITexts } from '@texts'

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

  modal.appendChild(<h2>{UITexts.Pickers.processes.heading}</h2>)

  const search = makeSearchInput('Search processes…', () => render())
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
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
      const main = (
        <div class="claude-main">
          <span class="claude-title">{c.proc.title}</span>
          <span class="claude-sub">
            {[c.proc.target?.name, c.proc.cwd].filter(Boolean).join(' · ')}
          </span>
        </div>
      )

      const badge = (
        <span class={'proc-status proc-status-' + c.proc.status}>
          {PROC_STATUS_LABEL[c.proc.status] ?? c.proc.status}
        </span>
      )

      const viewBtn = (
        <button
          class="wt-act"
          onClick={(e: MouseEvent) => {
            e.stopPropagation()
            void openProcessView(c.proc.stableId)
            close()
          }}
        >
          View
        </button>
      )
      const killBtn = (
        <button
          class="wt-act wt-remove"
          onClick={(e: MouseEvent) => {
            e.stopPropagation()
            killProcess(c.proc.stableId)
            render()
          }}
        >
          Kill
        </button>
      )

      const row = (
        <div class="pick-row wt-row">
          {main}
          {badge}
          {viewBtn}
          {killBtn}
        </div>
      )
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

  modal.appendChild(<h2>{UITexts.Pickers.processes.devicesHeading}</h2>)

  const search = makeSearchInput('Search devices…', () => render())
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
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

      list.appendChild(<div class="proc-group-header">{`${g.name} (${g.kind})`}</div>)

      items.forEach((c) => {
        const main = (
          <div class="claude-main">
            <span class="claude-title">{c.proc.title}</span>
            <span class="claude-sub">{c.proc.cwd}</span>
          </div>
        )

        const stopBtn = (
          <button
            class="wt-act wt-remove"
            onClick={(e: MouseEvent) => {
              e.stopPropagation()
              void stopApp(c)
            }}
          >
            Stop app
          </button>
        )

        const row = (
          <div class="pick-row wt-row">
            {main}
            {stopBtn}
          </div>
        )
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
