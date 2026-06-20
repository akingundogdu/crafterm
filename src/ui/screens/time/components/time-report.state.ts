import type { Range } from '@services/domain/time'
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

// Copy the current report text to the clipboard with a transient "Copied" label.
export function makeCopyClick(copyBtn: HTMLButtonElement, getText: () => string): () => void {
  return () => {
    void navigator.clipboard.writeText(getText())
    copyBtn.textContent = UITexts.Time.report.copied
    setTimeout(() => (copyBtn.textContent = UITexts.Time.report.copy), 1200)
  }
}
