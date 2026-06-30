import Pr from '@views/screens/pr/pr'
import store from '@views/screens/pr/pr.store'

// PR / Deployments panel — migrated to gea (src/views/screens/pr). This legacy
// entry point mounts the gea component into the right-panel tab host once; the
// store singleton owns the sub-tab/scope state, the reactive list, and the
// adaptive background poll across remounts.
let mounted = false

function ensureMounted(): void {
  if (mounted) return
  const el = document.getElementById('notif-pr-view')!
  el.replaceChildren()
  new Pr().render(el)
  mounted = true
}

export function renderPr(): Promise<void> {
  ensureMounted()
  return store.reload()
}

export function prTabVisible(visible: boolean): void {
  if (visible) ensureMounted()
  store.setTabVisible(visible)
}
