import { createButton } from '@ui/components'
import { rangeTab } from './time-report.state'
import type { Range } from '@services/domain/time'

interface RangeChipsProps {
  host: HTMLDivElement
  active: Range
  onSelect: (r: Range) => void
}

// Renders the today/week/month/all chip row into `host`, marking the active range.
export function renderRangeChips({ host, active, onSelect }: RangeChipsProps): void {
  host.replaceChildren()
  ;(['today', 'week', 'month', 'all'] as Range[]).forEach((r) => {
    host.appendChild(
      createButton({
        text: rangeTab(r),
        className: 'time-report-chip' + (r === active ? ' active' : ''),
        onClick: () => onSelect(r)
      })
    )
  })
}
