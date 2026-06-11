# PR Review Diff Pane → file:line into the active terminal

## Context

The right-panel PR tab (`src/renderer/src/pr.ts`) currently lets the user open a
PR in an in-app GitHub `<webview>` ("Review" button). While reviewing, there is
no way to pull a specific code location out of the PR and hand it to a Claude
terminal session for discussion. Selecting text inside the GitHub webview and
bridging it back is fragile (depends on GitHub's DOM).

Goal: render the PR diff **in-app** as a dedicated pane where the user can click /
shift-click to select a line range, then send that selection as a `file:line`
reference into the **currently active terminal** — where the user is typing to
Claude — so they can append a question and ask. (User decisions: in-app diff pane;
paste into the active terminal; send the `file:line` reference only, not the code
body.)

## Approach

Add a new lightweight **diff pane** type (modeled on the existing `DocPane` /
`SqlPane` / `BrowserPane` pattern), fed by `gh pr diff <number>`. The pane parses
the unified patch, renders each hunk with real new-file line numbers, supports
click + shift-click range selection, and a "Send to terminal" action that writes
`path:lineStart-lineEnd ` into the last active terminal via
`window.crafterm.input(...)`.

### 1. Main process — `src/main/pr.ts`

Add a `pr:diff` IPC handler next to the existing ones (reuse `ghRun`):

```ts
ipcMain.handle('pr:diff', async (_e, { cwd, number }: { cwd: string; number: number }) => {
  const r = await ghRun(['pr', 'diff', String(number), '--patch'], cwd, 30000)
  return r.ok ? { ok: true, patch: r.out } : { ok: false, error: (r.err || 'gh pr diff failed').trim() }
})
```

### 2. Preload — `src/preload/index.ts` + `src/preload/api.d.ts`

Add the bridge method (lockstep, per CLAUDE.md "three edits together"):
- `index.ts`: `prDiff: (cwd, number) => ipcRenderer.invoke('pr:diff', { cwd, number })`
- `api.d.ts`: `prDiff(cwd: string, number: number): Promise<{ ok: boolean; patch?: string; error?: string }>`

No `SavedState` change (diff panes are not persisted — see §6).

### 3. New renderer module — `src/renderer/src/diffPane.ts`

Follow the `dbPane.ts` / `createDocPane` shape. Exports:
- `createDiffPane(opts: { cwd: string; prNumber: number; title: string; targetPaneId: string | null }): string`
- `destroyDiffPane(id: string): void`

Responsibilities:
- Build a `.pane-box diff-pane` element with a `pane-header` (title `PR #N diff`,
  reload `⟳`, close `×`) matching `createBrowserPane`.
- Call `window.crafterm.prDiff(cwd, prNumber)`, then **parse the unified patch**:
  - Split on `diff --git a/… b/…` blocks → per-file sections; capture the new path
    from the `+++ b/<path>` line.
  - Track current new-file line number from each `@@ -a,b +c,d @@` hunk header;
    increment on context (` `) and added (`+`) lines; do **not** increment on
    removed (`-`) lines.
  - Render one row per line: a gutter showing the new line number (blank for `-`
    lines), an add/del/context class for color, and the line text. Store
    `data-file` and `data-line` on each selectable (non-removed) row.
- **Selection**: click selects a single row; shift-click extends to a contiguous
  range within the same file; selected rows get a `.selected` class. From the
  selection derive `path:lineStart` or `path:lineStart-lineEnd`.
- **Send action**: a small footer button "Send to terminal" (and Enter on a
  focused selection) that resolves the target terminal (see §5) and calls
  `window.crafterm.input(targetPaneId, ref + ' ')` (trailing space, **no** `\r`),
  then `paneActions.select(targetPaneId)` + `focusActivePane()` so the user can
  immediately type the question. Show a transient inline hint if no terminal exists.

### 4. Registry + render + close wiring

- `state.ts`: add `export const diffPanes = new Map<string, DiffPane>()`.
- `types.ts`: add `DiffPane` interface (`id`, `el`, `cwd`, `prNumber`,
  `targetPaneId`).
- `content.ts` (~line 35-39): extend the el lookup chain with
  `diffPanes.get(node.paneId)?.el`.
- `commands.ts` `closePane` (~line 824-829): add
  `else if (diffPanes.has(paneId)) destroyDiffPane(paneId)`.

### 5. Target-terminal resolution

When the diff pane is opened, the diff pane itself becomes the active pane, so we
must remember which terminal to paste into:
- At open time, capture the current `state.activePaneId` **if it is a terminal**
  (`panes.has(id)`) as `targetPaneId`.
- On send, if `targetPaneId` is gone, fall back to the current `state.activePaneId`
  when it is a terminal; otherwise show the "open a terminal first" hint.

### 6. Opening the diff pane — `src/renderer/src/pr.ts`

In `card()`, add a **"Diff"** button beside "Review" (keep "Review" → GitHub
webview unchanged). Its handler:
- capture `targetPaneId = state.activePaneId && panes.has(state.activePaneId) ? state.activePaneId : null`
- `const id = createDiffPane({ cwd, prNumber: pr.number, title: `PR #${pr.number}`, targetPaneId })`
- place it beside the active pane with the existing `placeSplit(id, 'row')` helper
  (same pattern as `hostDoc` / `runInSplit`).

Persistence: diff panes are transient (a PR diff changes constantly), so they are
**not** written to `SavedState` and are skipped on restore — mirror how a leaf
with an unknown pane id already degrades to an empty `.pane-box` in
`content.ts:40-44`. Confirm restore does not crash on a missing diff leaf; if a
stale diff leaf can persist in the layout tree, prune diff-pane leaves on save (in
the `persist()` path) so they never reach restore.

### 7. Styles — `src/renderer/src/style.css`

Add `.diff-pane`, `.diff-row` (`.add` / `.del` / `.ctx`), `.diff-gutter`,
`.diff-row.selected`, and the footer button — using existing CSS custom
properties (`var(--accent)`, `var(--text-dim)`, success/danger vars already used
by `.pr-checks.ok` / `.bad`). No inline hex in `.ts`.

## Files touched

- `src/main/pr.ts` (new `pr:diff` handler)
- `src/preload/index.ts`, `src/preload/api.d.ts` (bridge method)
- `src/renderer/src/diffPane.ts` (**new** module)
- `src/renderer/src/types.ts` (`DiffPane` interface)
- `src/renderer/src/state.ts` (`diffPanes` registry)
- `src/renderer/src/content.ts` (render dispatch)
- `src/renderer/src/commands.ts` (close wiring + open helper)
- `src/renderer/src/pr.ts` ("Diff" button)
- `src/renderer/src/style.css` (diff styling)

## Verification

1. Typecheck both configs:
   `npx tsc --noEmit -p tsconfig.web.json` and `... -p tsconfig.node.json`.
2. `npm run build`, then `npm run dev`.
3. In a terminal inside a GitHub repo with an open PR: open the PR tab, click
   **Diff** → in-app diff pane renders with correct new-file line numbers.
4. Open a Claude terminal pane, focus it, return to the diff, select a line (and a
   shift-click range) → **Send to terminal** → the active terminal receives
   `path:line` / `path:line-line` with a trailing space and focus, ready for a
   question. Verify the line numbers match the actual file.
5. Close the diff pane (×) → no leak; restart the app → no crash / no orphaned
   diff leaf.
