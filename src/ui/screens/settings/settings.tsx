import './settings.css'
import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'
import { createOverlay } from '@ui/components'
import { makeCloseButton } from '@ui/dialog/dialog'
import { settingsCleanups } from './shared'
import { buildTabsPanel } from './tabs/tabs'
import { buildRemindersPanel } from './tabs/reminders'
import { buildAppearancePanel, buildThemePanel } from './tabs/appearance'
import { buildShortcutsPanel } from './tabs/shortcuts'
import { buildWorkspacePanel } from './tabs/workspace'
import { buildSidebarPanel } from './tabs/sidebar-tab'
import { buildActionMenuPanel } from './tabs/action-menu'
import { buildSystemUpdatePanel } from './tabs/system-update'
import { buildProjectsPanel } from './tabs/projects'
import { buildCommandsPanel } from './tabs/commands'
import { SETTINGS_CATEGORIES, makeRefreshChip, flushSave } from './settings.state'

// macOS-style settings: category list on the left, the selected panel on the right.
export function openSettings(): void {
  settingsCleanups.length = 0
  const { overlay, mount, close: closeSettings, onClose } = createOverlay()
  onClose(() => settingsCleanups.forEach((fn) => fn()))
  const modal = (<div class="modal settings-modal" />) as HTMLDivElement
  overlay.appendChild(modal)
  modal.appendChild(makeCloseButton(closeSettings))

  const nav = (<div class="settings-nav" />) as HTMLDivElement
  const body = (<div class="settings-body" />) as HTMLDivElement
  modal.append(nav, body)

  const categories = SETTINGS_CATEGORIES
  const panels: Record<string, HTMLElement> = {}
  const navButtons: Record<string, HTMLButtonElement> = {}

  const show = (cat: string): void => {
    for (const c of categories) {
      panels[c].style.display = c === cat ? 'block' : 'none'
      navButtons[c].classList.toggle('active', c === cat)
    }
  }

  for (const c of categories) {
    const b = (
      <button class="settings-nav-item" onClick={() => show(c)}>
        {c}
      </button>
    ) as HTMLButtonElement
    nav.appendChild(b)
    navButtons[c] = b
    const p = (<div class="settings-panel" />) as HTMLDivElement
    panels[c] = p
    body.appendChild(p)
  }

  buildAppearancePanel(panels['Appearance'])
  buildThemePanel(panels['Theme'])
  buildSidebarPanel(panels['Sidebar'])
  buildTabsPanel(panels['Tabs'])
  buildWorkspacePanel(panels['Workspace'])
  buildProjectsPanel(panels['Projects'])
  buildCommandsPanel(panels['Commands'])
  buildRemindersPanel(panels['Reminders'])
  buildShortcutsPanel(panels['Shortcuts'])
  buildActionMenuPanel(panels['Action menu'])
  buildSystemUpdatePanel(panels['System update'])

  // Save status footer: shows Unsaved / Saving… / Saved HH:MM:SS + a manual flush.
  const chip = (<span class="settings-save-chip" />) as HTMLSpanElement
  const saveBtn = (
    <button class="settings-inline-btn" onClick={flushSave}>
      Save now
    </button>
  ) as HTMLButtonElement
  const footer = (
    <div class="settings-save-footer">
      {chip}
      {saveBtn}
    </div>
  ) as HTMLDivElement
  modal.appendChild(footer)

  const refreshChip = makeRefreshChip(chip)
  refreshChip()
  settingsCleanups.push(persistence.subscribe(refreshChip))

  show(UITexts.Settings.tabs.appearance)
  mount()
}
