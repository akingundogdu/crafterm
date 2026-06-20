// Shared types for the Monaco-backed code editor pane. Behaviour lives in
// `code-editor.state.ts`; the view composes it in `code-editor.tsx`.

// The `languages.typescript` defaults barrel — deprecated in the published types
// but present at runtime, so state reaches it through a narrow cast.
export interface TsLangDefaults {
  setDiagnosticsOptions(o: { noSemanticValidation?: boolean; noSyntaxValidation?: boolean }): void
}

// A resolved import binding: the module specifier plus the original exported
// symbol name (used to jump to the right line in the target file).
export interface ImportRef {
  spec: string
  symbol?: string
}

// Routes an in-editor navigation (go-to-definition) into the app's pane system.
export type EditorOpenHandler = (path: string, line?: number) => void

// Callbacks for the floating Cursor-style action bar shown over a selection.
export interface SelectionActionsHandlers {
  onCopyRef?: () => void // floating "Copy" on a selection
  onAddToChat?: () => void // floating "Add to Chat ⌘L" on a selection
}

// DOM-level event handlers the selection-actions view binds directly to its
// buttons; built from SelectionActionsHandlers by state. Undefined when the
// matching action wasn't requested, so the view omits that button.
export interface SelectionActionDomHandlers {
  preventCollapse: (e: Event) => void
  onCopy?: (e: Event) => void
  onAddToChat?: (e: Event) => void
}

// Imperative handle returned by createCodeEditor.
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

export interface CreateCodeEditorOptions extends SelectionActionsHandlers {
  parent: HTMLElement
  doc: string
  path: string
  themeName?: string
  readOnly?: boolean
  fontSize?: number
  line?: number // initial line to reveal + place the cursor on
  onSave: () => void
  onChange?: (dirty: boolean) => void
}
