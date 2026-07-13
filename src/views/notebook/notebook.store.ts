import { settings } from '@views/state/spine'
import type { PlanItem } from './notebook.types'

export const FOLDER_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M1.6 4.4c0-.6.4-1 1-1h3.1l1.2 1.4H13.4c.6 0 1 .4 1 1V11.6c0 .6-.4 1-1 1H2.6c-.6 0-1-.4-1-1z" fill="currentColor"/></svg>'
export const NOTE_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4 1.5h5l3 3v10H4z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M9 1.5v3h3" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>'
export const LINK_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6.5 9.5l3-3M5.5 7.5L4 9a2.1 2.1 0 0 0 3 3l1.5-1.5M10.5 8.5L12 7a2.1 2.1 0 0 0-3-3L7.5 5.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'

export const MD_RE = /\.(md|mdx|mdc)$/i

export function basename(p: string): string {
  return p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p
}
export function parentOf(p: string): string {
  return p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
}
export function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}

// Move the persisted color tag when a node's path changes (rename / move).
export function moveColor(from: string, to: string): void {
  const col = settings.notebookColors[from]
  if (!col) return
  delete settings.notebookColors[from]
  settings.notebookColors[to] = col
}

// Filter plan items by a query over name + project.
export function filterPlans(items: PlanItem[], query: string): PlanItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter(
    (p) => p.name.toLowerCase().includes(q) || p.project.toLowerCase().includes(q)
  )
}

// Group plan items by project, preserving first-seen (newest-first) order.
export function groupPlansByProject(items: PlanItem[]): Map<string, PlanItem[]> {
  const groups = new Map<string, PlanItem[]>()
  for (const p of items) {
    const g = groups.get(p.project) ?? []
    g.push(p)
    groups.set(p.project, g)
  }
  return groups
}

// Wraps a row action so it stops propagation before running (the hover-action
// buttons must not bubble into the row's own click).
export function stopAnd(fn: () => void): (e: Event) => void {
  return (e) => {
    e.stopPropagation()
    fn()
  }
}
