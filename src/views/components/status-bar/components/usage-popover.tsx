import { Component } from '@geajs/core'
import { fmtResetTime, usageErrorLong } from '@services/domain/usage'
import { shortModel } from '@views/screens/notifications/notif-format'
import { UITexts } from '@texts'
import type { RealUsage, UsageWindow } from '@views/screens/notifications/notifications.types'

// Floating Claude usage popover (today / week / month progress bars; mirrors
// Claude's /usage TUI). The content is a gea Component built with JSX; the usage
// snapshot arrives via the constructor into a plain field (a manually mounted gea
// Component does not populate `this.props`). renderUsagePopover keeps its imperative
// signature so the usage-chip poller stays unchanged: it mounts the component into a
// throwaway host and transplants the built children into the caller's popover
// element, preserving the exact flat child structure.
class UsagePopoverContent extends Component {
  private readonly usage: RealUsage | null

  constructor(opts: { usage: RealUsage | null }) {
    super()
    this.usage = opts.usage
  }

  private openSettings = (e: MouseEvent): void => {
    ;(e.currentTarget as HTMLElement).closest('.usage-popover')?.remove()
    document.getElementById('settings-btn')?.dispatchEvent(new MouseEvent('click'))
  }

  template() {
    const u = this.usage
    if (!u) {
      return (
        <div>
          <div class="usage-empty">Loading…</div>
        </div>
      )
    }

    const model = shortModel(u.modelName) || UITexts.Notifications.claudeUsageFallback
    const sub = 'Official limits · ' + fmtResetTime(u.fetchedAt).replace(/^Today /, 'updated ')
    const bars: { label: string; win: UsageWindow }[] = []
    if (u.fiveHour) bars.push({ label: UITexts.Notifications.bars.session, win: u.fiveHour })
    if (u.sevenDay) bars.push({ label: UITexts.Notifications.bars.week, win: u.sevenDay })
    if (u.sevenDaySonnet) bars.push({ label: UITexts.Notifications.bars.weekSonnet, win: u.sevenDaySonnet })

    return (
      <div>
        <div class="usage-head">
          <div class="usage-title">{model}</div>
          <div class="usage-sub">{sub}</div>
        </div>
        {u.error && <div class="usage-empty">{usageErrorLong(u.error)}</div>}
        {bars.map((b) => {
          const pct = Math.min(100, Math.round(b.win.utilization))
          return (
            <div key={b.label} class="usage-bar-wrap">
              <div class="usage-bar-head">
                <b>{b.label}</b>
                <span class="usage-pct">{pct}% used</span>
              </div>
              <div class="usage-bar">
                <div class="usage-bar-fill" style={{ width: pct + '%' }} />
              </div>
              {b.win.resetsAt > 0 && <div class="usage-bar-foot">resets {fmtResetTime(b.win.resetsAt)}</div>}
            </div>
          )
        })}
        <div class="usage-foot">
          <button class="usage-edit" onClick={this.openSettings}>
            Token source in Settings
          </button>
        </div>
      </div>
    )
  }
}

// Create the empty `.usage-popover` host element the chip positions and appends.
// Provided here so the imperative usage-chip poller stays free of el()/createElement.
export function createUsagePopover(): HTMLElement {
  const pop = document.createElement('div')
  pop.className = 'usage-popover'
  return pop
}

// Fill an existing `.usage-popover` element with the current usage snapshot. Renders
// the gea content into a throwaway host, then transplants its children so the
// popover keeps its flat child structure and the caller's element reference stays valid.
export function renderUsagePopover(pop: HTMLElement, u: RealUsage | null): void {
  const host = document.createElement('div')
  new UsagePopoverContent({ usage: u }).render(host)
  const root = host.firstElementChild
  pop.replaceChildren(...(root ? Array.from(root.childNodes) : []))
}
