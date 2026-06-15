import { settings, panes, state, hooks } from './state'
import {
  overlayModal,
  makeSearchInput,
  buildGlobalSearchIndex,
  loadZshCommands,
  showRunApp,
  SOURCE_LABEL,
  type GsEntry
} from './pickers'
import {
  openMarkdownFile,
  selectPane,
  openCodeEditor,
  openProject,
  splitProjectRight,
  newTab,
  newClaudeTab
} from './commands'
import { flattenProjects } from './catalog'
import { allTabs, panesInLayout, ancestorFolders } from './tree'
import { KEYBINDINGS, effectiveCombo, comboFromEvent, comboLabel } from './keybindings'
import { showDailyPlanModal } from './dailyPlan'
import { openReminderForm } from './reminders'
import { paneStatus } from './pane'
import { terminalService, fsService, plansService, appService } from './services/ipc'

// Unified "Search Everywhere" spotlight: one cmd+P surface with WebStorm-style
// tabs (All, Files, Commands, Claude, Terminals, Shortcuts, Plans, Bookmarks,
// Apps, Tasks, Projects, Notebooks, Accounts). Tabs switch via Tab/Shift+Tab,
// a header click, or each tab's own configurable shortcut. Heavy sources (file
// scan, zsh, backlog) load lazily on first activation of their tab.

type SpotSource =
  | GsEntry['source']
  | 'file'
  | 'command'
  | 'claude'
  | 'shortcut'
  | 'app'
  | 'task'
  | 'reminder'
  | 'backlog'

interface SpotEntry {
  source: SpotSource
  label: string
  detail?: string
  run: () => void
  altRun?: () => void // ⌘⏎ alternate action (e.g. split instead of open)
}

interface SpotTab {
  id: string
  label: string
}

