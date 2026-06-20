import './status-bar.css'
import { settings } from '@ui/state/state'
import { appService } from '@services'
import { fmtResetTime, usageErrorShort, usageErrorLong } from '@services/domain/usage'
import { shortModel } from '@ui/screens/notifications/notif-format'
import { fetchRealUsage, evaluateUsageThresholds } from '@ui/screens/notifications/notifications.state'
import { runUpdate } from '@ui/screens/pickers/update/update'
import { UITexts } from '@texts'
import type { RealUsage, UsageWindow } from '@ui/screens/notifications/notifications.types'
import type { StatusBarDeps } from './status-bar.types'

// SVG namespace can't be built by the HTML-only JSX runtime, so panel-toggle and
// refresh icons are inline string constants applied via `innerHTML`.
const SIDEBAR_TOGGLE_SVG =
  '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">' +
  '<rect x="1.6" y="2.6" width="12.8" height="10.8" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.4" />' +
  '<line x1="6" y1="2.6" x2="6" y2="13.4" stroke="currentColor" stroke-width="1.4" /></svg>'
const NOTIF_TOGGLE_SVG =
  '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">' +
  '<rect x="1.6" y="2.6" width="12.8" height="10.8" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.4" />' +
  '<line x1="10" y1="2.6" x2="10" y2="13.4" stroke="currentColor" stroke-width="1.4" /></svg>'
const USAGE_REFRESH_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">' +
  '<path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />' +
  '<path d="M13.7 2.2v3.2h-3.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>'

// Build the status bar's DOM into `#content-statusbar` and wire its chips +
// toggles. Mounted by the main-window bootstrap into the content column.
export function mountStatusBar(contentCol: HTMLElement, deps: StatusBarDeps): void {
  const notifBadge = (<span id="notif-badge" />) as HTMLSpanElement
  const bar = (
    <div id="content-statusbar">
      <button
        id="statusbar-sidebar-toggle"
        title="Toggle sidebar (⌘B)"
        aria-label="Toggle sidebar"
        innerHTML={SIDEBAR_TOGGLE_SVG}
        onClick={deps.onToggleSidebar}
      />
      <div id="content-statusbar-drag" />
      <button id="statusbar-version" title="App version" aria-label="App version">
        <span class="version-dot" />
        <span class="version-text">v—</span>
      </button>
      <button id="statusbar-claude-usage" title="Claude usage" aria-label="Claude usage">
        <span class="usage-icon">⌬</span>
        <span class="usage-text">—</span>
      </button>
      <button
        id="statusbar-usage-refresh"
        title="Refresh usage"
        aria-label="Refresh usage"
        innerHTML={USAGE_REFRESH_SVG}
      />
      <button
        id="statusbar-notif-toggle"
        title="Toggle notifications (⌥⌘→)"
        aria-label="Toggle notifications"
        onClick={deps.onToggleNotif}
        innerHTML={NOTIF_TOGGLE_SVG}
      />
    </div>
  ) as HTMLDivElement
  // innerHTML on the notif toggle would clobber the badge, so append it after.
  bar.querySelector('#statusbar-notif-toggle')!.appendChild(notifBadge)
  contentCol.prepend(bar)

  initStatusbarUsage()
  initStatusbarVersion()
}

// Unread count on the notif toggle badge (shown while the panel is closed).
// Data lives in the notifications module; this only renders it.
export function updateNotifBadge(count: number): void {
  const badge = document.getElementById('notif-badge')
  if (!badge) return
  badge.textContent = count > 99 ? '99+' : String(count)
  badge.style.display = count > 0 ? 'flex' : 'none'
}

