import { Component } from '@geajs/core'
import './note-panel.css'

export interface NotePanelOptions {
  paneId: string
  initialValue: string
  onInput: (value: string) => void
  onClose: () => void
}

// The per-pane "Take a note" side panel: a thin markdown scratch pad overlaid on
// the right of the terminal. Mounted imperatively into the .pane-box (§5.11 thin
// shell), so its data + callbacks arrive via the constructor. Clicking the note
// still selects the pane (bubbles to the .pane-box handler); the textarea keeps
// focus because the mousedown's native focus default runs after that handler's
// synchronous term.focus().
class NotePanel extends Component {
  private readonly opts: NotePanelOptions
  private inputEl: HTMLTextAreaElement | null = null

  constructor(opts: NotePanelOptions) {
    super()
    this.opts = opts
  }

  onAfterRender(): void {
    const el = this.inputEl
    if (!el) return
    el.value = this.opts.initialValue
    el.focus()
    const end = el.value.length
    el.setSelectionRange(end, end)
  }

  private handleInput = (e: Event): void => {
    this.opts.onInput((e.currentTarget as HTMLTextAreaElement).value)
  }

  template() {
    const o = this.opts
    return (
      <div class="pane-note">
        <div class="pane-note-header">
          <span class="pane-note-title">Note</span>
          <button class="pane-note-close" title="Close note" onClick={o.onClose}>
            ×
          </button>
        </div>
        <textarea
          class="pane-note-input"
          placeholder="Take a note…"
          spellcheck={false}
          ref={this.inputEl}
          onInput={this.handleInput}
        />
      </div>
    )
  }
}

// Renders a NotePanel into the given pane box and returns the mounted element.
// Mirrors the createPaneHeader / buildTermBox imperative-mount pattern.
export function mountNotePanel(box: HTMLElement, opts: NotePanelOptions): HTMLElement {
  const host = document.createElement('div')
  new NotePanel(opts).render(host)
  const el = host.firstElementChild as HTMLElement
  box.append(el)
  return el
}
