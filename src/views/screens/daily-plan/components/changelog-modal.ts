import { el } from '@views/lib/dom'
import { createOverlay } from '@views/components/overlay/overlay'
import { makeCloseButton } from '@views/components/dialog/close-button'
import { CHANGELOG_RANGES, buildChangelogMarkdown } from '@views/screens/daily-plan/daily-plan.state'

// Modal: pick a day range, then generate a copyable markdown changelog of
// completed tasks for customers. Fully self-contained — reads completed tasks from
// the repo via buildChangelogMarkdown. Plain-DOM port (§2.7).
class ChangelogModal {
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
    const rangeSel = el(
      'select',
      { class: 'settings-select' },
      ...CHANGELOG_RANGES.map((r) => el('option', { value: r.id }, r.label))
    )
    rangeSel.value = 'today'
    const rangeField = el('div', { class: 'field' }, el('label', null, 'Date range'), rangeSel)

    // Generate + output
    const output = el('textarea', {
      class: 'changelog-output',
      placeholder: 'Click "Generate" to produce the changelog markdown…',
      onKeydown: (e: KeyboardEvent) => e.stopPropagation()
    })
    output.rows = 14

    const copyBtn = el(
      'button',
      {
        onClick: () => {
          void navigator.clipboard.writeText(output.value)
          const prev = copyBtn.textContent
          copyBtn.textContent = 'Copied!'
          setTimeout(() => (copyBtn.textContent = prev), 1200)
        }
      },
      'Copy'
    )
    copyBtn.disabled = true

    const generateBtn = el(
      'button',
      {
        class: 'button-primary',
        onClick: () => {
          output.value = buildChangelogMarkdown(rangeSel.value)
          copyBtn.disabled = false
        }
      },
      'Generate'
    )

    const actions = el('div', { class: 'modal-actions' }, generateBtn, copyBtn)

    const modal = el(
      'div',
      { class: 'modal modal-prompt changelog-modal' },
      makeCloseButton(close),
      el('h2', null, 'Changelog report'),
      rangeField,
      output,
      actions
    )
    overlay.appendChild(modal)

    mount()
  }
}

// Modal: pick a day range, then generate a copyable markdown changelog of
// completed tasks for customers.
export function showChangelogModal(): void {
  new ChangelogModal().open()
}
