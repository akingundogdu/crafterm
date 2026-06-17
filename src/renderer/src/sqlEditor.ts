import { monaco, ensureThemes, currentThemeId, applyTheme } from './editor/monaco-setup'
import { EDITOR_THEME_NAMES, DEFAULT_EDITOR_THEME } from './editor/editor-themes'
import type { DbEngine } from './types'

// Monaco-backed SQL editor: dialect-aware highlighting, schema autocomplete
// (table/column IntelliSense), and the shared color themes. Cmd/Ctrl+Enter runs
// the query. Themes are global to Monaco (shared with the code editor pane).

export const SQL_THEME_NAMES = EDITOR_THEME_NAMES
export const DEFAULT_SQL_THEME = DEFAULT_EDITOR_THEME

const SQL_LANGS = ['sql', 'mysql', 'pgsql']
function langOf(e: DbEngine): string {
  return e === 'mysql' ? 'mysql' : e === 'sqlite' ? 'sql' : 'pgsql'
}

// Per-model schema (table → columns), looked up by the shared completion
// provider so each pane suggests its own connection's objects.
interface ModelSchema {
  tables: string[]
  columns: Record<string, string[]>
}
const schemas = new Map<string, ModelSchema>()

let providerRegistered = false
function registerProviderOnce(): void {
  if (providerRegistered) return
  providerRegistered = true
  for (const lang of SQL_LANGS) {
    monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: ['.', ' '],
      provideCompletionItems(model, position) {
        const s = schemas.get(model.uri.toString())
        if (!s) return { suggestions: [] }
        const word = model.getWordUntilPosition(position)
        const range = new monaco.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn
        )
        const suggestions: monaco.languages.CompletionItem[] = []
        for (const t of s.tables) {
          suggestions.push({
            label: t,
            kind: monaco.languages.CompletionItemKind.Struct,
            insertText: t,
            range
          })
          for (const c of s.columns[t] ?? []) {
            suggestions.push({
              label: `${t}.${c}`,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: c,
              detail: t,
              range
            })
          }
        }
        return { suggestions }
      }
    })
  }
}

let modelSeq = 0

export interface SqlEditor {
  getValue(): string
  setSchema(engine: DbEngine, schema: Record<string, string[]>): void
  setTheme(name: string): void
  focus(): void
  dispose(): void
}

export function createSqlEditor(opts: {
  parent: HTMLElement
  doc: string
  engine: DbEngine
  themeName?: string
  onRun: () => void
}): SqlEditor {
  ensureThemes()
  registerProviderOnce()

  const uri = monaco.Uri.parse(`sqlpane:/query-${modelSeq++}.sql`)
  const model = monaco.editor.createModel(opts.doc, langOf(opts.engine), uri)
  const key = uri.toString()
  schemas.set(key, { tables: [], columns: {} })

  const editor = monaco.editor.create(opts.parent, {
    model,
    theme: currentThemeId(),
    fontSize: 13,
    fontFamily: 'var(--mono, Menlo, Monaco, monospace)',
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    renderWhitespace: 'selection',
    suggestOnTriggerCharacters: true
  })

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => opts.onRun())

  return {
    getValue: () => model.getValue(),
    setSchema: (engine, schema) => {
      monaco.editor.setModelLanguage(model, langOf(engine))
      schemas.set(key, { tables: Object.keys(schema), columns: schema })
    },
    setTheme: (name) => void applyTheme(name),
    focus: () => editor.focus(),
    dispose: () => {
      schemas.delete(key)
      editor.dispose()
      model.dispose()
    }
  }
}
