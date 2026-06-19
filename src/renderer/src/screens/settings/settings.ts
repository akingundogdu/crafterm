import './settings.css'
import { themes } from '../../themes'
import {
  settings,
  state,
  requestSidebar,
  resolveTheme,
  applyBgColor,
  uid
} from '../../state'
import { persistence } from '../../services/storage/persistence.service'
import type { PaletteCommand, ProjectNode, Application, ActionMenuItem, IosDevConfig } from '../../types'
import { BUILTIN_ACTIONS } from '../../types'
import { flattenProjects, removeProject } from '../../catalog'
import { makeProject } from '../../tree'
import { reconcileWorktrees, purgeWorktrees } from '../../services/worktrees'
import { applyAppearance } from '../../pane'
import { ALL_THEME_NAMES, applyTheme } from '../../editor/monaco-setup'
import { applyOrientation, applySidebarFont, applyTabDisplay, tabMeta } from '../sidebar/sidebar'
import { pickFolderPath } from '../pickers/folder/folder'
import { createOverlay } from '@crafterm/ui'
import { makeCloseButton, promptForm, promptText } from '../../dialog'
import {
  KEYBINDINGS,
  effectiveCombo,
  comboLabel,
  comboFromEvent,
  setBinding,
  resetBinding,
  setRecording,
  isModifierKey
} from '../../keybindings'
import { appService } from '../../services/ipc'
import { paletteCommandRepo, accountRepo, actionMenuRepo, applicationRepo, iosConfigRepo } from '../../services/storage/repositories'
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
  const modal = document.createElement('div')
  modal.className = 'modal settings-modal'
  overlay.appendChild(modal)
  modal.appendChild(makeCloseButton(closeSettings))

  const nav = document.createElement('div')
  nav.className = 'settings-nav'
  const body = document.createElement('div')
  body.className = 'settings-body'
  modal.append(nav, body)

  const categories = [
    'Appearance',
    'Theme',
    'Sidebar',
    'Tabs',
    'Workspace',
    'Projects',
    'Commands',
    'Reminders',
    'Action menu',
    'Shortcuts',
    'System update'
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
    const b = document.createElement('button')
    b.className = 'settings-nav-item'
    b.textContent = c
    b.addEventListener('click', () => show(c))
    nav.appendChild(b)
    navButtons[c] = b
    const p = document.createElement('div')
    p.className = 'settings-panel'
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
  const footer = document.createElement('div')
  footer.className = 'settings-save-footer'
  const chip = document.createElement('span')
  chip.className = 'settings-save-chip'
  const saveBtn = document.createElement('button')
  saveBtn.className = 'settings-inline-btn'
  saveBtn.textContent = 'Save now'
  saveBtn.addEventListener('click', () => persistence.flush())
  footer.append(chip, saveBtn)
  modal.appendChild(footer)
  const formatTime = (ms: number): string => {
    const d = new Date(ms)
    const pad = (n: number): string => (n < 10 ? '0' + n : String(n))
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }
  const refreshChip = (): void => {
    if (persistence.status.pending) {
      chip.textContent = 'Saving…'
      chip.dataset.state = 'pending'
    } else if (persistence.status.lastSavedAt) {
      chip.textContent = `Saved · ${formatTime(persistence.status.lastSavedAt)}`
      chip.dataset.state = 'saved'
    } else {
      chip.textContent = 'No changes yet'
      chip.dataset.state = 'idle'
    }
  }
  refreshChip()
  const unsubscribe = persistence.subscribe(refreshChip)
  settingsCleanups.push(unsubscribe)

  show('Appearance')
  mount()
}

