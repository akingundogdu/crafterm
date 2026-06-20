import type { ButtonOptions } from './button.types'
import { resolveButtonClass } from './button.state'

export type { ButtonOptions } from './button.types'

// Button primitive. Produces a plain <button>; `variant: 'primary'` adds the
// `.button-primary` class (and `'danger'` → `.button-danger`). No type attribute
// unless asked (matches the app's modal action buttons, which rely on the default).
export function createButton(opts: ButtonOptions = {}): HTMLButtonElement {
  return (
    <button
      class={resolveButtonClass(opts)}
      type={opts.type}
      title={opts.title}
      aria-label={opts.ariaLabel}
      onClick={opts.onClick}
    >
      {opts.text}
    </button>
  ) as HTMLButtonElement
}
