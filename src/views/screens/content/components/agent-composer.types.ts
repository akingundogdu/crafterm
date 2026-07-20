// Where the ticket's terminal runs: in the project itself, or in a fresh worktree
// branched off the selected base and named after the issue key.
export type ComposerMode = 'local' | 'worktree'

// What a "/" entry does when picked: switch the project, the plan/build mode, the
// run mode, or toggle one of the ticket's labels.
export type SlashKind = 'project' | 'plan' | 'build' | 'local' | 'worktree' | 'label'

export interface SlashItem {
  id: string
  kind: SlashKind
  // What the user types after the "/" — the project name, the label name, or the
  // command word.
  label: string
  // Secondary line: the project path, or what the command switches to.
  detail: string
  projectId?: string
  labelId?: string
  // Label entries only: whether the label is currently on the ticket, so the menu
  // can mark it and picking it reads as a toggle.
  isOn?: boolean
}
