import { el } from '@views/lib/dom'
import { settings } from '@views/state/spine'
import { UITexts } from '@texts'
import { labeledInput } from '../shared'
import { buildPresetCard } from './components/preset-card'
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
  const list = el('div')
  panel.appendChild(list)

  const renderList = (): void => {
    list.innerHTML = ''
    settings.reminderDefaults.presets.forEach((p, idx) => {
      list.appendChild(
        buildPresetCard({
          label: p.label,
          kind: presetKind(p),
          initialValue: presetInitialValue(p),
          snapHour: p.snapHour === true,
          onCommitLabel: (raw) => commitPresetLabel(p, raw),
          onApplyValue: (kind, rawValue, snapChecked) => applyPresetValue(p, kind, rawValue, snapChecked),
          onDelete: () => {
            removePreset(idx)
            renderList()
          }
        })
      )
    })

    const add = el(
      'button',
      {
        class: 'settings-inline-btn',
        onClick: () => {
          addDefaultPreset()
          renderList()
        }
      },
      '+ Add preset'
    )
    list.appendChild(add)
  }
  renderList()
}
