// Button primitive. Produces a plain <button>; `variant: 'primary'` adds the
// existing `.primary` class. No type attribute unless asked (matches the app's
// modal action buttons, which rely on the default). Reuses existing CSS classes.

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
  const btn = document.createElement('button')
  const classes: string[] = []
  if (opts.variant) classes.push(opts.variant)
  if (opts.className) classes.push(opts.className)
  if (classes.length) btn.className = classes.join(' ')
  if (opts.type) btn.type = opts.type
  if (opts.title) btn.title = opts.title
  if (opts.ariaLabel) btn.setAttribute('aria-label', opts.ariaLabel)
  if (opts.text != null) btn.textContent = opts.text
  if (opts.onClick) btn.addEventListener('click', opts.onClick)
  return btn
}
