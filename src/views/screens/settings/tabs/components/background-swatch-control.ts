import { el } from '@views/lib/dom'
import '@views/components/form-field/form-field.css'
import { UITexts } from '@texts'

interface BackgroundSwatchControlProps {
  presets: readonly string[]
  currentBgColor: () => string
  customColor: string
  onApply: (color: string) => void
}

// Background color control: a strip of preset swatches plus a free color
// picker. Applying any value calls onApply and re-marks the active swatch
// against the live background color (read via currentBgColor). Inline `.field`
// markup (§5.9 — no FormField wrapper).
export function buildBackgroundSwatchControl(props: BackgroundSwatchControlProps): HTMLDivElement {
  const { presets, currentBgColor, customColor, onApply } = props

  const apply = (color: string): void => {
    onApply(color)
    mark()
  }

  const swatches: HTMLButtonElement[] = []
  const swatchEls = presets.map((c) => {
    const b = el('button', { class: 'bg-swatch', title: c, onClick: () => apply(c) })
    b.style.background = c
    swatches.push(b)
    return b
  })

  const custom = el('input', {
    type: 'color',
    class: 'bg-custom',
    title: UITexts.Settings.appearance.customColor,
    onInput: () => apply(custom.value)
  })
  custom.value = /^#[0-9a-fA-F]{6}$/.test(customColor) ? customColor : '#000000'

  const row = el('div', { class: 'bg-swatches' }, ...swatchEls, custom)

  const mark = (): void => {
    swatches.forEach((s, i) => s.classList.toggle('active', presets[i] === currentBgColor()))
  }
  mark()

  return el('div', { class: 'field' }, el('label', null, UITexts.Settings.appearance.background), row)
}
