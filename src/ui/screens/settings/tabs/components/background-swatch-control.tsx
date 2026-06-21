import { UITexts } from '@texts'
import { FormField } from '@ui/components'

interface BackgroundSwatchControlProps {
  presets: readonly string[]
  currentBgColor: () => string
  customColor: string
  onApply: (color: string) => void
}

// Background color control: a strip of preset swatches plus a free color
// picker. Applying any value calls onApply and re-marks the active swatch
// against the live background color (read via currentBgColor).
export function buildBackgroundSwatchControl(props: BackgroundSwatchControlProps): HTMLDivElement {
  const { presets, currentBgColor, customColor, onApply } = props

  const apply = (color: string): void => {
    onApply(color)
    mark()
  }

  const swatches: HTMLButtonElement[] = []
  const swatchEls = presets.map(
    (c) =>
      (
        <button
          class="bg-swatch"
          style={{ background: c }}
          title={c}
          ref={(el: HTMLButtonElement) => swatches.push(el)}
          onClick={() => apply(c)}
        />
      ) as HTMLButtonElement
  )

  const custom = (
    <input
      type="color"
      class="bg-custom"
      title={UITexts.Settings.appearance.customColor}
      ref={(el: HTMLInputElement) => {
        el.value = /^#[0-9a-fA-F]{6}$/.test(customColor) ? customColor : '#000000'
      }}
      onInput={() => apply(custom.value)}
    />
  ) as HTMLInputElement

  const row = (
    <div class="bg-swatches">
      {swatchEls}
      {custom}
    </div>
  ) as HTMLDivElement

  const mark = (): void => {
    swatches.forEach((s, i) => s.classList.toggle('active', presets[i] === currentBgColor()))
  }
  mark()

  return (<FormField label={UITexts.Settings.appearance.background}>{row}</FormField>) as HTMLDivElement
}
