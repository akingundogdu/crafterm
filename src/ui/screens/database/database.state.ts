import { settings } from '@ui/state/state'
import type { DbNode, DbGroup, DbEngine } from '@ui/types/types'
import type { DbSectionKind, DbTreeNode } from './database.types'

export const GROUP_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M1.6 4.4c0-.6.4-1 1-1h3.1l1.2 1.4H13.4c.6 0 1 .4 1 1V11.6c0 .6-.4 1-1 1H2.6c-.6 0-1-.4-1-1z" fill="currentColor"/></svg>'
export const DB_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><ellipse cx="8" cy="3.4" rx="5" ry="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3 3.4v9.2c0 1.1 2.2 2 5 2s5-.9 5-2V3.4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>'
// object-type glyphs: table (grid), view (eye), procedure (ƒ)
export const TABLE_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2 6.4h12M2 9.6h12M6 6.4v6.6" fill="none" stroke="currentColor" stroke-width="1"/></svg>'
export const VIEW_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M1.5 8s2.4-4.2 6.5-4.2S14.5 8 14.5 8s-2.4 4.2-6.5 4.2S1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="1.9" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>'
export const PROC_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M9.5 3.2c-1.3 0-2 .8-2.2 2L7 6.2H5.4M5 12.8c1.3 0 2-.8 2.2-2l.9-6.1M4.6 8.2h4.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>'
export const QUERY_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 1.6h5l3 3v9.8H4z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M9 1.6v3h3" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M6 8.2l1.4 1.4L6 11M9 11h1.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>'

// Per-engine accent (drives the connection dot + engine pill colors).
export function engineClass(e: DbEngine): string {
  return 'db-eng-' + e
}

export function enginePillText(e: DbEngine): string {
  return e === 'postgres' ? 'PG' : e === 'mysql' ? 'SQL' : 'LITE'
}

export function sectionGlyph(k: DbSectionKind): string {
  return k === 'Tables' ? TABLE_SVG : k === 'Views' ? VIEW_SVG : k === 'Procedures' ? PROC_SVG : QUERY_SVG
}

export const wrap = (n: DbNode): DbTreeNode => (n.kind === 'group' ? { t: 'group', g: n } : { t: 'conn', c: n })

// ---- tree helpers (operate on settings.dbTree) ----

export function findGroup(id: string, nodes: DbNode[] = settings.dbTree): DbGroup | null {
  for (const n of nodes) {
    if (n.kind === 'group') {
      if (n.id === id) return n
      const r = findGroup(id, n.children)
      if (r) return r
    }
  }
  return null
}

export function removeNode(id: string, nodes: DbNode[] = settings.dbTree): boolean {
  const i = nodes.findIndex((n) => n.id === id)
  if (i >= 0) {
    nodes.splice(i, 1)
    return true
  }
  for (const n of nodes) {
    if (n.kind === 'group' && removeNode(id, n.children)) return true
  }
  return false
}

// ---- drag-drop reorder/nesting over settings.dbTree ----

export function locate(
  id: string,
  arr: DbNode[] = settings.dbTree
): { arr: DbNode[]; i: number; node: DbNode } | null {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].id === id) return { arr, i, node: arr[i] }
    const n = arr[i]
    if (n.kind === 'group') {
      const r = locate(id, n.children)
      if (r) return r
    }
  }
  return null
}

export function containsId(node: DbNode, id: string): boolean {
  if (node.id === id) return true
  return node.kind === 'group' ? node.children.some((c) => containsId(c, id)) : false
}
