import { makeCloseButton } from '@ui/components/dialog/dialog'
import { createOverlay, FormField } from '@ui/components'
import { CHANGELOG_RANGES, buildChangelogMarkdown } from '../daily-plan.state'

// Modal: pick a day range, then generate a copyable markdown changelog of
// completed tasks for customers. Fully self-contained — reads completed tasks
// from the repo via buildChangelogMarkdown.
export class ChangelogModalController {
  open(): void {
    const { overlay, mount, close, onClose } = createOverlay()
    overlay.classList.add('daily-plan-form-overlay')

    const onKey = (e: KeyboardEvent): void => {
      e.stopPropagation()
      if (e.key === 'Escape') close()
    }
    onClose(() => document.removeEventListener('keydown', onKey, true))
    document.addEventListener('keydown', onKey, true)

    // Range select
    const rangeSel = (
      <select class="settings-select">
        {CHANGELOG_RANGES.map((r) => (
          <option value={r.id}>{r.label}</option>
        ))}
      </select>
    ) as HTMLSelectElement
    rangeSel.value = 'today'
    const rangeField = (<FormField label="Date range">{rangeSel}</FormField>) as HTMLDivElement

    // Generate + output
    const output = (
      <textarea
        class="changelog-output"
        placeholder='Click "Generate" to produce the changelog markdown…'
        onKeydown={(e: KeyboardEvent) => e.stopPropagation()}
      />
    ) as HTMLTextAreaElement
    output.rows = 14

    const copyBtn = (
      <button
        onClick={() => {
          void navigator.clipboard.writeText(output.value)
          const prev = copyBtn.textContent
          copyBtn.textContent = 'Copied!'
          setTimeout(() => (copyBtn.textContent = prev), 1200)
        }}
      >
        Copy
      </button>
    ) as HTMLButtonElement
    copyBtn.disabled = true

    const generateBtn = (
      <button
        class="button-primary"
        onClick={() => {
          output.value = buildChangelogMarkdown(rangeSel.value)
          copyBtn.disabled = false
        }}
      >
        Generate
      </button>
    ) as HTMLButtonElement

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
}
