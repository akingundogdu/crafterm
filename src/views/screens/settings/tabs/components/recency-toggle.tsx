import { Component } from '@geajs/core'
import { settings } from '@views/state/spine'
import { UITexts } from '@texts'

interface RecencyToggleProps {
  panel: HTMLElement
  makeToggle: (cb: HTMLInputElement) => () => void
}

// Sidebar "group by recency" toggle. One-shot builder — opts arrive via the
// constructor into a plain field (a gea Component only fills `this.props` when
// rendered from a parent template). `onChange` sits on the root `<label>` and reads
// the input from the event target; `checked` is bound inline (no store — never
// re-renders).
class RecencyToggleView extends Component {
  private readonly makeToggle: (cb: HTMLInputElement) => () => void

  constructor(opts: { makeToggle: (cb: HTMLInputElement) => () => void }) {
    super()
    this.makeToggle = opts.makeToggle
  }

  template() {
    return (
      <label
        class="checkbox-row"
        onChange={(e: Event) => this.makeToggle(e.target as HTMLInputElement)()}
      >
        <input type="checkbox" checked={!!settings.sidebar.groupByRecency} />
        {UITexts.Settings.sidebar.groupByRecency}
      </label>
    )
  }
}

// Signature preserved so `sidebar-tab.ts` resolves unchanged. Single-root view —
// mount into a throwaway host and append the `.checkbox-row` directly (byte-faithful
// with the old plain-DOM append).
export function buildRecencyToggle(props: RecencyToggleProps): void {
  const host = document.createElement('div')
  new RecencyToggleView({ makeToggle: props.makeToggle }).render(host)
  props.panel.appendChild(host.firstElementChild as HTMLElement)
}
