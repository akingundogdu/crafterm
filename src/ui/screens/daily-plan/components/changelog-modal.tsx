import { makeCloseButton } from '@ui/components/dialog/dialog'
import { createOverlay } from '@ui/components'
import { CHANGELOG_RANGES, buildChangelogMarkdown } from '../daily-plan.state'

// Modal: pick a day range, then generate a copyable markdown changelog of
// completed tasks for customers. Fully self-contained — reads completed tasks
// from the repo via buildChangelogMarkdown.
export function showChangelogModal(): void {
  const { overlay, mount, close, onClose } = createOverlay()
  overlay.classList.add('daily-plan-form-overlay')

  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  }
  onClose(() => document.removeEventListener('keydown', onKey, true))
  document.addEventListener('keydown', onKey, true)

  // Range select
  const rangeSel = (<select class="settings-select" />) as HTMLSelectElement
  for (const r of CHANGELOG_RANGES) {
    const o = document.createElement('option')
    o.value = r.id
    o.textContent = r.label
    rangeSel.appendChild(o)
  }
  rangeSel.value = 'today'
  const rangeField = (
    <div class="field">
      <label>Date range</label>
      {rangeSel}
    </div>
  ) as HTMLDivElement

  // Generate + output
  const output = (
    <textarea
      class="changelog-output"
      placeholder='Click "Generate" to produce the changelog markdown…'
      onKeydown={(e: KeyboardEvent) => e.stopPropagation()}
    />
  ) as HTMLTextAreaElement
  output.rows = 14

  const copyBtn = (<button>Copy</button>) as HTMLButtonElement
  copyBtn.disabled = true
  copyBtn.addEventListener('click', () => {
    void navigator.clipboard.writeText(output.value)
    const prev = copyBtn.textContent
    copyBtn.textContent = 'Copied!'
    setTimeout(() => (copyBtn.textContent = prev), 1200)
  })

  const generateBtn = (<button class="button-primary">Generate</button>) as HTMLButtonElement
  generateBtn.addEventListener('click', () => {
    output.value = buildChangelogMarkdown(rangeSel.value)
    copyBtn.disabled = false
  })

  const actions = (
    <div class="modal-actions">
      {generateBtn}
      {copyBtn}
    </div>
  ) as HTMLDivElement

  const modal = (
    <div class="modal modal-prompt changelog-modal">
      {makeCloseButton(close)}
      <h2>Changelog report</h2>
      {rangeField}
      {output}
      {actions}
    </div>
  ) as HTMLDivElement
  overlay.appendChild(modal)

  mount()
}
