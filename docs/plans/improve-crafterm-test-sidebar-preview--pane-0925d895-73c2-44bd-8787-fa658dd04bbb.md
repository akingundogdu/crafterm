# Test Sidebar Preview Plan

A sample plan file used to verify how plans appear in the Crafterm sidebar
(grouped under the producing pane via the `--pane-<id>` suffix).

## Goal

Render this plan in the sidebar under the current pane so we can visually
inspect:

- Title rendering and truncation
- TODO checkbox interaction
- Nested section grouping
- Status indicators (open / in-progress / done)

## Background

Crafterm picks up any markdown file in `docs/plans/` whose filename ends with
`--pane-<CRAFTERM_PANE_ID>.md` and attributes it to that pane in the sidebar.
This file is intentionally minimal — it exists only to exercise the UI path.

## TODO

- [x] Create the plan file with the correct pane suffix
- [x] Add a heading and a short background section
- [ ] Confirm the plan appears in the sidebar under the current pane
- [ ] Toggle a checkbox from the sidebar and verify it persists
- [ ] Collapse / expand the plan node
- [ ] Rename the plan from the sidebar and verify the file is renamed on disk
- [ ] Delete the plan from the sidebar and verify the file is removed

## Subsection A — Visual checks

- [ ] Title is not truncated awkwardly
- [ ] Long bullet wraps correctly inside the sidebar width
- [ ] Active item highlight matches the current theme accent

## Subsection B — Edge cases

- [ ] Plan with zero TODOs still renders
- [ ] Plan with only completed TODOs shows a "done" indicator
- [ ] Plan with deeply nested checklist items renders without overflow

## Notes

This file can be deleted once the sidebar behavior is confirmed.
