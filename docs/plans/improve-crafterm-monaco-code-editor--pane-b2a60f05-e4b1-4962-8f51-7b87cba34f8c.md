# Files → VSCode-style Code IDE (CodeMirror 6)

Branch: `improve-crafterm` · Pane: `b2a60f05-e4b1-4962-8f51-7b87cba34f8c`

> Slug kept as user-chosen `monaco-code-editor`, but the engine is **CodeMirror 6**
> (already installed and proven in this repo via `sqlEditor.ts`). Monaco was
> dropped to avoid a new ~5MB dependency + electron-vite worker setup.

## Goal

Turn the right-panel **Files** experience into a VSCode-like code IDE:
- Click a file in the tree → it opens in a **real editable code editor pane**
  (CodeMirror 6) with syntax highlighting, line numbers, code folding, and a
  breadcrumb header.
- **Edit + save** (Cmd+S) writes the file back to disk, with a dirty indicator.
- Upgrade the Files **tree** to file-type icons + git status colors, reusing the
  existing `treeview.ts` infrastructure.

## What already exists (reuse, don't rebuild)

| Need | Existing in repo |
|---|---|
| CodeMirror 6 wrapper pattern | `sqlEditor.ts` — Compartments for lang/theme, themes, autocomplete |
| Editor build integration | `codemirror`, `@codemirror/*` already in `package.json`, working in renderer |
| Read-only file pane (header, font zoom, line ref → terminal) | `filePane.ts` |
| Generic tree (icons, drag, inline rename, context menu, keyboard nav, color) | `treeview.ts` (used by `notebook.ts`, `database.ts`) |
| Current Files tree | `explorer.ts` (custom lightweight tree, no icons/git) |
| Pane host + split + tab | `commands.ts` `hostDoc` / `placeSplit` |
| Pane persistence pattern | `serializeLayout` in `state.ts` (`sqlPane` field) |
| Read file IPC | `fs:readText` (main `index.ts:1790`) |

## Decisions (confirmed with user)

1. **Editable + save** (not read-only).
2. **CodeMirror 6** (not Monaco).
3. Deliverable now: **detailed plan** (this file). No code until approved.

## Open approval gate (BLOCKING)

New dependencies — all official CodeMirror language packs, small, same family as
the installed ones. **Must get explicit user approval before `npm install`**
(CLAUDE.md: "Ask before adding any dependency"):

- `@codemirror/lang-javascript` (js, ts, jsx, tsx)
- `@codemirror/lang-python`
- `@codemirror/lang-json`
- `@codemirror/lang-html`
- `@codemirror/lang-css`
- `@codemirror/lang-markdown`
- `@codemirror/lang-rust`
- `@codemirror/lang-cpp`
- `@codemirror/lang-java`
- `@codemirror/lang-php`
- `@codemirror/lang-xml`
- `@codemirror/lang-yaml`
- `@codemirror/legacy-modes` (Swift, Go, Shell, Ruby, Kotlin, etc. via `StreamLanguage`)

