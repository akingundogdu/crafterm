export type DropZoneName = 'left' | 'right' | 'top' | 'bottom'

// One row in the pane ⋯ menu. `item` is a clickable action, `label` a
// non-interactive section heading, `swatch` a background-color button.
// buildPaneMenu produces these so both the menu and the global search (Cmd+J)
// consume the same definition without duplicating the action logic.
export type PaneMenuEntry =
  | { kind: 'item'; label: string; run: () => void }
  | { kind: 'label'; text: string }
  | { kind: 'swatch'; label: string; color: string | null; run: () => void }
