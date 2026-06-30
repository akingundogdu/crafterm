import { ensureThemes, applyTheme } from '../monaco/monaco-setup'
import { EDITOR_THEME_NAMES, DEFAULT_EDITOR_THEME } from '../monaco/editor-themes'
import type { SqlEditor, CreateSqlEditorOptions } from './sql-editor.types'
import {
  schemas,
  registerProviderOnce,
  createSqlModelAndEditor,
  bindRunCommand,
  applyModelSchema
} from './sql-editor.state'

export type { SqlEditor } from './sql-editor.types'

// Monaco-backed SQL editor: dialect-aware highlighting, schema autocomplete
// (table/column IntelliSense), and the shared color themes. Cmd/Ctrl+Enter runs
// the query. Themes are global to Monaco (shared with the code editor pane).
export const SQL_THEME_NAMES = EDITOR_THEME_NAMES
export const DEFAULT_SQL_THEME = DEFAULT_EDITOR_THEME

export function createSqlEditor(opts: CreateSqlEditorOptions): SqlEditor {
  ensureThemes()
  registerProviderOnce()

  const { editor, model, key } = createSqlModelAndEditor(opts)
  bindRunCommand(editor, opts.onRun)

  return {
    getValue: () => model.getValue(),
    setSchema: (engine, schema) => applyModelSchema(model, key, engine, schema),
    setTheme: (name) => void applyTheme(name),
    focus: () => editor.focus(),
    dispose: () => {
      schemas.delete(key)
      editor.dispose()
      model.dispose()
    }
  }
}
