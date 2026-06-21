import { buildTabsPanel } from '../tabs/tabs'
import { buildRemindersPanel } from '../tabs/reminders'
import { buildAppearancePanel, buildThemePanel } from '../tabs/appearance'
import { buildShortcutsPanel } from '../tabs/shortcuts'
import { buildWorkspacePanel } from '../tabs/workspace'
import { buildSidebarPanel } from '../tabs/sidebar-tab'
import { buildActionMenuPanel } from '../tabs/action-menu'
import { buildSystemUpdatePanel } from '../tabs/system-update'
import { buildProjectsPanel } from '../tabs/projects'
import { buildCommandsPanel } from '../tabs/commands'

// Wires each buildXxxPanel to its category container. The literal English keys
// match SETTINGS_CATEGORIES (and the panel-lookup keys in the view).
export function loadSettingsPanels(panels: Record<string, HTMLElement>): void {
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
}
