import { settings } from '@ui/state/state'
import { UITexts } from '@texts'
import { labeledInput, labeledSelect } from '../shared'
import {
  makeOrientationChange,
  makeFontSizeChange,
  makeDetailToggle,
  makeRecencyToggle
} from './sidebar-tab.state'

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
    makeOrientationChange()
  )
  labeledInput(
    panel,
    UITexts.Settings.sidebar.fontSize,
    'number',
    String(settings.sidebar.fontSize),
    makeFontSizeChange()
  )

  const detailDefs: Array<[keyof typeof settings.sidebar.details, string]> = [
    ['status', UITexts.Settings.sidebar.showStatusText],
    ['git', UITexts.Settings.sidebar.showGitBranch],
    ['panes', UITexts.Settings.sidebar.showPaneCount],
    ['paneList', UITexts.Settings.sidebar.showPanesUnderTerminal]
  ]
  detailDefs.forEach(([key, label]) => {
    const cb = (<input type="checkbox" />) as HTMLInputElement
    cb.checked = settings.sidebar.details[key]
    cb.addEventListener('change', makeDetailToggle(key, cb))
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
  recCb.addEventListener('change', makeRecencyToggle(recCb))
  const recRow = (
    <label class="checkbox-row">
      {recCb}
      {UITexts.Settings.sidebar.groupByRecency}
    </label>
  ) as HTMLLabelElement
  panel.appendChild(recRow)
}
