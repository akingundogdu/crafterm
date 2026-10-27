// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@services', () => ({ terminalService: {} }))
vi.mock('@views/components/dialog/confirm', () => ({ promptConfirm: async () => true }))

const { makeWaitingFlash, POPOUT_WAITING_CLASS } = await import('@views/popout/popout.store')

// A pop-out window pulses while Claude waits on the user in its pane, unless the
// window already has focus; focusing it or typing stops the pulse.
describe('pop-out waiting flash', () => {
  let el: HTMLElement
  let hasFocus: boolean
  const isFlashing = (): boolean => el.classList.contains(POPOUT_WAITING_CLASS)

  beforeEach(() => {
    el = document.createElement('div')
    hasFocus = false
  })

  it('flashes when its own pane starts waiting while the window is unfocused', () => {
    const flash = makeWaitingFlash('stable-1', el, () => hasFocus)
    flash.onWaitingChanged('stable-1', true)
    expect(isFlashing()).toBe(true)
  })

  it('ignores events for other panes', () => {
    const flash = makeWaitingFlash('stable-1', el, () => hasFocus)
    flash.onWaitingChanged('stable-2', true)
    expect(isFlashing()).toBe(false)
  })

  it('does not flash when the window already has focus', () => {
    hasFocus = true
    const flash = makeWaitingFlash('stable-1', el, () => hasFocus)
    flash.onWaitingChanged('stable-1', true)
    expect(isFlashing()).toBe(false)
  })

  it('stops when the pane stops waiting', () => {
    const flash = makeWaitingFlash('stable-1', el, () => hasFocus)
    flash.onWaitingChanged('stable-1', true)
    flash.onWaitingChanged('stable-1', false)
    expect(isFlashing()).toBe(false)
  })

  it('stops when acknowledged (window focus or typing)', () => {
    const flash = makeWaitingFlash('stable-1', el, () => hasFocus)
    flash.onWaitingChanged('stable-1', true)
    flash.acknowledge()
    expect(isFlashing()).toBe(false)
  })

  it('never flashes without a stable id (pop-out opened by an older build)', () => {
    const flash = makeWaitingFlash('', el, () => hasFocus)
    flash.onWaitingChanged('', true)
    expect(isFlashing()).toBe(false)
  })
})
