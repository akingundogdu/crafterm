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
// checkbox (shown only for day-based presets) + delete.
export class PresetCardController {
  private readonly props: PresetCardProps

  private kindSel!: HTMLSelectElement
  private valueI!: HTMLInputElement
  private snap!: HTMLInputElement
  private snapWrap!: HTMLLabelElement

  constructor(props: PresetCardProps) {
    this.props = props
  }

  render(): HTMLDivElement {
    const { label, kind, initialValue, snapHour, onCommitLabel, onDelete } = this.props

    const labelI = (
      <input
        type="text"
        placeholder={UITexts.Settings.reminders.label}
        onChange={() => {
          labelI.value = onCommitLabel(labelI.value)
        }}
        ref={(el: HTMLInputElement) => {
          el.value = label
        }}
      />
    ) as HTMLInputElement

    // kind: relative offset (minutes) vs day-based jump
    const kindSel = (
      <select
        class="settings-select"
        onChange={() => {
          this.syncSnapVisibility()
          this.applyValue()
        }}
      >
        {[
          ['offset', UITexts.Settings.reminders.offsetMinutes],
          ['days', UITexts.Settings.reminders.daysAhead]
        ].map(
          ([val, text]) =>
            (
              <option
                ref={(el: HTMLOptionElement) => {
                  el.value = val
                }}
              >
                {text}
              </option>
            ) as HTMLOptionElement
        )}
      </select>
    ) as HTMLSelectElement
    kindSel.value = kind
    this.kindSel = kindSel

    const valueI = (
      <input
        type="number"
        min="0"
        ref={(el: HTMLInputElement) => {
          el.value = initialValue
        }}
      />
    ) as HTMLInputElement
    this.valueI = valueI

    const snap = (
      <input
        type="checkbox"
        ref={(el: HTMLInputElement) => {
          el.checked = snapHour
        }}
      />
    ) as HTMLInputElement
    this.snap = snap
    const snapWrap = (
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {snap}
        {' Snap to default hour'}
      </label>
    ) as HTMLLabelElement
    this.snapWrap = snapWrap

    this.syncSnapVisibility()

    // applyValue is wired imperatively here: the value/snap inputs are created
    // above, so they can't reference applyValue as a prop value at build time.
    valueI.addEventListener('change', this.applyValue)
    snap.addEventListener('change', this.applyValue)

    const del = (
      <button class="settings-app-delete" title={UITexts.Settings.reminders.removePreset} onClick={onDelete}>
        ✕
      </button>
    ) as HTMLButtonElement

    return (
      <div class="settings-app-card">
        {labelI}
        {kindSel}
        {valueI}
        {snapWrap}
        {del}
      </div>
    ) as HTMLDivElement
  }

  private syncSnapVisibility = (): void => {
    this.snapWrap.style.display = this.kindSel.value === 'days' ? '' : 'none'
  }

  private applyValue = (): void => this.props.onApplyValue(this.kindSel.value, this.valueI.value, this.snap.checked)
}
