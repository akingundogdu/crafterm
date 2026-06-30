// Spotlight global-search types.

export interface GsEntry {
  source:
    | 'project'
    | 'feature'
    | 'pane'
    | 'notebook'
    | 'bookmark'
    | 'plan'
    | 'account'
    | 'action'
    | 'pane-action'
  label: string
  detail?: string
  open: () => void
}
