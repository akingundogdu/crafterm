import { describe, it, expect } from 'vitest'
import { themes, defaultThemeName, withSelection, SELECTION_BACKGROUND, SELECTION_FOREGROUND } from '@ui/themes/themes'

const ANSI = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightWhite', 'brightCyan'
]

describe('themes', () => {
  it('exposes the 7 built-ins + GitHub Dark default', () => {
    expect(defaultThemeName).toBe('GitHub Dark')
    expect(themes[defaultThemeName]).toBeDefined()
    for (const name of ['GitHub Dark', 'Dracula', 'One Dark', 'Nord', 'Solarized Dark', 'Tokyo Night', 'Monokai']) {
      expect(themes[name], name).toBeDefined()
    }
  })

  it('each theme has bg/fg/cursor + the 16 ANSI colors as hex strings', () => {
    for (const [name, t] of Object.entries(themes)) {
      expect(typeof t.background, name).toBe('string')
      expect(typeof t.foreground, name).toBe('string')
      expect(typeof t.cursor, name).toBe('string')
      for (const k of ANSI) expect(typeof (t as Record<string, unknown>)[k], `${name}.${k}`).toBe('string')
    }
  })

  it('the app fallback idiom resolves an unknown name to the default', () => {
    expect(themes['Nonexistent']).toBeUndefined()
    expect(themes['Nonexistent'] ?? themes[defaultThemeName]).toBe(themes['GitHub Dark'])
  })

  it('withSelection adds the selection colors without mutating the input', () => {
    const base = themes['Dracula']
    const withSel = withSelection(base)
    expect(withSel.selectionBackground).toBe(SELECTION_BACKGROUND)
    expect(withSel.selectionForeground).toBe(SELECTION_FOREGROUND)
    expect(withSel.background).toBe(base.background)
    expect((base as Record<string, unknown>).selectionBackground).toBeUndefined()
  })
})
