import { settings, requestSidebar } from '../../../state'
import { persistence } from '@services/storage/persistence.service'
import { applyOrientation, applySidebarFont } from '../../sidebar/sidebar'
import { labeledInput, labeledSelect } from '../shared'

export function buildSidebarPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Sidebar</h3>')
  labeledSelect(
    panel,
    'Position',
    [
      ['left', 'Vertical (left)'],
      ['top', 'Horizontal (top)']
    ],
    settings.sidebar.orientation,
    (v) => {
      settings.sidebar.orientation = v as 'left' | 'top'
      applyOrientation()
      persistence.save()
    }
  )
  labeledInput(panel, 'Sidebar font size', 'number', String(settings.sidebar.fontSize), (v) => {
    const n = parseInt(v, 10)
    if (!Number.isNaN(n) && n >= 9 && n <= 22) {
      settings.sidebar.fontSize = n
      applySidebarFont()
      persistence.save()
    }
  })

  const detailDefs: Array<[keyof typeof settings.sidebar.details, string]> = [
    ['status', 'Show status text'],
    ['git', 'Show git branch'],
    ['panes', 'Show pane count'],
    ['paneList', 'Show panes under terminal']
  ]
  detailDefs.forEach(([key, label]) => {
    const cb = (<input type="checkbox" />) as HTMLInputElement
    cb.checked = settings.sidebar.details[key]
    cb.addEventListener('change', () => {
      settings.sidebar.details[key] = cb.checked
      requestSidebar()
      persistence.save()
    })
    const r = (
      <label class="checkbox-row">
        {cb}
        {label}
      </label>
    ) as HTMLLabelElement
    panel.appendChild(r)
  })

  const recCb = (<input type="checkbox" />) as HTMLInputElement
  recCb.checked = !!settings.sidebar.groupByRecency
  recCb.addEventListener('change', () => {
    settings.sidebar.groupByRecency = recCb.checked
    requestSidebar()
    persistence.save()
  })
  const recRow = (
    <label class="checkbox-row">
      {recCb}
      {'Group by recency (Today / Yesterday / Earlier)'}
    </label>
  ) as HTMLLabelElement
  panel.appendChild(recRow)
}
