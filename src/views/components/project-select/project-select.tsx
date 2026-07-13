import { Component } from '@geajs/core'
import './project-select.css'
import { projectOptions, projectPath, type ProjectOption } from './project-select.store'

export interface ProjectSelectProps {
  // Selected project id; '' selects the empty option (when `emptyLabel` is set).
  value: string
  // Adds a leading '' option with this label ("All projects", "— Select a project —").
  // Omit to offer projects only.
  emptyLabel?: string
  // Renders the selected project's path under the select.
  showPathHint?: boolean
  // Extra classes for the <select> so a host can style it (inline, settings, …).
  selectClass?: string
  onChange?: (id: string) => void
  // Hands the <select> element to the host — for hosts that read/validate it
  // imperatively (the task form marks it invalid and reads its value on commit).
  onSelectRef?: (el: HTMLSelectElement) => void
}

// Shared project dropdown: every project in the sidebar, indented by nesting depth
// and labelled with its issue-key prefix, plus an optional path hint under it. The
// select is UNCONTROLLED — `value` seeds it, the host owns the selection from there
// (a `value=` binding would make gea reset it on every keystroke/render).
export default class ProjectSelect extends Component {
  declare props: ProjectSelectProps

  selectEl: HTMLSelectElement | null = null
  hintEl: HTMLDivElement | null = null

  private options: ProjectOption[] = []

  onAfterRender(): void {
    if (this.selectEl) {
      // Only force the value when an option actually carries it — assigning an id
      // no option has (e.g. '' with no empty option) clears the selection and the
      // select renders blank.
      if (this.options.some((o) => o.id === this.props.value)) this.selectEl.value = this.props.value
      this.props.onSelectRef?.(this.selectEl)
    }
    this.updateHint()
  }

  // The hint is written imperatively: it tracks the select's own (uncontrolled)
  // value, so no re-render — and no lost focus — on every pick.
  private updateHint = (): void => {
    if (!this.hintEl) return
    this.hintEl.textContent = projectPath(this.options, this.selectEl?.value ?? '')
  }

  private onChange = (e: Event): void => {
    this.updateHint()
    this.props.onChange?.((e.target as HTMLSelectElement).value)
  }

  template({ value, emptyLabel, showPathHint, selectClass }: this['props']) {
    this.options = projectOptions(emptyLabel)
    return (
      <div class="project-select">
        <select class={'project-select-input ' + (selectClass ?? '')} ref={this.selectEl} onChange={this.onChange}>
          {this.options.map((o) => (
            <option key={o.id} value={o.id} selected={o.id === value}>
              {o.label}
            </option>
          ))}
        </select>
        {showPathHint ? <div class="project-select-hint" ref={this.hintEl} /> : null}
      </div>
    )
  }
}
