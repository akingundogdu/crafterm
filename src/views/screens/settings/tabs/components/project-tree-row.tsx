import { Component } from '@geajs/core'

export interface ProjectTreeRowProps {
  name: string
  group: string
  appsLabel: string
  active: boolean
  paddingLeft: string
  onSelect: () => void
}

// One row of the project catalog tree (left column of the Projects editor): the
// project name, an optional group tag, and an optional "N apps" badge, indented by
// depth. Rendered as a keyed `.map()` item root (a child Component), so the click
// handler sits on this row's own root, not on a nested element in the parent's map.
export default class ProjectTreeRow extends Component {
  declare props: ProjectTreeRowProps

  template({ name, group, appsLabel, active, paddingLeft, onSelect }: this['props']) {
    return (
      <div class={'proj-li' + (active ? ' active' : '')} style={{ paddingLeft }} onClick={onSelect}>
        <span class="proj-li-name">{name}</span>
        {group ? <span class="proj-li-group">{group}</span> : null}
        {appsLabel ? <span class="proj-li-apps">{appsLabel}</span> : null}
      </div>
    )
  }
}
