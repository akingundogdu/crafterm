import { settings } from '@ui/state/state'
import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'
import { applyTabDisplay, tabMeta } from '../../sidebar/sidebar'
import { labeledSelect } from '../shared'

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
    (v) => {
      settings.tabDisplay.mode = v as 'icon' | 'text' | 'both'
      applyTabDisplay()
      persistence.save()
    }
  )

  const renderHideGroup = (strip: 'left' | 'right', title: string): void => {
    panel.insertAdjacentHTML('beforeend', `<div class="settings-subhead">${title}</div>`)
    for (const t of tabMeta().filter((m) => m.strip === strip)) {
      const cb = (<input type="checkbox" />) as HTMLInputElement
      cb.checked = !settings.tabDisplay.hidden[strip].includes(t.id)
      cb.addEventListener('change', () => {
        const list = settings.tabDisplay.hidden[strip]
        const idx = list.indexOf(t.id)
        if (cb.checked) {
          if (idx >= 0) list.splice(idx, 1)
        } else if (idx < 0) {
          list.push(t.id)
        }
        applyTabDisplay()
        persistence.save()
      })
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
