import type { ResumeSession } from '../claude.state'
import { relTime, shortCwd } from '../claude.state'

// One row in the resume-session list: the session summary plus a subline of
// short cwd · relative time. The parent owns selection state and keyboard nav,
// passing the active flag and the click/hover handlers.
export function resumeSessionRow(
  s: ResumeSession,
  active: boolean,
  onClick: () => void,
  onMouseEnter: () => void
): HTMLDivElement {
  const row = (
    <div class={'pick-row project-row' + (active ? ' active' : '')}>
      <span class="picker-name">{s.summary || '(no prompt)'}</span>
      <span class="project-sub">{`${shortCwd(s.cwd)} · ${relTime(s.mtimeMs)}`}</span>
    </div>
  ) as HTMLDivElement
  row.addEventListener('click', onClick)
  row.addEventListener('mouseenter', onMouseEnter)
  return row
}
