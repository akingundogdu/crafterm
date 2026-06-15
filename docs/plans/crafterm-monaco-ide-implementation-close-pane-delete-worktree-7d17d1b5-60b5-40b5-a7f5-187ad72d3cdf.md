# Close-pane → delete worktree

## Context

When a terminal pane that is bound to a daily task is closed, Crafterm already
asks "Mark task done?" (todo50, `confirmAndClosePane` in
`src/renderer/src/commands.ts:1008-1024`). The originally requested second half
of that flow — *"if this pane lives in a git worktree, also offer to delete the
worktree on close"* — was never implemented. There is no worktree step in the
close flow at all.

This plan adds that step: on close, after the task-done prompt, if the pane's
`cwd` resolves to a linked git worktree, offer to delete it. On confirm, the
worktree is removed with `git worktree remove --force` (dirty trees are wiped —
per the user's decision) and the **branch is kept**.

## What already exists (reuse, don't rewrite)

- `removeWorktree(p, worktreePath)` — `src/renderer/src/worktrees.ts:290`. Runs
  `git worktree remove <path>` as a hidden background shell, shows the worktree
  node's spinner (`archiving`), and on success calls `archiveWorktreeNode(wt)`
  which archives every tab under the worktree (kills their PTYs) and hides the
  node. It currently has **no force option** and prompts its own confirm.
- `archiveWorktreeNode(wt)` — `worktrees.ts:116`. Archives all tabs under the
  worktree via `archiveTab` (→ `destroyPane` + `kill`), removing those panes
  from the live `panes` map.
- `worktreeProjectOf(node)` — `worktrees.ts:36`. Resolves a worktree node's
  owning `ProjectNode`.
- `findWorktreeNodeByPath(path)` — `worktrees.ts:180` (currently module-private):
  finds a `WorktreeNode` by exact `worktreePath` match.

## Changes

### 1. `src/renderer/src/worktrees.ts` — add force + skip-confirm to `removeWorktree`

Extend the signature to:

```ts
export async function removeWorktree(
  p: ProjectNode,
  worktreePath: string,
  opts?: { force?: boolean; skipConfirm?: boolean }
): Promise<boolean>
```

- When `opts?.skipConfirm` is not set, keep the existing `promptConfirm` (so the
  sidebar caller is unchanged).
- Build the command with `--force` when `opts?.force`:
  `git worktree remove ${opts?.force ? '--force ' : ''}${shq(worktreePath)}`.
- Return `true` on `code === 0`, else `false` (today it returns `void`). The
  existing sidebar caller ignores the return — no change needed there.

Add a small exported helper to resolve a pane cwd to a removable worktree:

```ts
// Find the linked worktree (node + owning project) that contains `cwd`, or null
// if cwd is not inside any managed worktree (e.g. the main checkout).
export function worktreeForCwd(cwd: string):
  { project: ProjectNode; node: WorktreeNode; path: string } | null
```

Implementation: normalize `cwd`; scan worktree containers' children (or reuse
the same enumeration `reconcileProject` uses) for a `WorktreeNode` whose
`norm(worktreePath)` equals `norm(cwd)` **or is a path-prefix of** `norm(cwd)`
(pane cwd may be a subdirectory of the worktree root). Resolve the project via
`worktreeProjectOf(node)`. Return null when none match.

### 2. `src/renderer/src/commands.ts` — extend `confirmAndClosePane`

After the existing task-done block (`commands.ts:1024`) and before
`closePane(paneId)`:

```ts
// If this terminal lives in a git worktree, offer to delete it on close.
if (p?.cwd) {
  const wt = worktreeForCwd(p.cwd)
  if (wt) {
    const del = await promptConfirm({
      title: 'Delete worktree?',
      message: `Also remove the worktree "${wt.node.branch}" at ${wt.path}? (the branch is kept)`,
      confirmText: 'Delete worktree'
    })
    if (del) {
      const removed = await removeWorktree(wt.project, wt.path, {
        force: true,
        skipConfirm: true
      })
      // On success archiveWorktreeNode already tore down this pane (and any
      // siblings under the worktree); nothing left to close.
      if (removed) return
    }
  }
}
closePane(paneId)
```

Add `removeWorktree` + `worktreeForCwd` to the existing import from
`./worktrees` in `commands.ts`. (Note: `worktrees.ts` already imports
`archiveTab` from `./commands`; importing `removeWorktree` back into
`commands.ts` is a function-level — not top-level — use, which the codebase's
cycle convention permits.)

Behavioral notes baked into the flow above:
- Deleting the worktree archives **all** terminals under it, not just the one
  being closed — this is intended (the worktree is gone).
- If removal fails (`removed === false`), the pane is still closed via the
  fall-through `closePane(paneId)`, and `removeWorktree` already surfaces the
  failure notification.
- If the user declines the worktree prompt, the pane closes normally.

## Decisions (already settled with user)

- Dirty worktree → `git worktree remove --force` (no second warning).
- Branch is **kept** (not deleted).

## Verification

No test framework in this repo (per CLAUDE.md). Verify manually:

1. `npx tsc --noEmit -p tsconfig.web.json` and `-p tsconfig.node.json` — clean.
2. `npm run build` — succeeds.
3. `npm run dev`, then:
   - Open a project with `supportWorktree`, create a worktree, open a terminal
     in it. Close that terminal → confirm the "Delete worktree?" prompt appears,
     and on confirm the worktree node disappears and `git worktree list` no
     longer shows it (branch still present via `git branch`).
   - Make the worktree dirty (touch a file), repeat → `--force` still removes it.
   - Close a terminal in the **main checkout** → no worktree prompt.
   - Decline the prompt → terminal closes, worktree stays.
   - Pane bound to an unfinished daily task in a worktree → both prompts appear
     in order (task done, then delete worktree).
