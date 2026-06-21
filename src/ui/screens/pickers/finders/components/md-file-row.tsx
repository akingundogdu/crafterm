import type { MdFile } from '../finders.types'
import { prettyPath } from '../finders.state'

// One row in the markdown/file finder lists: the file name plus its containing
// path. The parent owns selection state and keyboard nav, passing the active
// flag and the click/hover handlers.
export function mdFileRow(
  f: MdFile,
  active: boolean,
  onClick: () => void,
  onMouseEnter: () => void
): HTMLDivElement {
  const row = (
    <div class={'pick-row mdfile-row' + (active ? ' active' : '')} onClick={onClick}>
      <div class="claude-main">
        <span class="picker-name">{f.name}</span>
        <span class="project-sub">{prettyPath(f.path.slice(0, f.path.length - f.name.length))}</span>
      </div>
    </div>
  ) as HTMLDivElement
  row.addEventListener('mouseenter', onMouseEnter)
  return row
}
