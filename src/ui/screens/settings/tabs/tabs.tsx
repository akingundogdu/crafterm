import { settings } from '@ui/state/state'
import { UITexts } from '@texts'
import { tabMeta } from '../../sidebar/sidebar'
import { labeledSelect } from '../shared'
import { makeTabDisplayChange, makeHideToggle } from './tabs.state'

export function buildTabsPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.tabsTab.heading}</h3>`)
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Controls the sidebar and right-panel tab strips. In icon-only mode, hover a tab to see its name and shortcut.</div>'
  )

  labeledSelect(
    panel,
    UITexts.Settings.tabsTab.display,
    [
      ['icon', UITexts.Settings.tabsTab.iconOnly],
      ['text', UITexts.Settings.tabsTab.textOnly],
      ['both', UITexts.Settings.tabsTab.iconText]
    ],
    settings.tabDisplay.mode,
    makeTabDisplayChange()
  )

  const renderHideGroup = (strip: 'left' | 'right', title: string): void => {
    panel.insertAdjacentHTML('beforeend', `<div class="settings-subhead">${title}</div>`)
    for (const t of tabMeta().filter((m) => m.strip === strip)) {
      const cb = (<input type="checkbox" />) as HTMLInputElement
      cb.checked = !settings.tabDisplay.hidden[strip].includes(t.id)
      cb.addEventListener('change', makeHideToggle(strip, t.id, cb))
      const row = (
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}>
          {cb}
          {' ' + t.label}
        </label>
      ) as HTMLLabelElement
      panel.appendChild(row)
    }
  }
  renderHideGroup('left', UITexts.Settings.tabsTab.sidebarShow)
  renderHideGroup('right', UITexts.Settings.tabsTab.rightPanelShow)
}
