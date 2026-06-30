import { el } from '@views/lib/dom'
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
      const checkbox = el('input', { type: 'checkbox' })
      checkbox.checked = !!cmd
      checkbox.disabled = !cmd
      const row = el(
        'label',
        { class: 'run-app-row' + (cmd ? '' : ' disabled') },
        checkbox,
        el('span', { class: 'run-app-name' }, name),
        el('span', { class: 'run-app-cmd' }, cmd || `no command for ${env}`)
      )
      return { row, checkbox }
    }

    const checkbox = el('input', { type: 'checkbox', title: UITexts.Pickers.project.includeTitle })
    checkbox.checked = !!cmd
    checkbox.disabled = !cmd
    const worktreeCheckbox = el('input', { type: 'checkbox' })
    worktreeCheckbox.disabled = !cmd
    const wtLabel = el('label', { class: 'feature-wt' }, worktreeCheckbox, 'worktree')
    const row = el(
      'div',
      { class: 'run-app-row feature-app-row' + (cmd ? '' : ' disabled') },
      checkbox,
      el('span', { class: 'run-app-name' }, name),
      el('span', { class: 'run-app-cmd' }, cmd || `no command for ${env}`),
      wtLabel
    )
    return { row, checkbox, worktreeCheckbox }
  }
}
