# Phase 8 — CSS reorganization

> Part of [Architecture & Component Refactor](./improve-crafterm-architecture-refactor-e1034e15-5a56-429d-8828-5992b69040e4.md) · **Branch:** `improve-crafterm`
> **Goal:** split the 5,607-line `style.css` into design tokens + co-located component/screen CSS, leaving only a small `global.css`. Visual parity, zero behavior change.
> **Depends on:** Phases 1, 6, 7 (components + screens settled, so CSS moves don't churn). **Final structural phase.**

## Scope
- **In:** `crafterm-ui/src/tokens.css`, per-component/per-screen `.css` co-location, `global.css`, the component-name-based naming convention.
- **Out:** any new styling, theme changes, or visual redesign.

## Naming convention (mandatory)
- **Component-name-based:** every CSS class/variable is prefixed with its component's **full name**, then the styled aspect.
  - `button` component → `button-background-color`
  - `right-section-tab-page-container` component → `right-section-tab-page-container-background-color`
- One rule maps to exactly one component → self-documenting, traceable, collision-free.
- Apply while moving each section out of `style.css`: rename the old ad-hoc class to the component-name-based form and update its DOM references in the same commit.
- Add a grep guard: flag classes in a component/screen `.css` that don't start with that component's name.

## Steps
1. **Design tokens:** extract the existing CSS custom properties (`--accent`, `--text-dim`, spacing, radius, fonts) into `packages/crafterm-ui/src/tokens.css`; import once globally. Single source of design truth.
2. **Co-locate crafterm-ui CSS:** for each primitive add `import './x.css'` and move its rules from `style.css` (use the existing section comments as boundaries — e.g. modal rules around `style.css` modal section).
3. **Co-locate screen CSS:** for each `screens/<feature>/` add `<feature>.css` and move its section out of `style.css` (sections are already comment-delimited — improve panel `~2103`, settings `~1977`, docker `~4203`, PR `~4469`, time `~3824`, explorer `~3719`, etc.). Fold the already-separate `sidebar.css`/`database.css`/`dbPane.css`/`notebook.css`/`treeview.css` into their new homes.
4. **`global.css`:** keep only resets, dark scrollbars (`style.css:31`), `<html>`/`<body>` base, traffic-light strip, and truly global layout.
5. Delete the emptied `style.css`.

## Verification (visual parity is the risk)
- Move **one section per commit**; after each, screenshot-compare the affected surface (Playwright screenshot diff) against a pre-Phase-8 baseline.
- Watch specifics: split resizers, drag-drop overlays, pane status bar, notification card accents, tab strip display modes.

## Tests added
- Playwright visual-regression snapshots for: main layout, a modal, settings, sidebar (both modes), a DB pane, the notification panel, PR panel. Baseline captured before the first move; each move must match.

## features.md checklist slice
- Appearance/theming items (`features.md §10`), per-pane appearance (`§4.8`), tab strip display modes (`§6`), and background color picker — all visually unchanged.

## Acceptance criteria
- `style.css` removed; CSS co-located; `tokens.css` is the only place defining design vars.
- All visual-regression snapshots match baseline; checklist + E2E green.
