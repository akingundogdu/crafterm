import { el } from '@views/lib/dom'

// Button primitive (plain-DOM port of the @ui createButton). `variant: 'primary'`
// adds `.button-primary` (`'danger'` → `.button-danger`), plus any caller
// `className`. Self-contained (§2.7).
export interface ButtonOptions {
  text?: string
  variant?: 'primary' | 'danger'
  className?: string
  type?: 'button' | 'submit'
  title?: string
  ariaLabel?: string
  onClick?: (e: MouseEvent) => void
}

function resolveButtonClass(opts: ButtonOptions): string | undefined {
  const classes: string[] = []
  if (opts.variant) classes.push('button-' + opts.variant)
  if (opts.className) classes.push(opts.className)
  return classes.length ? classes.join(' ') : undefined
}

export function createButton(opts: ButtonOptions = {}): HTMLButtonElement {
  return el('button', {
    class: resolveButtonClass(opts),
    type: opts.type,
    title: opts.title,
    'aria-label': opts.ariaLabel,
    onClick: opts.onClick
  }, opts.text)
}
