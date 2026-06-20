export const DEFAULT_FONT = 12
export const MIN_FONT = 8
export const MAX_FONT = 28

// Clamp a font-size change into the allowed range.
export function clampFont(current: number, delta: number): number {
  return Math.max(MIN_FONT, Math.min(MAX_FONT, current + delta))
}

// Build a `path:line` (or `path:a-b` for a multi-line span) reference.
export function buildRef(file: string, a: number, b: number): string {
  return a === b ? `${file}:${a}` : `${file}:${a}-${b}`
}

// Generic mousedown guard: keeps a button click from collapsing the selection.
export function preventAndStop(e: Event): void {
  e.preventDefault()
  e.stopPropagation()
}
