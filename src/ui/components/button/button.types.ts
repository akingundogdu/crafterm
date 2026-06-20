// Button primitive types.

export interface ButtonOptions {
  text?: string
  variant?: 'primary' | 'danger'
  className?: string
  type?: 'button' | 'submit'
  title?: string
  ariaLabel?: string
  onClick?: (e: MouseEvent) => void
}
