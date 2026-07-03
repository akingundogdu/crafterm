import { Component } from '@geajs/core'
import type { MdFile } from '../finders.types'
import { prettyPath } from '../finders.state'

export interface MdFileRowProps {
  file: MdFile
  active: boolean
  onChoose: () => void
  onHover: () => void
}

// One row in the markdown/file finder lists: the file name plus its containing
// path. The parent owns selection state and keyboard nav, passing the active flag
// and the click/hover handlers. Rendered as a JSX child of the list, so gea
// populates `this.props`.
export default class MdFileRow extends Component {
  declare props: MdFileRowProps

  template({ file, active, onChoose, onHover }: this['props']) {
    return (
      <div class={'pick-row mdfile-row' + (active ? ' active' : '')} onClick={onChoose} onMouseEnter={onHover}>
        <div class="claude-main">
          <span class="picker-name">{file.name}</span>
          <span class="project-sub">{prettyPath(file.path.slice(0, file.path.length - file.name.length))}</span>
        </div>
      </div>
    )
  }
}
