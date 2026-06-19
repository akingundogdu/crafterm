import { createOverlay, createButton } from '@ui/components'
import { makeCloseButton } from '../../../dialog'
import { state } from '../../../state'
import { findProjectByPath, findFeature } from '../../../catalog'
import { timeEntryRepo } from '@services/storage/repositories'
import { fmtHM, rangeStart, reportByProject, type Range } from '@services/domain/time'

// Report modal: total per project (and per feature) over a date range.
export function showReport(): void {
  const ov = createOverlay({ closeOnBackdrop: true })
  const modal = document.createElement('div')
  modal.className = 'modal time-report-modal'
  ov.overlay.appendChild(modal)
  modal.appendChild(makeCloseButton(ov.close))
  modal.insertAdjacentHTML('beforeend', '<h2>Time report</h2>')

  let range: Range = 'week'
  const chipsRow = document.createElement('div')
  chipsRow.className = 'time-report-chips'
  const body = document.createElement('div')
  body.className = 'time-report-body'
  modal.append(chipsRow, body)

  // Plain-text version of the current report, rebuilt on every render so the
  // "Copy" button can hand the user a paste-ready summary for clients.
  let reportText = ''
  const rangeLabel = (): string =>
    range === 'today' ? 'Today' : range === 'week' ? 'Last 7 days' : range === 'month' ? 'Last 30 days' : 'All time'

  const render = (): void => {
    chipsRow.replaceChildren()
    ;(['today', 'week', 'month', 'all'] as Range[]).forEach((r) => {
      chipsRow.appendChild(
        createButton({
          text: r === 'today' ? 'Today' : r === 'week' ? '7 days' : r === 'month' ? '30 days' : 'All',
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
      body.insertAdjacentHTML('beforeend', '<div class="notif-empty">No time logged in this range</div>')
      reportText = `Time report — ${rangeLabel()}\nNo time logged in this range`
      return
    }
    const lines: string[] = [`Time report — ${rangeLabel()}`, '']
    let grand = 0
    for (const [path, info] of [...byProj].sort((a, b) => b[1].total - a[1].total)) {
      grand += info.total
      const proj = findProjectByPath(state.tree, path)
      const pr = document.createElement('div')
      pr.className = 'time-report-row time-report-proj'
      pr.innerHTML = `<span class="time-report-name">${proj?.name ?? path}</span><span class="time-report-dur">${fmtHM(info.total)}</span>`
      body.appendChild(pr)
      lines.push(`${proj?.name ?? path}: ${fmtHM(info.total)}`)
      for (const [fid, ms] of [...info.feats].sort((a, b) => b[1] - a[1])) {
        const feat = fid ? findFeature(state.tree, fid)?.feature : null
        const fr = document.createElement('div')
        fr.className = 'time-report-row time-report-feat'
        fr.innerHTML = `<span class="time-report-name">${feat?.name ?? '(no feature)'}</span><span class="time-report-dur">${fmtHM(ms)}</span>`
        body.appendChild(fr)
        lines.push(`  - ${feat?.name ?? '(no feature)'}: ${fmtHM(ms)}`)
      }
    }
    const tot = document.createElement('div')
    tot.className = 'time-report-row time-report-total'
    tot.innerHTML = `<span class="time-report-name">Total</span><span class="time-report-dur">${fmtHM(grand)}</span>`
    body.appendChild(tot)
    lines.push('', `Total: ${fmtHM(grand)}`)
    reportText = lines.join('\n')
  }
  render()

  const foot = document.createElement('div')
  foot.className = 'time-report-foot'
  const copyBtn = createButton({ text: 'Copy report', className: 'settings-inline-btn' })
  copyBtn.addEventListener('click', () => {
    void navigator.clipboard.writeText(reportText)
    copyBtn.textContent = 'Copied'
    setTimeout(() => (copyBtn.textContent = 'Copy report'), 1200)
  })
  foot.appendChild(copyBtn)
  modal.appendChild(foot)

  ov.mount()
}
