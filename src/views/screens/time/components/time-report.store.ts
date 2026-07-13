import { Store } from '@geajs/core'
import shellStore from '@views/state/shell.store'
import { findProjectByPath, findFeature } from '@views/catalog/catalog'
import { timeEntryRepo } from '@repositories'
import { fmtHM, rangeStart, reportByProject, type Range } from '@services/domain/time'
import { UITexts } from '@texts'

// Human label for the current range, used in the copy-to-clipboard text.
export function rangeLabel(range: Range): string {
  return range === 'today'
    ? UITexts.Time.report.today
    : range === 'week'
      ? UITexts.Time.report.week
      : range === 'month'
        ? UITexts.Time.report.month
        : UITexts.Time.report.all
}

// Tab/chip label for a range.
export function rangeTab(r: Range): string {
  return r === 'today'
    ? UITexts.Time.report.tabToday
    : r === 'week'
      ? UITexts.Time.report.tabWeek
      : r === 'month'
        ? UITexts.Time.report.tabMonth
        : UITexts.Time.report.tabAll
}

// A single line of the report: a project total, a nested feature total, or the
// grand total. `cls` carries the legacy row class so the e2e selectors + styling
// hold; `id` is the stable key for the keyed list (§5.9).
export interface ReportRow {
  id: string
  cls: string
  name: string
  dur: string
}

// gea store for the report modal: the selected range, the derived rows + paste
// text, and a transient "Copied" flag. Singleton, reset on each open (mirrors the
// legacy per-open controller). Self-contained — no @ui (§2.7).
class TimeReportStore extends Store {
  range: Range = 'week'
  copied = false
  private closeFn: () => void = () => {}

  open(close: () => void): void {
    this.range = 'week'
    this.copied = false
    this.closeFn = close
  }

  setRange(r: Range): void {
    this.range = r
  }

  close(): void {
    this.closeFn()
  }

  // Project (and per-feature) totals over the range, plus a paste-ready text. The
  // Maps are spread into fresh arrays before sorting, so no store-tracked array is
  // mutated inside the getter (§5.7).
  get computed(): { rows: ReportRow[]; text: string } {
    const byProj = reportByProject(timeEntryRepo.getAll(), rangeStart(this.range))
    if (!byProj.size) {
      return { rows: [], text: `Time report — ${rangeLabel(this.range)}\nNo time logged in this range` }
    }
    const rows: ReportRow[] = []
    const lines: string[] = [`Time report — ${rangeLabel(this.range)}`, '']
    let grand = 0
    for (const [path, info] of [...byProj].sort((a, b) => b[1].total - a[1].total)) {
      grand += info.total
      const proj = findProjectByPath(shellStore.tree, path)
      const pname = proj?.name ?? path
      rows.push({ id: `p:${path}`, cls: 'time-report-proj', name: pname, dur: fmtHM(info.total) })
      lines.push(`${pname}: ${fmtHM(info.total)}`)
      for (const [fid, ms] of [...info.feats].sort((a, b) => b[1] - a[1])) {
        const feat = fid ? findFeature(shellStore.tree, fid)?.feature : null
        const fname = feat?.name ?? '(no feature)'
        rows.push({ id: `f:${path}:${fid}`, cls: 'time-report-feat', name: fname, dur: fmtHM(ms) })
        lines.push(`  - ${fname}: ${fmtHM(ms)}`)
      }
    }
    rows.push({ id: 'total', cls: 'time-report-total', name: UITexts.Time.report.total, dur: fmtHM(grand) })
    lines.push('', `Total: ${fmtHM(grand)}`)
    return { rows, text: lines.join('\n') }
  }

  // Copy the current report text with a transient "Copied" label.
  copy(): void {
    void navigator.clipboard.writeText(this.computed.text)
    this.copied = true
    setTimeout(() => (this.copied = false), 1200)
  }
}

export default new TimeReportStore()
