import './settings.css'
import { UITexts } from '@texts'
import { settingsCleanups } from './shared'
import { SETTINGS_CATEGORIES } from './settings.state'
import { createSettingsModal } from './components/settings-modal'
import { createSettingsBody, makeShow } from './components/settings-body'
import { createSettingsNav } from './components/settings-nav'
import { loadSettingsPanels } from './components/panel-loader'
import { createSaveChip } from './components/save-chip'

// macOS-style settings: category list on the left, the selected panel on the right.
export function openSettings(): void {
  settingsCleanups.length = 0
  const { modal, mount, onClose } = createSettingsModal()
  onClose(() => settingsCleanups.forEach((fn) => fn()))

  const categories = SETTINGS_CATEGORIES
  const { body, panels } = createSettingsBody(categories)
  const { nav, navButtons } = createSettingsNav(categories, (cat) => show(cat))
  const show = makeShow(categories, panels, navButtons)

  modal.append(nav, body)

  loadSettingsPanels(panels)

  const { footer, cleanup } = createSaveChip()
  modal.appendChild(footer)
  settingsCleanups.push(cleanup)

  show(UITexts.Settings.tabs.appearance)
  mount()
}
