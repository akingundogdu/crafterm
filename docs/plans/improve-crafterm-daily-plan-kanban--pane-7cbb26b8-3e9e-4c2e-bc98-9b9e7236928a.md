# Daily Plan / Kanban screen

## Context

Crafterm currently has no first-class place for the user to capture and track
day-by-day work. They want a self-driven daily planning surface where they can:

- open a screen from the sidebar action menu (the `⋯` button),
- pick a date (Today / prev / next / date input),
- see that day's tasks laid out as a Kanban board with three fixed columns
  (`Todo` / `In Progress` / `Done`),
- create / edit / drag-drop / delete task cards,
- tag tasks with multiple free-text labels picked from a dropdown that offers
  "Create <new>" inline, and remember those labels in a shared pool,
- mark a card's priority (low / medium / high),
- and have everything survive a restart (persisted into the existing
  `crafterm-state.json`).

This matches the existing "feature module + action-menu builtin + modal-overlay
UI" pattern already used by Improve Crafterm, Show all plans, Bookmarks, etc.

## Approach

Add a new self-contained module `src/renderer/src/dailyPlan.ts` that owns the
whole screen, register a new builtin action `dailyPlan` in the existing action
menu registry, and persist the data inside the existing `settings` object.

### 1. Types (`src/renderer/src/types.ts`)

Add three new types and register a new builtin row:

```ts
export type DailyPlanStatus = 'todo' | 'wip' | 'done'
export type DailyPlanPriority = 'low' | 'medium' | 'high'

export interface DailyPlanTask {
  id: string
  title: string
  date: string            // YYYY-MM-DD, the day this card belongs to
  status: DailyPlanStatus
  priority: DailyPlanPriority
  tagIds: string[]        // refs into DailyPlanTag[]
  order: number           // position within (date, status); for drag-drop ordering
  createdAt: number
  updatedAt: number
}

export interface DailyPlanTag {
  id: string
  name: string
  color: string           // hex; we'll seed a small palette and let user pick
}
```

Append one entry to `BUILTIN_ACTIONS`:

```ts
{ id: 'dailyPlan', label: 'Daily plan' }
```

### 2. Persistence (`src/renderer/src/state.ts` + `src/preload/api.d.ts`)

Following the established four-edit pattern (settings field → `persist()`
payload → `loadSettings()` reader → `SavedState` type):

- `settings.dailyPlan: { tasks: DailyPlanTask[]; tags: DailyPlanTag[] }`,
  initialized as `{ tasks: [], tags: [] }`.
- Add it to the `persist()` payload.
- Guard-read it in `loadSettings()` (`if (saved.dailyPlan && typeof
  saved.dailyPlan === 'object') ...`, with `Array.isArray` checks on the inner
  fields).
- Add the matching field to `SavedState` in `src/preload/api.d.ts`.

Use the existing `uid('task')` / `uid('tag')` helpers for id generation, and
`saveSoon()` after every mutation.

`seedActionMenu()` auto-picks up new `BUILTIN_ACTIONS` entries on first run.
For existing users whose `settings.actionMenu` was already seeded, the new
"Daily plan" item won't appear automatically — they can add it from
Settings → Action menu. (Same behaviour Improve and Update Crafterm have today;
matches the established convention.)

### 3. New module: `src/renderer/src/dailyPlan.ts`

Export a single entry point: `showDailyPlanModal(initialDate?: string): void`.

Reuses existing infra:

- `makeCloseButton` and overlay/modal pattern from `dialog.ts` /
  `bookmarks.ts`.
- `settings`, `saveSoon`, `uid` from `state.ts`.
- A new wide modal class `.daily-plan-modal` styled in `style.css` (next to
  `.improve-modal` / `.list-modal`) — roughly 90vw × 80vh, centred, with an
  internal flex layout.

Internal layout (vanilla DOM):

```
.daily-plan-modal
 ├── header
 │    ├── < prev   [date input]   next >    [Today]
 │    ├── title "Daily plan — Mon Jun 1"
 │    └── [+ New task]   [Manage tags]
 ├── board (display: grid, 3 cols)
 │    ├── column[data-status="todo"]   (header: Todo · N)
 │    ├── column[data-status="wip"]    (header: In Progress · N)
 │    └── column[data-status="done"]   (header: Done · N)
 └── empty-state shown when 0 cards for the day
```

Each card renders: title, priority badge (colored dot), tag chips, and an edit
+ delete affordance (small icons on hover, matching the bookmark card style).

