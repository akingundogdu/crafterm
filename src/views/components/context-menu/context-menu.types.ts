// Shared context-menu types.

export interface ContextMenuItem {
  label: string
  run?: () => void
  danger?: boolean
  // When set, clicking the item runs `run` but keeps the menu open and re-opens
  // the submenu it lives in (e.g. a "Refresh" item that clears a cache and lets
  // its parent producer re-fetch).
  keepOpen?: boolean
  // A submenu: either ready items or a (possibly async) producer evaluated when
  // the submenu opens (e.g. enumerating simulators/devices on demand).
  children?: ContextMenuItem[] | (() => ContextMenuItem[] | Promise<ContextMenuItem[]>)
}

export interface ColorOption {
  current: string | null
  onPick: (color: string | null) => void
}
