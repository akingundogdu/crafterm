import { codePanes } from '@views/state/spine'
import { UITexts } from '@texts'
import { createCodeEditor, type CodeEditor } from '@views/editor/code-editor/code-editor'
import { DEFAULT_EDITOR_THEME } from '@views/editor/monaco/editor-themes'
import { fsService } from '@services'
import { breadcrumb } from './path-ref'
import { createCodePaneHeader } from './components/code-pane-header'
import type { CreateCodePaneOptions } from './code-pane.types'
import {
  DEFAULT_FONT,
  registerCodePaneCleanup,
  clampFont,
  makeCopyRef,
  makeAddToChat,
  makeCopyPathClick,
  makeRevealClick,
  makeReloadClick,
  makeCloseClick,
  makeSaveClick
} from './code-pane.state'

// DOM nodes the controller drives. The view (code-pane.ts) builds the static
// skeleton and hands these refs over; the controller builds its own header
// (whose callbacks close over private behavior) and owns all per-pane state.
export interface CodePaneRefs {
  el: HTMLDivElement
  body: HTMLDivElement
}

// Owns one code-editor pane's mutable state (font, dirty flag, Monaco editor)
// and the load/save/openFile behavior. All methods are arrow methods so `this`
// binds when they are passed as callbacks (editor onSave/onChange, header
// buttons, the codePanes registry entry).
export class CodePaneController {
  private readonly id: string
  private readonly el: HTMLDivElement
  private readonly body: HTMLDivElement
  private readonly themeName: string

  private readonly dirtyDot: HTMLSpanElement
  private readonly htitle: HTMLSpanElement
  private readonly saveBtn: HTMLButtonElement

  private path: string
  private fontSize = DEFAULT_FONT
  private dirty = false
  private editor: CodeEditor | null = null

  private readonly copyRef: (sel?: string) => void
  private readonly addToChat: (sel?: string) => void

  constructor(id: string, refs: CodePaneRefs, opts: CreateCodePaneOptions) {
    this.id = id
    this.el = refs.el
    this.body = refs.body
    this.path = opts.path
    this.themeName = opts.themeName ?? DEFAULT_EDITOR_THEME

    this.copyRef = makeCopyRef(() => this.editor, () => this.path, id)
    this.addToChat = makeAddToChat(() => this.editor, () => this.path, id)

    // ---- header: breadcrumb · dirty · save · copy · reveal · reload · close ----
    const { header, dirtyDot, htitle, saveBtn } = createCodePaneHeader({
      path: this.path,
      onCopyPath: makeCopyPathClick(() => this.path),
      onReveal: makeRevealClick(() => this.path),
      onReload: makeReloadClick(() => void this.load()),
      onClose: makeCloseClick(id)
    })
    this.dirtyDot = dirtyDot
    this.htitle = htitle
    this.saveBtn = saveBtn
    this.el.prepend(header)

    saveBtn.addEventListener('click', makeSaveClick(() => void this.save()))

    this.register()
    registerCodePaneCleanup(id, () => {
      this.editor?.destroy()
      this.editor = null
    })

    void this.load(opts.line)
  }

  private applyFont = (): void => {
    this.editor?.setFontSize(this.fontSize)
  }

  private setDirty = (d: boolean): void => {
    this.dirty = d
    this.dirtyDot.style.display = d ? '' : 'none'
    this.saveBtn.classList.toggle('code-save-dirty', d)
  }

  private save = async (): Promise<void> => {
    if (!this.editor) return
    const ok = await fsService.writeText(this.path, this.editor.getValue())
    if (ok) {
      this.setDirty(false)
      this.saveBtn.textContent = '✓'
      setTimeout(() => (this.saveBtn.textContent = '💾'), 1000)
    } else {
      this.saveBtn.textContent = '⚠'
      this.saveBtn.title = 'Save failed'
      setTimeout(() => {
        this.saveBtn.textContent = '💾'
        this.saveBtn.title = 'Save (⌘S)'
      }, 1500)
    }
  }

  private load = async (line?: number): Promise<void> => {
    const { body } = this
    this.editor?.destroy()
    this.editor = null
    body.replaceChildren()
    body.textContent = UITexts.CodePane.loadingFile
    const res = await fsService.readText(this.path)
    body.replaceChildren()
    if (!res.ok) {
      body.textContent = res.error || 'Failed to load file.'
      return
    }
    this.editor = createCodeEditor({
      parent: body,
      doc: res.text ?? '',
      path: this.path,
      themeName: this.themeName,
      fontSize: this.fontSize,
      line,
      onSave: () => void this.save(),
      onChange: () => this.setDirty(true),
      onCopyRef: this.copyRef,
      onAddToChat: this.addToChat
    })
    this.setDirty(false)
  }

  // Reopen this pane on a different file (single-editor reuse on file clicks /
  // go-to-definition). When already showing the file, just jump to `line`.
  private openFile = (next: string, line?: number): void => {
    if (next === this.path) {
      if (line) this.editor?.goToLine(line)
      this.editor?.focus()
      return
    }
    this.path = next
    this.htitle.textContent = breadcrumb(this.path)
    this.htitle.title = this.path
    void this.load(line)
  }

  private register = (): void => {
    const self = this
    codePanes.set(this.id, {
      id: this.id,
      el: this.el,
      get path() {
        return self.path
      },
      themeName: this.themeName,
      isDirty: () => this.dirty,
      openFile: this.openFile,
      setFont: (delta: number) => {
        this.fontSize = clampFont(this.fontSize, delta)
        this.applyFont()
      },
      resetFont: () => {
        this.fontSize = DEFAULT_FONT
        this.applyFont()
      },
      focus: () => this.editor?.focus()
    })
  }
}
