import { settings } from '@views/state/spine'

// Settings-local copy of the keybindings helper (§2.7 self-contained; vanishes at
// teardown when the shared keybindings module migrates). Bindings live in
// settings.bindings (shared with the shell via the spine bridge), so set/reset/
// effectiveCombo stay live across trees; only the in-flight `recording` flag is
// local — harmless because the open settings overlay (`.modal-overlay`) already
// makes the shell surrender its global shortcuts while a combo is captured.

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
  { id: 'folder-picker', label: 'Open folder picker', default: 'cmd+alt+p' },
  { id: 'command-palette', label: 'Command palette', default: 'cmd+shift+p' },
  { id: 'focus-search', label: 'Focus search', default: 'cmd+shift+f' },
  { id: 'toggle-sidebar', label: 'Toggle sidebar', default: 'cmd+b' },
  { id: 'new-folder', label: 'New folder', default: '' },
  { id: 'start-screen', label: 'Show start screen', default: 'cmd+shift+n' },
  { id: 'split-right', label: 'Split pane (right)', default: 'cmd+d' },
  { id: 'split-claude', label: 'Split pane with Claude', default: 'cmd+shift+d' },
  { id: 'split-picker', label: 'Split pane with project picker', default: 'cmd+alt+t' },
  { id: 'global-search', label: 'Global search (Spotlight)', default: 'cmd+j' },
  { id: 'spotlight', label: 'Spotlight (unified search)', default: 'cmd+p' },
  { id: 'spotlight-files', label: 'Spotlight: Files', default: '' },
  { id: 'spotlight-commands', label: 'Spotlight: Commands', default: '' },
  { id: 'spotlight-claude', label: 'Spotlight: Claude sessions', default: '' },
  { id: 'spotlight-terminals', label: 'Spotlight: Terminals', default: '' },
  { id: 'spotlight-shortcuts', label: 'Spotlight: Shortcuts', default: '' },
  { id: 'spotlight-plans', label: 'Spotlight: Plans', default: '' },
  { id: 'spotlight-bookmarks', label: 'Spotlight: Bookmarks', default: '' },
  { id: 'spotlight-apps', label: 'Spotlight: Applications', default: '' },
  { id: 'spotlight-tasks', label: 'Spotlight: Tasks', default: '' },
  { id: 'spotlight-projects', label: 'Spotlight: Projects', default: '' },
  { id: 'spotlight-notebooks', label: 'Spotlight: Notebooks', default: '' },
  { id: 'spotlight-accounts', label: 'Spotlight: Accounts', default: '' },
  { id: 'cycle-next', label: 'Next pane', default: 'cmd+]' },
  { id: 'cycle-prev', label: 'Previous pane', default: 'cmd+[' },
  { id: 'equalize', label: 'Distribute panes evenly', default: 'cmd+shift+e' },
  { id: 'settings', label: 'Open settings', default: 'cmd+,' },
  { id: 'improve', label: 'Open Improve Crafterm', default: 'cmd+shift+l' },
  { id: 'daily-board', label: 'Open Daily Plan board', default: 'cmd+shift+k' },
  { id: 'rename', label: 'Rename selected item / New reminder (in a terminal)', default: 'cmd+shift+r' }
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
// macOS remaps `e.key` when Option is held (e.g. Option+T → "†"); fall back to
// `e.code` (KeyT/Digit1/…) so Cmd+Alt+letter bindings stay layout-stable.
export function comboFromEvent(e: KeyboardEvent): string {
  if (!e.metaKey) return ''
  const parts = ['cmd']
  if (e.ctrlKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  let key = e.key.toLowerCase()
  if (e.altKey) {
    if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase()
    else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5)
  }
  parts.push(key)
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
