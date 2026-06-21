import type { Pane } from '@ui/types/types'
import { makeCopyPath } from './status-bar.state'
import { buildStatusSegments } from './status-segments.engine'
import { createStatusSegment } from './components/status-segment'
import { createStatusSeparator } from './components/status-separator'
import { createStatusCopyBtn } from './components/status-copy-btn'

// Per-pane bottom status bar: tracking · branch · worktree/repo · cwd (last 4
// segments) plus a button that copies the full path. Hidden when there's nothing.
export function updatePaneStatus(pane: Pane): void {
  const { fullCwd, items } = buildStatusSegments(pane)
  if (!items.length) {
    pane.statusEl.style.display = 'none'
    return
  }
  pane.statusEl.replaceChildren()
  items.forEach((item, i) => {
    if (i > 0) pane.statusEl.appendChild(createStatusSeparator())
    pane.statusEl.appendChild(createStatusSegment(item.segment, item.onClick))
  })
  if (fullCwd) pane.statusEl.appendChild(createStatusCopyBtn(makeCopyPath(fullCwd)))
  pane.statusEl.style.display = 'flex'
}
