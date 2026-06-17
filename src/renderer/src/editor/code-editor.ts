import { monaco, ensureThemes, currentThemeId, applyTheme } from './monaco-setup'
import { fsService } from '../services/ipc'

// Monaco-backed code editor pane: VSCode's editor engine (TextMate-grade
// highlighting + full TS/JS IntelliSense out of the box). Worker wiring + themes
// come from monacoSetup.

// Single-file editor: suppress cross-file semantic errors (e.g. "cannot find
// module") that fire when a file is edited without its whole project loaded.
// Completions + highlighting still work; only the noisy red squiggles go away.
// The `languages.typescript` barrel is deprecated in the types but present at
// runtime, so we reach it through a narrow cast.
interface TsLangDefaults {
  setDiagnosticsOptions(o: { noSemanticValidation?: boolean; noSyntaxValidation?: boolean }): void
}
let tsConfigured = false
function configureTsOnce(): void {
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

// ---- Go-to-definition for imports -----------------------------------------
// Monaco's TS worker can't resolve cross-file imports without the whole project
// loaded (it shows "References" instead of navigating). We add a definition
// provider that resolves relative import specifiers to real files via IPC, plus
// an editor opener that routes the navigation into our own pane system.

let openHandler: ((path: string, line?: number) => void) | null = null
export function setEditorOpenHandler(fn: (path: string, line?: number) => void): void {
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
function importForWord(text: string, word: string): { spec: string; symbol?: string } | null {
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
function ensureImportNavigation(): void {
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

// Unique per-editor model URIs (query disambiguator) so opening the same file in
// two panes doesn't collide on Monaco's model registry.
let modelSeq = 0

export interface CodeEditor {
  getValue(): string
  setValue(text: string): void
  setTheme(name: string): void
  setReadOnly(ro: boolean): void
  setFontSize(px: number): void
  // Current selection's 1-based line range (collapsed selection → cursor line).
  getSelection(): { startLine: number; endLine: number } | null
  goToLine(line: number): void
  focus(): void
  destroy(): void
}

export function createCodeEditor(opts: {
  parent: HTMLElement
  doc: string
  path: string
  themeName?: string
  readOnly?: boolean
  fontSize?: number
  line?: number // initial line to reveal + place the cursor on
  onSave: () => void
  onChange?: (dirty: boolean) => void
  onCopyRef?: () => void // floating "Copy" on a selection
  onAddToChat?: () => void // floating "Add to Chat ⌘L" on a selection
}): CodeEditor {
  configureTsOnce()
  ensureThemes()
  ensureImportNavigation()

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

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => opts.onSave())
  const sub = model.onDidChangeContent(() => opts.onChange?.(true))

  // ---- Floating selection actions (Cursor-style "Add to Chat ⌘L") ----------
  let selSub: monaco.IDisposable | null = null
  let actionWidget: monaco.editor.IContentWidget | null = null
  if (opts.onCopyRef || opts.onAddToChat) {
    const node = document.createElement('div')
    node.className = 'code-sel-actions'
    node.style.display = 'none'
    const mkBtn = (label: string, run: () => void, feedback?: string): HTMLButtonElement => {
      const b = document.createElement('button')
      b.className = 'code-sel-btn'
      b.textContent = label
      // preventDefault on mousedown so clicking doesn't collapse the selection.
      b.addEventListener('mousedown', (e) => e.preventDefault())
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        run()
        if (feedback) {
          b.textContent = feedback
          setTimeout(() => (b.textContent = label), 1000)
        }
      })
      return b
    }
    if (opts.onCopyRef) node.appendChild(mkBtn('Copy', () => opts.onCopyRef!(), 'Copied'))
    if (opts.onAddToChat) node.appendChild(mkBtn('Add to Chat ⌘L', () => opts.onAddToChat!()))

    let pos: monaco.editor.IContentWidgetPosition | null = null
    actionWidget = {
      getId: () => 'crafterm.selectionActions',
      getDomNode: () => node,
      getPosition: () => pos
    }
    editor.addContentWidget(actionWidget)

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
      editor.layoutContentWidget(actionWidget!)
    }
    selSub = editor.onDidChangeCursorSelection(refresh)
    if (opts.onAddToChat) {
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL, () => opts.onAddToChat!())
    }
  }

  const goToLine = (line: number): void => {
    const n = Math.max(1, Math.min(line, model.getLineCount()))
    editor.revealLineInCenter(n)
    editor.setPosition({ lineNumber: n, column: 1 })
  }
  if (opts.line && opts.line > 1) requestAnimationFrame(() => goToLine(opts.line!))

  return {
    getValue: () => model.getValue(),
    setValue: (text) => model.setValue(text),
    setTheme: (name) => void applyTheme(name),
    setReadOnly: (ro) => editor.updateOptions({ readOnly: ro }),
    setFontSize: (px) => editor.updateOptions({ fontSize: px }),
    goToLine,
    getSelection: () => {
      const sel = editor.getSelection()
      if (!sel) return null
      // A full-line selection ends at column 1 of the next line; trim it so the
      // range matches the visually highlighted lines.
      let endLine = sel.endLineNumber
      if (endLine > sel.startLineNumber && sel.endColumn === 1) endLine--
      return { startLine: sel.startLineNumber, endLine }
    },
    focus: () => editor.focus(),
    destroy: () => {
      sub.dispose()
      selSub?.dispose()
      if (actionWidget) editor.removeContentWidget(actionWidget)
      editor.dispose()
      model.dispose()
    }
  }
}
