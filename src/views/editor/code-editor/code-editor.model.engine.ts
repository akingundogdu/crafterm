import { monaco } from '../monaco/monaco-setup'
import type { CreateCodeEditorOptions } from './code-editor.types'
import { createModelAndEditor, bindSaveCommand, bindChange } from './code-editor.store'

// Builds the Monaco editor + model for a pane and wires the save command and the
// dirty-change subscription. Returns the instances plus the change disposable so
// the orchestrator can tear it down.
export function buildEditor(opts: CreateCodeEditorOptions): {
  editor: monaco.editor.IStandaloneCodeEditor
  model: monaco.editor.ITextModel
  changeSub: monaco.IDisposable
} {
  const { editor, model } = createModelAndEditor(opts)
  bindSaveCommand(editor, opts.onSave)
  const changeSub = bindChange(model, opts.onChange)
  return { editor, model, changeSub }
}
