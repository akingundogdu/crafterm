import { settings } from '@views/state/spine'
import { usageErrorShort, usageErrorLong } from '@services/domain/usage'
import { shortModel } from '@views/screens/notifications/notif-format'
import { fetchRealUsage, evaluateUsageThresholds } from '@views/screens/notifications/notifications.store'
import type { RealUsage } from '@views/screens/notifications/notifications.types'
import { createUsagePopover, renderUsagePopover } from './usage-popover'
import { USAGE_POLL_MS, USAGE_FIRST_READ_MS } from '../status-bar.store'

// Status bar Claude usage chip: compact display shows the active model + this-week
// percentage; clicking opens a popover with full today / week / month progress bars
// (mirrors Claude's /usage TUI).
//
// The usage token lives in the macOS keychain, and reading it makes macOS prompt the
// user. So the chip starts HIDDEN and asks for nothing at launch: the first read runs
// minutes later, once the app has settled. If there is no credential to read — the
// prompt was denied, or Claude Code never stored one — the chip stays hidden and the
// polling stops, instead of nagging every hour (todomrkl5n2rb1).
export function initStatusbarUsage(): void {
  const chip = document.getElementById('statusbar-claude-usage')
  if (!chip) return
  const textEl = chip.querySelector('.usage-text') as HTMLElement | null
  const refreshBtn = document.getElementById('statusbar-usage-refresh')

  let lastUsage: RealUsage | null = null
  let pollTimer: number | null = null

  const setVisible = (visible: boolean): void => {
    chip.style.display = visible ? '' : 'none'
    if (refreshBtn) refreshBtn.style.display = visible ? '' : 'none'
  }
  const stopPolling = (): void => {
    if (pollTimer !== null) window.clearInterval(pollTimer)
    pollTimer = null
  }
  setVisible(false)

  const refresh = async (force = false): Promise<void> => {
    refreshBtn?.classList.add('spinning')
    try {
      const u = await fetchRealUsage(force)
      lastUsage = u
      // No credential (denied prompt / Claude Code never stored one): there is
      // nothing to show and nothing to gain from asking again.
      if (u.error === 'no-token') {
        setVisible(false)
        stopPolling()
        return
      }
      setVisible(true)
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
  // Anthropic's limits move on the order of minutes/hours; poll hourly after the
  // delayed first read. Users can force an immediate refresh with the button next to
  // the chip.
  window.setTimeout(() => {
    void refresh()
    pollTimer = window.setInterval(refresh, USAGE_POLL_MS)
  }, USAGE_FIRST_READ_MS)
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
    const pop = createUsagePopover()
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
