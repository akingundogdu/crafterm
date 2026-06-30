// Toggle handlers are injected by the main-window bootstrap so the status bar
// component does not import the sidebar / notifications view modules directly
// (avoids an import cycle — notifications.tsx already imports this component for
// the unread badge).
export interface StatusBarDeps {
  onToggleSidebar: () => void
  onToggleNotif: () => void
}
