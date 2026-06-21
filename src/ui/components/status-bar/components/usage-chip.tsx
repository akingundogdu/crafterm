import { settings } from '@ui/state/state'
import { usageErrorShort, usageErrorLong } from '@services/domain/usage'
import { shortModel } from '@ui/screens/notifications/notif-format'
import { fetchRealUsage, evaluateUsageThresholds } from '@ui/screens/notifications/notifications.state'
import type { RealUsage } from '@ui/screens/notifications/notifications.types'
import { renderUsagePopover } from './usage-popover'
import { USAGE_POLL_MS } from '../status-bar.state'

// Status bar Claude usage chip: polls hourly. Compact display shows the active
// model + this-week percentage; clicking opens a popover with full today / week /
// month progress bars (mirrors Claude's /usage TUI).
export function initStatusbarUsage(): void {
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
  window.setInterval(refresh, USAGE_POLL_MS)
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
