import { el } from '@views/lib/dom'
import { createButton } from '../../lib/button'
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
  const labelEl = el('span', { class: 'update-label' })
  const row = el('div', { class: 'update-step active' }, el('span', { class: 'update-dot' }), labelEl)
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
      const e = el('div', { class: 'update-error' }, msg)
      modal.appendChild(e)
      const btn = createButton({ className: 'primary', text: 'Close', onClick: onClose })
      btn.style.marginTop = '12px'
      modal.appendChild(btn)
    }
  }
}
