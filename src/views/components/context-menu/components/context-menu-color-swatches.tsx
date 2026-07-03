import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import type { ColorOption } from '../context-menu.types'
import { NODE_PALETTE, makeSwatchClick } from '../context-menu.state'

// The root-level color row: a "none" swatch plus one swatch per palette color,
// each marked active when it matches the current selection. Rendered directly into
// the menu host so its gea tree is rooted there and survives the container's move
// into <body>. Data comes via the constructor into a plain field — a gea Component
// only populates `this.props` when rendered from a parent template, never a manual
// `new X()`. Self-contained — no @ui (§2.7).
export default class ColorSwatches extends Component {
  private readonly color: ColorOption

  constructor(opts: { color: ColorOption }) {
    super()
    this.color = opts.color
  }

  template() {
    const color = this.color
    return (
      <div class="context-menu-swatches">
        <button
          class={
            'context-menu-swatch context-menu-swatch-none' +
            (color.current === null ? ' context-menu-swatch-active' : '')
          }
          title={UITexts.Components.noColor}
          onClick={makeSwatchClick(color.onPick, null)}
        />
        {NODE_PALETTE.map((c) => (
          <button
            key={c}
            class={'context-menu-swatch' + (color.current === c ? ' context-menu-swatch-active' : '')}
            style={{ background: c }}
            onClick={makeSwatchClick(color.onPick, c)}
          />
        ))}
      </div>
    )
  }
}

// Renders the color-swatch row into the menu host.
export function createColorSwatches(color: ColorOption, menu: HTMLDivElement): void {
  new ColorSwatches({ color }).render(menu)
}
