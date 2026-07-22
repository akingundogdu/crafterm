// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import {
  createUsagePopover,
  renderUsagePopover
} from '@views/components/status-bar/components/usage-popover'
import type { RealUsage } from '@views/screens/notifications/notifications.types'

// Regression: the status-bar Claude usage popover must render one progress bar per
// available usage window, synchronously, through renderUsagePopover (the exact path
// the chip uses). This broke after the gea migration because the bar list was built
// with an empty array + `.push()`; gea's `.map()` transform only expands an array
// bound to a literal, so a push-built binding compiled to a dead comment anchor and
// no bars rendered.
function usageWith(windows: Partial<RealUsage>): RealUsage {
  return {
    fiveHour: null,
    sevenDay: null,
    sevenDaySonnet: null,
    modelName: 'Claude Opus 4.8',
    fetchedAt: Date.now(),
    ...windows
  }
}

describe('usage popover', () => {
  it('renders one progress bar per available window (synchronously)', () => {
    const u = usageWith({
      fiveHour: { utilization: 42, resetsAt: Date.now() + 3600_000 },
      sevenDay: { utilization: 71, resetsAt: Date.now() + 5 * 86400_000 },
      sevenDaySonnet: { utilization: 12, resetsAt: Date.now() + 5 * 86400_000 }
    })
    const pop = createUsagePopover()
    renderUsagePopover(pop, u)

    const bars = pop.querySelectorAll('.usage-bar-wrap')
    expect(bars.length).toBe(3)
    const fills = pop.querySelectorAll<HTMLElement>('.usage-bar-fill')
    expect(fills[0].style.width).toBe('42%')
    expect(fills[1].style.width).toBe('71%')
    expect(pop.querySelector('.usage-pct')?.textContent).toBe('42% used')
  })

  it('omits bars for windows that are absent', () => {
    const u = usageWith({ sevenDay: { utilization: 55, resetsAt: Date.now() + 86400_000 } })
    const pop = createUsagePopover()
    renderUsagePopover(pop, u)
    expect(pop.querySelectorAll('.usage-bar-wrap').length).toBe(1)
    expect(pop.querySelector<HTMLElement>('.usage-bar-fill')?.style.width).toBe('55%')
  })

  it('shows a loading state when no usage snapshot is available yet', () => {
    const pop = createUsagePopover()
    renderUsagePopover(pop, null)
    expect(pop.querySelector('.usage-empty')?.textContent).toContain('Loading')
    expect(pop.querySelectorAll('.usage-bar-wrap').length).toBe(0)
  })
})
