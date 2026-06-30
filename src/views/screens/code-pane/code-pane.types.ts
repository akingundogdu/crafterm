// Code editor pane types.

export interface CreateCodePaneOptions {
  path: string
  themeName?: string
  line?: number
}

// The terminal targeted by "Add to chat": a session id plus its working dir.
export interface TargetTerminal {
  id: string
  cwd: string | null
}
