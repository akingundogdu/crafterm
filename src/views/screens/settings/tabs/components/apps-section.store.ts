import { Store } from '@geajs/core'
import { applicationRepo } from '@repositories'
import type { Application } from '@views/types/types'

// Reactive state for the Applications section of a project's editor. `apps` mirrors
// the owning project's application list (read directly in AppsBody.template so gea
// re-renders on every add / remove / run-command change — the ssh/action-menu
// pattern; a bare `void rev` read is NOT tracked). Structural mutations resolve the
// RAW app object via the repo (never the proxied snapshot — §gea 5.3), reassign its
// arrays, persist through applicationRepo, then `reload()` to reassign the mirror.
class AppsStore extends Store {
  apps: Application[] = []
  projectId = ''

  reload(projectId: string): void {
    this.projectId = projectId
    this.apps = [...applicationRepo.listForProject(projectId)]
  }
}

export default new AppsStore()
