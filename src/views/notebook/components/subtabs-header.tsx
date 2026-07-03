import { Component } from '@geajs/core'
import type { NbSubTab } from '../notebook.types'

// The Notes/Plans/Daily/Meeting sub-tab bar. gea Component: the active tab and the
// switch callback are injected so this module holds no notebook state. Static (no
// store), so the caller may insert the returned root into its own container.

const TABS: { key: NbSubTab; label: string }[] = [
  { key: 'notes', label: 'Notes' },
  { key: 'plans', label: 'Plans' },
  { key: 'daily', label: 'Daily Plan' },
  { key: 'meeting', label: 'Meeting Notes' }
]

class SubtabsHeader extends Component {
  private readonly active: NbSubTab
  private readonly onSelect: (key: NbSubTab) => void

  // Data via the constructor into plain fields — a gea Component only populates
  // `this.props` when rendered from a parent template, not from a manual `new X()`.
  constructor(active: NbSubTab, onSelect: (key: NbSubTab) => void) {
    super()
    this.active = active
    this.onSelect = onSelect
  }

  template() {
    const active = this.active
    const onSelect = this.onSelect
    return (
      <div class="nb-subtabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            class={'notebook-mode-tab' + (active === t.key ? ' active' : '')}
            onClick={() => {
              if (active === t.key) return
              onSelect(t.key)
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    )
  }
}

export function buildSubtabsHeader(active: NbSubTab, onSelect: (key: NbSubTab) => void): HTMLElement {
  const host = document.createElement('div')
  new SubtabsHeader(active, onSelect).render(host)
  return host.firstElementChild as HTMLElement
}
