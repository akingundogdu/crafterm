// Spotlight tab bar: the WebStorm-style `.spot-tabs` row. Pure DOM — the active
// tab and per-tab shortcut label are injected, so the component carries no
// keybinding/state imports and renders in isolation under happy-dom.

export interface SpotTab {
  id: string
  label: string
}

export const TABS: SpotTab[] = [
  { id: 'all', label: 'All' },
  { id: 'files', label: 'Files' },
  { id: 'commands', label: 'Commands' },
  { id: 'claude', label: 'Claude' },
  { id: 'terminals', label: 'Terminals' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'plans', label: 'Plans' },
  { id: 'bookmarks', label: 'Bookmarks' },
  { id: 'apps', label: 'Apps' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'projects', label: 'Projects' },
  { id: 'notebooks', label: 'Notebooks' },
  { id: 'accounts', label: 'Accounts' }
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

export interface SpotTabsHandle {
  el: HTMLDivElement
  render: () => void
}

export function createSpotTabs(opts: {
  getActive: () => string
  comboFor: (tabId: string) => string | null
  onSelect: (tabId: string) => void
}): SpotTabsHandle {
  const el = document.createElement('div')
  el.className = 'spot-tabs'

  const render = (): void => {
    el.replaceChildren()
    for (const t of TABS) {
      const btn = document.createElement('button')
      btn.className = 'spot-tab' + (t.id === opts.getActive() ? ' active' : '')
      const name = document.createElement('span')
      name.className = 'spot-tab-name'
      name.textContent = t.label
      btn.appendChild(name)
      const combo = opts.comboFor(t.id)
      if (combo) {
        const kbd = document.createElement('span')
        kbd.className = 'spot-tab-combo'
        kbd.textContent = combo
        btn.appendChild(kbd)
      }
      btn.addEventListener('click', () => opts.onSelect(t.id))
      el.appendChild(btn)
    }
  }

  return { el, render }
}
