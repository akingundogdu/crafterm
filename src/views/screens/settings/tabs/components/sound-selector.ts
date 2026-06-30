import { el } from '@views/lib/dom'
import { settings } from '@views/state/spine'
import { UITexts } from '@texts'
import { SOUNDS } from '../workspace.state'

interface SoundSelectorProps {
  panel: HTMLElement
  makeChange: (sel: HTMLSelectElement) => () => void
}

// Notification sound section (macOS system sounds; '' = off). Picking a sound
// previews it via the change handler.
export function buildSoundSelector(props: SoundSelectorProps): void {
  const { panel, makeChange } = props
  panel.insertAdjacentHTML('beforeend', `<h3 style="margin-top:18px">${UITexts.Settings.workspace.notifications}</h3>`)
  const sel = el('select', { class: 'settings-select' })
  SOUNDS.forEach((s) => {
    const o = el('option', null, s || UITexts.Settings.workspace.soundOff)
    o.value = s
    if (s === settings.notifSound) o.selected = true
    sel.appendChild(o)
  })
  sel.addEventListener('change', makeChange(sel))
  const soundRow = el('div', { class: 'settings-row' })
  soundRow.insertAdjacentHTML('beforeend', `<span class="settings-row-label">${UITexts.Settings.workspace.soundLabel}</span>`)
  soundRow.appendChild(sel)
  panel.appendChild(soundRow)
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Played when a terminal finishes or Claude needs you. Pick one to preview.</div>'
  )
}
