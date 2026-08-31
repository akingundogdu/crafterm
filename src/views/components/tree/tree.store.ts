import { Store } from '@geajs/core'
import type { DropPos, FlatItem, TreeRow, TreeSectionData } from './tree.types'

// Horizontal indent per depth level, in px.
export const INDENT = 16

// ---- colour tint ------------------------------------------------------------

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return 'transparent'
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`
}

// The inline CSS variables a colour-tagged card reads (whole-card tint + edge).
export function colorVars(color: string | null | undefined): Record<string, string> {
  if (!color) return {}
  return { '--crtree-edge': color, '--crtree-tint': hexToRgba(color, 0.1) }
}

// ---- search filter ----------------------------------------------------------

function rowMatches(row: TreeRow, q: string): boolean {
  return row.label.toLowerCase().includes(q)
}

function subtreeMatches(row: TreeRow, q: string): boolean {
  if (rowMatches(row, q)) return true
  return !!row.children?.some((c) => subtreeMatches(c, q))
}

// ---- flatten ----------------------------------------------------------------

// Flatten header + row sections into the ordered, filter-applied visible model
// the gea list renders. Pure data — builds no DOM. Repopulates the plain lookup
// maps (`rowById` / `sectionById`) so the row/header Components read their data by
// id. A row survives the filter if it or any descendant matches; open (or
// filtered) containers recurse. Empty section headers are dropped.
export function flattenSections(
  sections: TreeSectionData[],
  filter: string,
  rowById: Map<string, TreeRow>,
  sectionById: Map<string, TreeSectionData>
): FlatItem[] {
  rowById.clear()
  sectionById.clear()
  const items: FlatItem[] = []
  const filtering = filter.length > 0
  let num = 0

  const walk = (rows: TreeRow[], depth: number, guides: boolean[]): void => {
    const list = filtering ? rows.filter((r) => subtreeMatches(r, filter)) : rows
    list.forEach((row, i) => {
      const isLast = i === list.length - 1
      rowById.set(row.id, row)
      items.push({ kind: 'row', row, depth, guides: [...guides], isLast, num })
      num++
      if (row.isContainer && row.children && (filtering || !row.collapsed)) {
        walk(row.children, depth + 1, [...guides, !isLast])
      }
    })
  }

  for (const section of sections) {
    const before = num
    const hasHeader = section.label != null || section.group === true
    const headerIndex = items.length
    if (hasHeader) {
      sectionById.set(section.id, section)
      items.push({ kind: 'header', section })
    }
    walk(section.rows, 0, [])
    if (hasHeader && num === before) {
      items.splice(headerIndex, 1) // empty section → drop its header
      sectionById.delete(section.id)
    }
  }
  return items
}

// A compact signature of everything the rows render (excluding selection, which
// is toggled imperatively). The controller re-mounts the list only when this
// changes, so the frequent status polls (every few seconds, unconditionally) don't
// re-mount the sidebar when nothing visible actually changed.
export function flatSignature(items: FlatItem[]): string {
  const parts: string[] = []
  for (const it of items) {
    if (it.kind === 'header') {
      parts.push('H|' + it.section.id + '|' + (it.section.label ?? '') + (it.section.group ? '|g' : ''))
      continue
    }
    const r = it.row
    const badges = (r.badges ?? []).map((b) => b.kind + (b.text ?? '') + (b.tone ?? '') + (b.pulse ? '!' : '')).join(',')
    const detail = (r.detail ?? []).map((d) => d.id + (d.done ? '✓' : '') + d.label).join(',')
    parts.push(
      [
        'R',
        r.id,
        it.depth,
        it.num,
        it.isLast ? 'L' : '',
        it.guides.join(''),
        r.label,
        r.icon ?? '',
        r.isContainer ? 'C' : '',
        r.collapsed ? 'c' : '',
        r.expandable ? 'e' : '',
        r.expanded ? 'o' : '',
        r.active ? 'A' : '',
        r.multiSelected ? 'M' : '',
        r.color ?? '',
        r.crumb?.text ?? '',
        badges,
        detail,
        r.extraClass ?? ''
      ].join('|')
    )
  }
  return parts.join('\n')
}

// ---- drag-drop zones --------------------------------------------------------

// top third = before, bottom third = after, middle = inside (containers only)
export function zoneFor(e: DragEvent, card: HTMLElement, container: boolean): DropPos {
  const r = card.getBoundingClientRect()
  const y = (e.clientY - r.top) / r.height
  if (container) {
    if (y < 0.3) return 'before'
    if (y > 0.7) return 'after'
    return 'inside'
  }
  return y < 0.5 ? 'before' : 'after'
}

// ---- reactive store ---------------------------------------------------------

// map a drop zone to its card modifier class
export function dropClass(pos: DropPos): string {
  return pos === 'inside' ? 'crtree-drag-into' : 'crtree-drag-' + pos
}

// The reactive per-tree render model. `flat` is the flattened, filter-applied,
// top-to-bottom list of headers + rows. The list child (`TreeRows`) reads it and
// re-renders on every reassignment. `rev` is bumped alongside so a row's template
// re-runs (keeping label/selection/status live even when its identity is stable).
// Only primitives + row DATA live here — never a DOM node (kept in the registry's
// plain maps), so gea never proxies DOM. Drag hover marks are applied imperatively
// (localized to the two cards involved) rather than reactively, so a fast stream
// of dragover events never re-renders the whole list.
export class TreeStore extends Store {
  flat: FlatItem[] = []
  rev = 0
  renamingId: string | null = null
  selectedId: string | null = null

  setFlat(items: FlatItem[]): void {
    this.flat = items
    this.rev++
  }

  setRenaming(id: string | null): void {
    this.renamingId = id
  }

  setSelected(id: string | null): void {
    this.selectedId = id
  }
}
