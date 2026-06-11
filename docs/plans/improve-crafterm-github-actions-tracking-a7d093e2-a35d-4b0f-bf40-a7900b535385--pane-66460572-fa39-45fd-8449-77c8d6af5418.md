# Plan: GitHub Actions / Deployment Tracking in the PR Panel

Branch: `improve-crafterm`
Status: feasibility + implementation plan (no code yet — pending approval)

## Goal

When a PR is merged on GitHub (or otherwise), surface the resulting GitHub
Actions workflow runs and Deployments/Environments inside Crafterm. Show them
live, as cards, in a new **Deployments** sub-tab inside the existing PR panel.
Notify (alert card + native notification) when a run/deployment completes.

## Feasibility — confirmed

Everything is reachable through the already-installed, already-authenticated
`gh` CLI (`src/main/pr.ts` → `ghBin()` / `ghRun()`); **no new dependency**.

- Workflow runs: `gh run list --json …`, `gh run view <id> --json jobs`.
- Deployments: `gh api repos/{owner}/{repo}/deployments`,
  `gh api repos/{owner}/{repo}/deployments/{id}/statuses`.
- Live tracking = polling while the sub-tab is visible (desktop apps cannot
  receive GitHub webhooks without a public endpoint). This mirrors the existing
  `pr.ts` poll model exactly.

## Scope decisions (from the user)

- PR panel gets **two sub-tabs**: `Pull Requests` (the current view) and
  `Deployments` (new).
- The Deployments sub-tab shows **both** GitHub Actions workflow runs **and**
  GitHub Deployments/Environments, rendered as cards.
- Repo context = the active terminal's cwd (same `activeCwd()` rule as `pr.ts`).

## Data model (preload `api.d.ts`)

```ts
export interface WorkflowRun {
  id: number              // databaseId
  name: string            // workflow name
  title: string           // displayTitle (commit/PR title)
  status: string          // queued | in_progress | completed
  conclusion: string      // success | failure | cancelled | '' (while running)
  event: string           // push | pull_request | deployment | …
  headBranch: string
  headSha: string
  url: string
  createdAt: string
}

export interface DeploymentStatus {
  id: number
  environment: string     // production | staging | …
  ref: string             // branch or sha
  state: string           // pending | in_progress | success | failure | error | inactive
  description: string
  url: string             // environment_url or log url
  createdAt: string
}
```

`SavedState` is **not** touched — this data is live/ephemeral, nothing persisted.

## Main process — `src/main/pr.ts`

Add to the existing `registerPrIpc()` (reuse `ghBin`/`ghRun`):

1. `deploy:runs` — `gh run list --limit 20 --json databaseId,name,displayTitle,status,conclusion,event,headBranch,headSha,url,createdAt` → map to `WorkflowRun[]`.
   - Returns `{ ok, error?, runs }`.
2. `deploy:run-jobs` — `gh run view <id> --json jobs` (lazy, only when a run card is expanded) → job/step breakdown for the detail view.
3. `deploy:deployments` — `gh api repos/{repo}/deployments` (needs repo via the existing `repo view … nameWithOwner` call), then for the most recent N, fetch latest status from `…/deployments/{id}/statuses` (`-q '.[0]'`). Returns `{ ok, error?, deployments }`.
   - Bound N (e.g. 10) and `log`/comment the cap so it is not silently truncated.

All wrapped in the same `{ ok, out, err }` resolve-never-reject idiom; parse
failures return `{ ok: false }`.

## Preload — three edits in lockstep

- `src/preload/index.ts`: `deployRuns(cwd)`, `deployRunJobs(cwd, id)`, `deployments(cwd)` → `ipcRenderer.invoke('deploy:*', …)`.
- `src/preload/api.d.ts`: method signatures on `CraftermApi` + the two new interfaces above.
- (no `SavedState` change)

## Renderer — `src/renderer/index.html`

Inside `#notif-pr-view` (currently empty, filled by `renderPr()`), the sub-tab
toggle is created in TS (keeps markup minimal). Alternative: add a small
`.pr-subtabs` bar in HTML. Decision: **build it in `pr.ts`** so the existing
`#notif-pr-view` container stays the single mount point and matches the
"build toolbar in renderPr()" pattern already there.

## Renderer — `src/renderer/src/pr.ts`

1. Add a module-level `prSubTab: 'prs' | 'deploys'` state.
2. `renderPr()` first renders a sub-tab bar (`Pull Requests` / `Deployments`),
   then dispatches to `renderPrList()` (the current body, extracted) or
   `renderDeployments()`.
3. `renderDeployments()`:
   - `prAvailable(cwd)` gate (reuse).
   - Fetch `deployRuns` + `deployments` in parallel.
   - **Deployments section**: one card per environment showing latest state
     (color-coded badge: success/in_progress/failure), ref, time, "Open" → `openLink(url)`.
   - **Workflow runs section**: one card per run — name + displayTitle, a
     status badge (queued/running/success/failure), branch→sha, event, time.
     Actions: `Open` (browser pane via `openLink`), `Logs`/`Details`
     (expand → `deployRunJobs` → job/step list in the existing `showTextModal`).
4. Change-detection + notifications: extend the existing `noteChecks` idea with
   a `lastRunState` / `lastDeployState` map keyed by id. On transition
   `in_progress → completed`/`success|failure`, fire `pushNotification('', 'Deploy <env> succeeded/failed' | 'Run <name> …', 'pr', title)`.
   - Native notification: `pushNotification` already routes through the app's
     notification surface; confirm whether a native OS `Notification` also fires
     (it does for `pr` kind today) — reuse, don't add a new path.

## Renderer — `src/renderer/src/notifications.ts`

No structural change needed: the existing `pr` RightTab already drives
`prTabVisible()`. The sub-tab lives entirely inside the PR view. The poll in
`pr.ts` (`prTabVisible` → `setInterval(poll, …)`) is extended so that when the
Deployments sub-tab is active, `poll()` refreshes deployments/runs instead of
(or in addition to) the PR list. Poll interval: keep 300s for PR list; for an
active in-progress run/deployment, consider a tighter 15–30s while something is
`in_progress`, backing off to 300s when all settled (matches the
cache/responsiveness trade-off; document the choice).

## CSS — `src/renderer/src/style.css`

Reuse `.pr-card`, `.pr-checks`, `.pr-tag`, `.pr-actions`, `.pr-toolbar`.
Add only: `.pr-subtabs` (the toggle bar) + a couple of run/deploy state
variants if existing badge classes (`ok`/`bad`/`wait`/`none`) don't cover them.
No inline hex — use existing `var(--accent)` / `var(--text-dim)` etc.

## Verification (no test framework in repo)

1. `npx tsc --noEmit -p tsconfig.web.json` and `-p tsconfig.node.json`.
2. `npm run build`.
3. `npm run dev` → open the PR panel → Deployments sub-tab → confirm:
   - workflow runs + deployments render against a repo with Actions;
   - an in-progress run updates live and fires a notification on completion;
   - empty/no-Actions repo shows a graceful empty state;
   - non-GitHub / unauth cwd shows the existing `prAvailable` error.

## Open questions / risks

- Repos without Actions or without Deployments → both sections must show clean
  empty states (not errors).
- `gh run list` is repo-wide (not PR-scoped); for "the run from my merge" we key
  off `headBranch`/`headSha`/`event`. Confirm with the user whether the
  Deployments tab should filter to the base branch (e.g. `main`) or show all
  recent runs. (Default in this plan: show all recent runs, newest first.)
- Polling cost: tighter interval only while something is `in_progress`.
