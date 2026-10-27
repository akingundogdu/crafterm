import type { PopoutBounds } from '@services/pty/pty.types'

// How much of a restored pop-out's top edge must land on a connected display for
// the saved position to be reused — enough of the title bar to grab and move it.
const MIN_VISIBLE_PX = 80

// The saved pop-out bounds when they still land on one of the displays' work
// areas, else null (the display was unplugged or rearranged, or the saved value
// is malformed) so the window opens at its default position instead.
export function visiblePopoutBounds(bounds: PopoutBounds, workAreas: PopoutBounds[]): PopoutBounds | null {
  const { x, y, width, height } = bounds
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null
  const isVisible = workAreas.some((area) => {
    const overlapWidth = Math.min(x + width, area.x + area.width) - Math.max(x, area.x)
    const isTopEdgeInside = y >= area.y && y <= area.y + area.height - MIN_VISIBLE_PX
    return overlapWidth >= MIN_VISIBLE_PX && isTopEdgeInside
  })
  return isVisible ? { x, y, width, height } : null
}
