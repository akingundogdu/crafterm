import { UITexts } from '@texts'

export interface ApplicationCheckboxRowProps {
  name: string
  cmd: string
  env: string
  // When true, render the feature-setup variant: a `feature-app-row` div with an
  // extra worktree checkbox. Otherwise render the run-apps `<label>` variant.
  withWorktree?: boolean
}

export interface ApplicationCheckboxRow {
  row: HTMLElement
  // The include/run checkbox.
  checkbox: HTMLInputElement
  // The worktree checkbox — present only in the feature-setup variant.
  worktreeCheckbox?: HTMLInputElement
}

// Builds one app row for the run / feature modals. Holds the row props and
// exposes render(), which produces the run-apps `<label>` variant or the
// feature-setup `feature-app-row` div (with an extra worktree checkbox).
export class ApplicationCheckboxRowController {
  private readonly name: string
  private readonly cmd: string
  private readonly env: string
  private readonly withWorktree: boolean

  constructor({ name, cmd, env, withWorktree = false }: ApplicationCheckboxRowProps) {
    this.name = name
    this.cmd = cmd
    this.env = env
    this.withWorktree = withWorktree
  }

  render(): ApplicationCheckboxRow {
    const { name, cmd, env } = this
    if (!this.withWorktree) {
      const checkbox = (
        <input
          type="checkbox"
          ref={(el: HTMLInputElement) => {
            el.checked = !!cmd
            el.disabled = !cmd
          }}
        />
      ) as HTMLInputElement
      const row = (
        <label class={'run-app-row' + (cmd ? '' : ' disabled')}>
          {checkbox}
          <span class="run-app-name">{name}</span>
          <span class="run-app-cmd">{cmd || `no command for ${env}`}</span>
        </label>
      ) as HTMLLabelElement
      return { row, checkbox }
    }

    const checkbox = (
      <input
        type="checkbox"
        title={UITexts.Pickers.project.includeTitle}
        ref={(el: HTMLInputElement) => {
          el.checked = !!cmd
          el.disabled = !cmd
        }}
      />
    ) as HTMLInputElement
    const worktreeCheckbox = (
      <input
        type="checkbox"
        ref={(el: HTMLInputElement) => {
          el.disabled = !cmd
        }}
      />
    ) as HTMLInputElement
    const wtLabel = (
      <label class="feature-wt">
        {worktreeCheckbox}
        worktree
      </label>
    ) as HTMLLabelElement
    const row = (
      <div class={'run-app-row feature-app-row' + (cmd ? '' : ' disabled')}>
        {checkbox}
        <span class="run-app-name">{name}</span>
        <span class="run-app-cmd">{cmd || `no command for ${env}`}</span>
        {wtLabel}
      </div>
    ) as HTMLDivElement
    return { row, checkbox, worktreeCheckbox }
  }
}
