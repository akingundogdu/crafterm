import './code-editor.css'
import { applyTheme } from '../monaco/monaco-setup'
import type { CodeEditor, CreateCodeEditorOptions } from './code-editor.types'
import { revealLine, readSelectionRange } from './code-editor.state'
import { runOneTimeSetup } from './code-editor.init.engine'
import { buildEditor } from './code-editor.model.engine'
import { setupSelectionActions } from './code-editor.selection.engine'

export type { CodeEditor } from './code-editor.types'
export { setEditorOpenHandler } from './code-editor.state'

// Monaco-backed code editor pane: VSCode's editor engine (TextMate-grade
// highlighting + full TS/JS IntelliSense out of the box). This is the view layer
// — it composes the engines (init / model / selection) and exposes the imperative
// handle. Worker wiring + themes come from `monaco-setup`.
export function createCodeEditor(opts: CreateCodeEditorOptions): CodeEditor {
  runOneTimeSetup()

  const { editor, model, changeSub } = buildEditor(opts)
  const selectionActions = setupSelectionActions(editor, opts)

  if (opts.line && opts.line > 1) requestAnimationFrame(() => revealLine(editor, model, opts.line!))

  return {
    getValue: () => model.getValue(),
    setValue: (text) => model.setValue(text),
    setTheme: (name) => void applyTheme(name),
    setReadOnly: (ro) => editor.updateOptions({ readOnly: ro }),
    setFontSize: (px) => editor.updateOptions({ fontSize: px }),
    goToLine: (line) => revealLine(editor, model, line),
    getSelection: () => readSelectionRange(editor),
    focus: () => editor.focus(),
    destroy: () => {
      changeSub.dispose()
      selectionActions?.dispose()
      editor.dispose()
      model.dispose()
    }
  }
}
