# Phase 1 — `crafterm-ui` reusable components

> Part of [Architecture & Component Refactor](./improve-crafterm-architecture-refactor-e1034e15-5a56-429d-8828-5992b69040e4.md) · **Branch:** `improve-crafterm`
> **Goal:** build the reusable component library (HR-2) so every later screen consumes it. Zero behavior change to the running app.
> **Depends on:** Phase 0 (workspace, test harness, UI inventory reviewed). **Blocks:** Phase 6 (screen migration relies on these).

## Scope
- **In:** `@crafterm/ui` primitives as `.ts` factories reusing existing `style.css` classes; relocate `treeview` + `context-menu`; rebuild `dialog.ts` on top.
- **Out:** co-located CSS (Phase 8), consuming primitives inside feature screens (Phase 6), any new visual style.

## Component contract (recap)
`createX(opts) => Handle` — owns its DOM + cleanup, returns element + imperative methods, **no** `state`/`window.crafterm`/business logic. Reuses existing CSS classes; no `import './x.css'` yet.

## Steps (build order — simplest first, each TDD with happy-dom)
1. **`overlay`** — backdrop + focus trap + ESC/backdrop-close. Seed: `pickers.overlayModal` (`pickers.ts:27`).
2. **`button`** — variants (default/`primary`/danger), disabled, busy state. Seed: scattered `createElement('button')`.
3. **`input` / `field`** — labelled field + input. Seed: `dialog.ts` field block (`dialog.ts:33-42`).
4. **`modal`** — built on `overlay` + `button`; `{ el, body, close, setBusy }`. Seed: `dialog.ts` + `pickers.overlayModal`.
5. **`search-box`** — debounced input + clear + `onChange`. Seed: `pickers.makeSearchInput` (`pickers.ts:43`).
6. **`list`** — selectable rows + up/down/Enter keyboard nav + `onSelect`. Seed: list code in `pickers.ts` / `improve.ts`.
7. **`tabs`** — tab strip + body switch. Seed: `settings.buildSubTabs` (`settings.ts:73`).
8. **Relocate `treeview`** (`treeview.ts` + `treeview.css`) → `packages/crafterm-ui/src/treeview/` (keep `.css` import path working). Update importers (database/docker/notebook/sidebar) to `@crafterm/ui`.
9. **Relocate `context-menu`** (`contextmenu.ts`) → `@crafterm/ui`.
10. **`icons`** — gather inline SVG constants (`FOLDER_SVG`, `NOTE_SVG`, …) into `@crafterm/ui/icons`.
11. **Rebuild `dialog.ts`** (`promptText/promptConfirm/promptSelect/promptForm/makeCloseButton`) on top of `modal`+`field`+`button` — **same signatures, same behavior**, so existing callers are untouched. This proves the library end-to-end.

## Tests added (Vitest + happy-dom, HR-5: no FS)
- One component spec per primitive: render → assert DOM structure + classes → simulate click/keyboard → assert callbacks/cleanup.
- `dialog.ts` regression specs: `promptText` resolves trimmed value / null on cancel/empty; ESC + backdrop close; Enter submits — matching current behavior.
- `treeview`/`context-menu` smoke after relocation.

## features.md checklist slice
- All modal/picker/dialog-driven features still behave identically (spot-check: command palette open/close, a `promptConfirm` flow, treeview render in database/notebook sidebars).

## Acceptance criteria
- `@crafterm/ui` exports all primitives; `turbo run test` green incl. new component specs.
- `dialog.ts` is now a thin wrapper over crafterm-ui; **no caller changed**, app behaves identically.
- `treeview`/`context-menu` consumed from `@crafterm/ui`; build + E2E smoke pass.
- No feature screen migrated yet (that's Phase 6).
