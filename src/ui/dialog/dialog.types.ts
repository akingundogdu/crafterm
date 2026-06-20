// Modal prompt option/result types.

export interface PromptTextOptions {
  title: string
  label: string
  value?: string
  placeholder?: string
  confirmText?: string
}

export interface PromptConfirmOptions {
  title: string
  message: string
  confirmText?: string
}

export interface CloseActionsResult {
  markDone: boolean
  deleteWorktree: boolean
}

export interface PromptCloseActionsOptions {
  title: string
  confirmText?: string
  task?: { issueKey?: string | null; title: string }
  worktree?: { branch: string; path: string }
}

export interface PromptSelectOptions {
  title: string
  label: string
  value?: string
  options: string[]
  emptyLabel?: string // label for the '' option; omit to hide the empty choice
  allowCreate?: boolean
  confirmText?: string
}

export interface FormField {
  key: string
  label: string
  value?: string
  placeholder?: string
}

export interface PromptFormOptions {
  title: string
  fields: FormField[]
  confirmText?: string
}
