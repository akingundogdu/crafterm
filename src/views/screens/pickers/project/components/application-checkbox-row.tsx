import { Component } from '@geajs/core'
import { UITexts } from '@texts'

export interface ApplicationCheckboxRowProps {
  name: string
  cmd: string
  env: string
  // The include/run checkbox state — bound to a reactive store field so a toggle
  // re-renders; `onToggle` writes the new value back.
  checked: boolean
  onToggle: (value: boolean) => void
  // When true, render the feature-setup variant: a `feature-app-row` div with an
  // extra worktree checkbox. Otherwise render the run-apps `<label>` variant.
  withWorktree?: boolean
  worktreeChecked?: boolean
  onToggleWorktree?: (value: boolean) => void
}

// One app row for the run / feature modals: a checkbox, the app name, and the
// resolved command for the selected environment (or a "no command" hint when the
// app has none, which disables the row). Rendered as a JSX child, so gea populates
// `this.props`; the checked state lives in the owning store (reactive) so toggles
// re-render.
export default class ApplicationCheckboxRow extends Component {
  declare props: ApplicationCheckboxRowProps

  template({
    name,
    cmd,
    env,
    checked,
    onToggle,
    withWorktree,
    worktreeChecked,
    onToggleWorktree
  }: this['props']) {
    const cmdText = cmd || `no command for ${env}`
    const disabled = !cmd

    if (!withWorktree) {
      return (
        <label class={'run-app-row' + (cmd ? '' : ' disabled')}>
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e: Event) => onToggle((e.target as HTMLInputElement).checked)}
          />
          <span class="run-app-name">{name}</span>
          <span class="run-app-cmd">{cmdText}</span>
        </label>
      )
    }

    return (
      <div class={'run-app-row feature-app-row' + (cmd ? '' : ' disabled')}>
        <input
          type="checkbox"
          title={UITexts.Pickers.project.includeTitle}
          checked={checked}
          disabled={disabled}
          onChange={(e: Event) => onToggle((e.target as HTMLInputElement).checked)}
        />
        <span class="run-app-name">{name}</span>
        <span class="run-app-cmd">{cmdText}</span>
        <label class="feature-wt">
          <input
            type="checkbox"
            checked={!!worktreeChecked}
            disabled={disabled}
            onChange={(e: Event) => onToggleWorktree?.((e.target as HTMLInputElement).checked)}
          />
          worktree
        </label>
      </div>
    )
  }
}
