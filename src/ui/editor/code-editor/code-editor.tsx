import './code-editor.css'
import { ensureThemes, applyTheme } from '../monaco/monaco-setup'
import type { CodeEditor, CreateCodeEditorOptions } from './code-editor.types'
import {
  configureTsOnce,
  ensureImportNavigation,
  createModelAndEditor,
  bindSaveCommand,
  bindChange,
  mountSelectionActions,
  revealLine,
  readSelectionRange
} from './code-editor.state'
import { createSelectionActions } from './components/selection-actions'

export type { CodeEditor } from './code-editor.types'
export { setEditorOpenHandler } from './code-editor.state'

// Monaco-backed code editor pane: VSCode's editor engine (TextMate-grade
// highlighting + full TS/JS IntelliSense out of the box). This is the view layer
// — it composes the helpers in `code-editor.state.ts` and exposes the imperative
// handle. Worker wiring + themes come from `monaco-setup`.
export function createCodeEditor(opts: CreateCodeEditorOptions): CodeEditor {
  configureTsOnce()
  ensureThemes()
  ensureImportNavigation()

  const { editor, model } = createModelAndEditor(opts)
  bindSaveCommand(editor, opts.onSave)
  const changeSub = bindChange(model, opts.onChange)

  let selectionActions: { dispose(): void } | null = null
  if (opts.onCopyRef || opts.onAddToChat) {
    const node = createSelectionActions({ onCopyRef: opts.onCopyRef, onAddToChat: opts.onAddToChat })
    selectionActions = mountSelectionActions(editor, node, { onAddToChat: opts.onAddToChat })
  }

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
