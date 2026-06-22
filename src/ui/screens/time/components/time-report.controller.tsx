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
export class TimeReportController {
  private range: Range = 'week'
  private readonly chipsRow = (<div class="time-report-chips" />) as HTMLDivElement
  private readonly body = (<div class="time-report-body" />) as HTMLDivElement
  // Plain-text version of the current report, rebuilt on every render so the
  // "Copy" button can hand the user a paste-ready summary for clients.
  private reportText = ''

  private render = (): void => {
    renderRangeChips({
      host: this.chipsRow,
      active: this.range,
      onSelect: (r) => {
        this.range = r
        this.render()
      }
    })

    const byProj = reportByProject(timeEntryRepo.getAll(), rangeStart(this.range))

    this.body.replaceChildren()
    if (!byProj.size) {
      this.body.insertAdjacentHTML('beforeend', `<div class="notif-empty"></div>`)
      this.reportText = `Time report — ${rangeLabel(this.range)}\nNo time logged in this range`
      return
    }
    const lines: string[] = [`Time report — ${rangeLabel(this.range)}`, '']
    let grand = 0
    for (const [path, info] of [...byProj].sort((a, b) => b[1].total - a[1].total)) {
      grand += info.total
      const proj = findProjectByPath(state.tree, path)
      this.body.appendChild(reportProjectRow({ name: proj?.name ?? path, duration: fmtHM(info.total) }))
      lines.push(`${proj?.name ?? path}: ${fmtHM(info.total)}`)
      for (const [fid, ms] of [...info.feats].sort((a, b) => b[1] - a[1])) {
        const feat = fid ? findFeature(state.tree, fid)?.feature : null
        this.body.appendChild(reportFeatureRow({ name: feat?.name ?? '(no feature)', duration: fmtHM(ms) }))
        lines.push(`  - ${feat?.name ?? '(no feature)'}: ${fmtHM(ms)}`)
      }
    }
    this.body.appendChild(
      (
        <div
          class="time-report-row time-report-total"
          innerHTML={`<span class="time-report-name">${UITexts.Time.report.total}</span><span class="time-report-dur">${fmtHM(grand)}</span>`}
        />
      ) as HTMLDivElement
    )
    lines.push('', `Total: ${fmtHM(grand)}`)
    this.reportText = lines.join('\n')
  }

  open = (): void => {
    const ov = createOverlay({ closeOnBackdrop: true })

    this.render()

    const copyBtn = createButton({ text: UITexts.Time.report.copy, className: 'settings-inline-btn' })
    copyBtn.addEventListener('click', makeCopyClick(copyBtn, () => this.reportText))
    const foot = (<div class="time-report-foot">{copyBtn}</div>) as HTMLDivElement

    const modal = (
      <div class="modal time-report-modal">
        {makeCloseButton(ov.close)}
        <h2>{UITexts.Time.report.title}</h2>
        {this.chipsRow}
        {this.body}
        {foot}
      </div>
    ) as HTMLDivElement

    ov.overlay.appendChild(modal)
    ov.mount()
  }
}
