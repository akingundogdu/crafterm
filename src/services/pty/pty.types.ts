// Terminal / pty domain data models (moved out of the former bridge api.d.ts).
// (PaneInfo moved to pane.types.ts — it's the pane:* surface.)

// Options for spawning an interactive pty (the visible terminal panes).
export interface PtyCreateOptions {
  cwd?: string
  env?: Record<string, string>
  shell?: string
}

// Options for a background process ("hidden shell"): a one-shot command in a PTY
// keyed by stableId, buffered in main so a view can attach + replay.
export interface ProcStartOptions {
  stableId: string
  command: string
  cwd?: string
  env?: Record<string, string>
}

// main → renderer push payloads.
export interface PtyDataEvent {
  id: string
  data: string
}
export interface ProcExitEvent {
  id: string
  code: number
}
