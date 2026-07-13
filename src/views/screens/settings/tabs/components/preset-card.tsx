import { Component } from '@geajs/core'
import { UITexts } from '@texts'

export interface PresetCardProps {
  label: string
  kind: 'days' | 'offset'
  initialValue: string
  snapHour: boolean
  onCommitLabel: (raw: string) => string
  onApplyValue: (kind: string, rawValue: string, snapChecked: boolean) => void
  onDelete: () => void
}

// One quick-time preset card: label + kind select + value input + a snap-to-hour
// checkbox (shown only for day-based presets) + delete. Rendered as a keyed JSX
// child of the presets list, so gea populates `this.props`. The nested-control
// onChange handlers are safe here because this is the card's OWN template, not a
// `.map()` body (the gea plugin mis-compiles a handler on a non-root element
// inside a keyed map). The inputs are UNCONTROLLED — seeded imperatively in
// onAfterRender (a `value=` JSX binding would let gea treat them as controlled and
// reset them on every keystroke) — and the mutations run through the reminders
// state fns passed in as props. Editing a field mutates + persists in place with
// no re-render, so onAfterRender re-seeds only when the list structurally
// re-renders (add / remove). Self-contained — no @ui.
export default class PresetCard extends Component {
  declare props: PresetCardProps

  labelInput: HTMLInputElement | null = null
  kindSelect: HTMLSelectElement | null = null
  valueInput: HTMLInputElement | null = null
  snapCheckbox: HTMLInputElement | null = null
  snapWrap: HTMLLabelElement | null = null

  // Seed the uncontrolled controls + wire the snap wrapper's inline layout and
  // conditional visibility, mirroring the former imperative controller exactly.
  onAfterRender(): void {
    if (this.labelInput) this.labelInput.value = this.props.label
    if (this.kindSelect) this.kindSelect.value = this.props.kind
    if (this.valueInput) this.valueInput.value = this.props.initialValue
    if (this.snapCheckbox) this.snapCheckbox.checked = this.props.snapHour
    if (this.snapWrap) {
      this.snapWrap.style.display = 'flex'
      this.snapWrap.style.alignItems = 'center'
      this.snapWrap.style.gap = '6px'
    }
    this.syncSnapVisibility()
  }

  private syncSnapVisibility = (): void => {
    if (this.snapWrap) this.snapWrap.style.display = this.kindSelect?.value === 'days' ? '' : 'none'
  }

  private applyValue = (): void => {
    this.props.onApplyValue(this.kindSelect?.value ?? '', this.valueInput?.value ?? '', this.snapCheckbox?.checked ?? false)
  }

  private onLabelChange = (): void => {
    if (this.labelInput) this.labelInput.value = this.props.onCommitLabel(this.labelInput.value)
  }

  private onKindChange = (): void => {
    this.syncSnapVisibility()
    this.applyValue()
  }

  template({ onDelete }: this['props']) {
    return (
      <div class="settings-app-card">
        <input type="text" placeholder={UITexts.Settings.reminders.label} ref={this.labelInput} onChange={this.onLabelChange} />
        <select class="settings-select" ref={this.kindSelect} onChange={this.onKindChange}>
          <option value="offset">{UITexts.Settings.reminders.offsetMinutes}</option>
          <option value="days">{UITexts.Settings.reminders.daysAhead}</option>
        </select>
        <input type="number" min="0" ref={this.valueInput} onChange={this.applyValue} />
        <label ref={this.snapWrap}>
          <input type="checkbox" ref={this.snapCheckbox} onChange={this.applyValue} />
          {' Snap to default hour'}
        </label>
        <button class="settings-app-delete" title={UITexts.Settings.reminders.removePreset} onClick={onDelete}>
          ✕
        </button>
      </div>
    )
  }
}
