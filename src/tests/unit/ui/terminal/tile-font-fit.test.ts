// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'

// terminal.store pulls in xterm + the spine singleton at import time; only the pure
// size math is under test here, so both are stubbed to whatever keeps evaluation
// happy. The global default matters for the "no override" reading.
vi.mock('@views/state/spine', () => ({
  panes: new Map(),
  opened: new Set(),
  state: { activePaneId: null },
  settings: { font: { family: 'mono', size: 14 } }
}))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class {} }))
vi.mock('@xterm/xterm', () => ({ Terminal: class {} }))

import { scaledFontForCols, TILE_TARGET_COLS } from '@views/terminal/terminal.store'

describe('scaledFontForCols', () => {
  it('leaves the font untouched when the tile is already wide enough', () => {
    // A tile that fits the target (or more) at the user's size keeps that size.
    expect(scaledFontForCols(30, TILE_TARGET_COLS, TILE_TARGET_COLS)).toBe(30)
    expect(scaledFontForCols(30, 120, TILE_TARGET_COLS)).toBe(30)
  })

  it('shrinks proportionally when the tile is too narrow', () => {
    // 30px shows only 30 cols in a narrow tile; to reach 80 cols the glyph must be
    // ~30 * 30/80 = 11px. This is the "font stays huge in a 6-up split" case.
    expect(scaledFontForCols(30, 30, 80)).toBe(11)
    // Half the target width → roughly half the font.
    expect(scaledFontForCols(20, 40, 80)).toBe(10)
  })

  it('never drops below the readable floor', () => {
    // An extremely narrow tile would compute a sub-6px font; it clamps to 6.
    expect(scaledFontForCols(30, 2, 80)).toBe(6)
  })

  it('treats an unmeasurable tile (0 cols) as no change', () => {
    // proposeDimensions can return 0 before layout; do not shrink on a bad read.
    expect(scaledFontForCols(30, 0, 80)).toBe(30)
  })
})
