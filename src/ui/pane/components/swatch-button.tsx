interface SwatchButtonOptions {
  color: string | null
  onClick: () => void
}

// A single color-swatch option in the pane menu. Pure view — paints the swatch
// (or marks it as the default/none swatch) and forwards the click.
export function createSwatchButton(opts: SwatchButtonOptions): HTMLButtonElement {
  const s = (
    <button
      class={'context-menu-swatch' + (opts.color === null ? ' context-menu-swatch-none' : '')}
      onClick={opts.onClick}
    />
  ) as HTMLButtonElement
  if (opts.color) s.style.background = opts.color
  else s.title = 'Default'
  return s
}
