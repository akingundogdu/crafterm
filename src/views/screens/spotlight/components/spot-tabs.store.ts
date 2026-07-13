import { UITexts } from '@texts'
import type { SpotTab } from './spot-tabs.types'

export const TABS: SpotTab[] = [
  { id: 'all', label: UITexts.Spotlight.tabs.all },
  { id: 'files', label: UITexts.Spotlight.tabs.files },
  { id: 'commands', label: UITexts.Spotlight.tabs.commands },
  { id: 'claude', label: UITexts.Spotlight.tabs.claude },
  { id: 'terminals', label: UITexts.Spotlight.tabs.terminals },
  { id: 'shortcuts', label: UITexts.Spotlight.tabs.shortcuts },
  { id: 'plans', label: UITexts.Spotlight.tabs.plans },
  { id: 'bookmarks', label: UITexts.Spotlight.tabs.bookmarks },
  { id: 'apps', label: UITexts.Spotlight.tabs.apps },
  { id: 'tasks', label: UITexts.Spotlight.tabs.tasks },
  { id: 'projects', label: UITexts.Spotlight.tabs.projects },
  { id: 'notebooks', label: UITexts.Spotlight.tabs.notebooks },
  { id: 'accounts', label: UITexts.Spotlight.tabs.accounts }
]

// tab id -> editable keybinding action id (drives the per-tab shortcut + label).
export const TAB_ACTION: Record<string, string> = {
  all: 'spotlight',
  files: 'spotlight-files',
  commands: 'spotlight-commands',
  claude: 'spotlight-claude',
  terminals: 'spotlight-terminals',
  shortcuts: 'spotlight-shortcuts',
  plans: 'spotlight-plans',
  bookmarks: 'spotlight-bookmarks',
  apps: 'spotlight-apps',
  tasks: 'spotlight-tasks',
  projects: 'spotlight-projects',
  notebooks: 'spotlight-notebooks',
  accounts: 'spotlight-accounts'
}

export function spotTabClass(active: boolean): string {
  return 'spot-tab' + (active ? ' active' : '')
}

// Click handler for a tab: selects it.
export function makeTabSelect(onSelect: (tabId: string) => void, tabId: string): () => void {
  return () => onSelect(tabId)
}
