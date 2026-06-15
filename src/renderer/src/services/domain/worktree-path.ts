// Pure path helpers for the git-worktree feature. No DOM, no IPC.

// Drop trailing slashes so two spellings of the same dir compare equal.
export function norm(p: string): string {
  return p.replace(/\/+$/, '')
}

// Last path segment (the directory/worktree name).
export function baseName(p: string): string {
  return norm(p).split('/').pop() || p
}

// Single-quote a string for safe interpolation into a shell command.
export function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}
