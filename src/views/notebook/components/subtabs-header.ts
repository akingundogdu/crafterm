import { el } from '@views/lib/dom'
import type { NbSubTab } from '../notebook.types'

// The Notes/Plans/Daily/Meeting sub-tab bar. Pure factory: the active tab and the
// switch callback are injected so this module holds no notebook state.

export function buildSubtabsHeader(active: NbSubTab, onSelect: (key: NbSubTab) => void): HTMLElement {
  const subtabs = el('div', { class: 'nb-subtabs' })
  const mk = (key: NbSubTab, label: string): void => {
    const b = el(
      'button',
      {
        class: 'notebook-mode-tab' + (active === key ? ' active' : ''),
        onClick: () => {
          if (active === key) return
          onSelect(key)
        }
      },
      label
    )
    subtabs.appendChild(b)
  }
  mk('notes', 'Notes')
  mk('plans', 'Plans')
  mk('daily', 'Daily Plan')
  mk('meeting', 'Meeting Notes')
  return subtabs
}
