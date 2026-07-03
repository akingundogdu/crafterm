import { Component } from '@geajs/core'
import '@views/components/modal/modal.css'
import '@views/components/form-field/form-field.css'
import { createOverlay } from '@views/components/overlay/overlay'
import { CHANGELOG_RANGES, buildChangelogMarkdown } from '@views/screens/daily-plan/daily-plan.state'

// Modal: pick a day range, then generate a copyable markdown changelog of
// completed tasks for customers. Fully self-contained — reads completed tasks from
// the repo via buildChangelogMarkdown. The output textarea, copy button and range
// select are handled imperatively via property refs: Generate writes the textarea
// and enables Copy, Copy flashes "Copied!" — no reactive field is written, so the
// gea template renders once. Self-contained — no @ui (§2.7).
export default class ChangelogModal extends Component {
  rangeSel: HTMLSelectElement | null = null
  output: HTMLTextAreaElement | null = null
  copyBtn: HTMLButtonElement | null = null

  private readonly onCloseFn: () => void

  // Data via the constructor into plain fields — a gea Component only populates
  // `this.props` when rendered from a parent template, not from a manual `new X()`.
  constructor(opts: { onClose: () => void }) {
    super()
    this.onCloseFn = opts.onClose
  }

  // Seed the imperative initial state once after the template mounts (mirrors the
  // legacy `rangeSel.value = 'today'` + `copyBtn.disabled = true`).
  onAfterRender(): void {
    if (this.rangeSel) this.rangeSel.value = 'today'
    if (this.copyBtn) this.copyBtn.disabled = true
  }

  private doGenerate = (): void => {
    if (!this.output || !this.copyBtn || !this.rangeSel) return
    this.output.value = buildChangelogMarkdown(this.rangeSel.value)
    this.copyBtn.disabled = false
  }

  private doCopy = (): void => {
    if (!this.copyBtn || !this.output) return
    void navigator.clipboard.writeText(this.output.value)
    const prev = this.copyBtn.textContent
    this.copyBtn.textContent = 'Copied!'
    setTimeout(() => {
      if (this.copyBtn) this.copyBtn.textContent = prev
    }, 1200)
  }

  template() {
    return (
      <div class="modal modal-prompt changelog-modal">
        <button class="modal-close" type="button" aria-label="Close" title="Close" onClick={() => this.onCloseFn()}>
          ×
        </button>
        <h2>Changelog report</h2>
        <div class="field">
          <label>Date range</label>
          <select class="settings-select" ref={this.rangeSel}>
            {CHANGELOG_RANGES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <textarea
          class="changelog-output"
          rows={14}
          placeholder='Click "Generate" to produce the changelog markdown…'
          ref={this.output}
          onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
        />
        <div class="modal-actions">
          <button class="button-primary" onClick={this.doGenerate}>
            Generate
          </button>
          <button ref={this.copyBtn} onClick={this.doCopy}>
            Copy
          </button>
        </div>
      </div>
    )
  }
}

// Modal: pick a day range, then generate a copyable markdown changelog of
// completed tasks for customers. Opens the gea ChangelogModal body inside a @views
// overlay backdrop; signature preserved so daily-plan resolves unchanged.
export function showChangelogModal(): void {
  const ov = createOverlay()
  ov.overlay.classList.add('daily-plan-form-overlay')

  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') ov.close()
  }
  ov.onClose(() => document.removeEventListener('keydown', onKey, true))
  document.addEventListener('keydown', onKey, true)

  new ChangelogModal({ onClose: () => ov.close() }).render(ov.overlay)
  ov.mount()
}
