import { Component } from '@geajs/core'
import type { ResumeSession } from '../claude.store'
import { relTime, shortCwd } from '../claude.store'

export interface ResumeSessionRowProps {
  session: ResumeSession
  isActive: boolean
  onSelect: () => void
  onHover: () => void
}

// One row in the resume-session list: the session summary plus a subline of short
// cwd · relative time. Rendered as a keyed JSX child of the list, so gea populates
// `this.props`; the parent owns the selection index and passes the active flag plus
// the click/hover handlers.
export default class ResumeSessionRow extends Component {
  declare props: ResumeSessionRowProps

  template({ session, isActive, onSelect, onHover }: this['props']) {
    const s = session
    return (
      <div
        class={'pick-row project-row' + (isActive ? ' active' : '')}
        onClick={onSelect}
        onMouseEnter={onHover}
      >
        <span class="picker-name">{s.summary || '(no prompt)'}</span>
        <span class="project-sub">{`${shortCwd(s.cwd)} · ${relTime(s.mtimeMs)}`}</span>
      </div>
    )
  }
}
