import { INDENT } from '../treeview.state'

// Depth guide lines for a row: vertical ancestor lines + the elbow into this
// node. Pure presentation — takes plain args, no closure state.
export function buildGuides(depth: number, guides: boolean[], isLast: boolean): HTMLElement | null {
  if (depth === 0) return null
  const x = (level: number): number => 10 + level * INDENT + 7
  const lines: HTMLElement[] = []
  for (let level = 0; level < depth - 1; level++) {
    if (!guides[level]) continue
    lines.push((<span class="guide-line" style={{ left: x(level) + 'px' }} />) as HTMLSpanElement)
  }
  return (
    <div class="row-guides">
      {lines}
      <span class={'guide-elbow' + (isLast ? ' last' : '')} style={{ left: x(depth - 1) + 'px' }} />
    </div>
  ) as HTMLDivElement
}
