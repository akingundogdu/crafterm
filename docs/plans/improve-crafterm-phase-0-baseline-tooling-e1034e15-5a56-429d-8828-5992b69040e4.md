# Phase 0 — Baseline docs, tooling & scaffolding

> Part of [Architecture & Component Refactor](./improve-crafterm-architecture-refactor-e1034e15-5a56-429d-8828-5992b69040e4.md) · **Branch:** `improve-crafterm`
> **Goal:** lay the safety net (docs + tests) and tooling (pnpm/turbo/workspace) **before any code moves**. Zero behavior change.
> **Depends on:** nothing. **Blocks:** every other phase.

## Scope
- **In:** feature inventory refresh, terminal context doc, UI inventory, pnpm+turbo migration, empty `packages/crafterm-ui`, dir scaffolding, test harness + `CRAFTERM_STATE_DIR` isolation, first E2E smoke.
- **Out:** moving/refactoring any feature code; CSS; building components.

## Steps

### A. Safety-net documents (HR-1 / HR-3 / HR-2)
1. **Refresh `docs/features.md` → verification checklist (HR-1).** Scan the whole codebase. Add every feature missing since it went stale: Docker, Database, dbPane, PR, Diff pane, Bookmarks, Daily plan, Accounts, Time, Explorer, treeview, project nodes, self-update, plans-watcher, secrets/accounts. For each feature add: current `file:line`, a one-line behavior description, and a **checkbox + "how to confirm"** step (action → expected). Group by the same sections as today.
2. **Write `docs/terminal-architecture.md` (HR-3).** End-to-end terminal story from `features.md §3.2/§4`: `pty.spawn` (main `index.ts:135`) ↔ IPC `pty:*` (`index.ts:121-174`) ↔ xterm (renderer `pane.ts`); lifecycle, input handling, activity detection + Claude awareness, OSC title following, per-pane status bar, pop-out hand-off, `CRAFTERM_PANE_ID` injection. Diagram + sequence per flow.
3. **UI component inventory (HR-2).** Produce `docs/plans/crafterm-ui-inventory.md`: every UI element/pattern in the app today (modals, overlays, buttons, inputs, fields, search boxes, lists, tabs, tree, context menu, cards, badges, chips, status dots, …) with where each is used. **Review with the user before Phase 1.**

### B. Tooling migration (pnpm + Turborepo)
4. Add `pnpm-workspace.yaml` (`packages: ["packages/*", "."]`). Generate `pnpm-lock.yaml` (`pnpm import` from `package-lock.json`, then delete the npm lock).
5. Add `turbo.json` with pipelines: `build`, `test`, `typecheck`, `lint` (proper `dependsOn`/`outputs`). Map root scripts to pnpm/turbo.
6. **Validate native build early (risk):** `pnpm rebuild` of `node-pty`; if pnpm's symlinked store breaks electron-rebuild, set `.npmrc` `node-linker=hoisted`. Confirm `pnpm dev` and `pnpm dist:dir` work.
7. Update CLAUDE.md build commands `npm run …` → `pnpm …` (doc-only edit).

### C. Workspace + directory scaffolding (empty)
8. Create `packages/crafterm-ui/` (`package.json` name `@crafterm/ui`, `tsconfig`, `src/index.ts` empty barrel). Wire `@crafterm/ui` into renderer `tsconfig`/Vite resolve. No components yet.
9. Create empty dirs: `src/renderer/src/{core,services/ipc,services/storage,services/domain,terminal,screens,app}/` and `resources/scripts/templates/`. Add a short `docs/component-contract.md` (§3.2 of master).

### D. Test harness + isolation (HR-5)
10. Add Vitest with two projects: `node` (env node) and `dom` (env happy-dom). Add Playwright `_electron`.
11. **`CRAFTERM_STATE_DIR` override:** modify `stateDir()` in main to honor `process.env.CRAFTERM_STATE_DIR` when set; default unchanged (`~/.crafterm`, dev `~/.crafterm-dev`). This is the only code edit in Phase 0 and is behavior-preserving by default.
12. Shared test setup: create a fresh `os.tmpdir()` state dir per run, set `CRAFTERM_STATE_DIR`, teardown removes it; **guard that hard-fails** if `CRAFTERM_STATE_DIR` is unset or resolves inside `$HOME/.crafterm*`.
13. First E2E smoke: app launches, opens one terminal, types `echo hi`, asserts output — all against the temp state dir.

## Tests added
- E2E: app-launch + terminal-spawn smoke (`e2e/smoke.spec.ts`).
- Unit: `stateDir()` honors `CRAFTERM_STATE_DIR` and falls back to default.
- Setup guard self-test (refuses `~/.crafterm`).

## features.md checklist slice
- Full document produced; no feature verified-as-changed (no code moved). Run the **app-launch + terminal-spawn** items manually to confirm the env override didn't shift defaults.

## Acceptance criteria
- `pnpm install`, `pnpm dev`, `pnpm dist:dir`, `turbo run typecheck/build/test` all green.
- `docs/features.md` (checklist), `docs/terminal-architecture.md`, `crafterm-ui-inventory.md` exist; inventory reviewed with user.
- E2E smoke passes against a temp dir; guard proven (a deliberately mis-set run fails).
- Default `stateDir()` unchanged → live `~/.crafterm/` untouched (HR-5).