const TABS: SpotTab[] = [
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
const TAB_ACTION: Record<string, string> = {
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

const BADGE_LABEL: Record<SpotSource, string> = {
  ...SOURCE_LABEL,
  file: 'FILE',
  command: 'CMD',
  claude: 'CLAUDE',
  shortcut: 'KEY',
  app: 'APP',
  task: 'TASK',
  reminder: 'REMIND',
  backlog: 'BACKLOG'
}

const pretty = (p: string): string => p.replace(/^\/Users\/[^/]+/, '~')
const firstLine = (s: string): string => {
  const line = s.split('\n')[0].trim()
  return line.length > 120 ? line.slice(0, 117) + '…' : line
}

export async function showSpotlight(initialTab = 'all'): Promise<void> {
  const { overlay, modal, close } = overlayModal('picker-modal picker-modal-wide spotlight-modal')

  const input = makeSearchInput('Search everything…  (Tab switch · ↑↓ move · ⏎ open · ⌘⏎ split)', () => {
    sel = 0
    renderList()
  })
  const tabsBar = document.createElement('div')
  tabsBar.className = 'spot-tabs'
  const list = document.createElement('div')
  list.className = 'pick-list picker-list spot-list'
  modal.append(input, tabsBar, list)

  // The All tab aggregates the cheap, already-in-memory sources. buildGlobalSearchIndex
  // already covers projects/features, panes, bookmarks, accounts, plans, notebooks and
  // the action menus — load it once per open and reuse it for the dedicated tabs.
  const gsIndex = await buildGlobalSearchIndex()
  const mapGs = (entries: GsEntry[]): SpotEntry[] =>
    entries.map((e) => ({ source: e.source, label: e.label, detail: e.detail, run: e.open }))

  const claudeEntries = buildClaude()
  const shortcutEntries = buildShortcuts()
  const appEntries = buildApps()
  const projectEntries = buildProjects()
  const taskEntries = buildDailyTasks().concat(buildReminders())

  // Lazy caches for the heavier sources.
  let filesCache: SpotEntry[] | null = null
  let commandsCache: SpotEntry[] | null = null
  let plansCache: SpotEntry[] | null = null
  let backlogCache: SpotEntry[] | null = null

  async function entriesFor(tab: string): Promise<SpotEntry[]> {
    switch (tab) {
      case 'all':
        // Files & Commands stay in their own tabs (heavy); Claude panes already
        // appear here as PANE entries, so don't duplicate them. Projects come from
        // buildProjects (runs startup+command on open), not the gsIndex variant.
        return [
          ...mapGs(gsIndex.filter((e) => e.source !== 'project' && e.source !== 'feature')),
          ...projectEntries,
          ...shortcutEntries,
          ...appEntries,
          ...taskEntries
        ]
      case 'files':
        filesCache ??= await loadFiles()
        return filesCache
      case 'commands':
        commandsCache ??= await loadCommands()
        return commandsCache
      case 'claude':
        return claudeEntries
      case 'terminals':
        return mapGs(gsIndex.filter((e) => e.source === 'pane'))
      case 'shortcuts':
        return shortcutEntries
      case 'plans':
        plansCache ??= await loadPlans()
        return plansCache
      case 'bookmarks':
        return mapGs(gsIndex.filter((e) => e.source === 'bookmark'))
      case 'apps':
        return appEntries
      case 'tasks':
        backlogCache ??= await loadBacklog()
        return [...taskEntries, ...backlogCache]
      case 'projects':
        return projectEntries
      case 'notebooks':
        return mapGs(gsIndex.filter((e) => e.source === 'notebook'))
      case 'accounts':
        return mapGs(gsIndex.filter((e) => e.source === 'account'))
      default:
        return []
    }
  }

  let activeTab = TABS.some((t) => t.id === initialTab) ? initialTab : 'all'
  let current: SpotEntry[] = []
  let sel = 0
  let loadSeq = 0

  const comboToTab = new Map<string, string>()
  for (const [tab, actionId] of Object.entries(TAB_ACTION)) {
    const combo = effectiveCombo(actionId)
    if (combo) comboToTab.set(combo, tab)
  }

  const renderTabs = (): void => {
    tabsBar.replaceChildren()
    for (const t of TABS) {
      const btn = document.createElement('button')
      btn.className = 'spot-tab' + (t.id === activeTab ? ' active' : '')
      const name = document.createElement('span')
      name.className = 'spot-tab-name'
      name.textContent = t.label
      btn.appendChild(name)
      const combo = effectiveCombo(TAB_ACTION[t.id])
      if (combo) {
        const kbd = document.createElement('span')
        kbd.className = 'spot-tab-combo'
        kbd.textContent = comboLabel(combo)
        btn.appendChild(kbd)
      }
      btn.addEventListener('click', () => {
        void switchTab(t.id)
        input.focus()
      })
      tabsBar.appendChild(btn)
    }
  }

  const filtered = (): SpotEntry[] => {
    const q = input.value.trim().toLowerCase()
    const items = q
      ? current.filter((e) =>
          `${e.label} ${e.detail ?? ''} ${BADGE_LABEL[e.source]}`.toLowerCase().includes(q)
        )
      : current
    return items.slice(0, 200)
  }

  const choose = (e: SpotEntry): void => {
    close()
    e.run()
  }

  const highlight = (): void => {
    list.querySelectorAll<HTMLElement>('.spot-row').forEach((el, i) => {
      el.classList.toggle('active', i === sel)
    })
  }

  const renderList = (): void => {
    const items = filtered()
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    list.replaceChildren()
    if (!items.length) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    const showBadge = activeTab === 'all'
    items.forEach((e, i) => {
      const row = document.createElement('button')
      row.className = 'pick-row spot-row' + (i === sel ? ' active' : '')
      if (showBadge) {
        const badge = document.createElement('span')
        badge.className = 'gs-badge gs-' + e.source
        badge.textContent = BADGE_LABEL[e.source]
        row.append(badge)
      }
      const lab = document.createElement('span')
      lab.className = 'gs-label'
      lab.textContent = e.label
      row.append(lab)
      if (e.detail) {
        const sub = document.createElement('span')
        sub.className = 'gs-detail'
        sub.textContent = e.detail
        row.append(sub)
      }
      row.addEventListener('click', () => choose(e))
      row.addEventListener('mouseenter', () => {
        sel = i
        highlight()
      })
      list.appendChild(row)
    })
  }

  const switchTab = async (tab: string): Promise<void> => {
    if (!TABS.some((t) => t.id === tab)) return
    activeTab = tab
    sel = 0
    renderTabs()
    const seq = ++loadSeq
    current = []
    list.replaceChildren()
    list.insertAdjacentHTML('beforeend', '<div class="empty-hint">Loading…</div>')
    const entries = await entriesFor(tab)
    if (seq !== loadSeq) return // a newer switch superseded this load
    current = entries
    renderList()
  }

  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') {
      close()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const idx = TABS.findIndex((t) => t.id === activeTab)
      const next = (idx + (e.shiftKey ? -1 : 1) + TABS.length) % TABS.length
      void switchTab(TABS[next].id)
      return
    }
    // Per-tab shortcut while open: jump straight to the bound tab.
    if (e.metaKey) {
      const tab = comboToTab.get(comboFromEvent(e))
      if (tab) {
        e.preventDefault()
        void switchTab(tab)
        return
      }
    }
    const items = filtered()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      sel = Math.min(items.length - 1, sel + 1)
      highlight()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      sel = Math.max(0, sel - 1)
      highlight()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[sel]
      if (!item) return
      if (e.metaKey && item.altRun) {
        close()
        item.altRun()
      } else {
        choose(item)
      }
    }
  })
  overlay.addEventListener('mousedown', (ev) => {
    if (ev.target === overlay) close()
  })

  renderTabs()
  await switchTab(activeTab)
  setTimeout(() => input.focus(), 0)
}

