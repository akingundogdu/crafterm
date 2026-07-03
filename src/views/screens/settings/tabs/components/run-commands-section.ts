import RunCommandsSection from './run-commands-section-view'
import store from './run-commands-section.store'

export interface RunCommandsSectionProps {
  projectId: string
  parent: HTMLElement
  uid: (prefix: string) => string
}

// Run commands: named one-shot shell commands. Surfaced in the sidebar "Run command…"
// modal and executed at the project path (split or new tab). Seeds the reactive store
// from the project, then mounts the gea RunCommandsSection view into the sub-tab panel
// host. Signature preserved shape (props factory) so the controller resolves unchanged.
export function buildRunCommandsSection(props: RunCommandsSectionProps): void {
  store.reload(props.projectId)
  new RunCommandsSection({ uid: props.uid }).render(props.parent)
}
