// Types for the iOS worktree sidebar add-on.

export type RunTarget = { kind: 'device' | 'simulator'; name: string; udid: string; scheme?: string }
