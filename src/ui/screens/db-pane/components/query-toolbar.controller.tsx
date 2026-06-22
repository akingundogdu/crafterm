import { UITexts } from '@texts'
import { ALL_THEME_NAMES } from '../../../editor/monaco/monaco-setup'
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
// returns the refs the host wires.
export class QueryToolbarController {
  private readonly dot: HTMLSpanElement
  private readonly connSel: HTMLSelectElement
  private readonly runBtn: HTMLButtonElement
  private readonly saveBtn: HTMLButtonElement
  private readonly themeSel: HTMLSelectElement
  private readonly bar: HTMLDivElement

  constructor() {
    this.dot = (<span class="db-conn-dot" />) as HTMLSpanElement
    this.connSel = (<select class="settings-select" />) as HTMLSelectElement
    this.runBtn = (
      <button class="button-primary db-run-btn" innerHTML={PLAY_SVG + '<span>' + UITexts.DbPane.run + '</span><kbd>⌘↵</kbd>'} />
    ) as HTMLButtonElement
    this.saveBtn = (<button class="db-save-btn">{UITexts.DbPane.saveSql}</button>) as HTMLButtonElement
    // theme picker (right-aligned via CSS)
    this.themeSel = (
      <select class="settings-select db-theme-select" title={UITexts.DbPane.editorTheme}>
        {ALL_THEME_NAMES.map((t) => (<option value={t}>{t}</option>) as HTMLOptionElement)}
      </select>
    ) as HTMLSelectElement
    const connWrap = (
      <div class="db-conn-select">
        {this.dot}
        {this.connSel}
      </div>
    ) as HTMLDivElement
    this.bar = (
      <div class="db-query-bar">
        {connWrap}
        {this.runBtn}
        {this.saveBtn}
        {this.themeSel}
      </div>
    ) as HTMLDivElement
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
