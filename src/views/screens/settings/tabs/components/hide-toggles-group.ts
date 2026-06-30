import { el } from '@views/lib/dom'
import { settings } from '@views/state/spine'
import { tabMeta } from '../../shell-apply'

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
    const cb = el('input', { type: 'checkbox' })
    cb.checked = !settings.tabDisplay.hidden[strip].includes(t.id)
    cb.addEventListener('change', makeToggle(strip, t.id, cb))
    const row = el('label', null, cb, ' ' + t.label)
    row.style.display = 'flex'
    row.style.alignItems = 'center'
    row.style.gap = '6px'
    row.style.padding = '2px 0'
    panel.appendChild(row)
  }
}
