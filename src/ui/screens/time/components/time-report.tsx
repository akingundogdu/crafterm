import { TimeReportController } from './time-report.controller'

// Report modal: total per project (and per feature) over a date range.
export function showReport(): void {
  new TimeReportController().open()
}