// Status bar Claude usage chip: polls hourly. Compact display shows the active
// model + this-week percentage; clicking opens a popover with full today / week /
// month progress bars (mirrors Claude's /usage TUI).
function initStatusbarUsage(): void {
  const chip = document.getElementById('statusbar-claude-usage')
  if (!chip) return
  const textEl = chip.querySelector('.usage-text') as HTMLElement | null
  const refreshBtn = document.getElementById('statusbar-usage-refresh')

  let lastUsage: RealUsage | null = null

  const refresh = async (force = false): Promise<void> => {
    refreshBtn?.classList.add('spinning')
    try {
      const u = await fetchRealUsage(force)
      lastUsage = u
      const week = u.sevenDay ? Math.round(u.sevenDay.utilization) : null
      const model = shortModel(u.modelName) || settings.claudePlanCaps.effort
      const parts: string[] = [model]
      if (u.error) parts.push(usageErrorShort(u.error))
      else if (week !== null) parts.push(`${week}% wk`)
      if (textEl) textEl.textContent = parts.join(' · ')
      chip.title = u.error ? usageErrorLong(u.error) : 'Click for session / week usage'
      evaluateUsageThresholds(u)
      const open = document.querySelector('.usage-popover')
      if (open) renderUsagePopover(open as HTMLElement, u)
    } catch {
      // ignore — chip keeps its last value
    } finally {
      refreshBtn?.classList.remove('spinning')
    }
  }
  void refresh()
  // Anthropic's limits move on the order of minutes/hours; poll hourly. Users
  // can force an immediate refresh with the button next to the chip.
  window.setInterval(refresh, 3_600_000)
  refreshBtn?.addEventListener('click', (e) => {
    e.stopPropagation()
    void refresh(true)
  })

  chip.addEventListener('click', (e) => {
    e.stopPropagation()
    const existing = document.querySelector('.usage-popover')
    if (existing) {
      existing.remove()
      return
    }
    const pop = (<div class="usage-popover" />) as HTMLDivElement
    document.body.append(pop)
    renderUsagePopover(pop, lastUsage)
    const rect = chip.getBoundingClientRect()
    pop.style.top = rect.bottom + 6 + 'px'
    pop.style.right = window.innerWidth - rect.right + 'px'
    const onDown = (ev: MouseEvent): void => {
      if (!pop.contains(ev.target as Node) && ev.target !== chip && !chip.contains(ev.target as Node)) {
        pop.remove()
        document.removeEventListener('mousedown', onDown, true)
      }
    }
    setTimeout(() => document.addEventListener('mousedown', onDown, true))
  })
}

