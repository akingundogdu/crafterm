import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import { ALL_THEME_NAMES, currentThemeName } from '@views/editor/monaco/monaco-setup'
import { breadcrumb } from '../path-ref'
import { stopMousedown, makeThemeChange } from '../code-pane.store'

export interface CodePaneHeaderProps {
  path: string
  onCopyPath: (e: Event) => void
  onReveal: (e: Event) => void
  onReload: (e: Event) => void
  onClose: (e: Event) => void
}

export interface CodePaneHeader {
  header: HTMLDivElement
  dirtyDot: HTMLSpanElement
  htitle: HTMLSpanElement
  saveBtn: HTMLButtonElement
}

// The code-pane header (dirty dot · breadcrumb · theme picker · save · copy ·
// reveal · reload · close). Mounted imperatively, so props arrive via the
// constructor into a plain field. The global Monaco theme `<select>` is wired
// imperatively (value + listeners) in onAfterRender — it needs the live element,
// and no reactive field is written, so the template renders once.
class CodePaneHeaderView extends Component {
  private readonly p: CodePaneHeaderProps
  private themeSel: HTMLSelectElement | null = null

  constructor(opts: { props: CodePaneHeaderProps }) {
    super()
    this.p = opts.props
  }

  onAfterRender(): void {
    const sel = this.themeSel
    if (!sel) return
    sel.value = currentThemeName()
    sel.addEventListener('mousedown', stopMousedown)
    sel.addEventListener('change', makeThemeChange(sel))
  }

  template() {
    const p = this.p
    return (
      <div class="pane-header diff-header">
        <div class="diff-hcenter">
          <span class="code-editor-unsaved-dot" title={UITexts.CodePane.unsavedChanges} style="display: none" />
          <span class="diff-path" title={p.path}>
            {breadcrumb(p.path)}
          </span>
        </div>
        <select class="code-editor-theme-select" title="Editor theme" ref={this.themeSel}>
          {ALL_THEME_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button class="diff-hbtn" title="Save (⌘S)">
          💾
        </button>
        <button class="diff-hbtn" title="Copy full path" onClick={p.onCopyPath}>
          ⧉
        </button>
        <button class="diff-hbtn" title="Show in Finder" onClick={p.onReveal}>
          ⌕
        </button>
        <button class="diff-hbtn" title="Reload from disk (discards unsaved edits)" onClick={p.onReload}>
          ⟳
        </button>
        <button class="diff-hbtn diff-hclose" title="Close" onClick={p.onClose}>
          ×
        </button>
      </div>
    )
  }
}

export function createCodePaneHeader(props: CodePaneHeaderProps): CodePaneHeader {
  const host = document.createElement('div')
  new CodePaneHeaderView({ props }).render(host)
  const header = host.firstElementChild as HTMLDivElement
  return {
    header,
    dirtyDot: header.querySelector('.code-editor-unsaved-dot') as HTMLSpanElement,
    htitle: header.querySelector('.diff-path') as HTMLSpanElement,
    saveBtn: header.querySelector('[title="Save (⌘S)"]') as HTMLButtonElement
  }
}
