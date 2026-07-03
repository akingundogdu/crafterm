import { Component } from '@geajs/core'
import { settings } from '@views/state/spine'
import { UITexts } from '@texts'

interface DetailTogglesProps {
  panel: HTMLElement
  makeToggle: (key: keyof typeof settings.sidebar.details, cb: HTMLInputElement) => () => void
}

const DETAIL_DEFS: Array<[keyof typeof settings.sidebar.details, string]> = [
  ['status', UITexts.Settings.sidebar.showStatusText],
  ['git', UITexts.Settings.sidebar.showGitBranch],
  ['panes', UITexts.Settings.sidebar.showPaneCount],
  ['paneList', UITexts.Settings.sidebar.showPanesUnderTerminal]
]

// Sidebar per-node detail toggles (status text, git branch, pane count, pane list).
// One-shot builder — opts arrive via the constructor into a plain field (a gea
// Component only fills `this.props` when rendered from a parent template). The
// `onChange` sits on the map-item ROOT `<label>` (a handler on a nested element
// inside a keyed `.map()` trips the gea-plugin bug); it reads the toggled input from
// the event target. `checked` is bound inline (no store — never re-renders).
class DetailTogglesView extends Component {
  private readonly makeToggle: DetailTogglesProps['makeToggle']

  constructor(opts: { makeToggle: DetailTogglesProps['makeToggle'] }) {
    super()
    this.makeToggle = opts.makeToggle
  }

  template() {
    // `display: contents` so the labels lay out as direct panel children (byte-
    // faithful with the old plain-DOM append), rendered straight into the panel —
    // NOT moved out of the gea tree (moving gea-rendered nodes trips a gea
    // reconcile `insertBefore` crash). The label text is wrapped in a <span>: a
    // BARE text child alongside element siblings inside a keyed `.map()` item is
    // mis-compiled to an empty comment by the gea plugin.
    return (
      <div style={{ display: 'contents' }}>
        {DETAIL_DEFS.map((def) => (
          <label
            key={def[0]}
            class="checkbox-row"
            onChange={(e: Event) => this.makeToggle(def[0], e.target as HTMLInputElement)()}
          >
            <input type="checkbox" checked={settings.sidebar.details[def[0]]} />
            <span>{def[1]}</span>
          </label>
        ))}
      </div>
    )
  }
}

// Signature preserved so `sidebar-tab.ts` resolves unchanged. Rendered straight
// into the panel (the display:contents root keeps the labels as flat children).
export function buildDetailToggles(props: DetailTogglesProps): void {
  new DetailTogglesView({ makeToggle: props.makeToggle }).render(props.panel)
}
