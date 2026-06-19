// Button primitive. Produces a plain <button>; `variant: 'primary'` adds the
// `.button-primary` class (and `'danger'` → `.button-danger`). No type attribute
// unless asked (matches the app's modal action buttons, which rely on the default).

export interface ButtonOptions {
  text?: string
  variant?: 'primary' | 'danger'
  className?: string
  type?: 'button' | 'submit'
  title?: string
  ariaLabel?: string
  onClick?: (e: MouseEvent) => void
}

export function createButton(opts: ButtonOptions = {}): HTMLButtonElement {
  const classes: string[] = []
  if (opts.variant) classes.push('button-' + opts.variant)
  if (opts.className) classes.push(opts.className)
  return (
    <button
      class={classes.length ? classes.join(' ') : undefined}
      type={opts.type}
      title={opts.title}
      aria-label={opts.ariaLabel}
      onClick={opts.onClick}
    >
      {opts.text}
    </button>
  ) as HTMLButtonElement
}
