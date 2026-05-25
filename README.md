# Crafterm

A fully-customizable **macOS terminal manager** (cmux-style) built on
**Electron + xterm.js + node-pty**. Split-pane terminals, a project/folder
sidebar, command/worktree/SSH/Claude pickers, an in-app notebook, a right-side
notifications + reminders + files + time panel, per-pane theming, and pop-out
windows. Each pane runs your real `zsh` login shell.

> Crafterm is designed to play nicely with CLI agents like **Claude Code**: when
> a background pane rings the terminal bell, a native macOS notification fires —
> no extra config needed.

## Screenshots

_(Add screenshots/GIFs here.)_

## Features

- **Split-pane terminals** — each tab is a split tree; drag the gap between two
  panes to resize. Every pane is a real `zsh` login shell via `node-pty`.
- **Project / folder sidebar** — group terminals into nested folders, drag-drop
  to reorder/move, pin, color, and inline-rename. Per-row status, git branch,
  and pane count.
- **Pickers** — command palette, project switcher, git worktree picker, saved
  SSH connections, and a Claude session picker, plus markdown/file finders.
- **In-app notebook** — a tree of markdown notes (plus linked external files)
  rendered in a pane.
- **Right panel** — Alerts, Reminders, Files (explorer), and Time (Pomodoro /
  time tracking) tabs.
- **Per-pane theming** — bundled themes or a fully custom palette (background,
  foreground, cursor, selection, all 16 ANSI colors) + font family/size.
- **Pop-out windows** — detach a pane into its own window.
- **Bell-driven notifications** — native macOS notifications when an unfocused
  pane needs attention; click to focus the pane.

See [`docs/features.md`](docs/features.md) for the complete feature reference.

## Requirements

- macOS
- Node.js 18+ and npm
- Xcode Command Line Tools (`xcode-select --install`) — required to build the
  native `node-pty` module.

## Run (development)

```bash
npm install     # also rebuilds node-pty for Electron's ABI (postinstall)
npm run dev     # launch with hot reload
```

If `node-pty` fails to load, rebuild it for Electron manually:

```bash
npm run rebuild
```

## Build & package

```bash
npm run build       # bundle main + preload + renderer into out/
npm run dist        # electron-builder package (dmg + zip)
npm run dist:dir    # unpacked build (faster, for local testing)
```

`electron-vite build` does **not** typecheck. Typecheck explicitly:

```bash
npx tsc --noEmit -p tsconfig.web.json     # renderer + preload
npx tsc --noEmit -p tsconfig.node.json    # main + preload
```

> The packaged app is currently **unsigned / not notarized**. On first launch
> macOS Gatekeeper may block it — right-click the app → **Open**, then confirm.

## Architecture

```
   RENDERER (Chromium / web)          MAIN (Node.js)              OS
   ┌───────────────────────┐      ┌──────────────────┐
   │ xterm.js (draws)      │      │ node-pty         │
   │  keypress  ───────────┼─IPC─>│ pty.write() ─────┼──> zsh
   │  screen    <──────────┼─IPC──┤ pty.onData() <───┼─── zsh output
   └───────────────────────┘      └──────────────────┘
```

- **Main** (`src/main/index.ts`) owns node-pty processes, windows, native
  notifications, the app menu, and every IPC handler. Anything that touches the
  OS lives here.
- **Preload** (`src/preload/`) exposes a narrow, typed `contextBridge`
  (`window.crafterm`) — the only channel between renderer and shell.
- **Renderer** (`src/renderer/src/`) is vanilla TS + DOM (no UI framework),
  using a manager/hooks pattern with a single source of truth in `state.ts`.

### Renderer modules (`src/renderer/src/`)

| File | Responsibility |
| ---- | -------------- |
| `state.ts` | Central state, settings, persistence, render-hook dispatch |
| `types.ts` | Shared types (layout tree, sidebar tree, pane, settings) |
| `main.ts` | Boot, wiring, keyboard shortcuts |
| `commands.ts` | High-level actions (new/split/close, move, color, pin, rename …) |
| `pane.ts` | Pane/terminal lifecycle: create, status, title, bell, info |
| `content.ts` | Renders the terminal area (splits + drag resizers) |
| `sidebar.ts` | Sidebar: folders, drag-drop, context menu, rename, color, pin |
| `notebook.ts` | Notebook tree + linked external files |
| `notifications.ts` / `reminders.ts` / `explorer.ts` / `time.ts` | Right-panel tabs |
| `pickers.ts` | Modal pickers (command palette, project, worktree, SSH, Claude, finders) |
| `settings.ts` | Settings modal |
| `themes.ts` / `markdown.ts` / `tree.ts` / `dialog.ts` / `popout.ts` | Theming, markdown, pure tree algorithms, modal helpers, pop-out |

## Shortcuts (macOS)

| Key             | Action                       |
| --------------- | ---------------------------- |
| `Cmd + T`       | New tab                      |
| `Cmd + D`       | Split pane left/right        |
| `Cmd + Shift+D` | Split pane top/bottom        |
| `Cmd + W`       | Close active pane            |
| `Cmd + [` / `]` | Previous / next pane in tab  |
| `Cmd + 1..9`    | Switch to tab N              |
| `Cmd + ,`       | Open Settings                |

Shortcuts are configurable in Settings; defaults live in
`src/renderer/src/keybindings.ts`.

## Persistence

App state is stored as JSON under `~/.crafterm/` (dev: `~/.crafterm-dev/`),
including notebooks. Nothing leaves your machine.

## Themes

Bundled themes live in `src/renderer/src/themes.ts`; paste more from
[iTerm2-Color-Schemes](https://github.com/mbadolato/iTerm2-Color-Schemes) (the
`xterm/` folder is already in xterm.js format).

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). By
participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © Akin Gundogdu
