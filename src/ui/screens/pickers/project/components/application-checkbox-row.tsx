import { UITexts } from '@texts'

interface ApplicationCheckboxRowProps {
  name: string
  cmd: string
  env: string
  // When true, render the feature-setup variant: a `feature-app-row` div with an
  // extra worktree checkbox. Otherwise render the run-apps `<label>` variant.
  withWorktree?: boolean
}

interface ApplicationCheckboxRow {
  row: HTMLElement
  // The include/run checkbox.
  checkbox: HTMLInputElement
  // The worktree checkbox — present only in the feature-setup variant.
  worktreeCheckbox?: HTMLInputElement
}

// App row for the run / feature modals: a checkbox, the app name, and the
// resolved command for the selected environment (or a "no command" hint when the
// app has none, which disables the row).
export function applicationCheckboxRow({
  name,
  cmd,
  env,
  withWorktree = false
}: ApplicationCheckboxRowProps): ApplicationCheckboxRow {
  if (!withWorktree) {
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
