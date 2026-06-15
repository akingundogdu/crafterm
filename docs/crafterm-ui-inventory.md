# crafterm-ui — UI Component Inventory (HR-2)

Every UI element/pattern in the app today, mapped to the reusable `@crafterm/ui` component
it should become. Per HR-2, we **build the component in `crafterm-ui` first, then consume it**
in screens — no screen builds bespoke UI that bypasses the library.

**Review this list together before Phase 1.** Columns: *Component* = proposed crafterm-ui
name · *Today* = where it's reinvented now · *Tier* = P (build first, high reuse) / S (secondary) /
F (feature-specific, stays in `screens/<feature>/components/`) / K (keep external, not crafterm-ui).

---

## A. Primitives to build first (Tier P — Phase 1 core)

| Component | Today (duplication) | Source seed | Notes |
|---|---|---|---|
| **overlay** | every modal builds its own backdrop | `pickers.overlayModal:27` | backdrop + focus trap + ESC/click-out |
| **modal** | dialog, pickers, improve, reminders, dailyPlan, docker, pr, bookmarks, accounts, meetingNotes | `dialog.ts` + `overlayModal` | `{el, body, close, setBusy}`; built on overlay |
| **button** | ~all `createElement('button')` + `.primary`/danger | scattered | variants: default/primary/danger/ghost; busy; disabled |
| **input** | every text field | `dialog.ts:37` | text/number/password |
| **field** | label+input+hint row | `dialog.ts:33` | wraps input/select |
| **select** | dropdowns (engine, repeat, project, type) | `dialog.promptSelect`, db/reminders | + optional "+ New…" |
| **form** | multi-field forms | `dialog.promptForm:355` | validation, submit/cancel |
| **search-box** | pickers, improve, notebook, database, docker, explorer, accounts, bookmarks, spotlight | `pickers.makeSearchInput:43` | debounced + clear + onChange |
| **list** | pickers, improve, docker, terminal switcher, command history | `pickers` list code | selectable rows + ↑↓/Enter keyboard nav |
| **tabs** | settings sub-tabs, right-panel tabs, spotlight tabs, notebook sub-tabs, accounts/bookmarks filters | `settings.buildSubTabs:73`, `spotlight` | tab strip + body switch + display modes |
| **treeview** | sidebar, database, docker, notebook, explorer | `treeview.ts` (already shared) | **relocate** as-is + keyboard nav/DnD/rename |
| **context-menu** | sidebar, explorer, pane menu | `contextmenu.ts` (already shared) | **relocate** |
| **datepicker** | reminders, daily-plan, meeting-notes | `datepicker.ts` (already reusable) | **relocate**; date + datetime |
| **icons** | inline SVG consts in many files | scattered (`FOLDER_SVG`…) | one SVG set/registry |

## B. Composite / display components (Tier S)

| Component | Today | Source | Notes |
|---|---|---|---|
| **card** | notification, bookmark, PR, deployment, task, account, meeting-note, reminder cards | each feature hand-rolls | base card shell + header/body/actions slots |
| **badge / chip / pill** | status pills (working/ask/idle), tags, category chips, issue-key chip, draft/mergeable/check badges, recency labels | scattered | variants by tone/color |
| **status-dot** | sidebar, terminal switcher, claude dashboard, process rows | scattered | running/idle/attention/done colors |
| **toolbar** | pane header, db pane, diff pane, code pane, settings header | scattered | left/right action groups |
| **toast / inline-feedback** | "Copied"/"Saved ✓"/"⚠" flashes | scattered (1100ms reset) | transient confirm |
| **color-picker / swatches** | pane bg, node color, theme grid, tag colors | scattered | swatch grid + custom hex |
| **empty-state** | bookmarks, lists, explorer | scattered | icon + message |
| **resizer / splitter** | sidebar, notif panel, split panes | `content.ts`, `sidebar.ts`, `notifications.ts` | drag handle (col/row), clamp |
| **progress-bar** | improve overview, update modal, time | `improve.ts` | labeled bar |
| **count-badge** | folder child counts, tab counts | sidebar/improve | numeric badge |

## C. Result grid (Tier S — specialized)

| Component | Today | Source | Notes |
|---|---|---|---|
| **data-grid** | DB result grid (sort, edit/insert/delete row, formatting, pagination) | `dbResultGrid.ts` | reusable table; heavy, but one impl |

## D. Feature-specific children (Tier F — under screens/<feature>/components/)

Built **from** crafterm-ui primitives, not reusable app-wide:
- **daily-plan:** board, column, task-card, tag-editor, changelog-modal. `dailyPlan.ts`
- **improve:** feature-input, todo-card, progress-overview. `improve.ts`
- **settings:** general-tab, projects-tab (master/detail), apps-editor, features-editor, run-commands-editor, ios-tab, palette-admin, action-menu-editor, shortcuts-recorder, theme-grid. `settings.ts`
- **pr:** pr-card, deployment-card, run-card, project-picker-modal. `pr.ts`
- **docker:** container-row, detail-modal (inspect/logs/terminal). `docker.ts`
- **database:** connection-form, object-tree-section. `database.ts`
- **spotlight:** spotlight-result-row, tab-bar. `spotlight.ts`
- **reminders/bookmarks/accounts/meeting-notes:** their cards + forms (use crafterm-ui card/form/datepicker).
- **terminal:** pane-header, daily-task-chip, pane-menu (use crafterm-ui button/context-menu).

## E. Keep external (Tier K — not crafterm-ui)

- **xterm.js** terminal — heavy widget, lives in `terminal/`.
- **Monaco** editor — heavy widget, lives in `editor/` (monaco-setup, editor-themes), consumed by code-pane + db-pane.
- **`<webview>`** browser pane — Electron tag.

---

## Build order proposal (Phase 1)
1. overlay → 2. button → 3. input/field/select → 4. modal → 5. form → 6. search-box → 7. list → 8. tabs → 9. relocate treeview + context-menu + datepicker → 10. icons → then Tier S (card, badge, status-dot, toolbar, toast, color-picker, resizer, progress-bar) → data-grid.

## Open questions for review
1. Should **card** be one flexible base, or a few variants (notification/list/form-card)?
2. **data-grid** — promote to crafterm-ui now, or keep in db-pane until a second consumer appears?
3. **resizer** — one component covering both panel resizers and split resizers, or two?
4. Any visual inconsistencies to deliberately unify now (button paddings, modal widths, chip styles) vs preserve exactly (HR-1)?
