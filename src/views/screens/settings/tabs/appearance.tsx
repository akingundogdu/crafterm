import { Component } from '@geajs/core'
import '@views/components/form-field/form-field.css'
import { settings } from '@views/state/spine'
import { UITexts } from '@texts'
import { themes } from '../themes'
import { ALL_THEME_NAMES } from '@views/editor/monaco/monaco-setup'
import { makeInputChange, makeSelectChange } from '../shared'
import BackgroundSwatchControl from './components/background-swatch-control'
import ColorRow from './components/color-row'
import store from './theme.store'
import {
  BG_PRESETS,
  setFontFamily,
  setFontSize,
  setDocFontSize,
  setEditorTheme,
  applyBackground,
  copyCurrentToCustom,
  setCustomColor
} from './appearance.store'

// Appearance panel body: font family/size, background swatches, code-editor theme.
// Static (no reactive store) — the inputs are uncontrolled and seeded in
// onAfterRender (a `value=` binding would make gea treat them as controlled and
// reset on every render), mirroring the converted `labeledInput` fields. The
// `display: contents` root keeps the h3 + fields as direct flow children of the
// `.settings-panel` (no extra box), so the DOM stays byte-faithful. Self-contained.
class AppearancePanel extends Component {
  famInput: HTMLInputElement | null = null
  fontSizeInput: HTMLInputElement | null = null
  docFontSizeInput: HTMLInputElement | null = null

  onAfterRender(): void {
    if (this.famInput) {
      this.famInput.value = settings.font.family
      this.famInput.style.maxWidth = '280px'
    }
    if (this.fontSizeInput) this.fontSizeInput.value = String(settings.font.size)
    if (this.docFontSizeInput) this.docFontSizeInput.value = String(settings.docFontSize)
  }

  template() {
    return (
      <div style={{ display: 'contents' }}>
        <h3>{UITexts.Settings.appearance.heading}</h3>
        <div class="field">
          <label>{UITexts.Settings.appearance.fontFamily}</label>
          <input type="text" ref={this.famInput} onChange={makeInputChange(setFontFamily)} />
        </div>
        <div class="field">
          <label>{UITexts.Settings.appearance.terminalFontSize}</label>
          <input type="number" ref={this.fontSizeInput} onChange={makeInputChange(setFontSize)} />
        </div>
        <div class="field">
          <label>{UITexts.Settings.appearance.docFontSize}</label>
          <input type="number" ref={this.docFontSizeInput} onChange={makeInputChange(setDocFontSize)} />
        </div>
        <BackgroundSwatchControl
          presets={BG_PRESETS}
          currentBgColor={() => settings.bgColor}
          customColor={settings.bgColor}
          onApply={applyBackground}
        />
        <div class="field">
          <label>{UITexts.Settings.appearance.codeEditorTheme}</label>
          <select onChange={makeSelectChange(setEditorTheme)}>
            {ALL_THEME_NAMES.map((n) => (
              <option key={n} value={n} selected={n === settings.editorTheme}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
    )
  }
}

// Reactive body of the Theme panel: the theme select, the "copy to Custom" button,
// and the ANSI color grid. Rendered as a JSX child of ThemePanel so gea tracks its
// store reads and re-renders it on every theme switch — the ssh.store board pattern.
// The grid is editable only when the active theme is Custom (locked via inline
// opacity + pointer-events, exactly as before). Each color row is keyed by
// `key:value` so a value change forces a fresh mount that re-seeds its inputs.
class ThemeBody extends Component {
  private onCopy = (): void => {
    copyCurrentToCustom()
    store.sync()
  }

  template() {
    // Read the reactive store fields so this child re-renders after a theme switch
    // or a copy-to-Custom (which both bump `themeName` + `colors`).
    const editable = store.themeName === 'Custom'
    const themeOptions = [...Object.keys(themes), 'Custom']
    return (
      <div style={{ display: 'contents' }}>
        <h3>{UITexts.Settings.appearance.themeHeading}</h3>
        <div class="field">
          <label>{UITexts.Settings.appearance.theme}</label>
          <select onChange={(e: Event) => store.selectTheme((e.currentTarget as HTMLSelectElement).value)}>
            {themeOptions.map((n) => (
              <option key={n} value={n} selected={n === store.themeName}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <button class="settings-inline-btn" onClick={this.onCopy}>
          Copy current colors → Custom
        </button>
        <div
          class="color-grid"
          style={{ opacity: editable ? '1' : '0.4', pointerEvents: editable ? 'auto' : 'none' }}
        >
          {store.colors.map((c) => (
            <ColorRow key={`${c.key}:${c.value}`} colorKey={c.key} value={c.value} onApply={setCustomColor} />
          ))}
        </div>
      </div>
    )
  }
}

// Thin shell for the Theme panel: mounted imperatively into the panel host, it just
// renders the reactive ThemeBody child (an imperatively mounted root's own template
// won't re-subscribe on store writes, so the reactive markup lives in the child —
// the SshPicker/SshList pattern).
class ThemePanel extends Component {
  template() {
    return <ThemeBody />
  }
}

// Fills the Appearance category panel. Export name/signature/import path preserved
// so panel-loader resolves unchanged.
export function buildAppearancePanel(panel: HTMLElement): void {
  new AppearancePanel().render(panel)
}

// Fills the Theme category panel. Export name/signature/import path preserved so
// panel-loader resolves unchanged.
export function buildThemePanel(panel: HTMLElement): void {
  store.sync()
  new ThemePanel().render(panel)
}
