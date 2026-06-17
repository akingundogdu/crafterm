import { settings, applyBgColor, resolveTheme } from '../../../state'
import { persistence } from '../../../services/storage/persistence.service'
import { applyAppearance } from '../../../pane'
import { themes } from '../../../themes'
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
  panel.insertAdjacentHTML('beforeend', '<h3>Appearance</h3>')
  const fam = labeledInput(panel, 'Font family', 'text', settings.font.family, (v) => {
    settings.font.family = v
    applyAppearance()
    persistence.save()
  })
  fam.style.maxWidth = '280px'
  labeledInput(panel, 'Terminal font size', 'number', String(settings.font.size), (v) => {
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
    'Code editor theme',
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
  const field = document.createElement('div')
  field.className = 'field'
  const lab = document.createElement('label')
  lab.textContent = 'Background'

  const row = document.createElement('div')
  row.className = 'bg-swatches'

  const apply = (color: string): void => {
    settings.bgColor = color
    applyBgColor()
    applyAppearance()
    persistence.save()
    mark()
  }

  const swatches: HTMLButtonElement[] = []
  BG_PRESETS.forEach((c) => {
    const s = document.createElement('button')
    s.className = 'bg-swatch'
    s.style.background = c
    s.title = c
    s.addEventListener('click', () => apply(c))
    row.appendChild(s)
    swatches.push(s)
  })

  // free color picker for anything else
  const custom = document.createElement('input')
  custom.type = 'color'
  custom.className = 'bg-custom'
  custom.value = /^#[0-9a-fA-F]{6}$/.test(settings.bgColor) ? settings.bgColor : '#000000'
  custom.title = 'Custom color'
  custom.addEventListener('input', () => apply(custom.value))
  row.appendChild(custom)

  const mark = (): void => {
    swatches.forEach((s, i) => s.classList.toggle('active', BG_PRESETS[i] === settings.bgColor))
  }
  mark()

  field.append(lab, row)
  panel.appendChild(field)
}

export function buildThemePanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Theme</h3>')
  const sel = labeledSelect(
    panel,
    'Theme',
    [...Object.keys(themes), 'Custom'].map((n) => [n, n] as [string, string]),
    settings.themeName,
    () => {}
  )

  const copyBtn = document.createElement('button')
  copyBtn.textContent = 'Copy current colors → Custom'
  copyBtn.className = 'settings-inline-btn'
  panel.appendChild(copyBtn)

  const colorWrap = document.createElement('div')
  colorWrap.className = 'color-grid'
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
      const rowEl = document.createElement('div')
      rowEl.className = 'color-row'
      const label = document.createElement('label')
      label.textContent = key
      const color = document.createElement('input')
      color.type = 'color'
      color.value = toHex6(val)
      const hex = document.createElement('input')
      hex.type = 'text'
      hex.value = val
      const apply = (v: string): void => {
        settings.customTheme[key] = v
        color.value = toHex6(v)
        hex.value = v
        if (settings.themeName === 'Custom') {
          applyAppearance()
          persistence.save()
        }
      }
      color.addEventListener('input', () => apply(color.value))
      hex.addEventListener('change', () => apply(hex.value))
      rowEl.append(label, color, hex)
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

