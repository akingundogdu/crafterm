import { UITexts } from '@texts'
import { createButton, createSelect } from '@ui/components'
import { ALL_THEME_NAMES, currentThemeName } from '../../../editor/monaco/monaco-setup'
import { breadcrumb } from '../path-ref'
import { stopMousedown, makeThemeChange } from '../code-pane.state'

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

export function createCodePaneHeader(props: CodePaneHeaderProps): CodePaneHeader {
  const dirtyDot = (<span class="code-editor-unsaved-dot" title={UITexts.CodePane.unsavedChanges} style="display: none" />) as HTMLSpanElement
  const htitle = (<span class="diff-path" title={props.path}>{breadcrumb(props.path)}</span>) as HTMLSpanElement
  const center = (
    <div class="diff-hcenter">
      {dirtyDot}
      {htitle}
    </div>
  ) as HTMLDivElement

  // Global Monaco theme picker (changes every editor — themes are global).
  const themeSel = createSelect({ options: [...ALL_THEME_NAMES], value: currentThemeName() })
  themeSel.className = 'code-editor-theme-select'
  themeSel.title = 'Editor theme'
  themeSel.addEventListener('mousedown', stopMousedown)
  themeSel.addEventListener('change', makeThemeChange(themeSel))

  const saveBtn = createButton({ className: 'diff-hbtn', text: '💾', title: 'Save (⌘S)' })
  const copyBtn = createButton({ className: 'diff-hbtn', text: '⧉', title: 'Copy full path', onClick: props.onCopyPath })
  const revealBtn = createButton({ className: 'diff-hbtn', text: '⌕', title: 'Show in Finder', onClick: props.onReveal })
  const reloadBtn = createButton({ className: 'diff-hbtn', text: '⟳', title: 'Reload from disk (discards unsaved edits)', onClick: props.onReload })
  const closeBtn = createButton({ className: 'diff-hbtn diff-hclose', text: '×', title: 'Close', onClick: props.onClose })

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

  return { header, dirtyDot, htitle, saveBtn }
}
