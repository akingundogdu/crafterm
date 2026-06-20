import { monaco, currentThemeId } from '../monaco/monaco-setup'
import type { DbEngine } from '@ui/types/types'
import type { ModelSchema, CreateSqlEditorOptions } from './sql-editor.types'

const SQL_LANGS = ['sql', 'mysql', 'pgsql']

export function langOf(e: DbEngine): string {
  return e === 'mysql' ? 'mysql' : e === 'sqlite' ? 'sql' : 'pgsql'
}

// Per-model schema registry, keyed by model URI string; read by the shared
// completion provider so each pane suggests its own connection's objects.
export const schemas = new Map<string, ModelSchema>()

let providerRegistered = false
export function registerProviderOnce(): void {
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

export function createSqlModelAndEditor(opts: CreateSqlEditorOptions): {
  editor: monaco.editor.IStandaloneCodeEditor
  model: monaco.editor.ITextModel
  key: string
} {
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
  return { editor, model, key }
}

export function bindRunCommand(editor: monaco.editor.IStandaloneCodeEditor, onRun: () => void): void {
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRun())
}

// Switches the model's SQL dialect and replaces its completion schema.
export function applyModelSchema(
  model: monaco.editor.ITextModel,
  key: string,
  engine: DbEngine,
  schema: Record<string, string[]>
): void {
  monaco.editor.setModelLanguage(model, langOf(engine))
  schemas.set(key, { tables: Object.keys(schema), columns: schema })
}
