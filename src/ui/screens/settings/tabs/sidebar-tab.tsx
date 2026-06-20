import { settings, requestSidebar } from '@ui/state/state'
import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'
import { applyOrientation, applySidebarFont } from '../../sidebar/sidebar'
import { labeledInput, labeledSelect } from '../shared'

export function buildSidebarPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.sidebar.heading}</h3>`)
  labeledSelect(
    panel,
    UITexts.Settings.sidebar.position,
    [
      ['left', UITexts.Settings.sidebar.verticalLeft],
      ['top', UITexts.Settings.sidebar.horizontalTop]
    ],
    settings.sidebar.orientation,
    (v) => {
      settings.sidebar.orientation = v as 'left' | 'top'
      applyOrientation()
      persistence.save()
    }
  )
  labeledInput(panel, UITexts.Settings.sidebar.fontSize, 'number', String(settings.sidebar.fontSize), (v) => {
    const n = parseInt(v, 10)
    if (!Number.isNaN(n) && n >= 9 && n <= 22) {
      settings.sidebar.fontSize = n
      applySidebarFont()
      persistence.save()
    }
  })

  const detailDefs: Array<[keyof typeof settings.sidebar.details, string]> = [
    ['status', UITexts.Settings.sidebar.showStatusText],
    ['git', UITexts.Settings.sidebar.showGitBranch],
    ['panes', UITexts.Settings.sidebar.showPaneCount],
    ['paneList', UITexts.Settings.sidebar.showPanesUnderTerminal]
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
      {UITexts.Settings.sidebar.groupByRecency}
    </label>
  ) as HTMLLabelElement
  panel.appendChild(recRow)
}
