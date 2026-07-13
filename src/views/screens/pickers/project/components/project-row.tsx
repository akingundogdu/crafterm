import { Component } from '@geajs/core'

export interface ProjectRowProps {
  label: string
  sub?: string
  isActive: boolean
  onChoose: (split: boolean) => void
  onHover: () => void
}

// One project-list row: the project/entry name plus an optional sub-line. Rendered
// as a keyed JSX child of the list so gea populates `this.props`. A click reports
// whether ⌘/ctrl was held (split); selection index + navigation stay in the parent,
// passed in as already-bound handlers.
export default class ProjectRow extends Component {
  declare props: ProjectRowProps

  template({ label, sub, isActive, onChoose, onHover }: this['props']) {
    return (
      <div
        class={'pick-row project-row' + (isActive ? ' active' : '')}
        onClick={(ev: MouseEvent) => onChoose(ev.metaKey || ev.ctrlKey)}
        onMouseEnter={onHover}
      >
        <span class="picker-name">{label}</span>
        {sub ? <span class="project-sub">{sub}</span> : null}
      </div>
    )
  }
}
