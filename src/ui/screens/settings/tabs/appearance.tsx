import { settings } from '@ui/state/state'
import { UITexts } from '@texts'
import { themes } from '@ui/themes/themes'
import { ALL_THEME_NAMES } from '../../../editor/monaco/monaco-setup'
import { labeledInput, labeledSelect } from '../shared'
import { buildColorRow } from './components/color-row'
import { buildBackgroundSwatchControl } from './components/background-swatch-control'
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
  const field = buildBackgroundSwatchControl({
    presets: BG_PRESETS,
    currentBgColor: () => settings.bgColor,
    customColor: settings.bgColor,
    onApply: applyBackground
  })
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
      colorWrap.appendChild(buildColorRow({ key, value: val, onApply: setCustomColor }))
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
