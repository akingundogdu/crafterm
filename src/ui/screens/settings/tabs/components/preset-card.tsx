import { UITexts } from '@texts'

interface PresetCardProps {
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
export function buildPresetCard(props: PresetCardProps): HTMLDivElement {
  const { label, kind, initialValue, snapHour, onCommitLabel, onApplyValue, onDelete } = props

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
        syncSnapVisibility()
        applyValue()
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

  const valueI = (
    <input
      type="number"
      min="0"
      ref={(el: HTMLInputElement) => {
        el.value = initialValue
      }}
    />
  ) as HTMLInputElement

  const snap = (
    <input
      type="checkbox"
      ref={(el: HTMLInputElement) => {
        el.checked = snapHour
      }}
    />
  ) as HTMLInputElement
  const snapWrap = (
    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      {snap}
      {' Snap to default hour'}
    </label>
  ) as HTMLLabelElement

  const syncSnapVisibility = (): void => {
    snapWrap.style.display = kindSel.value === 'days' ? '' : 'none'
  }
  syncSnapVisibility()

  const applyValue = (): void => onApplyValue(kindSel.value, valueI.value, snap.checked)
  // applyValue is declared after the valueI/snap JSX, so it can't be referenced
  // as a prop value there (temporal dead zone); wire these imperatively.
  valueI.addEventListener('change', applyValue)
  snap.addEventListener('change', applyValue)

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
