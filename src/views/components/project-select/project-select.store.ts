import { state } from '@views/state/spine'
import { projectTree } from '@views/catalog/catalog'

// Model of the shared project dropdown: the sidebar's projects as flat <option>
// entries. The hierarchy is drawn with indentation (sub-projects under their
// parent) and each project carries its issue-key prefix and path, so picking one
// shows what it actually is — the same reading the Daily Plan task form gives.

export interface ProjectOption {
  id: string
  label: string
  path: string
}

// One dropdown row: "  └ crafterm (CRF)" — indented by depth, suffixed with the
// project's issue-key prefix when it has one.
function optionLabel(name: string, depth: number, issueKeyPrefix?: string): string {
  const indent = '   '.repeat(depth) + (depth ? '└ ' : '')
  return indent + (issueKeyPrefix ? `${name} (${issueKeyPrefix})` : name)
}

// The full option list. `emptyLabel` prepends a '' entry (the task form's
// "— Select a project —", the board's "All projects"); omit it to require a pick.
// Built as one flat list so the view renders a single keyed .map() with no in-JSX
// conditionals.
export function projectOptions(emptyLabel?: string): ProjectOption[] {
  const options: ProjectOption[] = []
  if (emptyLabel != null) options.push({ id: '', label: emptyLabel, path: '' })
  for (const { p, depth } of projectTree(state.tree)) {
    options.push({ id: p.id, label: optionLabel(p.name, depth, p.issueKeyPrefix?.trim()), path: p.path })
  }
  return options
}

export function projectPath(options: ProjectOption[], id: string): string {
  return options.find((o) => o.id === id)?.path ?? ''
}
