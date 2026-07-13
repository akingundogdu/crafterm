import { Component } from '@geajs/core'
import { settings } from '@views/state/spine'
import { tabMeta } from '../../shell-apply'

interface HideTogglesGroupProps {
  panel: HTMLElement
  strip: 'left' | 'right'
  title: string
  makeToggle: (strip: 'left' | 'right', tabId: string, cb: HTMLInputElement) => () => void
}

// One strip's per-tab visibility toggles (checked = visible) under a subhead.
// One-shot builder — opts arrive via the constructor into plain fields (a gea
// Component only fills `this.props` when rendered from a parent template). The
// `onChange` sits on the map-item ROOT `<label>` (a handler on a nested element
// inside a keyed `.map()` trips the gea-plugin bug); it reads the toggled input from
// the event target. `checked` is bound inline (no store — never re-renders).
class HideTogglesGroupView extends Component {
  private readonly strip: 'left' | 'right'
  private readonly title: string
  private readonly makeToggle: HideTogglesGroupProps['makeToggle']

  constructor(opts: {
    strip: 'left' | 'right'
    title: string
    makeToggle: HideTogglesGroupProps['makeToggle']
  }) {
    super()
    this.strip = opts.strip
    this.title = opts.title
    this.makeToggle = opts.makeToggle
  }

  template() {
    const rows = tabMeta().filter((m) => m.strip === this.strip)
    // display:contents → labels lay out as flat panel children (rendered straight
    // into the panel, NOT moved out of the gea tree). Row label text is wrapped in
    // a <span>: a bare text child alongside element siblings inside a keyed `.map()`
    // is mis-compiled to an empty comment by the gea plugin.
    return (
      <div style={{ display: 'contents' }}>
        <div class="settings-subhead">{this.title}</div>
        {rows.map((t) => (
          <label
            key={t.id}
            style="display:flex;align-items:center;gap:6px;padding:2px 0"
            onChange={(e: Event) => this.makeToggle(this.strip, t.id, e.target as HTMLInputElement)()}
          >
            <input
              type="checkbox"
              checked={!settings.tabDisplay.hidden[this.strip].includes(t.id)}
            />
            <span>{' ' + t.label}</span>
          </label>
        ))}
      </div>
    )
  }
}

// Signature preserved so `tabs.ts` resolves unchanged. Mounts the gea view into a
// throwaway host, then moves the subhead + each toggle row into the panel so the
// panel's children stay flat (byte-faithful with the old plain-DOM append order).
export function buildHideTogglesGroup(props: HideTogglesGroupProps): void {
  new HideTogglesGroupView({
    strip: props.strip,
    title: props.title,
    makeToggle: props.makeToggle
  }).render(props.panel)
}
