import { settings } from '../../../state'
import { persistence } from '../../../services/storage/persistence.service'
import { applyTabDisplay, tabMeta } from '../../sidebar/sidebar'
import { labeledSelect } from '../shared'

export function buildTabsPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Tabs</h3>')
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Controls the sidebar and right-panel tab strips. In icon-only mode, hover a tab to see its name and shortcut.</div>'
  )

  labeledSelect(
    panel,
    'Display',
    [
      ['icon', 'Icon only'],
      ['text', 'Text only'],
      ['both', 'Icon + text']
    ],
    settings.tabDisplay.mode,
    (v) => {
      settings.tabDisplay.mode = v as 'icon' | 'text' | 'both'
      applyTabDisplay()
      persistence.save()
    }
  )

  const renderHideGroup = (strip: 'left' | 'right', title: string): void => {
    panel.insertAdjacentHTML('beforeend', `<div class="settings-subhead">${title}</div>`)
    for (const t of tabMeta().filter((m) => m.strip === strip)) {
      const row = document.createElement('label')
      row.style.display = 'flex'
      row.style.alignItems = 'center'
      row.style.gap = '6px'
      row.style.padding = '2px 0'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = !settings.tabDisplay.hidden[strip].includes(t.id)
      cb.addEventListener('change', () => {
        const list = settings.tabDisplay.hidden[strip]
        const idx = list.indexOf(t.id)
        if (cb.checked) {
          if (idx >= 0) list.splice(idx, 1)
        } else if (idx < 0) {
          list.push(t.id)
        }
        applyTabDisplay()
        persistence.save()
      })
      row.append(cb, document.createTextNode(' ' + t.label))
      panel.appendChild(row)
    }
  }
  renderHideGroup('left', 'Sidebar tabs (show)')
  renderHideGroup('right', 'Right panel tabs (show)')
}

