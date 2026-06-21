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

// Query bar: connection select (with engine dot), run/save buttons, and the
// editor theme picker. A pure factory — the host wires the controls.
export function createQueryToolbar(): QueryToolbar {
  const dot = (<span class="db-conn-dot" />) as HTMLSpanElement
  const connSel = (<select class="settings-select" />) as HTMLSelectElement
  const runBtn = (
    <button class="button-primary db-run-btn" innerHTML={PLAY_SVG + '<span>' + UITexts.DbPane.run + '</span><kbd>⌘↵</kbd>'} />
  ) as HTMLButtonElement
  const saveBtn = (<button class="db-save-btn">{UITexts.DbPane.saveSql}</button>) as HTMLButtonElement
  // theme picker (right-aligned via CSS)
  const themeSel = (
    <select class="settings-select db-theme-select" title={UITexts.DbPane.editorTheme}>
      {ALL_THEME_NAMES.map((t) => (<option value={t}>{t}</option>) as HTMLOptionElement)}
    </select>
  ) as HTMLSelectElement
  const connWrap = (
    <div class="db-conn-select">
      {dot}
      {connSel}
    </div>
  ) as HTMLDivElement
  const bar = (
    <div class="db-query-bar">
      {connWrap}
      {runBtn}
      {saveBtn}
      {themeSel}
    </div>
  ) as HTMLDivElement

  return { bar, dot, connSel, runBtn, saveBtn, themeSel }
}
