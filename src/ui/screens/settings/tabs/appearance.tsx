import { settings } from '@ui/state/state'
import { UITexts } from '@texts'
import { themes } from '@ui/themes/themes'
import { ALL_THEME_NAMES } from '../../../editor/monaco-setup'
import { toHex6, labeledInput, labeledSelect } from '../shared'
import {
  BG_PRESETS,
  COLOR_KEYS,
  setFontFamily,
  setFontSize,
  setEditorTheme,
  applyBackground,
  setThemeName,
  copyCurrentToCustom,
  setCustomColor,
  themeColorSource
} from './appearance.state'

export function buildAppearancePanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.appearance.heading}</h3>`)
  const fam = labeledInput(panel, UITexts.Settings.appearance.fontFamily, 'text', settings.font.family, setFontFamily)
  fam.style.maxWidth = '280px'
  labeledInput(panel, UITexts.Settings.appearance.terminalFontSize, 'number', String(settings.font.size), setFontSize)
  buildBackgroundControl(panel)
  labeledSelect(
    panel,
    UITexts.Settings.appearance.codeEditorTheme,
    ALL_THEME_NAMES.map((n) => [n, n] as [string, string]),
    settings.editorTheme,
    setEditorTheme
  )
}

function buildBackgroundControl(panel: HTMLElement): void {
  const apply = (color: string): void => {
    applyBackground(color)
    mark()
  }

  const swatches: HTMLButtonElement[] = []
  const swatchEls = BG_PRESETS.map(
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

  // free color picker for anything else
  const custom = (
    <input
      type="color"
      class="bg-custom"
      title={UITexts.Settings.appearance.customColor}
      ref={(el: HTMLInputElement) => {
        el.value = /^#[0-9a-fA-F]{6}$/.test(settings.bgColor) ? settings.bgColor : '#000000'
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
    swatches.forEach((s, i) => s.classList.toggle('active', BG_PRESETS[i] === settings.bgColor))
  }
  mark()

  const field = (
    <div class="field">
      <label>{UITexts.Settings.appearance.background}</label>
      {row}
    </div>
  ) as HTMLDivElement
  panel.appendChild(field)
}

export function buildThemePanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.appearance.themeHeading}</h3>`)
  const sel = labeledSelect(
    panel,
    UITexts.Settings.appearance.theme,
    [...Object.keys(themes), 'Custom'].map((n) => [n, n] as [string, string]),
    settings.themeName,
    () => {}
  )

  const copyBtn = (
    <button class="settings-inline-btn">Copy current colors → Custom</button>
  ) as HTMLButtonElement
  panel.appendChild(copyBtn)

  const colorWrap = (<div class="color-grid" />) as HTMLDivElement
  panel.appendChild(colorWrap)

  const renderColors = (): void => {
    colorWrap.replaceChildren()
    const editable = settings.themeName === 'Custom'
    colorWrap.style.opacity = editable ? '1' : '0.4'
    colorWrap.style.pointerEvents = editable ? 'auto' : 'none'
    const src = themeColorSource()
    COLOR_KEYS.forEach((key) => {
      const val = src[key] || '#000000'
      const color = (
        <input
          type="color"
          ref={(el: HTMLInputElement) => {
            el.value = toHex6(val)
          }}
          onInput={() => apply(color.value)}
        />
      ) as HTMLInputElement
      const hex = (
        <input
          type="text"
          ref={(el: HTMLInputElement) => {
            el.value = val
          }}
          onChange={() => apply(hex.value)}
        />
      ) as HTMLInputElement
      const apply = (v: string): void => {
        color.value = toHex6(v)
        hex.value = v
        setCustomColor(key, v)
      }
      const rowEl = (
        <div class="color-row">
          <label>{key}</label>
          {color}
          {hex}
        </div>
      ) as HTMLDivElement
      colorWrap.appendChild(rowEl)
    })
  }

  sel.addEventListener('change', () => {
    setThemeName(sel.value)
    renderColors()
  })
  copyBtn.addEventListener('click', () => {
    copyCurrentToCustom()
    sel.value = 'Custom'
    renderColors()
  })
  renderColors()
}
