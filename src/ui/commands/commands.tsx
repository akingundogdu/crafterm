import { settings } from '@ui/state/state'

// High-level command actions (create/split/close panes, open links/notes/SQL,
// worktree/git flows, node editing, drag & drop). The action logic lives in
// `commands.state.ts`; this thin layer owns the one piece of view — the transient
// toast — and re-exports the module's public surface so importers keep importing
// from `@ui/commands/commands`.
export * from './commands.state'
export type { GitAction, DropMode } from './commands.types'
export { settings }

// ---- tiny transient toast ----
let flashTimer: number | null = null
export function flash(msg: string): void {
  let el = document.getElementById('toast')
  if (!el) {
    el = (<div id="toast" />) as HTMLDivElement
    document.body.appendChild(el)
  }
  el.textContent = msg
  el.classList.add('show')
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => el?.classList.remove('show'), 1800)
}
