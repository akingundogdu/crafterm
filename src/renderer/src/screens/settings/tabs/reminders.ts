import { settings } from '../../../state'
import { persistence } from '../../../services/storage/persistence.service'
import { labeledInput } from '../shared'

export function buildRemindersPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Reminders</h3>')

  labeledInput(
    panel,
    'Default hour (for "Tomorrow"-style presets)',
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
  const list = document.createElement('div')
  panel.appendChild(list)

  const renderList = (): void => {
    list.innerHTML = ''
    settings.reminderDefaults.presets.forEach((p, idx) => {
      const card = document.createElement('div')
      card.className = 'app-card'

      const labelI = document.createElement('input')
      labelI.type = 'text'
      labelI.value = p.label
      labelI.placeholder = 'Label'
      labelI.addEventListener('change', () => {
        p.label = labelI.value.trim() || p.label
        labelI.value = p.label
        persistence.save()
      })

      // kind: relative offset (minutes) vs day-based jump
      const kindSel = document.createElement('select')
      kindSel.className = 'settings-select'
      ;[
        ['offset', 'Offset (minutes)'],
        ['days', 'Days ahead']
      ].forEach(([val, text]) => {
        const o = document.createElement('option')
        o.value = val
        o.textContent = text
        kindSel.appendChild(o)
      })
      kindSel.value = typeof p.days === 'number' ? 'days' : 'offset'

      const valueI = document.createElement('input')
      valueI.type = 'number'
      valueI.min = '0'
      valueI.value = String(typeof p.days === 'number' ? p.days : (p.offsetMin ?? 0))

      const snapWrap = document.createElement('label')
      snapWrap.style.display = 'flex'
      snapWrap.style.alignItems = 'center'
      snapWrap.style.gap = '6px'
      const snap = document.createElement('input')
      snap.type = 'checkbox'
      snap.checked = p.snapHour === true
      snapWrap.append(snap, document.createTextNode(' Snap to default hour'))

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

      const del = document.createElement('button')
      del.className = 'app-del'
      del.textContent = '✕'
      del.title = 'Remove preset'
      del.addEventListener('click', () => {
        settings.reminderDefaults.presets.splice(idx, 1)
        persistence.save()
        renderList()
      })

      card.append(labelI, kindSel, valueI, snapWrap, del)
      list.appendChild(card)
    })

    const add = document.createElement('button')
    add.className = 'settings-inline-btn'
    add.textContent = '+ Add preset'
    add.addEventListener('click', () => {
      settings.reminderDefaults.presets.push({ label: '+1h', offsetMin: 60 })
      persistence.save()
      renderList()
    })
    list.appendChild(add)
  }
  renderList()
}

