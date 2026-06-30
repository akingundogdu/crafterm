import { el } from '@views/lib/dom'
import { UITexts } from '@texts'
import type { ColorOption } from '../context-menu.types'
import { NODE_PALETTE, makeSwatchClick } from '../context-menu.state'

// The root-level color row: a "none" swatch plus one swatch per palette color,
// each marked active when it matches the current selection.
export function createColorSwatches(color: ColorOption): HTMLDivElement {
  const none = el('button', {
    class:
      'context-menu-swatch context-menu-swatch-none' +
      (color.current === null ? ' context-menu-swatch-active' : ''),
    title: UITexts.Components.noColor,
    onClick: makeSwatchClick(color.onPick, null)
  })
  const row = el('div', { class: 'context-menu-swatches' }, none)
  for (const c of NODE_PALETTE) {
    const swatch = el('button', {
      class: 'context-menu-swatch' + (color.current === c ? ' context-menu-swatch-active' : ''),
      onClick: makeSwatchClick(color.onPick, c)
    })
    swatch.style.background = c
    row.appendChild(swatch)
  }
  return row
}
