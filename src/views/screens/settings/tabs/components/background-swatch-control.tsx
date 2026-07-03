import { Component } from '@geajs/core'
import '@views/components/form-field/form-field.css'
import { UITexts } from '@texts'

export interface BackgroundSwatchControlProps {
  presets: readonly string[]
  currentBgColor: () => string
  customColor: string
  onApply: (color: string) => void
}

// One preset background swatch. Rendered as a JSX child of the swatch strip (a
// `.map()` returning child Components is safe for handlers — unlike a nested raw
// element in a keyed map). Its color both tints the button and identifies it when
// the parent re-marks the active swatch.
class BgSwatch extends Component {
  declare props: { color: string; onApply: (color: string) => void }

  template({ color, onApply }: this['props']) {
    return <button class="bg-swatch" title={color} style={{ background: color }} onClick={() => onApply(color)} />
  }
}

// Background color control: a strip of preset swatches plus a free color picker.
// Applying any value calls onApply and re-marks the active swatch against the live
// background color (read via currentBgColor). Inline `.field` markup (§5.9 — no
// FormField wrapper). Mounted as a JSX child of the appearance panel, so gea
// populates `this.props`. The active-swatch marking is imperative (classList toggle
// via a ref), exactly as before — no reactive store is needed. Self-contained — no @ui.
export default class BackgroundSwatchControl extends Component {
  declare props: BackgroundSwatchControlProps
  swatchesEl: HTMLDivElement | null = null
  customEl: HTMLInputElement | null = null

  private apply = (color: string): void => {
    this.props.onApply(color)
    this.mark()
  }

  // Re-mark the active swatch: the button whose color (held in its `title`) matches
  // the live background color.
  private mark = (): void => {
    if (!this.swatchesEl) return
    const cur = this.props.currentBgColor()
    this.swatchesEl.querySelectorAll<HTMLButtonElement>('.bg-swatch').forEach((b) => {
      b.classList.toggle('active', b.title === cur)
    })
  }

  onAfterRender(): void {
    if (this.customEl) {
      this.customEl.value = /^#[0-9a-fA-F]{6}$/.test(this.props.customColor) ? this.props.customColor : '#000000'
    }
    this.mark()
  }

  template({ presets }: this['props']) {
    return (
      <div class="field">
        <label>{UITexts.Settings.appearance.background}</label>
        <div class="bg-swatches" ref={this.swatchesEl}>
          {presets.map((c) => (
            <BgSwatch key={c} color={c} onApply={this.apply} />
          ))}
          <input
            type="color"
            class="bg-custom"
            title={UITexts.Settings.appearance.customColor}
            ref={this.customEl}
            onInput={(e: Event) => this.apply((e.currentTarget as HTMLInputElement).value)}
          />
        </div>
      </div>
    )
  }
}
