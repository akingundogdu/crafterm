# Phase 9 — External UI library adoption (DEFERRED)

> Part of [Architecture & Component Refactor](./improve-crafterm-architecture-refactor-e1034e15-5a56-429d-8828-5992b69040e4.md) · **Branch:** `improve-crafterm`
> **Status:** **DEFERRED** — out of scope for the current round. Revisit only if needed after Phases 0–8 land. Requires explicit dependency approval (CLAUDE.md).
> **Depends on:** Phases 1 + 8 (crafterm-ui primitives + tokens in place).

## Why this is cheap to defer
The component contract (`createX(opts) => Handle`) is the seam. A library can back specific primitives **behind the unchanged API**, so feature/screen code never changes regardless of this decision.

## Candidate libraries (from master §6)
- **Franken UI** — shadcn/ui look, UIkit 3 JS + LitElement web components; Tailwind-based styling. Strongest fit if the shadcn aesthetic is wanted.
- **Microsoft Fluent UI Web Components (FAST)** — dev-tool/VS Code aesthetic, design-token driven.
- **Shoelace / Web Awesome** — framework-agnostic web components, built-in behavior.
- **Pico CSS / Open Props** — minimal, no build change.
- **daisyUI** — only if committing to Tailwind as the styling system (parallel-system risk).

## Steps (when/if approved)
1. Pick one library; get dependency approval.
2. Reconcile its design tokens with `crafterm-ui/src/tokens.css`.
3. Back **one** primitive first (e.g. `button` or `input`) with the library behind its existing `createX()` API; verify component tests + visual snapshots unchanged.
4. Roll out primitive-by-primitive; native widgets (xterm, CodeMirror, treeview) stay as-is.

## Decision checklist before starting
- Is the shadcn/Fluent aesthetic actually wanted enough to add a dependency + (for Franken/daisyUI) Tailwind build?
- Does it integrate with the existing dark theme + tokens without a parallel styling system?
- Bundle-size / packaging impact under electron-builder acceptable?

## Acceptance criteria (if pursued)
- Chosen primitives wrap the library behind the same API; **no screen code changed**.
- Component tests + visual-regression snapshots still pass.
