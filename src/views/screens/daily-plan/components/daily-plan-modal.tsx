import { Component } from '@geajs/core'
import '@views/components/modal/modal.css'
import './daily-plan-modal.css'
import DailyPlanBoard from '../daily-plan'

// Thin gea shell for the wide Daily Plan board overlay: a `.modal.daily-plan-modal`
// with an inline `.modal-close` button, hosting the imperative gea board via a
// property ref + onAfterRender (the board manages its own reactive subtree, so it
// mounts once into an empty host div). Mounted imperatively into the overlay, so
// `close` is a constructor field (not `this.props`). Self-contained — no @ui (§2.7).
export default class DailyPlanModal extends Component {
  private readonly close: () => void
  private boardHost: HTMLDivElement | null = null

  constructor(opts: { close: () => void }) {
    super()
    this.close = opts.close
  }

  onAfterRender(): void {
    if (this.boardHost && !this.boardHost.firstChild) new DailyPlanBoard().render(this.boardHost)
  }

  template() {
    return (
      <div class="modal daily-plan-modal">
        <button class="modal-close" type="button" aria-label="Close" title="Close (Esc)" onClick={() => this.close()}>
          ×
        </button>
        <div class="daily-plan-modal-board" ref={this.boardHost} />
      </div>
    )
  }
}
