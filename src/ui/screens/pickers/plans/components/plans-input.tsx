import { UITexts } from '@texts'
import { disableSpellcheck } from '../plans.state'

export function plansInput(): HTMLInputElement {
  return (
    <input
      class="search-box-input"
      type="text"
      placeholder={UITexts.Pickers.plans.placeholder}
      ref={disableSpellcheck}
    />
  ) as HTMLInputElement
}
