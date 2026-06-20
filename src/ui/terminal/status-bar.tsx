import type { Pane } from '@ui/types/types'
import { UITexts } from '@texts'
import { COPY_ICON, buildPaneStatus, makeBranchClick, makeCopyPath } from './status-bar.state'

// Per-pane bottom status bar: tracking · branch · worktree/repo · cwd (last 4
// segments) plus a button that copies the full path. Hidden when there's nothing.
export function updatePaneStatus(pane: Pane): void {
  const { fullCwd, segments } = buildPaneStatus(pane)
  if (!segments.length) {
    pane.statusEl.style.display = 'none'
    return
  }
  pane.statusEl.replaceChildren()
  segments.forEach((s, i) => {
    if (i > 0) {
      pane.statusEl.appendChild((<span class="pane-status-sep">·</span>) as HTMLSpanElement)
    }
    const seg = (<span class={'pane-status-seg ' + s.cls}>{s.text}</span>) as HTMLSpanElement
    // Clicking the branch opens a searchable checkout picker.
    if (s.cls === 'branch') {
      seg.classList.add('clickable')
      seg.title = 'Checkout branch…'
      seg.addEventListener('click', makeBranchClick(pane.id))
    }
    pane.statusEl.appendChild(seg)
  })
  if (fullCwd) {
    const copyBtn = (
      <button
        class="pane-status-copy"
        title={UITexts.Terminal.copyFullPath}
        aria-label={UITexts.Terminal.copyFullPath}
        innerHTML={COPY_ICON}
      />
    ) as HTMLButtonElement
    copyBtn.addEventListener('click', makeCopyPath(fullCwd))
    pane.statusEl.appendChild(copyBtn)
  }
  pane.statusEl.style.display = 'flex'
}
