# Phase 2 — Renderer service / data layer

> Part of [Architecture & Component Refactor](./improve-crafterm-architecture-refactor-e1034e15-5a56-429d-8828-5992b69040e4.md) · **Branch:** `improve-crafterm`
> **Goal:** introduce the renderer-side service/data layer so features stop touching `window.crafterm`/persistence directly (DIP). Zero behavior change.
> **Depends on:** Phase 0. **Blocks:** Phase 4 (namespaced bridge change stays contained to these wrappers).

## Scope
- **In:** `services/ipc/*.service.ts` wrappers, `services/storage/*`, `services/domain/*`; migrate feature modules to import services instead of `window.crafterm.*` and raw `saveSoon()`.
- **Out:** changing the bridge shape (Phase 4), splitting `index.ts` (Phase 4), moving features into `screens/` (Phase 6).

## Steps

### A. IPC service wrappers (the only callers of `window.crafterm`)
1. Create one typed wrapper per domain under `services/ipc/`: `terminal.service.ts` (pty:*), `git.service.ts`, `fs.service.ts`, `claude.service.ts`, `db.service.ts`, `pr.service.ts`, `docker.service.ts`, `notebook.service.ts`, `secrets.service.ts`, `plans.service.ts`, `store.service.ts`, `app.service.ts`, `sound.service.ts`.
2. Each wrapper re-exports the current flat `window.crafterm.X` calls 1:1 (still flat — Phase 4 namespaces the bridge behind these wrappers). Add precise return types (reuse `api.d.ts` types).
3. **Migrate callers incrementally:** replace direct `window.crafterm.*` usages across renderer modules with the service import. Grep target: every `window.crafterm.` site. After this, **only `services/ipc/*` reference `window.crafterm`.**

### B. Storage / persistence service
4. Move `serializeLayout`, `persist`, `loadSettings`, `saveSoon`, `persistNow`, `saveStatus`/`subscribeSaveStatus` out of `state.ts` (`state.ts:258-305+`) into `services/storage/persistence.service.ts` + `settings.service.ts`. `state.ts` keeps only singletons + `hooks` + `paneActions`.
5. Replace scattered `saveSoon()` calls with `persistence.save()` (same debounce/behavior).

### C. Domain (pure logic, no DOM/IPC)
6. Extract pure logic into `services/domain/`: worktree path rules, plan-filename parsing (mirror `main/planFilename.ts`), time aggregation (`time.ts` math), token-usage shaping (renderer-side), command-palette seeding helpers.

## Tests added
- Unit (node): each `services/ipc/*` wrapper calls the right channel with the right args (mock `window.crafterm`).
- Unit: `persistence` serialize/load round-trips a `SavedState`; migration of old shapes; debounce coalescing.
- Unit: each `services/domain/*` pure function (worktree rules, plan parse, time calc).
- HR-5: any storage test uses a mocked store / temp dir, never `~/.crafterm`.

## features.md checklist slice
- Persistence: change a setting / layout → reload app → state restored identically.
- Each domain that now routes through a service (git ops, db query, notebook CRUD, claude usage) behaves identically — spot-check one flow per domain.

## Acceptance criteria
- `grep 'window.crafterm.'` returns hits **only** in `services/ipc/*`.
- `state.ts` no longer owns persistence; app saves/loads identically.
- `turbo run test` green; build + E2E smoke pass; checklist slice verified.