Selected date is kept in a module-local `let selectedDate: string` (default =
today's `YYYY-MM-DD`); the modal re-renders the board whenever it changes. No
new `hooks` entry needed — the modal owns its own lifecycle.

### 4. Drag-drop

Use the native HTML5 drag-drop API (same as Crafterm's existing sidebar drag):

- Each card: `draggable="true"`, `dragstart` stamps the task id into
  `dataTransfer`, plus an `.dragging` class for visual feedback.
- Each column body: `dragover` → `preventDefault()` + highlight class;
  `drop` → read the task id, update `status` to the column's `data-status`,
  recompute `order` based on the drop position relative to siblings,
  `saveSoon()`, re-render.
- Within the same column, reordering is supported by inserting before the
  card under the cursor (or appending if dropped on empty area).

### 5. New task / edit task form

A nested sub-modal (`.modal prompt-modal daily-plan-form`) with fields:

- Title (required text input).
- Status (select: Todo / In Progress / Done).
- Priority (select with colored dots: Low / Medium / High).
- Tags multi-select: a chip-strip showing selected tags, plus a dropdown that
  filters `settings.dailyPlan.tags` by the typed query and shows
  `Create "<query>"` at the bottom of the list when no exact match exists.
  Creating a tag pushes it to `settings.dailyPlan.tags` immediately (with a
  default colour from a small predefined palette) and selects it.
- Save / Cancel actions.

Edit reuses the same form pre-filled. Delete uses `promptConfirm` from
`dialog.ts`.

### 6. "Manage tags" sub-modal

Small list editor for `settings.dailyPlan.tags`:

- rename, change colour (color input), delete (with a confirm — and on delete,
  strip that tag id from every task's `tagIds`).

This stays minimal — power users mostly create tags inline from the task form;
this modal exists purely so the user can clean up the pool.

### 7. Sidebar action wiring (`src/renderer/src/sidebar.ts`)

- Import `showDailyPlanModal` from `./dailyPlan`.
- Add `dailyPlan: () => showDailyPlanModal()` to `BUILTIN_ACTION_RUN`.

No other changes — the menu already iterates `settings.actionMenu` and the
Settings → Action menu editor already iterates `BUILTIN_ACTIONS`, so the new
row is picked up automatically.

### 8. CSS (`src/renderer/src/style.css`)

Add a block next to `.improve-modal` covering:

- `.daily-plan-modal` (size, layout).
- `.daily-plan-board` (3-column grid, gap, scroll per column).
- `.daily-plan-column` (header, body, drop-target highlight).
- `.daily-plan-card` (background, priority dot colours via existing
  `--accent` / `--text-dim` vars, tag chip styling, drag affordance).
- `.daily-plan-tag-dropdown` (search input + scrollable list + "Create …" row).

All colours via CSS custom properties — no inline hex.

## Files touched

- `src/renderer/src/types.ts` — types + `BUILTIN_ACTIONS` row.
- `src/renderer/src/state.ts` — `settings.dailyPlan` + `persist` + `loadSettings`.
- `src/preload/api.d.ts` — `SavedState.dailyPlan` field.
- `src/renderer/src/dailyPlan.ts` — **new**, ~400-500 lines, all UI + drag-drop.
- `src/renderer/src/sidebar.ts` — register `dailyPlan` in `BUILTIN_ACTION_RUN`.
- `src/renderer/src/style.css` — new `.daily-plan-*` block.

No new dependencies. No main-process / preload IPC additions — everything is
renderer-side state + existing `saveState` IPC.

## Verification

1. `npx tsc --noEmit -p tsconfig.web.json` and `npx tsc --noEmit -p
   tsconfig.node.json` — both clean.
2. `npm run build` — bundle succeeds.
3. `npm run dev` and manually exercise the feature:
   - Open Settings → Action menu, add the new "Daily plan" row, save.
   - Click sidebar `⋯` → "Daily plan" → modal opens on Today.
   - Create a task, change priority, add two tags (one existing via dropdown,
     one via inline "Create …"), save.
   - Drag the card between columns; reorder within a column.
   - Switch days with the prev / next / date input / Today buttons; verify
     each day's board is independent.
   - Open Manage tags, rename + delete a tag; verify the deleted tag is
     removed from any cards.
   - Close + reopen the app; verify tasks, tags, dates, statuses, and
     priorities all persisted.
   - Verify no console errors in DevTools.

No automated tests — repo has no test framework today (per `CLAUDE.md`).
