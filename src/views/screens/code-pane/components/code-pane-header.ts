import { el } from '@views/lib/dom'
import { UITexts } from '@texts'
import { ALL_THEME_NAMES, currentThemeName } from '@views/editor/monaco/monaco-setup'
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
  const dirtyDot = el('span', {
    class: 'code-editor-unsaved-dot',
    title: UITexts.CodePane.unsavedChanges,
    style: 'display: none'
  })
  const htitle = el('span', { class: 'diff-path', title: props.path }, breadcrumb(props.path))
  const center = el('div', { class: 'diff-hcenter' }, dirtyDot, htitle)

  // Global Monaco theme picker (changes every editor — themes are global).
  const themeSel = el(
    'select',
    { class: 'code-editor-theme-select', title: 'Editor theme' },
    ...ALL_THEME_NAMES.map((name) => el('option', { value: name }, name))
  )
  themeSel.value = currentThemeName()
  themeSel.addEventListener('mousedown', stopMousedown)
  themeSel.addEventListener('change', makeThemeChange(themeSel))

  const saveBtn = el('button', { class: 'diff-hbtn', title: 'Save (⌘S)' }, '💾')
  const copyBtn = el('button', { class: 'diff-hbtn', title: 'Copy full path', onclick: props.onCopyPath }, '⧉')
  const revealBtn = el('button', { class: 'diff-hbtn', title: 'Show in Finder', onclick: props.onReveal }, '⌕')
  const reloadBtn = el(
    'button',
    { class: 'diff-hbtn', title: 'Reload from disk (discards unsaved edits)', onclick: props.onReload },
    '⟳'
  )
  const closeBtn = el('button', { class: 'diff-hbtn diff-hclose', title: 'Close', onclick: props.onClose }, '×')

  const header = el(
    'div',
    { class: 'pane-header diff-header' },
    center,
    themeSel,
    saveBtn,
    copyBtn,
    revealBtn,
    reloadBtn,
    closeBtn
  )

  return { header, dirtyDot, htitle, saveBtn }
}
