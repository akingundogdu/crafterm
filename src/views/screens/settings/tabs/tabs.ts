import { UITexts } from '@texts'
import { makeTabDisplayChange, makeHideToggle } from './tabs.store'
import { buildDisplayModeSelect } from './components/display-mode-select'
import { buildHideTogglesGroup } from './components/hide-toggles-group'

export function buildTabsPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.tabsTab.heading}</h3>`)
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Controls the sidebar and right-panel tab strips. In icon-only mode, hover a tab to see its name and shortcut.</div>'
  )

  buildDisplayModeSelect({ panel, onChange: makeTabDisplayChange() })

  buildHideTogglesGroup({ panel, strip: 'left', title: UITexts.Settings.tabsTab.sidebarShow, makeToggle: makeHideToggle })
  buildHideTogglesGroup({ panel, strip: 'right', title: UITexts.Settings.tabsTab.rightPanelShow, makeToggle: makeHideToggle })
}
