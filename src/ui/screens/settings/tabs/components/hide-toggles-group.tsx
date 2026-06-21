import { settings } from '@ui/state/state'
import { tabMeta } from '../../../sidebar/sidebar'

interface HideTogglesGroupProps {
  panel: HTMLElement
  strip: 'left' | 'right'
  title: string
  makeToggle: (strip: 'left' | 'right', tabId: string, cb: HTMLInputElement) => () => void
}

// One strip's per-tab visibility toggles (checked = visible) under a subhead.
export function buildHideTogglesGroup(props: HideTogglesGroupProps): void {
  const { panel, strip, title, makeToggle } = props
  panel.insertAdjacentHTML('beforeend', `<div class="settings-subhead">${title}</div>`)
  for (const t of tabMeta().filter((m) => m.strip === strip)) {
    const cb = (<input type="checkbox" />) as HTMLInputElement
    cb.checked = !settings.tabDisplay.hidden[strip].includes(t.id)
    cb.addEventListener('change', makeToggle(strip, t.id, cb))
    const row = (
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}>
        {cb}
        {' ' + t.label}
      </label>
    ) as HTMLLabelElement
    panel.appendChild(row)
  }
}
