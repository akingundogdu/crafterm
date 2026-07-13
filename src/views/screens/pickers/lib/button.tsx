// Button primitive (gea port of the @ui createButton). `variant: 'primary'` adds
// `.button-primary` (`'danger'` → `.button-danger`), plus any caller `className`.
// A `.tsx` factory returning the raw button node (§gea gotcha: a detached node
// consumed imperatively can't come from a gea Component's deferred render +
// firstElementChild extraction, so it is built with document.createElement).
// Signature preserved so any consumer keeps a plain HTMLButtonElement.
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
  const button = document.createElement('button')
  const cls = resolveButtonClass(opts)
  if (cls) button.className = cls
  if (opts.type) button.type = opts.type
  if (opts.title) button.title = opts.title
  if (opts.ariaLabel) button.setAttribute('aria-label', opts.ariaLabel)
  if (opts.text != null) button.textContent = opts.text
  if (opts.onClick) button.addEventListener('click', opts.onClick)
  return button
}
