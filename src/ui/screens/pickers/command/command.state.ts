import { panes, state } from '@ui/state/state'
import { allTabs, panesInLayout, ancestorFolders } from '@ui/tree/tree'
import { paneStatus } from '@ui/pane/pane'
import { zshService } from '@services'
import { paletteCommandRepo } from '@repositories'
import type { PaletteCommand, OpenTerminal, ZshCommand } from './command.types'

// zsh alias/function lookup spawns an interactive shell (~seconds), so cache it
// for the session — the first open pays the cost, the rest are instant.
let zshCmdCache: ZshCommand[] | null = null
export async function loadZshCommands(): Promise<ZshCommand[]> {
  if (!zshCmdCache) zshCmdCache = await zshService.commands()
  return zshCmdCache
}

// Builds the palette command list (zsh first, then user categories) plus the
// category order (first-seen, zsh guaranteed first).
export function buildPaletteCommands(zsh: ZshCommand[]): {
  all: PaletteCommand[]
  categories: string[]
} {
  const all: PaletteCommand[] = [
    ...zsh.map((c) => ({ category: 'zsh', name: c.name, value: c.value })),
    ...paletteCommandRepo.getAll().map((c) => ({ category: c.category, name: c.name, value: c.command }))
  ]
  const categories: string[] = ['zsh']
  for (const c of all) if (!categories.includes(c.category)) categories.push(c.category)
  return { all, categories }
}

// Active-category + "name/value contains" filter for the palette.
export function filterPaletteCommands(
  all: PaletteCommand[],
  active: Set<string>,
  query: string
): PaletteCommand[] {
  const q = query.trim().toLowerCase()
  return all.filter(
    (c) => active.has(c.category) && (!q || (c.name + ' ' + c.value).toLowerCase().includes(q))
  )
}

// Snapshots every open terminal/pane across all tabs (with its folder trail).
export function buildOpenTerminals(): OpenTerminal[] {
  const all: OpenTerminal[] = []
  for (const tab of allTabs(state.tree)) {
    const trail = ancestorFolders(state.tree, tab.id)
    const group = trail && trail.length ? trail.map((f) => f.name).join(' / ') : ''
    for (const pid of panesInLayout(tab.root)) {
      const p = panes.get(pid)
      if (!p) continue
      all.push({
        paneId: pid,
        title: tab.title,
        group,
        status: paneStatus(p),
        cwd: p.cwd,
        branch: p.branch,
        claude: p.claude
      })
    }
  }
  return all
}

// "contains" filter across a terminal's title/group/branch/cwd.
export function filterTerminals(all: OpenTerminal[], query: string): OpenTerminal[] {
  const q = query.trim().toLowerCase()
  if (!q) return all
  return all.filter((t) =>
    `${t.title} ${t.group} ${t.branch ?? ''} ${t.cwd ?? ''}`.toLowerCase().includes(q)
  )
}

// "contains" filter for the command history list.
export function filterHistory(all: string[], query: string): string[] {
  const q = query.trim().toLowerCase()
  return q ? all.filter((c) => c.toLowerCase().includes(q)) : all
}

// Copies a history command and flashes "Copied" on the given button.
export function copyHistoryEntry(cmd: string, btn: HTMLElement): void {
  void navigator.clipboard.writeText(cmd)
  const prev = btn.textContent
  btn.textContent = 'Copied'
  setTimeout(() => (btn.textContent = prev), 1000)
}

// Copy-button click handler (stops propagation so the row click doesn't double-fire).
export function makeHistoryBtnCopy(cmd: string, btn: HTMLElement): (e: Event) => void {
  return (e) => {
    e.stopPropagation()
    copyHistoryEntry(cmd, btn)
  }
}

// Row click handler: copies via the row's copy button.
export function makeHistoryRowCopy(cmd: string, btn: HTMLElement): () => void {
  return () => copyHistoryEntry(cmd, btn)
}
