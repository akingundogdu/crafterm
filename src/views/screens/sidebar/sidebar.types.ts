// Sidebar types.

export type SidebarMode = 'terminal' | 'notebook' | 'database' | 'docker' | 'accounts'

export interface Crumb {
  text: string
  color: string | null
}
