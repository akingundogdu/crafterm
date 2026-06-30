import { el } from '@views/lib/dom'
import { UITexts } from '@texts'
import { disableSpellcheck } from '../plans.state'

export function plansInput(): HTMLInputElement {
  const input = el('input', {
    class: 'search-box-input',
    type: 'text',
    placeholder: UITexts.Pickers.plans.placeholder
  })
  disableSpellcheck(input)
  return input
}
