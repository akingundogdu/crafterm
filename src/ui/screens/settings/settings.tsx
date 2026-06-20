import './settings.css'
import { UITexts } from '@texts'
import { themes } from '@ui/themes/themes'
import {
  settings,
  state,
  requestSidebar,
  resolveTheme,
  applyBgColor,
  uid
} from '@ui/state/state'
import { persistence } from '@repositories/persistence.service'
import type { PaletteCommand, ProjectNode, Application, ActionMenuItem, IosDevConfig } from '@ui/types/types'
import { BUILTIN_ACTIONS } from '@ui/types/types'
import { flattenProjects, removeProject } from '@ui/catalog/catalog'
import { makeProject } from '@ui/tree/tree'
import { reconcileWorktrees, purgeWorktrees } from '@services/worktrees'
import { applyAppearance } from '@ui/pane/pane'
import { ALL_THEME_NAMES, applyTheme } from '../../editor/monaco-setup'
import { applyOrientation, applySidebarFont, applyTabDisplay, tabMeta } from '../sidebar/sidebar'
import { pickFolderPath } from '../pickers/folder/folder'
import { createOverlay } from '@ui/components'
import { makeCloseButton, promptForm, promptText } from '@ui/dialog/dialog'
import {
  KEYBINDINGS,
  effectiveCombo,
  comboLabel,
  comboFromEvent,
  setBinding,
  resetBinding,
  setRecording,
  isModifierKey
} from '@ui/keybindings/keybindings'
import { appService } from '@services'
import { paletteCommandRepo, accountRepo, actionMenuRepo, applicationRepo, iosConfigRepo } from '@repositories'
import { settingsCleanups, toHex6, buildSubTabs, labeledInput, labeledSelect } from './shared'
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

// Quick background presets (black default + a few dark tones); a custom color
// picker covers anything else.

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

  const categories = [
    UITexts.Settings.tabs.appearance,
    UITexts.Settings.tabs.theme,
    UITexts.Settings.tabs.sidebar,
    UITexts.Settings.tabs.tabs,
    UITexts.Settings.tabs.workspace,
    UITexts.Settings.tabs.projects,
    UITexts.Settings.tabs.commands,
    UITexts.Settings.tabs.reminders,
    UITexts.Settings.tabs.actionMenu,
    UITexts.Settings.tabs.shortcuts,
    UITexts.Settings.tabs.systemUpdate
  ] as const
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
    <button class="settings-inline-btn" onClick={() => persistence.flush()}>
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
  const formatTime = (ms: number): string => {
    const d = new Date(ms)
    const pad = (n: number): string => (n < 10 ? '0' + n : String(n))
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }
  const refreshChip = (): void => {
    if (persistence.status.pending) {
      chip.textContent = UITexts.Settings.save.saving
      chip.dataset.state = 'pending'
    } else if (persistence.status.lastSavedAt) {
      chip.textContent = UITexts.Settings.save.saved(formatTime(persistence.status.lastSavedAt))
      chip.dataset.state = 'saved'
    } else {
      chip.textContent = UITexts.Settings.save.noChanges
      chip.dataset.state = 'idle'
    }
  }
  refreshChip()
  const unsubscribe = persistence.subscribe(refreshChip)
  settingsCleanups.push(unsubscribe)

  show(UITexts.Settings.tabs.appearance)
  mount()
}
