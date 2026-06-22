import { ChangelogModalController } from './changelog-modal.controller'

// Modal: pick a day range, then generate a copyable markdown changelog of
// completed tasks for customers. Fully self-contained — reads completed tasks
// from the repo via buildChangelogMarkdown.
export function showChangelogModal(): void {
  new ChangelogModalController().open()
}
