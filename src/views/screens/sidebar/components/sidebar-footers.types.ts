// Footer-button action handlers are injected by the main-window bootstrap so the
// footer component does not import the command / view modules directly (avoids
// import cycles). The accounts footer's buttons are wired separately by the
// accounts module, so they are not part of this dependency set.
export interface SidebarFootersDeps {
  onNewTerminal: () => void
  onNewClaude: () => void
  onNewFolder: () => void
  onNewProject: () => void
  onSettings: () => void
  onNotebookNewNote: () => void
  onNotebookNewFolder: () => void
  onNotebookLinkFile: () => void
  onDatabaseNewProject: () => void
  onDockerRefresh: () => void
}
