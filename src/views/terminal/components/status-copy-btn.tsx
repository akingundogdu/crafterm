import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import { COPY_ICON } from '../status-bar.store'

// Button that copies the pane's full cwd path, flashing a check on success. The
// SVG icon is injected via a ref in onAfterRender (the innerHTML JSX prop is not
// honoured by the gea runtime).
class StatusCopyBtnView extends Component {
  private readonly clickHandler: (e: Event) => void
  private btnEl: HTMLButtonElement | null = null

  constructor(opts: { onClick: (e: Event) => void }) {
    super()
    this.clickHandler = opts.onClick
  }

  onAfterRender(): void {
    if (this.btnEl) this.btnEl.innerHTML = COPY_ICON
  }

  template() {
    return (
      <button
        class="pane-status-copy"
        title={UITexts.Terminal.copyFullPath}
        aria-label={UITexts.Terminal.copyFullPath}
        onClick={this.clickHandler}
        ref={this.btnEl}
      />
    )
  }
}

export function createStatusCopyBtn(onClick: (e: Event) => void): HTMLButtonElement {
  const host = document.createElement('div')
  new StatusCopyBtnView({ onClick }).render(host)
  return host.firstElementChild as HTMLButtonElement
}