// ---- Source builders ----

function buildClaude(): SpotEntry[] {
  const out: SpotEntry[] = []
  for (const tab of allTabs(state.tree)) {
    const trail = ancestorFolders(state.tree, tab.id)
    const group = trail && trail.length ? trail.map((f) => f.name).join(' / ') : ''
    for (const pid of panesInLayout(tab.root)) {
      const p = panes.get(pid)
      if (!p?.claude) continue
      out.push({
        source: 'claude',
        label: tab.title,
        detail: [group, p.branch, p.cwd ? pretty(p.cwd) : null, paneStatus(p)]
          .filter(Boolean)
          .join(' · '),
        run: () => selectPane(pid)
      })
    }
  }
  return out
}

function buildShortcuts(): SpotEntry[] {
  return KEYBINDINGS.map((k) => ({
    source: 'shortcut' as const,
    label: k.label,
    detail: comboLabel(effectiveCombo(k.id)),
    run: () => hooks.runShortcut(k.id)
  }))
}

function buildApps(): SpotEntry[] {
  const out: SpotEntry[] = []
  for (const p of flattenProjects(state.tree)) {
    for (const app of p.apps ?? []) {
      out.push({
        source: 'app',
        label: app.name,
        detail: p.name,
        run: () => showRunApp(p, app)
      })
    }
  }
  return out
}

function buildProjects(): SpotEntry[] {
  const out: SpotEntry[] = []
  for (const p of flattenProjects(state.tree)) {
    // ⏎ opens a new tab nested under the project and runs its startup + command
    // chain (same as the project picker); ⌘⏎ splits the active pane instead.
    out.push({
      source: 'project',
      label: p.name,
      detail: p.command ? `${pretty(p.path)} · ${p.command}` : pretty(p.path),
      run: () => void openProject(p),
      altRun: () => void splitProjectRight(p)
    })
    // Project-scoped terminal creation, mirroring the sidebar's right-click
    // "New terminal / New Claude terminal here": opens a new tab nested under the
    // project at its path (the Claude variant auto-runs `claude`).
    out.push({
      source: 'pane',
      label: `New terminal — ${p.name}`,
      detail: pretty(p.path),
      run: () => void newTab(p.id, p.path)
    })
    out.push({
      source: 'claude',
      label: `New Claude terminal — ${p.name}`,
      detail: pretty(p.path),
      run: () => void newClaudeTab(p.id, p.path)
    })
    for (const f of p.features ?? []) {
      out.push({
        source: 'feature',
        label: f.name,
        detail: p.name,
        run: () => void openProject(p),
        altRun: () => void splitProjectRight(p)
      })
    }
  }
  return out
}

