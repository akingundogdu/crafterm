import { el } from '@views/lib/dom'
import { settings } from '@views/state/spine'
import { UITexts } from '@texts'

interface RecencyToggleProps {
  panel: HTMLElement
  makeToggle: (cb: HTMLInputElement) => () => void
}

// Sidebar "group by recency" toggle.
export function buildRecencyToggle(props: RecencyToggleProps): void {
  const { panel, makeToggle } = props
  const recCb = el('input', { type: 'checkbox' })
  recCb.checked = !!settings.sidebar.groupByRecency
  recCb.addEventListener('change', makeToggle(recCb))
  panel.appendChild(el('label', { class: 'checkbox-row' }, recCb, UITexts.Settings.sidebar.groupByRecency))
}