// Status bar version chip: shows the installed app version (base + git commit
// count it was built from) and flags "redeploy needed" when the source repo has
// moved ahead of the running build — either new commits or uncommitted edits.
// Clicking runs the self-update (deploy) flow, or briefly confirms it's current.
function initStatusbarVersion(): void {
  const chip = document.getElementById('statusbar-version')
  if (!chip) return
  const textEl = chip.querySelector('.version-text') as HTMLElement | null
  let base = '' // base semver from package.json (e.g. "0.1.0")
  let built: { commit: string | null; commitCount: number | null } | null = null
  let counter: number | null = null // monotonic save count for the source repo
  let needsRedeploy = false

  // The running build is stale when the repo's HEAD differs from what this build
  // was packaged from, or the repo has uncommitted changes (code changed but not
  // yet deployed). Skipped when there's no build info (dev) or no source repo.
  const evaluate = async (): Promise<void> => {
    const repo = settings.repoPath.trim()
    if (!repo || !built || !built.commit) {
      needsRedeploy = false
      chip.classList.remove('has-update')
      chip.title = base ? UITexts.Notifications.deployHint(base) : UITexts.Notifications.appName
      return
    }
    const repoGit = await appService.repoGit(repo)
    needsRedeploy = !!repoGit && (repoGit.commit !== built.commit || repoGit.dirty)
    chip.classList.toggle('has-update', needsRedeploy)
    if (needsRedeploy && repoGit) {
      const reason = repoGit.dirty ? 'uncommitted changes' : 'new commits'
      chip.title =
        `Redeploy needed — repo is ahead (${reason}).\n` +
        `Running build +${built.commitCount ?? '?'} → repo +${repoGit.commitCount}.\n` +
        `Click to rebuild & restart.`
    } else {
      chip.title = `Crafterm v${base}+${counter ?? built.commitCount ?? '?'} (up to date) · click to check`
    }
  }

  const refresh = async (): Promise<void> => {
    try {
      base = (await appService.version()) || ''
      built = await appService.buildInfo()
      const repo = settings.repoPath.trim()
      // The displayed "+N" is the live save counter (ticks up as code changes);
      // fall back to the built-from commit count when no source repo is set.
      counter = repo ? await appService.buildCounter(repo) : null
      if (textEl) {
        const n = counter ?? built?.commitCount ?? null
        const suffix = n != null ? `+${n}` : ''
        textEl.textContent = base ? `v${base}${suffix}` : 'v—'
      }
      await evaluate()
    } catch {
      // ignore — chip keeps its last value
    }
  }

  chip.addEventListener('click', async () => {
    await evaluate()
    // Source repo behind the running build (or none set yet): run the deploy flow.
    if (needsRedeploy || !settings.repoPath.trim()) {
      void runUpdate()
      return
    }
    // Up to date: flash a brief confirmation, then restore the version label.
    if (textEl) {
      const prev = textEl.textContent
      textEl.textContent = UITexts.Notifications.upToDate
      window.setTimeout(() => {
        if (textEl.textContent === UITexts.Notifications.upToDate) textEl.textContent = prev
      }, 1600)
    }
  })

  void refresh()
  // Re-read the counter and redeploy state periodically and on focus so saves
  // surface in the label without a manual click.
  window.setInterval(() => void refresh(), 20_000)
  window.addEventListener('focus', () => void refresh())
}

function renderUsagePopover(pop: HTMLElement, u: RealUsage | null): void {
  pop.replaceChildren()
  if (!u) {
    pop.insertAdjacentHTML('beforeend', '<div class="usage-empty">Loading…</div>')
    return
  }

  const model = shortModel(u.modelName) || UITexts.Notifications.claudeUsageFallback
  const head = (
    <div
      class="usage-head"
      innerHTML={
        `<div class="usage-title">${model}</div>` +
        `<div class="usage-sub">Official limits · ${fmtResetTime(u.fetchedAt).replace(/^Today /, 'updated ')}</div>`
      }
    />
  ) as HTMLDivElement
  pop.appendChild(head)

  if (u.error) {
    const err = (<div class="usage-empty">{usageErrorLong(u.error)}</div>) as HTMLDivElement
    pop.appendChild(err)
  }

  const bar = (label: string, win: UsageWindow | null): HTMLElement | null => {
    if (!win) return null
    const pct = Math.min(100, Math.round(win.utilization))
    return (
      <div
        class="usage-bar-wrap"
        innerHTML={
          `<div class="usage-bar-head"><b>${label}</b><span class="usage-pct">${pct}% used</span></div>` +
          `<div class="usage-bar"><div class="usage-bar-fill" style="width:${pct}%"></div></div>` +
          (win.resetsAt > 0 ? `<div class="usage-bar-foot">resets ${fmtResetTime(win.resetsAt)}</div>` : '')
        }
      />
    ) as HTMLDivElement
  }
  const session = bar(UITexts.Notifications.bars.session, u.fiveHour)
  const week = bar(UITexts.Notifications.bars.week, u.sevenDay)
  const sonnet = bar(UITexts.Notifications.bars.weekSonnet, u.sevenDaySonnet)
  if (session) pop.appendChild(session)
  if (week) pop.appendChild(week)
  if (sonnet) pop.appendChild(sonnet)

  const foot = (
    <div class="usage-foot">
      <button
        class="usage-edit"
        onClick={() => {
          pop.remove()
          document.getElementById('settings-btn')?.dispatchEvent(new MouseEvent('click'))
        }}
      >
        Token source in Settings
      </button>
    </div>
  ) as HTMLDivElement
  pop.appendChild(foot)
}
