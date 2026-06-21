import type { StatusSegment } from '../status-bar.types'

// A single status segment span (tracking · branch · worktree · cwd). The branch
// segment is made clickable when a checkout handler is supplied, opening a
// searchable checkout picker.
export function createStatusSegment(s: StatusSegment, onClick?: (e: Event) => void): HTMLSpanElement {
  const seg = (<span class={'pane-status-seg ' + s.cls}>{s.text}</span>) as HTMLSpanElement
  if (s.cls === 'branch' && onClick) {
    seg.classList.add('clickable')
    seg.title = 'Checkout branch…'
    seg.addEventListener('click', onClick)
  }
  return seg
}
