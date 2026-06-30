import { clampSelection } from './result-list.state'

// Pure selection-navigation logic for the result list: clamping into range and
// applying a move delta. No DOM — the view owns highlight rendering.
export function moveSelection(current: number, delta: number, length: number): number {
  return clampSelection(current + delta, length)
}

export function applyHighlight(el: HTMLElement, sel: number): void {
  el.querySelectorAll<HTMLElement>('.spot-row').forEach((row, i) => {
    row.classList.toggle('active', i === sel)
  })
}
