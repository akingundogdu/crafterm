import { Component } from '@geajs/core'
import './color-row.css'
import { toHex6 } from '../../shared'
import { UITexts } from '@texts'

export interface ColorRowProps {
  colorKey: string
  value: string
  onApply: (key: string, value: string) => void
  // Hint shown in the hex input while the value is blank (e.g. "Default").
  placeholder?: string
  // When set, a reset button is rendered that clears the value back to blank.
  onClear?: () => void
}

// One labeled color picker + hex input row. Rendered as a JSX child of the theme
// grid, so gea populates `this.props`. The two inputs stay in sync: a change to
// either applies via onApply and reflects into the other. The inputs are
// uncontrolled and seeded in onAfterRender (a `value=` binding would make gea treat
// them as controlled and reset on every render); the parent re-keys a row when its
// value changes, forcing a fresh mount + re-seed. Self-contained — no @ui.
export default class ColorRow extends Component {
  declare props: ColorRowProps
  colorEl: HTMLInputElement | null = null
  hexEl: HTMLInputElement | null = null

  private apply = (v: string): void => {
    if (this.colorEl) this.colorEl.value = toHex6(v)
    if (this.hexEl) this.hexEl.value = v
    this.props.onApply(this.props.colorKey, v)
  }

  // Blank both inputs and hand the reset to the owner (which stores '' — the
  // "use the theme default" value — rather than a color).
  private clear = (): void => {
    if (this.colorEl) this.colorEl.value = toHex6('')
    if (this.hexEl) this.hexEl.value = ''
    this.props.onClear?.()
  }

  onAfterRender(): void {
    if (this.colorEl) this.colorEl.value = toHex6(this.props.value)
    if (this.hexEl) this.hexEl.value = this.props.value
  }

  template({ colorKey, placeholder, onClear }: this['props']) {
    return (
      <div class="color-row">
        <label>{colorKey}</label>
        <input
          type="color"
          ref={this.colorEl}
          onInput={(e: Event) => this.apply((e.currentTarget as HTMLInputElement).value)}
        />
        <input
          type="text"
          placeholder={placeholder}
          ref={this.hexEl}
          onChange={(e: Event) => this.apply((e.currentTarget as HTMLInputElement).value)}
        />
        {onClear ? (
          <button type="button" class="color-row-reset" title={UITexts.Settings.appearance.resetToDefault} onClick={this.clear}>
            {UITexts.Settings.appearance.reset}
          </button>
        ) : null}
      </div>
    )
  }
}
