# Phase 5 — Terminal renderer consolidation (HR-3, highest caution)

> Part of [Architecture & Component Refactor](./improve-crafterm-architecture-refactor-e1034e15-5a56-429d-8828-5992b69040e4.md) · **Branch:** `improve-crafterm`
> **Goal:** split the 1,286-line `pane.ts` into a dedicated `src/renderer/src/terminal/` module. **Pure relocation, no logic edits.** Terminal is the app's brain — maximum scrutiny.
> **Depends on:** Phase 4 (terminal.manager + namespaced terminal service). **Blocks:** Phase 6 (pane screen consumes terminal module).

## Scope
- **In:** carve `pane.ts` terminal concerns into focused files; route through `services/ipc/terminal.service.ts`.
- **Out:** doc pane / browser pane / SQL pane (those move in Phase 6); any behavior change to PTY data flow or activity heuristics.

## Steps
1. **`terminal/terminal.ts`** — xterm instance lifecycle: create/attach/fit/dispose, write input → `terminal.service`, render PTY data, resize. Lifted from `pane.ts`.
2. **`terminal/activity-detection.ts`** — activity heuristics + Claude awareness + notification triggers (`pane.ts` activity section; cross-check `features.md §4.3/§4.4`). **Heuristics copied verbatim** — thresholds/timers unchanged.
3. **`terminal/osc-title.ts`** — OSC title following (`features.md §4.5`).
4. **`terminal/status-bar.ts`** — per-pane status bar (branch · worktree · cwd; `features.md §4.6`).
5. Keep the `paneActions` indirection and `hooks` wiring intact; the terminal module exposes a small handle the `pane` screen mounts.
6. Re-point pop-out (`popout.ts`) hand-off at the new module without changing behavior.

## Guardrails (HR-1 / HR-3)
- Diff old `pane.ts` vs new files: every moved block must be logically identical. No "while I'm here" edits.
- Verify against `docs/terminal-architecture.md` line-by-line for each moved flow.
- Timing constants (`features.md §15`) must be unchanged — grep them before/after.

## Tests added
- Unit (happy-dom, mock terminal.service): activity-detection state machine emits the same notifications for a scripted byte stream; osc-title parsing; status-bar formatting.
- E2E (real Electron): spawn terminal, run a long command → activity notification fires; OSC title updates; status bar shows branch/cwd; pop-out keeps the session alive. All against temp state dir (HR-5).

## features.md checklist slice
- Re-walk the **entire** §4 Terminal/Pane checklist (lifecycle, input, activity, Claude awareness, OSC title, status bar, appearance, link provider, drag-to-rearrange) with extra scrutiny.

## Acceptance criteria
- `pane.ts` terminal concerns now live in `terminal/`; no logic delta (verified by diff + checklist).
- Full terminal E2E + §4 checklist green; timing constants unchanged.
