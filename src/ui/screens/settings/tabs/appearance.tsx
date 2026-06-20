import { settings, applyBgColor, resolveTheme } from '@ui/state/state'
import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'
import { applyAppearance } from '@ui/pane/pane'
import { themes } from '@ui/themes/themes'
import { ALL_THEME_NAMES, applyTheme } from '../../../editor/monaco-setup'
import { toHex6, labeledInput, labeledSelect } from '../shared'

const BG_PRESETS = ['#000000', '#0d1117', '#0d0e12', '#11151c', '#161821', '#1a1b26', '#1e1e2e']

const COLOR_KEYS = [
  'background',
  'foreground',
  'cursor',
  'cursorAccent',
  'selectionBackground',
  'selectionForeground',
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite'
] as const

export function buildAppearancePanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.appearance.heading}</h3>`)
  const fam = labeledInput(panel, UITexts.Settings.appearance.fontFamily, 'text', settings.font.family, (v) => {
    settings.font.family = v
    applyAppearance()
    persistence.save()
  })
  fam.style.maxWidth = '280px'
  labeledInput(panel, UITexts.Settings.appearance.terminalFontSize, 'number', String(settings.font.size), (v) => {
    const n = parseInt(v, 10)
    if (!Number.isNaN(n) && n >= 6 && n <= 40) {
      settings.font.size = n
      applyAppearance()
      persistence.save()
    }
  })
  buildBackgroundControl(panel)
  labeledSelect(
    panel,
    UITexts.Settings.appearance.codeEditorTheme,
    ALL_THEME_NAMES.map((n) => [n, n] as [string, string]),
    settings.editorTheme,
    (v) => {
      settings.editorTheme = v
      void applyTheme(v)
      persistence.save()
    }
  )
}

function buildBackgroundControl(panel: HTMLElement): void {
  const apply = (color: string): void => {
    settings.bgColor = color
    applyBgColor()
    applyAppearance()
    persistence.save()
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
    const src =
      settings.themeName === 'Custom'
        ? settings.customTheme
        : (resolveTheme() as unknown as Record<string, string>)
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
        settings.customTheme[key] = v
        color.value = toHex6(v)
        hex.value = v
        if (settings.themeName === 'Custom') {
          applyAppearance()
          persistence.save()
        }
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
    settings.themeName = sel.value
    applyAppearance()
    persistence.save()
    renderColors()
  })
  copyBtn.addEventListener('click', () => {
    settings.customTheme = { ...(resolveTheme() as unknown as Record<string, string>) }
    settings.themeName = 'Custom'
    sel.value = 'Custom'
    applyAppearance()
    persistence.save()
    renderColors()
  })
  renderColors()
}
