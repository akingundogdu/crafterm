import { createOverlay, createButton } from '@ui/components'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import { state } from '@ui/state/state'
import { findProjectByPath, findFeature } from '@ui/catalog/catalog'
import { timeEntryRepo } from '@repositories'
import { fmtHM, rangeStart, reportByProject, type Range } from '@services/domain/time'
import { UITexts } from '@texts'
import { rangeLabel, rangeTab, makeCopyClick } from './time-report.state'

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
    chipsRow.replaceChildren()
    ;(['today', 'week', 'month', 'all'] as Range[]).forEach((r) => {
      chipsRow.appendChild(
        createButton({
          text: rangeTab(r),
          className: 'time-report-chip' + (r === range ? ' active' : ''),
          onClick: () => {
            range = r
            render()
          }
        })
      )
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
      body.appendChild(
        (
          <div
            class="time-report-row time-report-proj"
            innerHTML={`<span class="time-report-name">${proj?.name ?? path}</span><span class="time-report-dur">${fmtHM(info.total)}</span>`}
          />
        ) as HTMLDivElement
      )
      lines.push(`${proj?.name ?? path}: ${fmtHM(info.total)}`)
      for (const [fid, ms] of [...info.feats].sort((a, b) => b[1] - a[1])) {
        const feat = fid ? findFeature(state.tree, fid)?.feature : null
        body.appendChild(
          (
            <div
              class="time-report-row time-report-feat"
              innerHTML={`<span class="time-report-name">${feat?.name ?? '(no feature)'}</span><span class="time-report-dur">${fmtHM(ms)}</span>`}
            />
          ) as HTMLDivElement
        )
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
