import { el } from '@views/lib/dom'
import { UITexts } from '@texts'
import { ALL_THEME_NAMES } from '@views/editor/monaco/monaco-setup'
import { PLAY_SVG } from '../db-pane.state'

export interface QueryToolbar {
  bar: HTMLDivElement
  dot: HTMLSpanElement
  connSel: HTMLSelectElement
  runBtn: HTMLButtonElement
  saveBtn: HTMLButtonElement
  themeSel: HTMLSelectElement
}

// Builds the query bar: connection select (with engine dot), run/save buttons,
// and the editor theme picker. The constructor builds the controls; build()
// returns the refs the host wires. Plain-DOM (el()) port of the legacy JSX
// controller (§2.7 self-contained, no @ui).
export class QueryToolbarController {
  private readonly dot: HTMLSpanElement
  private readonly connSel: HTMLSelectElement
  private readonly runBtn: HTMLButtonElement
  private readonly saveBtn: HTMLButtonElement
  private readonly themeSel: HTMLSelectElement
  private readonly bar: HTMLDivElement

  constructor() {
    this.dot = el('span', { class: 'db-conn-dot' })
    this.connSel = el('select', { class: 'settings-select' })
    this.runBtn = el('button', {
      class: 'button-primary db-run-btn',
      innerHTML: PLAY_SVG + '<span>' + UITexts.DbPane.run + '</span><kbd>⌘↵</kbd>'
    })
    this.saveBtn = el('button', { class: 'db-save-btn' }, UITexts.DbPane.saveSql)
    // theme picker (right-aligned via CSS)
    this.themeSel = el(
      'select',
      { class: 'settings-select db-theme-select', title: UITexts.DbPane.editorTheme },
      ...ALL_THEME_NAMES.map((t) => el('option', { value: t }, t))
    )
    const connWrap = el('div', { class: 'db-conn-select' }, this.dot, this.connSel)
    this.bar = el('div', { class: 'db-query-bar' }, connWrap, this.runBtn, this.saveBtn, this.themeSel)
  }

  build(): QueryToolbar {
    return {
      bar: this.bar,
      dot: this.dot,
      connSel: this.connSel,
      runBtn: this.runBtn,
      saveBtn: this.saveBtn,
      themeSel: this.themeSel
    }
  }
}