function buildDailyTasks(): SpotEntry[] {
  return settings.dailyPlan.tasks.map((t) => ({
    source: 'task' as const,
    label: t.title,
    detail: `${t.status} · ${t.date}`,
    run: () => showDailyPlanModal(t.date, t.id)
  }))
}

function buildReminders(): SpotEntry[] {
  return settings.reminders.map((r) => ({
    source: 'reminder' as const,
    label: r.text,
    detail: new Date(r.time).toLocaleString(),
    run: () => openReminderForm(r)
  }))
}

async function loadFiles(): Promise<SpotEntry[]> {
  const folders = settings.commands.mdFolders
  if (!folders.length) return []
  const results = await Promise.all(
    folders.map((f) => fsService.findFiles(f, settings.explorerExclude))
  )
  const byPath = new Map<string, { path: string; name: string }>()
  results.forEach((r) => r.files.forEach((f) => byPath.set(f.path, f)))
  return [...byPath.values()].map((f) => ({
    source: 'file' as const,
    label: f.name,
    detail: pretty(f.path.slice(0, f.path.length - f.name.length)),
    // Markdown opens in the in-app doc viewer; any other file opens in the
    // Monaco code editor on a new page.
    run: () =>
      /\.(md|mdx|mdc)$/i.test(f.name)
        ? openMarkdownFile(f.path)
        : openCodeEditor(f.path, { newPage: true })
  }))
}

async function loadCommands(): Promise<SpotEntry[]> {
  const zsh = await loadZshCommands()
  const insert = (value: string): void => {
    const id = state.activePaneId
    if (!id) return
    selectPane(id)
    terminalService.input(id, value)
  }
  return [
    ...zsh.map((c) => ({
      source: 'command' as const,
      label: c.name,
      detail: c.value || 'zsh',
      run: () => insert(c.value || c.name)
    })),
    ...settings.paletteCommands.map((c) => ({
      source: 'command' as const,
      label: c.name,
      detail: `${c.category} · ${c.command}`,
      run: () => insert(c.command)
    }))
  ]
}

async function loadPlans(): Promise<SpotEntry[]> {
  const seen = new Set<string>()
  const out: SpotEntry[] = []
  // pane-attached plans (docs/plans) first, then ~/.claude/plans
  for (const pane of panes.values()) {
    for (const plan of pane.plans) {
      if (seen.has(plan.path)) continue
      seen.add(plan.path)
      out.push({
        source: 'plan',
        label: plan.name.replace(/\.(md|mdx|mdc)$/i, ''),
        detail: pretty(plan.path),
        run: () => openMarkdownFile(plan.path)
      })
    }
  }
  try {
    const plans = await plansService.list()
    for (const p of plans) {
      if (seen.has(p.path)) continue
      seen.add(p.path)
      out.push({
        source: 'plan',
        label: p.name.replace(/\.(md|mdx|mdc)$/i, ''),
        detail: pretty(p.path),
        run: () => openMarkdownFile(p.path)
      })
    }
  } catch {
    // ignore — plans IPC may fail in dev
  }
  return out
}

async function loadBacklog(): Promise<SpotEntry[]> {
  const res = await appService.backlogRead()
  if (!res) return []
  return res.items.map((it) => ({
    source: 'backlog' as const,
    label: firstLine(it.text),
    detail: it.status || 'Backlog',
    run: () => openCodeEditor(res.path, { newPage: true })
  }))
}
