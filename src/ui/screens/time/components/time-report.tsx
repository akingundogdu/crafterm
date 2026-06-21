import { createOverlay, createButton } from '@ui/components'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import { state } from '@ui/state/state'
import { findProjectByPath, findFeature } from '@ui/catalog/catalog'
import { timeEntryRepo } from '@repositories'
import { fmtHM, rangeStart, reportByProject, type Range } from '@services/domain/time'
import { UITexts } from '@texts'
import { rangeLabel, makeCopyClick } from './time-report.state'
import { renderRangeChips } from './range-chips'
import { reportProjectRow } from './report-project-row'
import { reportFeatureRow } from './report-feature-row'

// Report modal: total per project (and per feature) over a date range.
export function showReport(): void {
  const ov = createOverlay({ closeOnBackdrop: true })

  let range: Range = 'week'
  const chipsRow = (<div class="time-report-chips" />) as HTMLDivElement
  const body = (<div class="time-report-body" />) as HTMLDivElement

  // Plain-text version of the current report, rebuilt on every render so the
  // "Copy" button can hand the user a paste-ready summary for clients.
  let reportText = ''

  const render = (): void => {
    renderRangeChips({
      host: chipsRow,
      active: range,
      onSelect: (r) => {
        range = r
        render()
      }
    })

    const byProj = reportByProject(timeEntryRepo.getAll(), rangeStart(range))

    body.replaceChildren()
    if (!byProj.size) {
      body.insertAdjacentHTML('beforeend', `<div class="notif-empty"></div>`)
      reportText = `Time report — ${rangeLabel(range)}\nNo time logged in this range`
      return
    }
    const lines: string[] = [`Time report — ${rangeLabel(range)}`, '']
    let grand = 0
    for (const [path, info] of [...byProj].sort((a, b) => b[1].total - a[1].total)) {
      grand += info.total
      const proj = findProjectByPath(state.tree, path)
      body.appendChild(reportProjectRow({ name: proj?.name ?? path, duration: fmtHM(info.total) }))
      lines.push(`${proj?.name ?? path}: ${fmtHM(info.total)}`)
      for (const [fid, ms] of [...info.feats].sort((a, b) => b[1] - a[1])) {
        const feat = fid ? findFeature(state.tree, fid)?.feature : null
        body.appendChild(reportFeatureRow({ name: feat?.name ?? '(no feature)', duration: fmtHM(ms) }))
        lines.push(`  - ${feat?.name ?? '(no feature)'}: ${fmtHM(ms)}`)
      }
    }
    body.appendChild(
      (
        <div
          class="time-report-row time-report-total"
          innerHTML={`<span class="time-report-name">${UITexts.Time.report.total}</span><span class="time-report-dur">${fmtHM(grand)}</span>`}
        />
      ) as HTMLDivElement
    )
    lines.push('', `Total: ${fmtHM(grand)}`)
    reportText = lines.join('\n')
  }
  render()

  const copyBtn = createButton({ text: UITexts.Time.report.copy, className: 'settings-inline-btn' })
  copyBtn.addEventListener('click', makeCopyClick(copyBtn, () => reportText))
  const foot = (<div class="time-report-foot">{copyBtn}</div>) as HTMLDivElement

  const modal = (
    <div class="modal time-report-modal">
      {makeCloseButton(ov.close)}
      <h2>{UITexts.Time.report.title}</h2>
      {chipsRow}
      {body}
      {foot}
    </div>
  ) as HTMLDivElement

  ov.overlay.appendChild(modal)
  ov.mount()
}
