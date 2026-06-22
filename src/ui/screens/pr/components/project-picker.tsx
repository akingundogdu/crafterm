import { ProjectPickerController } from './project-picker.controller'

// Searchable, multi-select repo picker for the "All projects" PR/Deployments
// view. Pre-checks the current selection; on save, persists settings.prProjects
// and runs the injected onSaved (re-render) — injected to avoid a cycle with pr.ts.
export async function showProjectPicker(onSaved: () => void): Promise<void> {
  await new ProjectPickerController(onSaved).open()
}
