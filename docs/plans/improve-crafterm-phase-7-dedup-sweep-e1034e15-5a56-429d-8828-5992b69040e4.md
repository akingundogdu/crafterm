# Phase 7 — Dedup sweep

> Part of [Architecture & Component Refactor](./improve-crafterm-architecture-refactor-e1034e15-5a56-429d-8828-5992b69040e4.md) · **Branch:** `improve-crafterm`
> **Goal:** delete now-dead duplicated UI scaffolding and confirm everything routes through `@crafterm/ui`. Zero behavior change.
> **Depends on:** Phase 6 (all features migrated). **Blocks:** Phase 8.

## Scope
- **In:** removing leftover ad-hoc modal/overlay/search/list/keyboard-nav code; enforcing single-implementation.
- **Out:** CSS (Phase 8).

## Steps
1. Grep for residual ad-hoc scaffolding: `modal-overlay` builders, hand-rolled `makeSearchInput`-style helpers, manual up/down/Enter list handlers, stray `createElement('button')` clusters that should be crafterm-ui `button`.
2. Delete dead code paths left behind after Phase 6 migrations (old `overlayModal`, the original list/search code in the former `pickers.ts`, etc.).
3. Confirm the DRY targets from the master plan §2/§3.3 are collapsed:
   - Every modal → crafterm-ui `modal`.
   - Every selectable list → crafterm-ui `list`.
   - Every search field → crafterm-ui `search-box`.
   - Every tab strip → crafterm-ui `tabs`.
4. Add a lightweight lint/guard (or a grep CI check) that flags new `modal-overlay`/raw-button patterns outside `@crafterm/ui`, to prevent regression of HR-2.

## Tests added
- A repo-guard test: assert no renderer file outside `@crafterm/ui` constructs a `.modal-overlay` directly (grep-based unit test).
- Re-run the full component + E2E suite; nothing should change behaviorally.

## features.md checklist slice
- Spot-check one feature per category (a modal flow, a list/picker, a search, a tabbed screen) to confirm identical behavior after dead-code removal.

## Acceptance criteria
- No duplicate modal/search/list implementations remain; guard test passes.
- Line count drop recorded; full test suite + E2E green.
