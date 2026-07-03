import { Component } from '@geajs/core'
import { createOverlay } from '@views/components/overlay/overlay'

// gea shell for the settings modal: a `.modal.settings-modal` grid with its inline
// `.modal-close` button. The backdrop stays plain-DOM (createOverlay); this
// Component is only the modal body mounted inside it, and openSettings appends the
// nav / body / save-footer into it. `close` arrives via the constructor into a
// field — a manual `new X()` never populates `this.props`. Self-contained — no @ui.
export default class SettingsModalShell extends Component {
  private readonly close: () => void

  constructor(opts: { close: () => void }) {
    super()
    this.close = opts.close
  }

  template() {
    return (
      <div class="modal settings-modal">
        <button class="modal-close" type="button" aria-label="Close" title="Close (Esc)" onClick={() => this.close()}>
          ×
        </button>
      </div>
    )
  }
}

// Builds the settings overlay + `.settings-modal` shell with its close button,
// returning the overlay/modal handles plus mount/close/onClose for the caller.
// Signature + returned shape preserved so openSettings resolves unchanged.
export function createSettingsModal(): {
  overlay: HTMLElement
  modal: HTMLDivElement
  mount: () => void
  close: () => void
  onClose: (fn: () => void) => void
} {
  const { overlay, mount, close, onClose } = createOverlay()
  new SettingsModalShell({ close }).render(overlay)
  const modal = overlay.firstElementChild as HTMLDivElement
  return { overlay, modal, mount, close, onClose }
}