> Swift (the user's main case, per the screenshot) ships via `legacy-modes`
> (`@codemirror/legacy-modes/mode/swift`). `@codemirror/language` is already a
> transitive dep (used in `sqlEditor.ts`).

## Implementation phases

### Phase 0 — Dependency approval
- Present the dep list above, get approval, `npm install`.
- Smoke check: `npx tsc --noEmit -p tsconfig.web.json` still clean.

### Phase 1 — Main process IPC (`src/main/index.ts`)
- **`fs:writeText`** — write arbitrary file content to an absolute path (mirrors
  `fs:writeMd` at `index.ts:1802`, but for any extension). Return `true`/`false`.
  Guard: only write under allowed roots? Match existing `writeMd` behavior (no
  sandbox — this is a non-sandboxed terminal app), so plain `fs.writeFileSync`.
- **`git:fileStatus`** (for tree decorations) — run `git status --porcelain`
  in the worktree root, return `{ path → 'modified' | 'added' | 'untracked' | 'deleted' }`.
  Optional (Phase 5b); can ship the editor without it.

### Phase 2 — Preload wiring (3-edit lockstep)
For each new IPC, the mandatory three edits:
- `src/main/index.ts` — handler (Phase 1).
- `src/preload/index.ts` — `writeText(path, content)`, `gitFileStatus(cwd)`.
- `src/preload/api.d.ts` — typed signatures (+ `SavedState`/`SavedNode` field if
  persisted, Phase 6).

### Phase 3 — `src/renderer/src/codeEditor.ts` (new)
Generic CodeMirror 6 wrapper, modeled directly on `sqlEditor.ts`:
- `createCodeEditor({ parent, doc, languageId, themeName, onSave, onChange })`.
- **Language by extension** — a `langExtensionFor(path)` map (`.swift` → swift
  StreamLanguage, `.ts/.tsx` → javascript({typescript:true,jsx:true}), `.py`,
  `.json`, `.html`, `.css`, `.md`, `.rs`, `.cpp/.h`, `.java`, `.php`, `.xml`,
  `.yaml/.yml`, shell, go, ruby, kotlin…). Unknown → plain text (no lang ext).
- **Reuse the theme palettes** from `sqlEditor.ts` — extract `PALETTES` +
  `buildThemeExtension` into a shared `editorThemes.ts` so SQL and code editors
  share one source (avoids duplication; `sqlEditor.ts` imports from it).
- `Cmd/Ctrl+S` keymap (`Prec.highest`) → `onSave(getValue())`.
- Track dirty via `EditorView.updateListener` → `onChange(isDirty)`.
- Use `basicSetup` (gives line numbers, folding, bracket matching, history).

### Phase 4 — `src/renderer/src/codePane.ts` (new) + routing
A real editable code pane. Two options for relationship to `filePane.ts`:
- **(a) New `codePane.ts`** that becomes the default for code files; keep
  `filePane.ts` for the line-selection → terminal-reference flow (or fold that
  flow into the new pane). **Recommended: new `codePane.ts`, retire `filePane`
  routing for code files but keep the file for plain non-highlightable views.**
- Header: breadcrumb (`<project> › <relpath>`), dirty dot, Save button (+ Cmd+S),
  copy-path, reveal-in-Finder, reload, close, font zoom (mirror `filePane` header).
- Body: mount `createCodeEditor`. On `onSave` → `window.crafterm.writeText(path, value)`,
  clear dirty, toast/checkmark on success.
- **Wire-up**: in `commands.ts`, route `openFileViewer` (and `explorer.ts`
  `openFile`) for code files to a new `openCodeEditor(absPath)` that calls
  `hostDoc(createCodePane({ path }), basename)`. Markdown keeps `openMarkdownFile`.
- Add a `codePanes` registry in `state.ts` (like `sqlPanes`), with cleanup on
  pane close (mirror `filePane.ts` `cleanups` map).

### Phase 5 — Files tree upgrade (`explorer.ts` → `treeview.ts`)
- Rebuild `explorer.ts` rendering on `createTreeView<Entry>` with a `TreeAdapter`:
  - `icon` — file-type SVG by extension (new small icon set: swift, ts/js, json,
    md, folder, generic; reuse `FOLDER_SVG` style constants).
  - `isContainer`/`children` — lazy via `fs:listEntries` (keep current lazy load;
    adapt to treeview's `children` by pre-expanding on toggle, or keep a loaded-
    children cache).
  - `onActivate`/`onClick` — open file in the code editor (Phase 4).
  - `menu` — keep Open in editor / Finder / Exclude; **add (Phase 5c, optional):
    New File, New Folder, Rename, Delete** (needs `fs:mkdir`/`rename`/`unlink`
    IPC — additional approval-free system calls in main, same pattern as
    `writeText`).
  - Keyboard navigation + search filter come for free from `treeview.ts`.
- **5b (optional): git decorations** — `color`/`rowClass` from `git:fileStatus`,
  refreshed on tab focus + on save. Modified = amber, added/untracked = green.

### Phase 6 — Persistence (optional but matches "real IDE")
- Persist open code editor panes across reload, mirroring `sqlPane` in
  `serializeLayout` (`state.ts:304`): add a `codePane: { path, themeName }` branch.
  On restore, re-open the file (re-read from disk; unsaved edits are NOT persisted
  — document this, or add a dirty-buffer save-to-temp later).
- Add `codePane` to `SavedNode` type in `api.d.ts`.

### Phase 7 — Verify
- `npx tsc --noEmit -p tsconfig.web.json` and `-p tsconfig.node.json` — clean.
- `npm run build` — succeeds.
- `npm run dev` — manual smoke:
  1. Files tab → tree shows icons; expand folders.
  2. Click `App.swift` → opens in code editor with Swift highlighting + line numbers.
  3. Edit → dirty dot appears → Cmd+S → saves; verify file on disk changed.
  4. Reload app → open editors restored (if Phase 6 done).
  5. (If 5b) modified file shows amber in the tree after an edit.

## Risk / notes
- **No test framework** in repo → verification is tsc + build + manual dev
  (per CLAUDE.md). No unit tests possible without a new dep (separate approval).
- `basicSetup` default theme vs Crafterm theme — reuse `sqlEditor` palettes to
  stay consistent; wire `--mono`/`--bg-term` CSS vars like the SQL editor does.
- Large files — CodeMirror handles big docs well, but add a soft cap (e.g. warn
  > 2MB) to keep the pane responsive.
- Worktree root: `explorer.ts` already resolves the active worktree
  (`explorerRoot()`); the editor save path is absolute, so no root ambiguity.
- Keep all phases independently shippable: Phase 1–4 alone delivers the editable
  editor; Phase 5 polishes the tree; Phase 6 adds persistence.

## Suggested order
0 (approve deps) → 1+2 (writeText IPC) → 3 (editor) → 4 (pane + routing) → 7
(verify core) → 5 (tree) → 6 (persistence) → 7 (verify full).
