// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { panes, state } from '@views/state/spine'
import {
  WAITING_FLASH_CLASS,
  isPaneAttended,
  onClaudeWaitingChanged,
  acknowledgeActivePane,
  setWaitingFlash
} from '@views/terminal/waiting-flash'
import type { Pane } from '@views/types/types'

// A pane flashes while Claude waits on the user in it, unless the user is
// already looking at it; looking at it or typing stops the flash.

const makePane = (id: string, stableId: string): Pane =>
  ({ id, stableId, el: document.createElement('div') }) as unknown as Pane

const isFlashing = (pane: Pane): boolean => pane.el.classList.contains(WAITING_FLASH_CLASS)

describe('isPaneAttended', () => {
  it('is attended only when its window has focus and it is the active pane', () => {
    expect(isPaneAttended('p1', 'p1', true)).toBe(true)
    expect(isPaneAttended('p1', 'p1', false)).toBe(false)
    expect(isPaneAttended('p1', 'p2', true)).toBe(false)
    expect(isPaneAttended('p1', null, true)).toBe(false)
  })
})

describe('waiting flash', () => {
  let waiting: Pane
  let other: Pane
  let hasFocus: boolean
  const previousActive = state.activePaneId

  beforeEach(() => {
    waiting = makePane('p1', 'stable-1')
    other = makePane('p2', 'stable-2')
    panes.set(waiting.id, waiting)
    panes.set(other.id, other)
    hasFocus = true
    vi.spyOn(document, 'hasFocus').mockImplementation(() => hasFocus)
    state.activePaneId = other.id
  })

  afterEach(() => {
    panes.delete(waiting.id)
    panes.delete(other.id)
    state.activePaneId = previousActive
    vi.restoreAllMocks()
  })

  it('flashes the pane with that stable id while the user looks elsewhere', () => {
    onClaudeWaitingChanged('stable-1', true)
    expect(isFlashing(waiting)).toBe(true)
    expect(isFlashing(other)).toBe(false)
  })

  it('flashes the active pane when its window is not focused', () => {
    state.activePaneId = waiting.id
    hasFocus = false
    onClaudeWaitingChanged('stable-1', true)
    expect(isFlashing(waiting)).toBe(true)
  })

  it('does not flash the pane the user is looking at', () => {
    state.activePaneId = waiting.id
    onClaudeWaitingChanged('stable-1', true)
    expect(isFlashing(waiting)).toBe(false)
  })

  it('stops when Claude no longer waits', () => {
    onClaudeWaitingChanged('stable-1', true)
    onClaudeWaitingChanged('stable-1', false)
    expect(isFlashing(waiting)).toBe(false)
  })

  it('ignores an unknown stable id', () => {
    onClaudeWaitingChanged('stable-unknown', true)
    expect(isFlashing(waiting)).toBe(false)
    expect(isFlashing(other)).toBe(false)
  })

  it('stops once the user switches to the pane in a focused window', () => {
    onClaudeWaitingChanged('stable-1', true)
    state.activePaneId = waiting.id
    acknowledgeActivePane()
    expect(isFlashing(waiting)).toBe(false)
  })

  it('keeps flashing while the window is not focused', () => {
    onClaudeWaitingChanged('stable-1', true)
    state.activePaneId = waiting.id
    hasFocus = false
    acknowledgeActivePane()
    expect(isFlashing(waiting)).toBe(true)
  })

  it('keeps the other panes flashing when the active one is acknowledged', () => {
    onClaudeWaitingChanged('stable-1', true)
    acknowledgeActivePane() // the active pane is `other`
    expect(isFlashing(waiting)).toBe(true)
  })

  it('setWaitingFlash(false) stops the flash, as a keystroke does', () => {
    onClaudeWaitingChanged('stable-1', true)
    setWaitingFlash(waiting, false)
    expect(isFlashing(waiting)).toBe(false)
  })
})
