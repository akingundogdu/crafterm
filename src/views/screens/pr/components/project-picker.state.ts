import { settings } from '@views/state/spine'
import { persistence } from '@repositories/persistence.service'

// Pure helpers for the repo picker modal. Copied into @views (§2.7); settings
// flow through the sanctioned spine bridge instead of @ui/state.

// Escape-to-close, unregistered when the overlay closes.
export function bindEscapeClose(close: () => void, onClose: (cb: () => void) => void): void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }
  document.addEventListener('keydown', onKey, true)
  onClose(() => document.removeEventListener('keydown', onKey, true))
}

// Case-insensitive name filter over the repo list.
export function filterRepos<T extends { name: string }>(repos: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  return q ? repos.filter((r) => r.name.toLowerCase().includes(q)) : repos
}

// "<n> selected · <m> repos" summary line.
export function projectCountLabel(selectedCount: number, items: number): string {
  return `${selectedCount} selected · ${items} repo${items === 1 ? '' : 's'}`
}

// Persists the chosen repo paths to settings (the picker re-renders after).
export function saveProjects(paths: string[]): void {
  settings.prProjects = paths
  persistence.save()
}
