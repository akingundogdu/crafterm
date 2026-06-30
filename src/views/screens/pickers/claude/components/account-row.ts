import { el } from '@views/lib/dom'
import type { ClaudeAccount } from '../claude.types'

// One row in the Claude account switcher: the account label, plus its underlying
// command/value as a subline when present.
export function accountRow(a: ClaudeAccount, onClick: () => void): HTMLButtonElement {
  return el(
    'button',
    { class: 'pick-row project-row', onClick },
    el('span', { class: 'picker-name' }, a.label),
    a.value ? el('span', { class: 'project-sub' }, a.value) : null
  )
}
