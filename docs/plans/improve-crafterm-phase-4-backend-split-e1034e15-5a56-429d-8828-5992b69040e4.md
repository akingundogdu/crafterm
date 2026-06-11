# Phase 4 — Backend service split + terminal manager (main)

> Part of [Architecture & Component Refactor](./improve-crafterm-architecture-refactor-e1034e15-5a56-429d-8828-5992b69040e4.md) · **Branch:** `improve-crafterm`
> **Goal:** break the 1,964-line `main/index.ts` into `ipc/` + `services/` + `windows/` using the proven `registerXIpc()` pattern, and switch the bridge to the namespaced shape. **PTY/terminal logic lifted verbatim** (HR-3).
> **Depends on:** Phase 2 (bridge change contained to `services/ipc/*` wrappers), Phase 3 (scripts helper exists). **Blocks:** Phase 5.

## Scope
- **In:** extract handler groups into `main/ipc/*` + business logic into `main/services/*` + window mgmt into `main/windows/*`; regroup `preload`; namespaced `window.crafterm.*`.
- **Out:** renderer terminal split (Phase 5); feature/screen moves (Phase 6).

## Steps

### A. Services (business logic, no `ipcMain`)
1. **`main/services/terminal.manager.ts` (HR-3)** — lift verbatim the `Map<id, IPty>`, `owners`, `popouts`, `spawn/write/resize/kill`, `sendToOwner` routing (`index.ts:45-174`). No logic edits to byte piping, resize, env injection (`CRAFTERM_PANE_ID`).
2. `main/services/claude.usage.ts` — the ~100-line JSONL token aggregation (`index.ts:533-633`).
3. `git.service.ts` (`run()`/`gitBin()` `index.ts:317-408`), `fs.service.ts`, `notebook.service.ts` (`nbResolve`/`nbTree` `index.ts:1617-1648`), `plans.watcher.ts`, `secrets.service.ts`, app-update service. Fold existing `db.ts`/`docker.ts`/`pr.ts` into `services/` naming.
4. `scripts.ts` from Phase 3 lives here.

### B. IPC registration (thin)
5. `main/ipc/*.ipc.ts`, one per domain, each exporting `registerXIpc()` that wires `ipcMain.handle/on` to the service — mirroring the existing `registerDbIpc`/`registerDockerIpc`/`registerPrIpc` style. Channels: terminal(pty), git, fs, claude, notebook, secrets, plans, store, app-update, sound, popout.

### C. Windows
6. `main/windows/` — `BrowserWindow` + pop-out creation, `sendToRenderer`/`sendToOwner`, fullscreen broadcast, menu.

### D. Preload + namespaced bridge
7. Split `preload/index.ts` + `api.d.ts` (609 lines) into domain modules. Switch the exposed API to **namespaced**: `window.crafterm.git.*`, `crafterm.pty.*`, `crafterm.db.*`, … Update the `services/ipc/*` wrappers (only callers) accordingly.
8. `index.ts` shrinks to lifecycle + `registerXIpc()` wiring (target: a few hundred lines).

## Tests added
- Unit (node, mock `node-pty`/`child_process`/`fs`): `terminal.manager` spawn/write/resize/kill bookkeeping; `claude.usage` aggregation on sample JSONL; `git.service` parsing; `notebook.service` tree walk (temp dir, HR-5).
- Preload contract test: namespaced surface exposes every channel the renderer services call.
- E2E: terminal spawn/split, git branch picker, db query, notebook CRUD still work.

## features.md checklist slice
- **Full terminal section** (lifecycle, input, activity detection, OSC title, status bar, pop-out) verified against `docs/terminal-architecture.md`.
- Git / Claude usage / filesystem / notebook / secrets / plans-watcher / self-update flows verified one-by-one.

## Acceptance criteria
- `index.ts` ≤ ~400 lines, lifecycle/wiring only; each domain in its own `ipc/`+`services/`.
- `window.crafterm` is namespaced; renderer goes only through `services/ipc/*`.
- All terminal behavior byte-identical (verbatim move); tests + E2E + checklist green.
