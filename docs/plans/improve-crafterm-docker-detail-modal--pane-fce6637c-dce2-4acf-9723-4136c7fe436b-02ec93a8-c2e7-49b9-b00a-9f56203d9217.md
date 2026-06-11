# Docker Detail Modal (todo33)

Rich, tabbed detail modal for the Docker tool — replaces the current static
`<pre>` inspect/logs view with a structured inspect table, live log tailing, and
an embedded exec terminal.

## Goal (todo33)

> docker tarafında inspect ya da log tıkladığımızda modal içerisinde detaylı bir
> listeleme ve log tailing yapısı koyalım, hatta ihtiyaç varsa terminal koyalım
> ki ilgili docker'ı inspect edip içerisinde command çalıştırabilip detayları
> rahatlıkla inspect edebilelim.

Confirmed scope: **all three features** (structured inspect, live log tailing,
embedded exec terminal), for **all object types** (container gets all tabs;
image/volume/network get structured inspect + raw JSON only).

## Current state

- `src/renderer/src/docker.ts` — `showTextModal(title, text)` shows a static
  `<pre>` for inspect/logs. Logs are one-shot (`dockerLogs(id, 500)`); no follow.
- Inspect/Logs/Exec are row actions in `renderContainers`; Inspect is a row
  action in images/volumes/networks.
