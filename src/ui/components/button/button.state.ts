import type { ButtonOptions } from './button.types'

// Resolves the button's class string: `variant: 'primary'` → `.button-primary`
// (`'danger'` → `.button-danger`), plus any caller `className`. Undefined when
// neither is set, so the view omits the attribute.
export function resolveButtonClass(opts: ButtonOptions): string | undefined {
  const classes: string[] = []
  if (opts.variant) classes.push('button-' + opts.variant)
  if (opts.className) classes.push(opts.className)
  return classes.length ? classes.join(' ') : undefined
}
