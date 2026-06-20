import { settings, panes, state, hooks } from '@ui/state/state'
import { dailyTaskRepo, reminderRepo, paletteCommandRepo } from '@repositories'
import { showRunApp } from '../pickers/project/project'
import { loadZshCommands } from '../pickers/command/command'
import { SOURCE_LABEL } from '../pickers/global-search/global-search'
import {
  openMarkdownFile,
  selectPane,
  openCodeEditor,
  openProject,
  splitProjectRight,
  newTab,
  newClaudeTab
} from '@ui/commands/commands'
import { flattenProjects } from '@ui/catalog/catalog'
import { allTabs, panesInLayout, ancestorFolders } from '@ui/tree/tree'
import { KEYBINDINGS, effectiveCombo, comboLabel, comboFromEvent } from '@ui/keybindings/keybindings'
import { showDailyPlanModal } from '../daily-plan/daily-plan'
import { openReminderForm } from '../reminders/reminders'
import { paneStatus } from '@ui/pane/pane'
import { terminalService, fsService, plansService, backlogService } from '@services'
import { TABS } from './components/spot-tabs'
import type { SpotEntry, SpotSource } from './components/result-list'
import type { SpotlightKeyContext } from './spotlight.types'

export const BADGE_LABEL: Record<SpotSource, string> = {
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

export const pretty = (p: string): string => p.replace(/^\/Users\/[^/]+/, '~')
export const firstLine = (s: string): string => {
  const line = s.split('\n')[0].trim()
  return line.length > 120 ? line.slice(0, 117) + '…' : line
}

// ---- Source builders ----

export function buildClaude(): SpotEntry[] {
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

export function buildShortcuts(): SpotEntry[] {
  return KEYBINDINGS.map((k) => ({
    source: 'shortcut' as const,
    label: k.label,
    detail: comboLabel(effectiveCombo(k.id)),
    run: () => hooks.runShortcut(k.id)
  }))
}

export function buildApps(): SpotEntry[] {
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

export function buildProjects(): SpotEntry[] {
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

export function buildDailyTasks(): SpotEntry[] {
  return dailyTaskRepo.getAll().map((t) => ({
    source: 'task' as const,
    label: t.title,
    detail: `${t.status} · ${t.date}`,
    run: () => showDailyPlanModal(t.date, t.id)
  }))
}

export function buildReminders(): SpotEntry[] {
  return reminderRepo.getAll().map((r) => ({
    source: 'reminder' as const,
    label: r.text,
    detail: new Date(r.time).toLocaleString(),
    run: () => openReminderForm(r)
  }))
}

export async function loadFiles(): Promise<SpotEntry[]> {
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

export async function loadCommands(): Promise<SpotEntry[]> {
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
    ...paletteCommandRepo.getAll().map((c) => ({
      source: 'command' as const,
      label: c.name,
      detail: `${c.category} · ${c.command}`,
      run: () => insert(c.command)
    }))
  ]
}

export async function loadPlans(): Promise<SpotEntry[]> {
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

export async function loadBacklog(): Promise<SpotEntry[]> {
  const res = await backlogService.read()
  if (!res) return []
  return res.items.map((it) => ({
    source: 'backlog' as const,
    label: firstLine(it.text),
    detail: it.status || 'Backlog',
    run: () => openCodeEditor(res.path, { newPage: true })
  }))
}

// ---- Handler factories ----

// Keydown handler: Escape closes; Tab/Shift+Tab cycles tabs; a bound ⌘ combo
// jumps to its tab; arrows move the selection; Enter chooses (⌘Enter → altRun).
export function makeSpotlightKeydown(ctx: SpotlightKeyContext): (e: KeyboardEvent) => void {
  return (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') {
      ctx.close()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const idx = TABS.findIndex((t) => t.id === ctx.getActiveTab())
      const next = (idx + (e.shiftKey ? -1 : 1) + TABS.length) % TABS.length
      ctx.switchTab(TABS[next].id)
      return
    }
    // Per-tab shortcut while open: jump straight to the bound tab.
    if (e.metaKey) {
      const tab = ctx.comboToTab.get(comboFromEvent(e))
      if (tab) {
        e.preventDefault()
        ctx.switchTab(tab)
        return
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      ctx.resultList.move(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      ctx.resultList.move(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = ctx.resultList.selected()
      if (!item) return
      if (e.metaKey && item.altRun) {
        ctx.close()
        item.altRun()
      } else {
        ctx.choose(item)
      }
    }
  }
}

// Backdrop mousedown: closes only when the click lands on the overlay itself.
export function makeOverlayBackdropClose(overlay: HTMLElement, close: () => void): (e: MouseEvent) => void {
  return (e) => {
    if (e.target === overlay) close()
  }
}
