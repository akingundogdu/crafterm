import { Store } from '@geajs/core'
import type { DirEntry } from '@services/fs/fs.types'
import { openMarkdownFile } from '@views/commands/commands'

// Reactive state for the plans picker. `plans` (the async-loaded list, seeded once
// per open), `search` and `selected` are all read directly in the list view's
// template(), so gea re-renders it on every keystroke, arrow move or hover — the
// board pattern. A bare rev counter read via `void store.rev` is NOT tracked by the
// gea compiler, so the list must be a real reactive field the template actually
// reads (the ssh.store lesson). The plans list is static for the picker's lifetime,
// so `load()` reassigns it once and resets the search + selection for the new open.
class PlansStore extends Store {
  plans: DirEntry[] = []
  search = ''
  selected = 0

  load(plans: DirEntry[]): void {
    this.plans = [...plans]
    this.search = ''
    this.selected = 0
  }

  setSearch(search: string): void {
    this.search = search
  }

  setSelected(selected: number): void {
    this.selected = selected
  }
}

export default new PlansStore()

// Plan file name without its markdown extension.
export function planTitle(p: { name: string }): string {
  return p.name.replace(/\.(md|mdx|mdc)$/i, '')
}

// Plans whose title contains the query (case-insensitive); all when blank.
export function filterPlans<T extends { name: string }>(plans: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return plans
  return plans.filter((p) => planTitle(p).toLowerCase().includes(q))
}

// Sets the spellcheck property (not just the attribute) so it reflects on `.spellcheck`.
export function disableSpellcheck(el: HTMLInputElement): void {
  el.spellcheck = false
}

// Click/Enter handler: open the plan in the Markdown app, then close the modal.
export function makeChoosePlan<T extends { path: string }>(close: () => void): (p: T) => void {
  return (p) => {
    openMarkdownFile(p.path)
    close()
  }
}
