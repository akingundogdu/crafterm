import { Component } from '@geajs/core'

// The icon + label spans that fill a sidebar/notif tab button. They are appended as
// two DIRECT children of the button so the button's flex `gap` and the
// tabs-mode-icon / tabs-mode-text visibility toggles apply. Data arrives via the
// constructor into plain fields (a gea Component only populates `this.props` when
// rendered from a parent template, not from a manual `new X()`). Self-contained (§2.7).
class TabIcon extends Component {
  private readonly html: string
  iconEl: HTMLElement | null = null

  constructor(opts: { html: string }) {
    super()
    this.html = opts.html
  }

  onAfterRender(): void {
    if (this.iconEl) this.iconEl.innerHTML = this.html
  }

  template() {
    return <span class="tab-icon" ref={this.iconEl} />
  }
}

class TabLabel extends Component {
  private readonly text: string

  constructor(opts: { text: string }) {
    super()
    this.text = opts.text
  }

  template() {
    return <span class="tab-label">{this.text}</span>
  }
}

// Clears the button and appends the gea icon + label spans, preserving the legacy
// markup (`<span.tab-icon>` + `<span.tab-label>` as direct button children).
export function fillTabButton(btn: HTMLElement, iconHtml: string, label: string): void {
  btn.textContent = ''
  new TabIcon({ html: iconHtml }).render(btn)
  new TabLabel({ text: label }).render(btn)
}
