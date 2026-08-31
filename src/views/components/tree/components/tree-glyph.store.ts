import type { TreeIcon } from '../tree.types'

// Inline SVG glyphs for the tree. They are injected as innerHTML by TreeGlyph:
// this project's JSX runtime builds plain HTML nodes and cannot create the
// namespaced SVG elements SVG needs, so each glyph must be a string, not JSX.

export const CHEVRON_SVG =
  '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>'

const FOLDER_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M1.6 4.4c0-.6.4-1 1-1h3.1l1.2 1.4H13.4c.6 0 1 .4 1 1V11.6c0 .6-.4 1-1 1H2.6c-.6 0-1-.4-1-1z" fill="currentColor"/></svg>'

const PROJECT_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M8 1.5l5.5 3.1v6.8L8 14.5 2.5 11.4V4.6z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M2.6 4.7L8 7.8l5.4-3.1M8 7.8v6.5" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>'

const WORKTREE_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="4.5" cy="3.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="4.5" cy="12.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="11.5" cy="3.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 5.1v5.8M11.5 5.1v1.2c0 2.2-1.8 3.4-3.9 3.9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'

const TERMINAL_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="1.6" y="2.6" width="12.8" height="10.8" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M4.4 6l2 2-2 2M8 10.4h3.4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'

const ICON_SVG: Record<TreeIcon, string> = {
  project: PROJECT_SVG,
  worktree: WORKTREE_SVG,
  folder: FOLDER_SVG,
  terminal: TERMINAL_SVG
}

export function iconSvg(icon: TreeIcon | null | undefined): string {
  return icon ? ICON_SVG[icon] : ''
}
