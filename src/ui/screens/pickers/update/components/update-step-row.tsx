import { createButton } from '@ui/components'
import type { UpdateStep } from '../update.types'

interface UpdateStepRowProps {
  label: string
  list: HTMLElement
  modal: HTMLElement
  onClose: () => void
}

// One self-update progress row: a status dot + label, appended to `list`. Pure
// factory — the modal mount point and close handler are passed in; on `fail` the
// row also mounts an error message + Close button into the modal.
export function updateStepRow({ label, list, modal, onClose }: UpdateStepRowProps): UpdateStep {
  let labelEl!: HTMLElement
  const row = (
    <div class="update-step active">
      <span class="update-dot" />
      <span class="update-label" ref={(el: HTMLSpanElement) => (labelEl = el)} />
    </div>
  ) as HTMLDivElement
  labelEl.textContent = label
  list.appendChild(row)
  return {
    done: () => {
      row.classList.remove('active')
      row.classList.add('done')
    },
    fail: (msg) => {
      row.classList.remove('active')
      row.classList.add('failed')
      const e = (<div class="update-error">{msg}</div>) as HTMLDivElement
      modal.appendChild(e)
      const btn = createButton({ className: 'primary', text: 'Close', onClick: onClose })
      btn.style.marginTop = '12px'
      modal.appendChild(btn)
    }
  }
}
