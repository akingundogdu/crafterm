import { monaco } from '../monaco/monaco-setup'
import type { CreateCodeEditorOptions } from './code-editor.types'
import { mountSelectionActions } from './code-editor.store'
import { createSelectionActions } from './components/selection-actions'

// Mounts the floating selection action bar when at least one selection callback
// was requested; otherwise returns null and mounts nothing.
export function setupSelectionActions(
  editor: monaco.editor.IStandaloneCodeEditor,
  opts: CreateCodeEditorOptions
): { dispose(): void } | null {
  if (!opts.onCopyRef && !opts.onAddToChat) return null
  const node = createSelectionActions({ onCopyRef: opts.onCopyRef, onAddToChat: opts.onAddToChat })
  return mountSelectionActions(editor, node, { onAddToChat: opts.onAddToChat })
}
