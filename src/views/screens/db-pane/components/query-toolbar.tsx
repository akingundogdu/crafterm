import { Component } from '@geajs/core'
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

// The query bar as a gea view: connection select (with engine dot), run/save buttons
// and the editor theme picker. Markup is JSX (no createElement); the run icon SVG is
// injected via a ref in onAfterRender (an `innerHTML=` JSX prop is dropped by gea).
// The db-pane is an imperative widget that wires these controls, so createQueryToolbar
// renders this view into a detached host and returns the live element refs — the exact
// same handle the host consumed before, so the pane's wiring is unchanged.
class QueryToolbarView extends Component {
  private iconEl: HTMLSpanElement | null = null

  onAfterRender(): void {
    if (this.iconEl) this.iconEl.innerHTML = PLAY_SVG
  }

  template() {
    return (
      <div class="db-query-bar">
        <div class="db-conn-select">
          <span class="db-conn-dot" />
          <select class="settings-select" />
        </div>
        <button class="button-primary db-run-btn">
          <span class="db-run-icon" ref={this.iconEl} />
          <span>{UITexts.DbPane.run}</span>
          <kbd>⌘↵</kbd>
        </button>
        <button class="db-save-btn">{UITexts.DbPane.saveSql}</button>
        <select class="settings-select db-theme-select" title={UITexts.DbPane.editorTheme}>
          {ALL_THEME_NAMES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
    )
  }
}

// Query bar: connection select (with engine dot), run/save buttons, and the editor
// theme picker. A pure factory — the host wires the controls off the returned refs.
export function createQueryToolbar(): QueryToolbar {
  const host = document.createElement('div')
  new QueryToolbarView().render(host)
  const bar = host.firstElementChild as HTMLDivElement
  return {
    bar,
    dot: bar.querySelector('.db-conn-dot') as HTMLSpanElement,
    connSel: bar.querySelector('.db-conn-select select') as HTMLSelectElement,
    runBtn: bar.querySelector('.db-run-btn') as HTMLButtonElement,
    saveBtn: bar.querySelector('.db-save-btn') as HTMLButtonElement,
    themeSel: bar.querySelector('.db-theme-select') as HTMLSelectElement
  }
}
