import { monaco, currentThemeId } from '../monaco-setup'
import { fsService } from '@services'
import type {
  TsLangDefaults,
  ImportRef,
  EditorOpenHandler,
  CreateCodeEditorOptions,
  SelectionActionsHandlers,
  SelectionActionDomHandlers
} from './code-editor.types'

// All editor behaviour lives here (the "hook" layer): Monaco capability setup,
// import navigation, the editor instance factory, and the selection-action
// widget wiring. The view (`code-editor.tsx`) never touches the `monaco`
// namespace directly — it only composes these helpers.

// ---- TypeScript diagnostics ------------------------------------------------
// Single-file editor: suppress cross-file semantic errors (e.g. "cannot find
// module") that fire when a file is edited without its whole project loaded.
// Completions + highlighting still work; only the noisy red squiggles go away.
// The `languages.typescript` barrel is deprecated in the types but present at
// runtime, so we reach it through a narrow cast.
let tsConfigured = false
export function configureTsOnce(): void {
  if (tsConfigured) return
  tsConfigured = true
  const ts = (
    monaco.languages as unknown as {
      typescript?: { typescriptDefaults: TsLangDefaults; javascriptDefaults: TsLangDefaults }
    }
  ).typescript
  if (!ts) return
  for (const d of [ts.typescriptDefaults, ts.javascriptDefaults]) {
    d.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false })
  }
}

// ---- Go-to-definition for imports ------------------------------------------
// Monaco's TS worker can't resolve cross-file imports without the whole project
// loaded (it shows "References" instead of navigating). We add a definition
// provider that resolves relative import specifiers to real files via IPC, plus
// an editor opener that routes the navigation into our own pane system.
let openHandler: EditorOpenHandler | null = null
export function setEditorOpenHandler(fn: EditorOpenHandler): void {
  openHandler = fn
}

// The quoted import specifier under `column` on a line ('./x', '../y', '/z'),
// or null when the cursor isn't inside an import path string.
function specAtColumn(lineText: string, column: number): string | null {
  if (!/\b(from|import|require)\b/.test(lineText)) return null
  const re = /['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(lineText)) !== null) {
    const inner = m[1]
    if (!inner.startsWith('.') && !inner.startsWith('/')) continue
    const start = m.index + 1
    if (column - 1 >= start && column - 1 <= start + inner.length) return inner
  }
  return null
}

// Given the document text and a clicked identifier, find the import that binds
// it → its module specifier + the original exported symbol name (for line jump).
function importForWord(text: string, word: string): ImportRef | null {
  const re = /import\s+(?:type\s+)?([\s\S]*?)\s+from\s*['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const clause = m[1]
    const spec = m[2]
    // namespace: import * as NS from '...'
    const ns = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause)
    if (ns && ns[1] === word) return { spec }
    // named: { A, B as C }
    const named = /\{([^}]*)\}/.exec(clause)
    if (named) {
      for (const part of named[1].split(',')) {
        const t = part.trim()
        if (!t) continue
        const as = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(t)
        if (as) {
          if (as[2] === word) return { spec, symbol: as[1] }
        } else if (t === word) {
          return { spec, symbol: t }
        }
      }
    }
    // default: leading identifier before a comma/brace
    const def = /^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause)
    if (def && def[1] === word) return { spec }
  }
  return null
}

let navProviderReady = false
export function ensureImportNavigation(): void {
  if (navProviderReady) return
  navProviderReady = true

  monaco.editor.registerEditorOpener({
    openCodeEditor(_source, resource, selectionOrPosition) {
      const sel = selectionOrPosition as { startLineNumber?: number; lineNumber?: number } | undefined
      openHandler?.(resource.fsPath, sel?.startLineNumber ?? sel?.lineNumber)
      return true
    }
  })

  monaco.languages.registerDefinitionProvider(['typescript', 'javascript'], {
    async provideDefinition(model, position) {
      const fromFile = model.uri.fsPath
      const lineText = model.getLineContent(position.lineNumber)
      let spec = specAtColumn(lineText, position.column)
      let symbol: string | undefined
      if (!spec) {
        const w = model.getWordAtPosition(position)
        if (w) {
          const found = importForWord(model.getValue(), w.word)
          if (found) {
            spec = found.spec
            symbol = found.symbol
          }
        }
      }
      if (!spec) return null
      const res = await fsService.resolveImport(fromFile, spec, symbol)
      if (!res) return null
      return [{ uri: monaco.Uri.file(res.path), range: new monaco.Range(res.line, 1, res.line, 1) }]
    }
  })
}

