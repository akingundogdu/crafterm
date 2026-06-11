# Phase 6 — Feature → screen migration

> Part of [Architecture & Component Refactor](./improve-crafterm-architecture-refactor-e1034e15-5a56-429d-8828-5992b69040e4.md) · **Branch:** `improve-crafterm`
> **Goal:** move every feature module into `screens/<feature>/` with feature-specific child components built **from `@crafterm/ui`** (HR-2), routed through `services/*`. One feature per PR. Zero behavior change.
> **Depends on:** Phases 1 (crafterm-ui), 2 (services), 5 (terminal). **Blocks:** Phase 7.

## Scope
- **In:** relocating feature modules, extracting their child components, consuming crafterm-ui + services.
- **Out:** CSS co-location (Phase 8); building *new* reusable primitives (those go to `@crafterm/ui` first, per HR-2).

## Per-feature recipe (apply to each)
1. Create `screens/<feature>/<feature>.ts` (+ later `.css`).
2. Extract child components into `screens/<feature>/components/` — but **any reusable UI bit is promoted to `@crafterm/ui` first**, then consumed (HR-2). Bespoke screen UI that bypasses crafterm-ui is not allowed.
3. Replace all `window.crafterm.*` with `services/ipc/*`; replace ad-hoc modal/list/search with crafterm-ui primitives.
4. Keep CSS classes as-is (Phase 8 splits them).
5. Write component/unit tests; run the feature's `features.md` checklist slice.

## Migration order (easiest/standalone → central; one PR each)
1. `bookmarks` → 2. `explorer` → 3. `time` → 4. `reminders` → 5. `daily-plan` → 6. `accounts` → 7. `pr` / `diff-pane` / `file-pane` → 8. `docker` → 9. `database` / `db-pane` (+ `dbResultGrid`, `sqlEditor`) → 10. `improve-crafterm` (children: `feature-input`, `todo-card`, `progress-bar`) → 11. `notifications` → 12. **`pickers`** (split the 2,685-line `pickers.ts` into one folder per picker: command-palette, project, worktree, ssh, claude, md/file finders — each on crafterm-ui `modal`+`search-box`+`list`) → 13. **`settings`** (split 1,935 lines into one child per tab: general, projects, palette, tabs, appearance, shortcuts, … on crafterm-ui `tabs`) → 14. `sidebar` → 15. `content` (`buildNode`).

## Notes on the big two
- **pickers:** every picker currently reinvents overlay+search+list — after this they all consume crafterm-ui. This is the largest DRY win.
- **settings:** each tab becomes an isolated child component; the save-status chip uses `subscribeSaveStatus` from the storage service.

## Tests added
- Per feature: component tests for new children (happy-dom); unit tests for any extracted logic; targeted E2E for the heaviest flows (command palette, settings save, db query pane).

## features.md checklist slice
- The corresponding section per feature, walked after each feature's PR. The pane/sidebar/content items get extra attention since they touch terminal mounting.

## Acceptance criteria
- All listed features live under `screens/`; no feature builds bespoke UI bypassing `@crafterm/ui`.
- `pickers.ts` and `settings.ts` no longer exist as monoliths.
- Each feature's checklist slice + tests green before its PR merges.
