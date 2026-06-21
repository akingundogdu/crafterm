import { settings } from '@ui/state/state'
import { UITexts } from '@texts'

interface RecencyToggleProps {
  panel: HTMLElement
  makeToggle: (cb: HTMLInputElement) => () => void
}

// Sidebar "group by recency" toggle.
export function buildRecencyToggle(props: RecencyToggleProps): void {
  const { panel, makeToggle } = props
  const recCb = (<input type="checkbox" />) as HTMLInputElement
  recCb.checked = !!settings.sidebar.groupByRecency
  // makeToggle(recCb) needs the element itself, unavailable until after creation.
  recCb.addEventListener('change', makeToggle(recCb))
  const recRow = (
    <label class="checkbox-row">
      {recCb}
      {UITexts.Settings.sidebar.groupByRecency}
    </label>
  ) as HTMLLabelElement
  panel.appendChild(recRow)
}
