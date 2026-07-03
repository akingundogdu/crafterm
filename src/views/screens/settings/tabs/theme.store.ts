import { Store } from '@geajs/core'
import { settings } from '@views/state/spine'
import { COLOR_KEYS, setThemeName, themeColorSource } from './appearance.state'

interface ColorEntry {
  key: string
  value: string
}

// Reactive state for the Theme settings panel. `themeName` (drives the select value
// + whether the ANSI grid is editable) and `colors` (the grid rows) are read
// directly in the ThemeBody template, so gea re-renders it whenever the theme
// changes — the ssh.store pattern (a bare rev counter read via `void store.rev` is
// NOT tracked by the gea compiler, so the mutated data must live in real reactive
// fields the template actually reads). settings stays the source of truth; this
// store mirrors the slice the panel renders.
class ThemeStore extends Store {
  themeName = ''
  colors: ColorEntry[] = []

  // Mirror the current theme + its color source into the reactive fields.
  sync(): void {
    const src = themeColorSource()
    this.themeName = settings.themeName
    this.colors = COLOR_KEYS.map((key) => ({ key, value: src[key] || '#000000' }))
  }

  // Switch the active theme (applies + persists) and refresh the mirrored state.
  selectTheme(name: string): void {
    setThemeName(name)
    this.sync()
  }
}

export default new ThemeStore()
