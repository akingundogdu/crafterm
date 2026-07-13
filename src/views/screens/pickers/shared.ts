import './pickers.css'
import { overlayModalShell } from './components/overlay-modal-shell'
import type { OverlayModalHandle } from './shared.types'

export type { OverlayModalHandle } from './shared.types'

// Last path segment (the directory/file name), tolerant of a trailing slash.
export function baseName(p: string): string {
  return p.replace(/\/+$/, '').split('/').pop() || p
}

// The pickers' "contains" search box is the @views search-box — re-exported
// under the legacy name so the per-picker modules consume one impl.
export { searchInputWrapper as makeSearchInput } from './components/search-input-wrapper'

// Shared primitive for the picker family: a bare overlay+modal box with a close
// button. Delegates to the overlay-modal-shell component; kept under the legacy
// name so every per-picker module routes through one place.
export function overlayModal(extraClass = ''): OverlayModalHandle {
  return overlayModalShell(extraClass)
}