- `showTextModal` is also reused for error toasts ("Action failed", "Prune
  failed") — must stay for that purpose.
- pty bridge: `createPty({cwd,env,shell})` spawns `<shell> -l`; `input/resize/
  kill`; global `onData/onExit` route to the `panes` map. `ipcRenderer.on`
  supports multiple listeners, so the modal can register its own filtered
  `onData/onExit` for its private pty ids.
- No new IPC required. Reuse `dockerInspect`, `dockerLogs`, `createPty`, `input`,
  `resize`, `kill`, `onData`, `onExit`.

## Design

New `showDetailModal(opts)` in `docker.ts`. `opts`:
`{ kind: DockerKind, id: string, name: string, running?: boolean }`.

Tabs by kind:
- **container, running**: Inspect · Logs (live) · Terminal (exec)
- **container, stopped**: Inspect · Logs (live `-f`; shows existing then waits)
- **image / volume / network**: Inspect only

### Inspect tab (all kinds)
- Fetch `dockerInspect(kind, id)` → parse JSON (array, take `[0]`).
- Render a structured two-column table of high-value fields per kind:
  - container: State+Status, Image, Command, Created, RestartPolicy, Ports,
    Mounts, Networks (name→IP), Env (list), Labels (count).
  - image: Id, RepoTags, Size, Architecture/Os, Created, Env, Cmd, Layers count.
  - volume: Name, Driver, Mountpoint, Scope, CreatedAt, Labels.
  - network: Name, Driver, Scope, Subnet/Gateway (IPAM), Containers attached.
- A "Raw JSON" toggle button reveals the full pretty-printed JSON in a `<pre>`
  (reuse `.docker-pre`). Defaults to the structured view.
- Parsing is defensive: any missing field is skipped; if JSON parse fails, fall
  back to showing the raw text in the `<pre>` only.

### Logs tab (container)
- Embedded xterm (`@xterm/xterm` + `FitAddon`, same imports as `pane.ts`).
- Spawn a pty via `createPty({})` (login shell), then after ~350ms write
  `docker logs -f --tail 500 <id>\r` (mirrors `createTab` command injection and
  the existing `Exec` action's reliance on shell PATH).
- Route the pty's data to this xterm via a dedicated `onData`/`onExit` listener
  filtered on the pty id (registered on tab open).
- xterm read-only is not enforced (a TUI may need keys); but logs follow stream
  — leaving input enabled lets the user Ctrl+C. Acceptable.

### Terminal tab (running container)
- Embedded xterm + pty; after ~350ms write `docker exec -it <id> sh\r`
  (sh; user can launch bash). Full interactive terminal inside the modal.

### Shared terminal/xterm plumbing (helper)
- `makeEmbeddedTerm(host, command)`:
  - `createPty({})` → id.
  - `new Terminal({fontFamily, fontSize, theme: resolveTheme(), cursorBlink})`
    using `settings.font` + `resolveTheme()` (import from `themes.ts`).
  - `FitAddon`, `term.open(host)`, `fit.fit()`, push initial `resize`.
  - `term.onData(d => crafterm.input(id, d))`.
  - dedicated `crafterm.onData((pid,data)=>{ if(pid===id) term.write(data) })`
    and `crafterm.onExit(pid=>{ if(pid===id) term.write('\r\n[process exited]') })`.
  - `ResizeObserver` on host → `fit.fit()` + `crafterm.resize(id, cols, rows)`.
  - after delay, inject the command.
  - return `{ id, term, fit, dispose }`. `dispose()` kills the pty, disconnects
    the ResizeObserver, and `term.dispose()`.
- The modal tracks created embedded terms; on close it calls `dispose()` for each
  (kills ptys — no leaked `docker logs -f` / `exec` processes).

### Tabbed modal shell
- Reuse `.modal-overlay` / `.modal`, `makeCloseButton`, Escape-to-close,
  click-outside-to-close (mirror `showTextModal`).
- A tab strip (`.docker-detail-tabs`) toggles `display` of tab panels (don't
  recreate; create lazily on first activation so a never-opened Terminal tab
  doesn't spawn a pty).
- On close: detach keydown listener, remove overlay, dispose all embedded terms.

### Wiring row actions
- Containers: replace the separate "Logs" and "Inspect" actions with a single
  **Details** action opening `showDetailModal({kind:'container', id, name,
  running})` on the relevant tab; keep **Exec** as a quick standalone too OR fold
  it into Details' Terminal tab. Decision: keep an "Inspect" entry that opens
  Details (Inspect tab) and a "Logs" entry that opens Details (Logs tab) — least
  surprising; both land in the new modal. Keep the standalone **Exec** row action
  (opens a real pane terminal) unchanged for users who want a full pane.
- Images/volumes/networks: their "Inspect" action opens
  `showDetailModal({kind, id, name})` (Inspect-only modal) instead of
  `showTextModal`.
- `showTextModal` stays for error/prune-failure toasts.

## Files touched

- `src/renderer/src/docker.ts` — add `showDetailModal`, `makeEmbeddedTerm`,
  inspect-structuring helpers; rewire row actions. Imports: `Terminal`,
  `FitAddon`, `settings` (state.ts), `resolveTheme` (themes.ts).
- `src/renderer/src/style.css` — `.docker-detail-tabs`, `.docker-detail-tab`,
  `.docker-detail-panel`, `.docker-term-host`, `.docker-kv` table, raw-toggle.
- No main / preload / api.d.ts changes (no new IPC).

## Verification

1. `npx tsc --noEmit -p tsconfig.web.json` and `-p tsconfig.node.json` — clean.
2. `npm run build` — succeeds.
3. `npm run dev`: open Docker mode →
   - Container Inspect: structured table + raw JSON toggle.
   - Container Logs: live stream (start/produce output, see it tail in real time).
   - Container Terminal: `docker exec` shell, run `ls`, exit.
   - Image/volume/network Inspect: structured + raw.
   - Close modal → confirm no orphan `docker logs -f` / exec processes
     (`docker ps`/`ps aux | grep "docker logs"`).
4. Switch tabs without spawning the Terminal pty until its tab is opened.

## Notes / risks

- Login-shell PATH must include docker (`/usr/local/bin` etc.). The existing
  Exec action already relies on this, so behavior is consistent. If it proves
  flaky, a follow-up could add a dedicated `docker:pty` IPC that spawns the
  resolved `dockerBin()` directly — out of scope for now.
- Keep English-only strings; no Turkish in code.
