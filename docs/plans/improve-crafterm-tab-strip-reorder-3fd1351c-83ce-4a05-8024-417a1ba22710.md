# Plan: Drag-drop reordering of tab strips (left + right panels)

## Context

The left sidebar tab strip (`#sidebar-tabs`: Terminal, Notebook, Database,
Docker, Accounts) and the right panel tab strip (`.notif-tabs`: Alerts,
Reminders, Files, Time, PR, Bookmarks) are currently rendered in a fixed,
hardcoded order. The user wants to reorder the individual tab buttons within
each strip via drag-and-drop, and have that order persist across restarts.

There is already a `tabDisplay` setting that controls per-strip display mode
(`mode`) and per-strip hidden lists (`hidden`). It is applied by
`applyTabDisplay()` in `sidebar.ts`. We extend the same setting with a per-strip
`order` array and have `applyTabDisplay()` re-append the buttons in that order,
plus add drag handlers to the buttons.

Keyboard shortcuts (⌘1/⌘2/⌘3 → `setSidebarMode('terminal'|'notebook'|'database')`
in `main.ts:335-337`) are bound by **function name**, not visual index, so
reordering the DOM does **not** change shortcut behavior — shortcuts stay tied
to their function regardless of position. No change needed there.

## Approach

Reuse the existing `tabDisplay` infrastructure. Add an `order` field, persist it
through the established 4-edit lockstep, and let `applyTabDisplay()` both apply
the order and own the drag-drop wiring.

### 1. Settings shape — add `order` to `tabDisplay`

Four edits in lockstep (per `CLAUDE.md` persistence rule):

- **`state.ts` (~line 132)** — default:
  ```ts
  tabDisplay: {
    mode: 'icon' as 'icon' | 'text' | 'both',
    hidden: { left: [] as string[], right: [] as string[] },
    order: { left: [] as string[], right: [] as string[] }
  }
  ```
  Empty `order` = natural `TAB_META` order (no migration needed).
- **`state.ts` `persist()` (~line 428)** — already serializes `settings.tabDisplay`
  wholesale; `order` rides along automatically. Verify no field-picking there.
- **`state.ts` `loadSettings()` (~line 577-588)** — add `order` using the existing
  `strArr` helper, same guarded shape as `hidden`:
  ```ts
  order: { left: strArr(td.order?.left), right: strArr(td.order?.right) }
  ```
- **`preload/api.d.ts` (~line 240)** — extend the `tabDisplay?` type:
  ```ts
  order?: { left?: string[]; right?: string[] }
  ```

### 2. Apply order in `applyTabDisplay()` (`sidebar.ts:668`)

After the existing per-button display loop, reorder the DOM for each strip:

- Build the effective order: saved `order[strip]` filtered to ids that still
  exist in `TAB_META` for that strip, then append any `TAB_META` ids missing
  from the saved order (so newly added tabs always appear). This keeps the
  function tolerant to future tab additions/removals.
- `strip.appendChild(btn)` each button in that order — `appendChild` on an
  existing child moves it, so the strip ends up in the desired order.

### 3. Drag-drop wiring (new helper in `sidebar.ts`, called from `applyTabDisplay()`)

Make each tab button draggable and reorderable within its own strip:

- On first `applyTabDisplay()` (guard with a module-level `wired` flag, mirroring
  the existing one-time `.tab-label` wrap guard), set `btn.draggable = true` and
  attach listeners. Constrain drops to the **same strip** (compare strip key).
- `dragstart`: stash the dragged id (module var) and add a `.dragging` class.
- `dragover` on a sibling button: `preventDefault()`; compute insert-before vs
  insert-after from cursor X relative to the button's horizontal midpoint
  (`getBoundingClientRect()`), since the strips are horizontal rows. Optionally
  add a `.drop-target` class for a visual indicator (CSS in `style.css`).
- `drop`: compute the new id order from the current DOM positions of that strip's
  buttons, write it to `settings.tabDisplay.order[strip]`, call `applyTabDisplay()`
  + `saveSoon()`.
- `dragend`: clear `.dragging`/`.drop-target` classes and the stashed id.

Strip key per button comes from `TAB_META` (`m.strip`). Skip hidden buttons in
the order computation but keep their saved entries.

### 4. CSS (`style.css`) — minimal

- `#sidebar-tabs button.dragging`, `.notif-tab.dragging` → reduced opacity.
- A thin accent left/right border (`var(--accent)`) on the current drop target
  for feedback. Reuse existing accent var; no new colors.

## Critical files

- `src/renderer/src/sidebar.ts` — `applyTabDisplay()` + new drag helper + order logic
- `src/renderer/src/state.ts` — default, `persist()`, `loadSettings()`
- `src/preload/api.d.ts` — `tabDisplay.order` type
- `src/renderer/src/style.css` — drag/drop visual states

No new dependencies. No changes to keyboard shortcuts or `switchTab`/`setSidebarMode`.

## Verification

1. `npx tsc --noEmit -p tsconfig.web.json` and `-p tsconfig.node.json` — clean.
2. `npm run build` — succeeds.
3. `npm run dev` and manually:
   - Drag a left-strip tab (e.g. Notebook before Terminal) → order changes live.
   - Drag a right-strip tab (e.g. Files before Alerts) → order changes live.
   - Confirm a left tab cannot be dropped into the right strip and vice-versa.
   - Click each reordered tab → still switches to the correct view
     (`selectTab`/`switchTab` unaffected).
   - Press ⌘1/⌘2/⌘3 → still select Terminal/Notebook/Database by function,
     regardless of visual position.
   - Restart the app → order persists (read back from
     `~/.crafterm-dev/crafterm-state.json`).
   - Toggle hide/show and display mode in Settings → still works alongside order.
