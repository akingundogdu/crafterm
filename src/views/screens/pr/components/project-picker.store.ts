import { Store } from '@geajs/core'
import { settings } from '@views/state/spine'
import { prService } from '@services'
import { UITexts } from '@texts'
import { filterRepos, projectCountLabel, saveProjects } from './project-picker.state'

type RepoEntry = { name: string; path: string }

// Reactive state + logic for the gea repo picker (merges the legacy imperative
// ProjectPicker). A singleton reset on each open (the connection-form pattern):
// `open()` seeds the current selection + the onSaved/close callbacks, `load()`
// fetches the repo list, the component reads the reactive fields (query, repos,
// selected), and `save()` persists the chosen paths. Self-contained — no @ui (§2.7).
class ProjectPickerStore extends Store {
  query = ''
  repos: RepoEntry[] = []
  selected: Set<string> = new Set()
  loading = true
  error = ''

  private onSavedFn: () => void = () => {}
  private closeFn: () => void = () => {}

  open(onSaved: () => void, close: () => void): void {
    this.query = ''
    this.repos = []
    this.selected = new Set(settings.prProjects)
    this.loading = true
    this.error = ''
    this.onSavedFn = onSaved
    this.closeFn = close
  }

  // Filtered repo list the component maps over.
  get items(): RepoEntry[] {
    return filterRepos(this.repos, this.query)
  }

  // "<n> selected · <m> repos" summary; blank while the repo scan is in flight.
  get countLabel(): string {
    return this.loading ? '' : projectCountLabel(this.selected.size, this.items.length)
  }

  // Hint shown in place of the checkbox rows: loading, error, or "no matches".
  get hint(): string {
    if (this.loading) return UITexts.Pr.picker.loading
    if (this.error) return this.error
    return 'No matches'
  }

  // Reassign a fresh Set so the reactive field change triggers a re-render.
  toggle(path: string, on: boolean): void {
    const next = new Set(this.selected)
    if (on) next.add(path)
    else next.delete(path)
    this.selected = next
  }

  close(): void {
    this.closeFn()
  }

  async load(): Promise<void> {
    const res = await prService.repos(settings.codeRoot)
    if (!res.ok) {
      this.repos = []
      this.error = res.error || 'Could not list repositories.'
      this.loading = false
      return
    }
    this.repos = res.repos
    this.error = ''
    this.loading = false
  }

  save(): void {
    saveProjects(this.repos.filter((r) => this.selected.has(r.path)).map((r) => r.path))
    this.close()
    this.onSavedFn()
  }
}

export default new ProjectPickerStore()
