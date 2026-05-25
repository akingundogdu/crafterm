import { settings } from './state'

// Editable shortcuts. Combos are stored as `cmd[+ctrl][+alt][+shift]+<key>`
// (Cmd is always required). Special keys (font zoom, Cmd+1..9, pane nav,
// Cmd+W) stay fixed and are not listed here.
export interface KeyAction {
  id: string
  label: string
  default: string
}

export const KEYBINDINGS: KeyAction[] = [
  { id: 'new-terminal', label: 'New terminal', default: 'cmd+t' },
  { id: 'new-claude', label: 'New Claude terminal', default: 'cmd+shift+t' },
  { id: 'open-project', label: 'Open project picker', default: 'cmd+o' },
  { id: 'terminal-switcher', label: 'Open terminal switcher', default: 'cmd+shift+o' },
  { id: 'folder-picker', label: 'Open folder picker', default: 'cmd+p' },
  { id: 'command-palette', label: 'Command palette', default: 'cmd+shift+p' },
  { id: 'focus-search', label: 'Focus search', default: 'cmd+shift+f' },
  { id: 'toggle-sidebar', label: 'Toggle sidebar', default: 'cmd+b' },
  { id: 'new-folder', label: 'New folder', default: 'cmd+shift+n' },
  { id: 'split-right', label: 'Split pane (right)', default: 'cmd+d' },
  { id: 'split-claude', label: 'Split pane with Claude', default: 'cmd+shift+d' },
  { id: 'cycle-next', label: 'Next pane', default: 'cmd+]' },
  { id: 'cycle-prev', label: 'Previous pane', default: 'cmd+[' },
  { id: 'equalize', label: 'Distribute panes evenly', default: 'cmd+shift+e' },
  { id: 'settings', label: 'Open settings', default: 'cmd+,' },
  { id: 'improve', label: 'Open Improve Crafterm', default: 'cmd+shift+l' },
  { id: 'rename', label: 'Rename selected item', default: 'cmd+shift+r' }
]

export function effectiveCombo(id: string): string {
  return settings.bindings[id] ?? KEYBINDINGS.find((k) => k.id === id)?.default ?? ''
}

export function setBinding(id: string, combo: string): void {
  settings.bindings[id] = combo
}

export function resetBinding(id: string): void {
  delete settings.bindings[id]
}

// While true, the global shortcut handler ignores keys (the settings recorder
// is capturing a new combo).
let recording = false
export function setRecording(v: boolean): void {
  recording = v
}
export function isRecording(): boolean {
  return recording
}

export function isModifierKey(key: string): boolean {
  return ['meta', 'shift', 'alt', 'control'].includes(key.toLowerCase())
}

// Canonical combo string from a keydown event (only meaningful with Cmd held).
export function comboFromEvent(e: KeyboardEvent): string {
  if (!e.metaKey) return ''
  const parts = ['cmd']
  if (e.ctrlKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  parts.push(e.key.toLowerCase())
  return parts.join('+')
}

const GLYPH: Record<string, string> = { cmd: '⌘', ctrl: '⌃', alt: '⌥', shift: '⇧' }
const KEYNAME: Record<string, string> = {
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  arrowdown: '↓',
  ' ': 'Space',
  enter: '⏎',
  escape: 'Esc'
}

export function comboLabel(combo: string): string {
  if (!combo) return '—'
  return combo
    .split('+')
    .map((p) => GLYPH[p] ?? KEYNAME[p] ?? (p.length === 1 ? p.toUpperCase() : p))
    .join('')
}
