import type { WorktreeScript, WorktreeScripts } from '@views/types/types'
import { norm, shq } from './worktree-path'

// Pure builder for the one shell line every worktree creation runs. No DOM, no IPC.
//
// Creating a worktree is a single command chain typed into a terminal, so the user
// sees git and every setup step as it happens:
//
//   <pre…> ; run-create-worktree <name> <base> ; cd <path> && { <post…> ; <trailing> ; }
//
// The steps are `;`-joined: a failing script warns in the terminal but never blocks
// the ones after it. The `cd &&` guard is the one exception — if the worktree was
// not created, its post scripts must not run against the repo root instead.

// The user's shell function that does the actual `git worktree add` (~/.zshrc).
export const WORKTREE_CREATE_FN = 'run-create-worktree'

// OSC code the chain reports its step boundaries on. The terminal swallows these
// (nothing is printed), and the app registers a handler for the duration of one
// creation — that's how the progress overlay knows a script actually started, and
// what it exited with. Payload: `wt;<step id>;start` / `wt;<step id>;done;<code>`.
export const WORKTREE_STEP_OSC = 777

// The step id the creation itself reports under.
export const CREATE_STEP_ID = 'creating'

function osc(payload: string): string {
  return `printf '\\033]${WORKTREE_STEP_OSC};%s\\007' ${shq(payload)}`
}

// `$?` is the exit status of the command right before it in the `;` chain.
function reported(id: string, command: string): string {
  return `${osc(`wt;${id};start`)} ; ${command} ; printf '\\033]${WORKTREE_STEP_OSC};wt;%s;done;%d\\007' ${shq(id)} "$?"`
}

// Where that shell function puts a worktree: <parent-of-repo-root>/worktrees/<name>.
// Mirrored here (not configurable) so the app can `cd` into the new worktree and
// find its node without parsing the function's output.
export function worktreePathFor(repoRoot: string, name: string): string {
  const parent = norm(repoRoot).split('/').slice(0, -1).join('/')
  return `${parent}/worktrees/${name}`
}

// Coerce a persisted (or hand-edited) blob into the script lists, dropping rows
// that are not usable. Malformed JSON must not break the worktree flow.
export function normalizeWorktreeScripts(raw: unknown): WorktreeScripts {
  const list = (v: unknown): WorktreeScript[] => {
    if (!Array.isArray(v)) return []
    const out: WorktreeScript[] = []
    for (const row of v) {
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      if (typeof r.command !== 'string') continue
      out.push({
        id: typeof r.id === 'string' && r.id ? r.id : `ws${out.length}`,
        name: typeof r.name === 'string' ? r.name : '',
        command: r.command
      })
    }
    return out
  }
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return { pre: list(o.pre), post: list(o.post) }
}

export interface WorktreeCommandContext {
  repoRoot: string
  worktreePath: string
  branch: string
  base: string
}

// Placeholders a script may use. Values are substituted raw (the script author
// quotes them as needed), matching how the run-command fields behave elsewhere.
export function expandWorktreePlaceholders(command: string, ctx: WorktreeCommandContext): string {
  return command
    .replace(/\{worktreePath\}/g, ctx.worktreePath)
    .replace(/\{repoRoot\}/g, ctx.repoRoot)
    .replace(/\{branch\}/g, ctx.branch)
    .replace(/\{name\}/g, ctx.branch)
    .replace(/\{base\}/g, ctx.base)
}

// Global scripts first, then the project's own — so a project extends the shared
// setup rather than replacing it. Blank commands are dropped.
export function collectWorktreeScripts(
  global: WorktreeScripts | null | undefined,
  project: WorktreeScripts | null | undefined,
  phase: 'pre' | 'post'
): WorktreeScript[] {
  return [...(global?.[phase] ?? []), ...(project?.[phase] ?? [])].filter((s) => s.command.trim())
}

export interface BuildWorktreeCommandOptions extends WorktreeCommandContext {
  global?: WorktreeScripts | null
  project?: WorktreeScripts | null
  // Command to run inside the new worktree after the post scripts (e.g. `claude …`).
  trailing?: string
  // Wrap every step in OSC step markers so the progress overlay can show each
  // script as it runs. Off for the subshell variant (nothing is watching it).
  report?: boolean
}

// The step id a script reports under, and what the overlay lists it as.
export function scriptStepId(phase: 'pre' | 'post', script: WorktreeScript): string {
  return `${phase}:${script.id}`
}

export function buildWorktreeCommand(opts: BuildWorktreeCommandOptions): string {
  const ctx: WorktreeCommandContext = {
    repoRoot: opts.repoRoot,
    worktreePath: opts.worktreePath,
    branch: opts.branch,
    base: opts.base
  }
  const step = (phase: 'pre' | 'post') =>
    collectWorktreeScripts(opts.global, opts.project, phase).map((s) => {
      const command = expandWorktreePlaceholders(s.command.trim(), ctx)
      return opts.report ? reported(scriptStepId(phase, s), command) : command
    })
  const pre = step('pre')
  const post = step('post')
  const trailing = opts.trailing?.trim()
  const inWorktree = [...post, ...(trailing ? [trailing] : [])]

  const createCommand = `${WORKTREE_CREATE_FN} ${shq(opts.branch)} ${shq(opts.base)}`
  const create = opts.report ? reported(CREATE_STEP_ID, createCommand) : createCommand
  const enter = inWorktree.length
    ? `cd ${shq(opts.worktreePath)} && { ${inWorktree.join(' ; ')} ; }`
    : `cd ${shq(opts.worktreePath)}`
  return [...pre, create, enter].join(' ; ')
}

// The command for a worktree that already exists: no creation, no pre scripts —
// just enter it and run whatever the caller wanted there.
export function buildExistingWorktreeCommand(worktreePath: string, trailing?: string): string {
  const t = trailing?.trim()
  return t ? `cd ${shq(worktreePath)} && ${t}` : `cd ${shq(worktreePath)}`
}

// Same chain wrapped in a subshell, for callers that create a worktree but keep
// running in their own directory (the "new feature" flow spawns app terminals in
// the project/app path and only wants the worktree + its setup done on the side).
// The subshell keeps the `cd` from leaking into the caller's shell.
export function buildWorktreeSetupChain(opts: BuildWorktreeCommandOptions): string {
  return `( ${buildWorktreeCommand({ ...opts, trailing: undefined, report: false })} )`
}
