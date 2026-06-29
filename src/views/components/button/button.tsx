import { Component } from '@geajs/core'

// Button primitive (gea). Produces a plain <button>; `variant: 'primary'` adds
// the `.button-primary` class (`'danger'` → `.button-danger`), plus any caller
// `className`. No `type` attribute unless asked, matching the app's modal action
// buttons that rely on the default. Self-contained — no @ui import (§2.7).
export default class Button extends Component {
  declare props: {
    text?: string
    variant?: 'primary' | 'danger'
    className?: string
    type?: 'button' | 'submit'
    title?: string
    ariaLabel?: string
    onClick?: (e: MouseEvent) => void
  }

  template({ text, variant, className, type, title, ariaLabel, onClick }: this['props']) {
    const classes: string[] = []
    if (variant) classes.push('button-' + variant)
    if (className) classes.push(className)
    const cls = classes.length ? classes.join(' ') : undefined
    return (
      <button class={cls} type={type} title={title} aria-label={ariaLabel} onClick={onClick}>
        {text}
      </button>
    )
  }
}
