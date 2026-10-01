// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { TreeCallbacks, TreeRow, TreeSectionData } from '@views/components/tree/tree.types'

// context-menu pulls in overlay/DOM machinery the row imports transitively; stub it
// so a bare mount works without a full app shell.
vi.mock('@views/components/context-menu/context-menu', () => ({ showContextMenu: () => {} }))

const { mountTree } = await import('@views/components/tree/tree')

const row = (id: string): TreeRow => ({ id, label: id, isContainer: false, collapsed: false })
const section = (id: string, rows: TreeRow[], label?: string): TreeSectionData => ({ id, label, rows })

const noop = (): void => {}
const callbacks: TreeCallbacks = {
  onSelect: noop,
  onActivate: noop,
  onToggle: noop,
  onRename: noop,
  onMove: noop,
  onColor: noop,
  onSetGroup: noop,
  menu: () => []
}

let host: HTMLElement
let errors: string[]
const onErr = (e: ErrorEvent): void => {
  errors.push(e.message)
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  errors = []
  window.addEventListener('error', onErr)
})
afterEach(() => {
  window.removeEventListener('error', onErr)
  host.remove()
})

describe('tree rebuild under rapid section changes', () => {
  // The regression: the list view read store.flat reactively while the controller
  // also re-mounted it on every setSections, so a header-dropping rebuild re-ran the
  // just-replaced view against a transiently inconsistent list and threw
  // "Cannot read properties of undefined (reading 'id')" from it.row/it.section.
  // Driving many shape-changing rebuilds in a row must paint cleanly and throw
  // nothing — the list now reads a plain snapshot, so there is no reactive race.
  it('survives headers appearing and vanishing across rebuilds', async () => {
    const panel = mountTree(host, callbacks)

    // Shapes chosen so sections gain and lose their headers between rebuilds — the
    // exact transition that dropped a flat item mid-render.
    const shapes: TreeSectionData[][] = [
      [section('s1', [row('a'), row('b')], 'In progress')],
      [section('s1', [], 'In progress'), section('s2', [row('c')], 'Review')], // s1 header dropped (empty)
      [section('s1', [row('a')], 'In progress'), section('s2', [row('c'), row('d')], 'Review')],
      [section('s1', [row('a')])], // no header at all
      [section('s1', [row('a'), row('b'), row('e')], 'In progress')]
    ]

    for (const shape of shapes) {
      panel.setSections(shape)
      await new Promise((r) => setTimeout(r, 5))
    }

    expect(errors).toEqual([])
    // Final shape painted its rows (3 cards, no stale leftovers).
    expect(host.querySelectorAll('.crtree-card').length).toBe(3)
  })
})
