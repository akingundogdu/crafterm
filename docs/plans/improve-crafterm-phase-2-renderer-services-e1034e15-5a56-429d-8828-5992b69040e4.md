# Phase 2 — Renderer service / data layer

> Part of [Architecture & Component Refactor](./improve-crafterm-architecture-refactor-e1034e15-5a56-429d-8828-5992b69040e4.md) · **Branch:** `improve-crafterm`
> **Goal:** introduce the renderer-side service/data layer so features stop touching `window.crafterm`/persistence directly (DIP). Zero behavior change.
> **Depends on:** Phase 0. **Blocks:** Phase 4 (namespaced bridge change stays contained to these wrappers).

## Scope
- **In:** `services/ipc/*.service.ts` wrappers, `services/storage/*` (persistence + **repositories**), `services/domain/*` (incl. **table-oriented `domain/model/*`**); migrate feature modules to import services instead of `window.crafterm.*` and raw `saveSoon()`.
- **Out:** changing the bridge shape (Phase 4), splitting `index.ts` (Phase 4), moving features into `screens/` (Phase 6), the actual SQLite backend (§10, post-refactor).

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

### D. Domain model — table-oriented entities (§3.12, HIGH PRIORITY)
> Follow the [Domain Model — Reference Example](./improve-crafterm-domain-model-example-e1034e15-5a56-429d-8828-5992b69040e4.md) as the template for every entity.
7. Add **Zod** (dependency). Create `services/domain/model/` with **one module per entity**, modeled as DB-table-ready rows (see §3.12 for the entity list + rules). For each: a **Zod schema** (source of truth), the entity type via `z.infer` (collapses the live vs `Saved*` duality from `types.ts` + `api.d.ts`), default factory, (de)serialize.
8. Apply table-readiness rules: stable string `id`; **reference-by-id, not nested embedding** for would-be tables (`Project` → separate `application`/`project-command`/`feature` entities with `projectId`; `DailyPlanData` → `daily-task` + `daily-tag`); flat scalar/enum fields; epoch timestamps.
9. Model the recursive trees (`layout-node`, `sidebar-node`) as **node rows** (`id, parentId, position, type, payload`) so they migrate to a node table later (document-column fallback per tree if normalization is too costly).

### E. Repository seam (`services/storage/repositories/`)
10. One repository per entity/aggregate: `getAll/get(id)/upsert/remove/query`. **JSON-backed now** (reads loaded state, writes via `persistence.service`). Define the repository **interfaces** explicitly — the future SQLite backend (§10) implements the same interfaces with zero caller changes.
11. Route feature reads/writes of these entities through repositories instead of poking `state`/`settings` arrays directly.

### F. Runtime validation at the JSON boundary
12. On load, validate the persisted JSON against the per-entity **Zod** schemas (`schema.safeParse`); on failure, fall back to defaults + log (replaces ad-hoc `Array.isArray` guards in `loadSettings`).

## Tests added
- Unit (node): each `services/ipc/*` wrapper calls the right channel with the right args (mock `window.crafterm`).
- Unit: `persistence` serialize/load round-trips a `SavedState`; migration of old shapes; debounce coalescing.
- Unit: each `services/domain/*` pure function (worktree rules, plan parse, time calc).
- Unit: each **entity schema** accepts valid rows + rejects malformed; default factory produces a valid row; entity (de)serialize round-trips.
- Unit: each **repository** CRUD (`getAll/get/upsert/remove/query`) against the JSON-backed store.
- HR-5: any storage test uses a mocked store / temp dir, never `~/.crafterm`.

## features.md checklist slice
- Persistence: change a setting / layout → reload app → state restored identically.
- Each entity-backed feature (daily tasks, worktrees, reminders, bookmarks, accounts, time entries, projects, db tree, palette, ssh, notifications) round-trips through its repository with identical behavior.
- Load resilience: a malformed/old `state.json` falls back to defaults without crashing (validation boundary).
- Each domain that now routes through a service (git ops, db query, notebook CRUD, claude usage) behaves identically — spot-check one flow per domain.

## Acceptance criteria
- `grep 'window.crafterm.'` returns hits **only** in `services/ipc/*`.
- `state.ts` no longer owns persistence; app saves/loads identically.
- Every persisted entity has a `domain/model/*` module (unified type + schema + repository); the live-vs-`Saved*` type duality is gone.
- Persisted JSON is validated on load; entity reads/writes go through repositories (the JSON→SQLite seam, §10).
- `turbo run test` green; build + E2E smoke pass; checklist slice verified.
