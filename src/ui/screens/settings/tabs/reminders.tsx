import { settings } from '@ui/state/state'
import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'
import { labeledInput } from '../shared'

export function buildRemindersPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.reminders.heading}</h3>`)

  labeledInput(
    panel,
    UITexts.Settings.reminders.defaultHour,
    'number',
    String(settings.reminderDefaults.defaultHour),
    (v) => {
      const n = parseInt(v, 10)
      if (Number.isInteger(n) && n >= 0 && n <= 23) {
        settings.reminderDefaults.defaultHour = n
        persistence.save()
      }
    }
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
        p.label = labelI.value.trim() || p.label
        labelI.value = p.label
        persistence.save()
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
      kindSel.value = typeof p.days === 'number' ? 'days' : 'offset'

      const valueI = (
        <input
          type="number"
          min="0"
          ref={(el: HTMLInputElement) => {
            el.value = String(typeof p.days === 'number' ? p.days : (p.offsetMin ?? 0))
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

      const applyValue = (): void => {
        const n = Math.max(0, parseInt(valueI.value, 10) || 0)
        if (kindSel.value === 'days') {
          p.days = n
          p.offsetMin = undefined
          p.snapHour = snap.checked ? true : undefined
        } else {
          p.offsetMin = n
          p.days = undefined
          p.snapHour = undefined
        }
        persistence.save()
      }
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
        settings.reminderDefaults.presets.splice(idx, 1)
        persistence.save()
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
      settings.reminderDefaults.presets.push({ label: '+1h', offsetMin: 60 })
      persistence.save()
      renderList()
    })
    list.appendChild(add)
  }
  renderList()
}
