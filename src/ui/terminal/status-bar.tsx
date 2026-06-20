import type { Pane } from '@ui/types/types'
import { state, paneActions } from '@ui/state/state'
import { UITexts } from '@texts'
import { findProjectByPath, findFeature } from '@ui/catalog/catalog'

// Keep only the last `n` path segments, prefixed with an ellipsis when trimmed.
function lastPathSegments(p: string, n: number): string {
  const parts = p.replace(/\/+$/, '').split('/').filter(Boolean)
  if (parts.length <= n) return p
  return '…/' + parts.slice(-n).join('/')
}

const COPY_ICON =
  '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">' +
  '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
  '<path d="M3.4 10.4H3a1.5 1.5 0 0 1-1.5-1.5V3a1.5 1.5 0 0 1 1.5-1.5h5.9A1.5 1.5 0 0 1 10.4 3v.4" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
  '</svg>'

// Per-pane bottom status bar: tracking · branch · worktree/repo · cwd (last 4
// segments) plus a button that copies the full path. Hidden when there's nothing.
export function updatePaneStatus(pane: Pane): void {
  const fullCwd = pane.cwd
  const homeShort = fullCwd ? fullCwd.replace(/^\/(Users|home)\/[^/]+/, '~') : null
  const cwd = homeShort ? lastPathSegments(homeShort, 4) : null
  const segs: { cls: string; text: string }[] = []
  if (pane.trackProjectPath) {
    const proj = findProjectByPath(state.tree, pane.trackProjectPath)
    const feat = pane.trackFeatureId ? findFeature(state.tree, pane.trackFeatureId)?.feature : null
    segs.push({ cls: 'tracking', text: feat?.name ?? proj?.name ?? 'tracking' })
  }
  if (pane.branch) segs.push({ cls: 'branch', text: pane.branch })
  if (pane.worktree) segs.push({ cls: 'worktree', text: pane.worktree })
  if (cwd) segs.push({ cls: 'cwd', text: cwd })
  if (!segs.length) {
    pane.statusEl.style.display = 'none'
    return
  }
  pane.statusEl.replaceChildren()
  segs.forEach((s, i) => {
    if (i > 0) {
      const sep = (<span class="pane-status-sep">·</span>) as HTMLSpanElement
      pane.statusEl.appendChild(sep)
    }
    const seg = (<span class={'pane-status-seg ' + s.cls}>{s.text}</span>) as HTMLSpanElement
    // Clicking the branch opens a searchable checkout picker.
    if (s.cls === 'branch') {
      seg.classList.add('clickable')
      seg.title = 'Checkout branch…'
      seg.addEventListener('click', (e) => {
        e.stopPropagation()
        paneActions.branchCheckout(pane.id)
      })
    }
    pane.statusEl.appendChild(seg)
  })
  if (fullCwd) {
    const copyBtn = (
      <button class="pane-status-copy" title={UITexts.Terminal.copyFullPath} aria-label={UITexts.Terminal.copyFullPath} innerHTML={COPY_ICON} />
    ) as HTMLButtonElement
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      void navigator.clipboard.writeText(fullCwd)
      copyBtn.classList.add('copied')
      copyBtn.textContent = '✓'
      window.setTimeout(() => {
        copyBtn.classList.remove('copied')
        copyBtn.innerHTML = COPY_ICON
      }, 1100)
    })
    pane.statusEl.appendChild(copyBtn)
  }
  pane.statusEl.style.display = 'flex'
}
