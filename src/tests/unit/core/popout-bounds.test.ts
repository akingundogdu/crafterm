import { describe, it, expect } from 'vitest'
import { visiblePopoutBounds } from '@core/windows/popout-bounds'

// A restored pop-out reopens at its saved bounds only while enough of its top
// edge lands on a connected display to grab it; otherwise it opens at the default.
describe('visiblePopoutBounds', () => {
  const main = { x: 0, y: 25, width: 1440, height: 875 }
  const external = { x: 1440, y: 0, width: 1920, height: 1080 }

  it('keeps bounds that sit on a display', () => {
    const bounds = { x: 100, y: 100, width: 720, height: 480 }
    expect(visiblePopoutBounds(bounds, [main])).toEqual(bounds)
  })

  it('keeps bounds on a secondary display while it is connected', () => {
    const bounds = { x: 2000, y: 200, width: 720, height: 480 }
    expect(visiblePopoutBounds(bounds, [main, external])).toEqual(bounds)
  })

  it('drops bounds on a display that is no longer connected', () => {
    expect(visiblePopoutBounds({ x: 2000, y: 200, width: 720, height: 480 }, [main])).toBe(null)
  })

  it('drops bounds whose title bar would sit above the work area', () => {
    expect(visiblePopoutBounds({ x: 100, y: -300, width: 720, height: 480 }, [main])).toBe(null)
  })

  it('drops bounds that only overlap a display by a sliver', () => {
    expect(visiblePopoutBounds({ x: 1400, y: 100, width: 720, height: 480 }, [main])).toBe(null)
  })

  it('drops malformed bounds', () => {
    expect(visiblePopoutBounds({ x: Number.NaN, y: 100, width: 720, height: 480 }, [main])).toBe(null)
    expect(visiblePopoutBounds({ x: 100, y: 100, width: 0, height: 480 }, [main])).toBe(null)
  })
})
