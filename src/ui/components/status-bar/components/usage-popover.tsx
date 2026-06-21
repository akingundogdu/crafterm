import { fmtResetTime, usageErrorLong } from '@services/domain/usage'
import { shortModel } from '@ui/screens/notifications/notif-format'
import { UITexts } from '@texts'
import type { RealUsage, UsageWindow } from '@ui/screens/notifications/notifications.types'

export function renderUsagePopover(pop: HTMLElement, u: RealUsage | null): void {
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
