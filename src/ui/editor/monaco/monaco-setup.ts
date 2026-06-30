import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import { PALETTES, DEFAULT_EDITOR_THEME, type EditorThemePalette } from './editor-themes'
import themelist from '../../../../node_modules/monaco-themes/themes/themelist.json'
import { appService , monacoService } from '@services'

// Shared Monaco bootstrap for the code editor + SQL editor: wires language-
// service workers (via Vite's `?worker` imports) and registers themes built from
// the shared palettes. Importing this module installs the worker environment.

;(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}

// Resolve a palette color to a concrete hex Monaco accepts. CSS custom
// properties (var(--x)) are read off the document root; anything else passes
// through. Falls back to a sane dark value when resolution fails.
function resolveColor(c: string, fallback: string): string {
  let v = c.trim()
  const m = /^var\((--[\w-]+)\)$/.exec(v)
  if (m) v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim()
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback
}

// Monaco theme rule foregrounds are hex WITHOUT the leading '#'.
function tok(c: string): string {
  return c.replace(/^#/, '')
}

function themeId(name: string): string {
  return 'crafterm-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function defineTheme(name: string, p: EditorThemePalette): void {
  const bg = resolveColor(p.bg, '#0d1117')
  const text = resolveColor(p.text, '#e6edf3')
  monaco.editor.defineTheme(themeId(name), {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: tok(text), background: tok(bg) },
      { token: 'comment', foreground: tok(p.comment), fontStyle: 'italic' },
      { token: 'keyword', foreground: tok(p.keyword) },
      { token: 'string', foreground: tok(p.string) },
      { token: 'number', foreground: tok(p.number) },
      { token: 'operator', foreground: tok(p.operator) },
      { token: 'delimiter', foreground: tok(text) },
      { token: 'type', foreground: tok(p.type) },
      { token: 'identifier', foreground: tok(p.identifier) },
      { token: 'function', foreground: tok(p.function) },
      { token: 'variable', foreground: tok(p.identifier) },
      { token: 'constant', foreground: tok(p.bool) },
      { token: 'tag', foreground: tok(p.type) },
      { token: 'attribute.name', foreground: tok(p.property) },
      { token: 'attribute.value', foreground: tok(p.string) },
      { token: 'annotation', foreground: tok(p.meta) },
      { token: 'namespace', foreground: tok(p.type) }
    ],
    colors: {
      'editor.background': bg,
      'editor.foreground': text,
      'editorGutter.background': bg
    }
  })
}

let themesReady = false
export function ensureThemes(): void {
  if (themesReady) return
  themesReady = true
  for (const [name, p] of Object.entries(PALETTES)) defineTheme(name, p)
}

// Map a built-in palette name to its registered Monaco theme id.
export function monacoThemeFor(name: string): string {
  return PALETTES[name] ? themeId(name) : themeId(DEFAULT_EDITOR_THEME)
}

// ---- Theme catalog: built-in palettes + the monaco-themes collection --------

const BUILTIN_NAMES = Object.keys(PALETTES)
const EXTERNAL_NAMES = Object.values(themelist as Record<string, string>).filter(
  (n) => !PALETTES[n]
)
// All selectable themes: our palette themes first, then the monaco-themes set.
export const ALL_THEME_NAMES: string[] = [...BUILTIN_NAMES, ...EXTERNAL_NAMES]

function externalId(name: string): string {
  return 'mt-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

const loadedExternal = new Set<string>()
let activeName = DEFAULT_EDITOR_THEME
let activeId = themeId(DEFAULT_EDITOR_THEME)

export function currentThemeId(): string {
  return activeId
}
export function currentThemeName(): string {
  return activeName
}

// Set the global Monaco theme (Monaco themes are global — one active theme for
// every editor). Built-ins apply synchronously; monaco-themes load on first use.
export async function applyTheme(name: string): Promise<void> {
  ensureThemes()
  if (PALETTES[name]) {
    activeName = name
    activeId = themeId(name)
    monaco.editor.setTheme(activeId)
    return
  }
  const id = externalId(name)
  if (!loadedExternal.has(name)) {
    const data = await monacoService.theme(name)
    if (!data) return // unknown theme / read failed — leave the current one active
    monaco.editor.defineTheme(id, data as unknown as monaco.editor.IStandaloneThemeData)
    loadedExternal.add(name)
  }
  activeName = name
  activeId = id
  monaco.editor.setTheme(id)
}

export { monaco }
