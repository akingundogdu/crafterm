import { openMarkdownFile } from '@ui/commands/commands'

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
