import { Component } from '@geajs/core'
import { settings } from '@views/state/spine'
import { UITexts } from '@texts'
import { SOUNDS } from '../workspace.store'

interface SoundSelectorProps {
  panel: HTMLElement
  makeChange: (sel: HTMLSelectElement) => () => void
}

// Notification sound section (macOS system sounds; '' = off). One-shot builder
// (rebuilt when the tab re-renders), so opts arrive via the constructor into plain
// fields — a gea Component only populates `this.props` when rendered from a parent
// template, not from a manual `new X()`. The selected option is bound inline
// (§labeledSelect); picking a sound previews it via the change handler.
class SoundSelectorView extends Component {
  private readonly makeChange: (sel: HTMLSelectElement) => () => void

  constructor(opts: { makeChange: (sel: HTMLSelectElement) => () => void }) {
    super()
    this.makeChange = opts.makeChange
  }

  template() {
    // display:contents → the rows lay out as flat panel children (rendered straight
    // into the panel, NOT moved out of the gea tree — moving gea-rendered nodes
    // trips a gea reconcile `insertBefore` crash).
    return (
      <div style={{ display: 'contents' }}>
        <h3 style="margin-top:18px">{UITexts.Settings.workspace.notifications}</h3>
        <div class="settings-row">
          <span class="settings-row-label">{UITexts.Settings.workspace.soundLabel}</span>
          <select
            class="settings-select"
            onChange={(e: Event) => this.makeChange(e.target as HTMLSelectElement)()}
          >
            {SOUNDS.map((s) => (
              <option key={s || 'off'} value={s} selected={s === settings.notifSound}>
                {s || UITexts.Settings.workspace.soundOff}
              </option>
            ))}
          </select>
        </div>
        <div class="field-hint">Played when a terminal finishes or Claude needs you. Pick one to preview.</div>
      </div>
    )
  }
}

// Signature preserved so `workspace.ts` resolves unchanged. Mounts the gea view into
// a throwaway host, then moves its rows into the panel so the panel's own children
// stay flat (byte-faithful with the old plain-DOM append order).
export function buildSoundSelector(props: SoundSelectorProps): void {
  new SoundSelectorView({ makeChange: props.makeChange }).render(props.panel)
}
