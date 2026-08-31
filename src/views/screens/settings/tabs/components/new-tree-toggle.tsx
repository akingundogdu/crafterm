import { Component } from '@geajs/core'
import { settings } from '@views/state/spine'
import { UITexts } from '@texts'

interface NewTreeToggleProps {
  panel: HTMLElement
  makeToggle: (cb: HTMLInputElement) => () => void
}

// Sidebar "new tree design" toggle (experimental). One-shot builder — opts arrive
// via the constructor into a plain field. `onChange` sits on the root `<label>` and
// reads the input from the event target; `checked` is bound inline (no store).
class NewTreeToggleView extends Component {
  private readonly makeToggle: (cb: HTMLInputElement) => () => void

  constructor(opts: { makeToggle: (cb: HTMLInputElement) => () => void }) {
    super()
    this.makeToggle = opts.makeToggle
  }

  template() {
    return (
      <label class="checkbox-row" onChange={(e: Event) => this.makeToggle(e.target as HTMLInputElement)()}>
        <input type="checkbox" checked={!!settings.sidebar.newTree} />
        {UITexts.Settings.sidebar.newTree}
      </label>
    )
  }
}

export function buildNewTreeToggle(props: NewTreeToggleProps): void {
  const host = document.createElement('div')
  new NewTreeToggleView({ makeToggle: props.makeToggle }).render(host)
  props.panel.appendChild(host.firstElementChild as HTMLElement)
}
