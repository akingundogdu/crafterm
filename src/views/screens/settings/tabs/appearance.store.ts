import { settings, applyBgColor, applySidebarSelectedColor, applyDocFont, resolveTheme } from '@views/state/spine'
import { persistence } from '@repositories/persistence.service'
import { applyAppearance } from '@views/pane/pane'
import { applyTheme } from '@views/editor/monaco/monaco-setup'

export const BG_PRESETS = ['#000000', '#0d1117', '#0d0e12', '#11151c', '#161821', '#1a1b26', '#1e1e2e']

export const COLOR_KEYS = [
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

export function setFontFamily(v: string): void {
  settings.font.family = v
  applyAppearance()
  persistence.save()
}

// Accepts the raw input string; applies only when it parses to 6..40.
export function setFontSize(v: string): void {
  const n = parseInt(v, 10)
  if (!Number.isNaN(n) && n >= 6 && n <= 40) {
    settings.font.size = n
    applyAppearance()
    persistence.save()
  }
}

// The doc font drives the markdown/doc panes AND the agent composer, which sizes
// its whole layout in `em` off it (todomrkhg31kaa). Applies only when it parses to
// 10..28 — the same range Cmd +/- clamps to.
export function setDocFontSize(v: string): void {
  const n = parseInt(v, 10)
  if (!Number.isNaN(n) && n >= 10 && n <= 28) {
    settings.docFontSize = n
    applyDocFont()
    persistence.save()
  }
}

export function setEditorTheme(v: string): void {
  settings.editorTheme = v
  void applyTheme(v)
  persistence.save()
}

export function applyBackground(color: string): void {
  settings.bgColor = color
  applyBgColor()
  applyAppearance()
  persistence.save()
}

export function setSidebarSelectedColor(v: string): void {
  settings.sidebarSelectedColor = v
  applySidebarSelectedColor()
  persistence.save()
}

// Background + text of the selected sidebar row. A blank value is meaningful: it
// stores "no override", so the stylesheet falls back to the theme default.
export function setSidebarSelectedBg(v: string): void {
  settings.sidebarSelectedBg = v.trim()
  applySidebarSelectedColor()
  persistence.save()
}

export function setSidebarSelectedText(v: string): void {
  settings.sidebarSelectedText = v.trim()
  applySidebarSelectedColor()
  persistence.save()
}

// Background + text of the active (open) terminal's filled sidebar card. Blank
// stores "no override", so the card falls back to the accent fill on white.
export function setSidebarActiveBg(v: string): void {
  settings.sidebarActiveBg = v.trim()
  applySidebarSelectedColor()
  persistence.save()
}

export function setSidebarActiveText(v: string): void {
  settings.sidebarActiveText = v.trim()
  applySidebarSelectedColor()
  persistence.save()
}

export function setThemeName(name: string): void {
  settings.themeName = name
  applyAppearance()
  persistence.save()
}

// Snapshots the currently resolved colors into the editable Custom theme.
export function copyCurrentToCustom(): void {
  settings.customTheme = { ...(resolveTheme() as unknown as Record<string, string>) }
  settings.themeName = 'Custom'
  applyAppearance()
  persistence.save()
}

// Writes one Custom-theme color; only re-applies live when Custom is active.
export function setCustomColor(key: string, v: string): void {
  settings.customTheme[key] = v
  if (settings.themeName === 'Custom') {
    applyAppearance()
    persistence.save()
  }
}

// The color map the theme panel reads from (editable Custom, else the resolved
// active theme shown read-only).
export function themeColorSource(): Record<string, string> {
  return settings.themeName === 'Custom'
    ? settings.customTheme
    : (resolveTheme() as unknown as Record<string, string>)
}
