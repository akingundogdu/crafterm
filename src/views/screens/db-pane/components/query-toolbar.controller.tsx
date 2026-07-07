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
// returns the refs the host wires. Plain-DOM port — the db-pane is an imperative
// widget (§2.7 self-contained, no @ui); the detached controls are consumed
// synchronously by createSqlPane, so they are built with document.createElement.
export class QueryToolbarController {
  private readonly dot: HTMLSpanElement
  private readonly connSel: HTMLSelectElement
  private readonly runBtn: HTMLButtonElement
  private readonly saveBtn: HTMLButtonElement
  private readonly themeSel: HTMLSelectElement
  private readonly bar: HTMLDivElement

  constructor() {
    this.dot = document.createElement('span')
    this.dot.className = 'db-conn-dot'

    this.connSel = document.createElement('select')
    this.connSel.className = 'settings-select'

    this.runBtn = document.createElement('button')
    this.runBtn.className = 'button-primary db-run-btn'
    this.runBtn.innerHTML = PLAY_SVG + '<span>' + UITexts.DbPane.run + '</span><kbd>⌘↵</kbd>'

    this.saveBtn = document.createElement('button')
    this.saveBtn.className = 'db-save-btn'
    this.saveBtn.textContent = UITexts.DbPane.saveSql

    // theme picker (right-aligned via CSS)
    this.themeSel = document.createElement('select')
    this.themeSel.className = 'settings-select db-theme-select'
    this.themeSel.title = UITexts.DbPane.editorTheme
    for (const t of ALL_THEME_NAMES) {
      const o = document.createElement('option')
      o.value = t
      o.textContent = t
      this.themeSel.appendChild(o)
    }

    const connWrap = document.createElement('div')
    connWrap.className = 'db-conn-select'
    connWrap.append(this.dot, this.connSel)

    this.bar = document.createElement('div')
    this.bar.className = 'db-query-bar'
    this.bar.append(connWrap, this.runBtn, this.saveBtn, this.themeSel)
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
