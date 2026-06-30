import { el } from '@views/lib/dom'
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

    const labelI = el('input', {
      type: 'text',
      placeholder: UITexts.Settings.reminders.label,
      onChange: () => {
        labelI.value = onCommitLabel(labelI.value)
      }
    })
    labelI.value = label

    // kind: relative offset (minutes) vs day-based jump
    const kindSel = el('select', {
      class: 'settings-select',
      onChange: () => {
        this.syncSnapVisibility()
        this.applyValue()
      }
    })
    ;([
      ['offset', UITexts.Settings.reminders.offsetMinutes],
      ['days', UITexts.Settings.reminders.daysAhead]
    ] as const).forEach(([val, text]) => {
      const o = el('option', null, text)
      o.value = val
      kindSel.appendChild(o)
    })
    kindSel.value = kind
    this.kindSel = kindSel

    const valueI = el('input', { type: 'number', min: '0' })
    valueI.value = initialValue
    this.valueI = valueI

    const snap = el('input', { type: 'checkbox' })
    snap.checked = snapHour
    this.snap = snap
    const snapWrap = el('label', null, snap, ' Snap to default hour')
    snapWrap.style.display = 'flex'
    snapWrap.style.alignItems = 'center'
    snapWrap.style.gap = '6px'
    this.snapWrap = snapWrap

    this.syncSnapVisibility()

    valueI.addEventListener('change', this.applyValue)
    snap.addEventListener('change', this.applyValue)

    const del = el('button', { class: 'settings-app-delete', title: UITexts.Settings.reminders.removePreset, onClick: onDelete }, '✕')

    return el('div', { class: 'settings-app-card' }, labelI, kindSel, valueI, snapWrap, del)
  }

  private syncSnapVisibility = (): void => {
    this.snapWrap.style.display = this.kindSel.value === 'days' ? '' : 'none'
  }

  private applyValue = (): void => this.props.onApplyValue(this.kindSel.value, this.valueI.value, this.snap.checked)
}