// ---- Editor instance -------------------------------------------------------
// Unique per-editor model URIs (query disambiguator) so opening the same file in
// two panes doesn't collide on Monaco's model registry.
let modelSeq = 0

export function createModelAndEditor(opts: CreateCodeEditorOptions): {
  editor: monaco.editor.IStandaloneCodeEditor
  model: monaco.editor.ITextModel
} {
  const uri = monaco.Uri.file(opts.path).with({ query: String(modelSeq++) })
  const model = monaco.editor.createModel(opts.doc, undefined, uri)
  const editor = monaco.editor.create(opts.parent, {
    model,
    theme: currentThemeId(),
    readOnly: opts.readOnly ?? false,
    fontSize: opts.fontSize ?? 13,
    fontFamily: 'var(--mono, Menlo, Monaco, monospace)',
    automaticLayout: true,
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    tabSize: 2,
    renderWhitespace: 'selection',
    bracketPairColorization: { enabled: true }
  })
  return { editor, model }
}

export function bindSaveCommand(editor: monaco.editor.IStandaloneCodeEditor, onSave: () => void): void {
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSave())
}

export function bindChange(
  model: monaco.editor.ITextModel,
  onChange?: (dirty: boolean) => void
): monaco.IDisposable {
  return model.onDidChangeContent(() => onChange?.(true))
}

// ---- Selection helpers -----------------------------------------------------
export function revealLine(
  editor: monaco.editor.IStandaloneCodeEditor,
  model: monaco.editor.ITextModel,
  line: number
): void {
  const n = Math.max(1, Math.min(line, model.getLineCount()))
  editor.revealLineInCenter(n)
  editor.setPosition({ lineNumber: n, column: 1 })
}

export function readSelectionRange(
  editor: monaco.editor.IStandaloneCodeEditor
): { startLine: number; endLine: number } | null {
  const sel = editor.getSelection()
  if (!sel) return null
  // A full-line selection ends at column 1 of the next line; trim it so the
  // range matches the visually highlighted lines.
  let endLine = sel.endLineNumber
  if (endLine > sel.startLineNumber && sel.endColumn === 1) endLine--
  return { startLine: sel.startLineNumber, endLine }
}

// Prepares the DOM event handlers for the selection action bar from the caller's
// high-level callbacks: stops propagation, fires the action, and (for Copy)
// flashes a transient "Copied" label. Keeps the view a pure markup skeleton.
// `preventCollapse` blocks the mousedown that would otherwise drop the selection.
export function makeSelectionActionHandlers(
  handlers: SelectionActionsHandlers
): SelectionActionDomHandlers {
  return {
    preventCollapse: (e) => e.preventDefault(),
    onCopy: handlers.onCopyRef
      ? (e) => {
          e.stopPropagation()
          handlers.onCopyRef!()
          const btn = e.currentTarget as HTMLButtonElement
          const label = btn.textContent
          btn.textContent = 'Copied'
          setTimeout(() => (btn.textContent = label), 1000)
        }
      : undefined,
    onAddToChat: handlers.onAddToChat
      ? (e) => {
          e.stopPropagation()
          handlers.onAddToChat!()
        }
      : undefined
  }
}

// ---- Floating selection actions (Cursor-style "Add to Chat ⌘L") ------------
// Wires a prebuilt action-bar node as a Monaco content widget: positions it
// above a non-empty selection, hides it otherwise, and binds the ⌘L shortcut.
export function mountSelectionActions(
  editor: monaco.editor.IStandaloneCodeEditor,
  node: HTMLElement,
  opts: { onAddToChat?: () => void }
): { dispose(): void } {
  let pos: monaco.editor.IContentWidgetPosition | null = null
  const widget: monaco.editor.IContentWidget = {
    getId: () => 'crafterm.selectionActions',
    getDomNode: () => node,
    getPosition: () => pos
  }
  editor.addContentWidget(widget)

  const refresh = (): void => {
    const sel = editor.getSelection()
    if (sel && !sel.isEmpty()) {
      pos = {
        position: { lineNumber: sel.startLineNumber, column: sel.startColumn },
        preference: [
          monaco.editor.ContentWidgetPositionPreference.ABOVE,
          monaco.editor.ContentWidgetPositionPreference.BELOW
        ]
      }
      node.style.display = ''
    } else {
      pos = null
      node.style.display = 'none'
    }
    editor.layoutContentWidget(widget)
  }

  const selSub = editor.onDidChangeCursorSelection(refresh)
  if (opts.onAddToChat) {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL, () => opts.onAddToChat!())
  }

  return {
    dispose(): void {
      selSub.dispose()
      editor.removeContentWidget(widget)
    }
  }
}
