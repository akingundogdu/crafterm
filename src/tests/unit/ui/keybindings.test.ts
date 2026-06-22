import { describe, it, expect, afterEach } from 'vitest'
import { comboFromEvent, comboLabel, effectiveCombo, KEYBINDINGS } from '@ui/keybindings/keybindings'
import { settings } from '@ui/state/state'

const ev = (o: Partial<KeyboardEvent>): KeyboardEvent => o as unknown as KeyboardEvent

afterEach(() => {
  for (const k of Object.keys(settings.bindings)) delete settings.bindings[k]
})

describe('comboFromEvent', () => {
  it('requires Cmd and builds the combo in fixed modifier order', () => {
    expect(comboFromEvent(ev({ metaKey: true, key: 't' }))).toBe('cmd+t')
    expect(comboFromEvent(ev({ metaKey: true, shiftKey: true, key: 'K' }))).toBe('cmd+shift+k') // lowercased
    expect(comboFromEvent(ev({ metaKey: false, key: 't' }))).toBe('') // Cmd required
    expect(comboFromEvent(ev({ metaKey: true, ctrlKey: true, altKey: true, shiftKey: true, key: 'a', code: 'KeyA' }))).toBe('cmd+ctrl+alt+shift+a')
  })

  it('remaps Option-modified keys via e.code', () => {
    expect(comboFromEvent(ev({ metaKey: true, altKey: true, key: '†', code: 'KeyT' }))).toBe('cmd+alt+t')
    expect(comboFromEvent(ev({ metaKey: true, altKey: true, key: '¡', code: 'Digit1' }))).toBe('cmd+alt+1')
  })
})

describe('comboLabel', () => {
  it('maps modifiers + keys to glyphs', () => {
    expect(comboLabel('')).toBe('—')
    expect(comboLabel('cmd+k')).toBe('⌘K')
    expect(comboLabel('cmd+shift+t')).toBe('⌘⇧T')
    expect(comboLabel('cmd+arrowleft')).toBe('⌘←')
    expect(comboLabel('cmd+enter')).toBe('⌘⏎')
  })

  it('round-trips with comboFromEvent', () => {
    expect(comboLabel(comboFromEvent(ev({ metaKey: true, shiftKey: true, key: 'k' })))).toBe('⌘⇧K')
  })
})

describe('effectiveCombo', () => {
  it('prefers an override, else the default, else empty', () => {
    expect(effectiveCombo('new-terminal')).toBe('cmd+t')
    expect(effectiveCombo('does-not-exist')).toBe('')
    settings.bindings['new-terminal'] = 'cmd+shift+t'
    expect(effectiveCombo('new-terminal')).toBe('cmd+shift+t')
  })
})

describe('KEYBINDINGS', () => {
  it('is a non-empty table of {id,label,default} strings', () => {
    expect(KEYBINDINGS.length).toBeGreaterThan(0)
    for (const k of KEYBINDINGS) {
      expect(typeof k.id).toBe('string')
      expect(typeof k.label).toBe('string')
      expect(typeof k.default).toBe('string')
    }
    expect(KEYBINDINGS.find((k) => k.id === 'new-terminal')?.default).toBe('cmd+t')
  })
})
