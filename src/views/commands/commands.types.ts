// High-level command action types.

// Git quick-actions available from the pane ⋯ menu.
export type GitAction = 'pull' | 'commitPush' | 'commitPushPr' | 'stash' | 'branchPr'

// Drag & drop placement relative to a target sidebar node.
export type DropMode = 'before' | 'after' | 'into'
