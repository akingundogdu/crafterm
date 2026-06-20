import './code-pane.css'
import { codePanes, uid } from '@ui/state/state'
import { UITexts } from '@texts'
import { setupPaneDnd } from '@ui/pane/pane'
import { createButton, createSelect } from '@ui/components'
import { createCodeEditor, type CodeEditor } from '@ui/editor/code-editor/code-editor'
import { ALL_THEME_NAMES, currentThemeName } from '../../editor/monaco-setup'
import { DEFAULT_EDITOR_THEME } from '../../editor/editor-themes'
import { fsService } from '@services'
import { breadcrumb } from './path-ref'
import type { CreateCodePaneOptions } from './code-pane.types'
import {
  DEFAULT_FONT,
  registerCodePaneCleanup,
  runCodePaneCleanup,
  clampFont,
  stopMousedown,
  makeThemeChange,
  makeCopyRef,
  makeAddToChat,
  makeCopyPathClick,
  makeRevealClick,
  makeReloadClick,
  makeCloseClick,
  makeSaveClick,
  makeSelectPane
} from './code-pane.state'

export type { CreateCodePaneOptions } from './code-pane.types'

// An editable code editor pane (Monaco) opened from the Files panel.
// Syntax-highlights by file extension, supports Cmd +/- zoom, and saves the
// buffer back to disk on Cmd+S / the Save button. A single pane is reused for
// successive file clicks (openFile). Transient — not persisted.
export function createCodePane(opts: CreateCodePaneOptions): string {
  const id = uid('cp')
  const themeName = opts.themeName ?? DEFAULT_EDITOR_THEME
  let path = opts.path

  // ---- mutable view state ----
  let fontSize = DEFAULT_FONT
  let dirty = false
  let editor: CodeEditor | null = null

  // ---- header: breadcrumb · dirty · save · copy · reveal · reload · close ----
  const dirtyDot = (<span class="code-dirty-dot" title={UITexts.CodePane.unsavedChanges} style="display: none" />) as HTMLSpanElement
  const htitle = (<span class="diff-path" title={path}>{breadcrumb(path)}</span>) as HTMLSpanElement
  const center = (
    <div class="diff-hcenter">
      {dirtyDot}
      {htitle}
    </div>
  ) as HTMLDivElement

  // Global Monaco theme picker (changes every editor — themes are global).
  const themeSel = createSelect({ options: [...ALL_THEME_NAMES], value: currentThemeName() })
  themeSel.className = 'code-theme-sel'
  themeSel.title = 'Editor theme'
  themeSel.addEventListener('mousedown', stopMousedown)
  themeSel.addEventListener('change', makeThemeChange(themeSel))

  const copyRef = makeCopyRef(() => editor, () => path, id)
  const addToChat = makeAddToChat(() => editor, () => path, id)

  const saveBtn = createButton({ className: 'diff-hbtn', text: '💾', title: 'Save (⌘S)' })
  const copyBtn = createButton({ className: 'diff-hbtn', text: '⧉', title: 'Copy full path', onClick: makeCopyPathClick(() => path) })
  const revealBtn = createButton({ className: 'diff-hbtn', text: '⌕', title: 'Show in Finder', onClick: makeRevealClick(() => path) })
  const reloadBtn = createButton({ className: 'diff-hbtn', text: '⟳', title: 'Reload from disk (discards unsaved edits)', onClick: makeReloadClick(() => void load()) })
  const closeBtn = createButton({ className: 'diff-hbtn diff-hclose', text: '×', title: 'Close', onClick: makeCloseClick(id) })

  const header = (
    <div class="pane-header diff-header">
      {center}
      {themeSel}
      {saveBtn}
      {copyBtn}
      {revealBtn}
      {reloadBtn}
      {closeBtn}
    </div>
  ) as HTMLDivElement

  const body = (<div class="diff-body code-body" />) as HTMLDivElement

  const el = (
    <div class="pane-box diff-pane code-pane" dataset={{ paneId: id }}>
      {header}
      {body}
    </div>
  ) as HTMLDivElement
  setupPaneDnd(el, header, id)
  el.addEventListener('mousedown', makeSelectPane(id))

  // ---- orchestration ----
  const applyFont = (): void => {
    editor?.setFontSize(fontSize)
  }

  const setDirty = (d: boolean): void => {
    dirty = d
    dirtyDot.style.display = d ? '' : 'none'
    saveBtn.classList.toggle('code-save-dirty', d)
  }

  const save = async (): Promise<void> => {
    if (!editor) return
    const ok = await fsService.writeText(path, editor.getValue())
    if (ok) {
      setDirty(false)
      saveBtn.textContent = '✓'
      setTimeout(() => (saveBtn.textContent = '💾'), 1000)
    } else {
      saveBtn.textContent = '⚠'
      saveBtn.title = 'Save failed'
      setTimeout(() => {
        saveBtn.textContent = '💾'
        saveBtn.title = 'Save (⌘S)'
      }, 1500)
    }
  }
  saveBtn.addEventListener('click', makeSaveClick(() => void save()))

  const load = async (line?: number): Promise<void> => {
    editor?.destroy()
    editor = null
    body.replaceChildren()
    body.textContent = UITexts.CodePane.loadingFile
    const res = await fsService.readText(path)
    body.replaceChildren()
    if (!res.ok) {
      body.textContent = res.error || 'Failed to load file.'
      return
    }
    editor = createCodeEditor({
      parent: body,
      doc: res.text ?? '',
      path,
      themeName,
      fontSize,
      line,
      onSave: () => void save(),
      onChange: () => setDirty(true),
      onCopyRef: copyRef,
      onAddToChat: addToChat
    })
    setDirty(false)
  }

  // Reopen this pane on a different file (single-editor reuse on file clicks /
  // go-to-definition). When already showing the file, just jump to `line`.
  const openFile = (next: string, line?: number): void => {
    if (next === path) {
      if (line) editor?.goToLine(line)
      editor?.focus()
      return
    }
    path = next
    htitle.textContent = breadcrumb(path)
    htitle.title = path
    void load(line)
  }

  codePanes.set(id, {
    id,
    el,
    get path() {
      return path
    },
    themeName,
    isDirty: () => dirty,
    openFile,
    setFont: (delta: number) => {
      fontSize = clampFont(fontSize, delta)
      applyFont()
    },
    resetFont: () => {
      fontSize = DEFAULT_FONT
      applyFont()
    },
    focus: () => editor?.focus()
  })
  registerCodePaneCleanup(id, () => {
    editor?.destroy()
    editor = null
  })

  void load(opts.line)
  return id
}

export function destroyCodePane(id: string): void {
  runCodePaneCleanup(id)
  codePanes.delete(id)
}
