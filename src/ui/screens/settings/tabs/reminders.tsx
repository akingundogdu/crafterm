import { settings } from '@ui/state/state'
import { UITexts } from '@texts'
import { labeledInput } from '../shared'
import {
  saveDefaultHour,
  commitPresetLabel,
  applyPresetValue,
  addDefaultPreset,
  removePreset,
  presetKind,
  presetInitialValue
} from './reminders.state'

export function buildRemindersPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.reminders.heading}</h3>`)

  labeledInput(
    panel,
    UITexts.Settings.reminders.defaultHour,
    'number',
    String(settings.reminderDefaults.defaultHour),
    saveDefaultHour
  )

  panel.insertAdjacentHTML('beforeend', '<div class="settings-subhead">Quick-time presets</div>')
  const list = (<div />) as HTMLDivElement
  panel.appendChild(list)

  const renderList = (): void => {
    list.innerHTML = ''
    settings.reminderDefaults.presets.forEach((p, idx) => {
      const labelI = (
        <input
          type="text"
          placeholder={UITexts.Settings.reminders.label}
          ref={(el: HTMLInputElement) => {
            el.value = p.label
          }}
        />
      ) as HTMLInputElement
      labelI.addEventListener('change', () => {
        labelI.value = commitPresetLabel(p, labelI.value)
      })

      // kind: relative offset (minutes) vs day-based jump
      const kindSel = (
        <select class="settings-select">
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
      kindSel.value = presetKind(p)

      const valueI = (
        <input
          type="number"
          min="0"
          ref={(el: HTMLInputElement) => {
            el.value = presetInitialValue(p)
          }}
        />
      ) as HTMLInputElement

      const snap = (
        <input
          type="checkbox"
          ref={(el: HTMLInputElement) => {
            el.checked = p.snapHour === true
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

      const applyValue = (): void => applyPresetValue(p, kindSel.value, valueI.value, snap.checked)
      kindSel.addEventListener('change', () => {
        syncSnapVisibility()
        applyValue()
      })
      valueI.addEventListener('change', applyValue)
      snap.addEventListener('change', applyValue)

      const del = (
        <button class="app-del" title={UITexts.Settings.reminders.removePreset}>
          ✕
        </button>
      ) as HTMLButtonElement
      del.addEventListener('click', () => {
        removePreset(idx)
        renderList()
      })

      const card = (
        <div class="app-card">
          {labelI}
          {kindSel}
          {valueI}
          {snapWrap}
          {del}
        </div>
      ) as HTMLDivElement
      list.appendChild(card)
    })

    const add = (<button class="settings-inline-btn">+ Add preset</button>) as HTMLButtonElement
    add.addEventListener('click', () => {
      addDefaultPreset()
      renderList()
    })
    list.appendChild(add)
  }
  renderList()
}
