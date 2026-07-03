import { Store } from '@geajs/core'

// One normalized project-list row: a label + optional sub, a precomputed
// `filterText` (matched contains-style against the search) and a `onChoose`
// that closes over the chosen entry/project + close. Both the project-open
// picker and the "pick a project with apps" picker feed rows through this shape.
export interface ProjectPickRow {
  label: string
  sub?: string
  // The exact text the search box matches against — mirrors the legacy
  // filterEntries (`label + ' ' + sub`) / filterAppProjects (`name path`)
  // semantics per caller so filtering stays byte-faithful.
  filterText: string
  onChoose: (split: boolean) => void
}

// Reactive state for the project-list pickers (only one picker modal is ever open
// at a time, so a singleton is safe). `rows` / `search` / `sel` are the source of
// truth read directly in the list view's template() so gea re-renders it on every
// search keystroke, selection change (arrow-key nav / hover), or reset — the board
// pattern. No `void store.rev`: every field the template renders is a real reactive
// field that mutations reassign.
class ProjectStore extends Store {
  rows: ProjectPickRow[] = []
  search = ''
  sel = 0

  set(rows: ProjectPickRow[]): void {
    this.rows = rows
    this.search = ''
    this.sel = 0
  }

  setSearch(search: string): void {
    this.search = search
    this.sel = 0
  }

  setSel(sel: number): void {
    this.sel = sel
  }

  // Contains-match over each row's precomputed filterText.
  visible(): ProjectPickRow[] {
    const q = this.search.trim().toLowerCase()
    return q ? this.rows.filter((r) => r.filterText.toLowerCase().includes(q)) : this.rows
  }
}

export default new ProjectStore()
