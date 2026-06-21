interface MenuItemOptions {
  label: string
  onClick: () => void
}

// A single action button in the pane menu. Pure view — forwards the click.
export function createMenuItem(opts: MenuItemOptions): HTMLButtonElement {
  return (<button onClick={opts.onClick}>{opts.label}</button>) as HTMLButtonElement
}
