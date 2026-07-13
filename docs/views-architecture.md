# Crafterm renderer (`src/views`) — architecture & component structure

The authoritative, enforced rules live in the repo `CLAUDE.md` (§"Module structure
convention"). This document is the fuller **how-to**: the component file layout, the
gea store patterns, the imperative-widget exception, and the gea gotchas learned
migrating the tree. Read it before adding or changing a component under `src/views/`.

## 1. What the renderer is

- **gea, not a framework.** `src/views` is the sole renderer tree (`@views`). UI is
  gea `.tsx` Components (`export default class extends Component`) compiled by
  `@geajs/vite-plugin`. There is no React.
- **State is reactive gea `Store`s.** A `Store` (from `@geajs/core`) holds reactive
  fields; a gea Component that reads a store field re-renders when it changes. State
  is not a separate manager class — it is the store the view reads.
- **The OS/IPC layer is elsewhere.** Views never touch Node/Electron directly — they
  call `@services` client wrappers. Domain models + windows live in `src/core`.

## 2. HARD RULE — component file structure

Every component / screen / feature folder under `src/views/` is:

| File | Role |
|---|---|
| `<name>.tsx` | **The gea view.** DOM via JSX only. No non-view code inline. |
| `<name>.store.ts` | **The entire non-view module** (required): reactive `Store` + pure logic/helpers + constants (labels, SVG strings) + `@services` IPC calls. |
| `<name>.css` | Co-located styles, imported by the view. |
| `<name>.types.ts` | Module-local TS types (optional; global types stay in `types/types.ts`). |

**Forbidden (hard rule):** no NEW `<name>.state.ts`, no NEW `<name>.controller.*`.
The old `types/state/view` split and the imperative `.controller` manager are
retired. A component's state + logic + constants + IPC go in its `.store.ts`; its
view in its `.tsx`.

**The `.tsx` stays a pure view.** Do not declare a constant, a pure function, an IPC
call, or a `const RANGES = [...]` in the `.tsx` — that is non-view code and belongs in
the `.store.ts`. (This is exactly why `RANGES` moved from `daily-plan.tsx` into
`daily-plan.store.ts`.)

### Two documented exceptions
1. **6 imperative-widget controllers** keep a `.controller`: `treeview`, `code-pane`,
   `content`, `db-pane`, `diff-pane/file-search`, `diff/line-select`. They own a
   Monaco/xterm/diff-engine widget or a DOM-reconciliation loop that gea's async
   store-driven render cannot express (see §5). **No new ones.**
2. **Cross-cutting pure-logic utilities** shared across components (`tree.ts`,
   `catalog.ts`, `task-helpers.ts`, `themes.ts`) stay plain `.ts` — they are not a
   single component's non-view code.

## 3. The store

```ts
// singleton (one overlay/screen at a time) — the common case
import { Store } from '@geajs/core'
class FooStore extends Store {
  items: FooRow[] = []      // reactive: the view reads store.items
  sel = 0
  query = ''
  reset(): void { this.items = []; this.sel = 0; this.query = '' }
  setItems(items: FooRow[]): void { this.items = items }   // reassign, don't mutate in place
  moveSel(delta: number, count: number): void { this.sel = Math.max(0, Math.min(count - 1, this.sel + delta)) }
}
export default new FooStore()

// per-instance (a widget that can coexist with others, e.g. one per pane)
export class BarStore extends Store { /* … */ }   // consumer does `new BarStore()`
```

The same `.store.ts` also exports the component's **pure helpers and constants**
(what used to be `.state.ts`): `export const STATUSES = [...]`, `export function
filterFoo(...)`, `export async function loadFoo(...)` calling `@services`.

## 4. Writing a component (recipe)

1. **`<name>.store.ts`** — a `Store` with one reactive field per piece of live UI
   state, mutator methods, derived getters, plus the constants/helpers/IPC the view
   needs. `export default new X()` (singleton) or `export class X` (per-instance).
2. **`<name>.tsx`** — `export default class extends Component`; `template()` returns
   JSX reading `store.field`. Controlled inputs `value={store.x}` + `onInput`.
   Keyboard-nav handlers call store methods. No constants/logic defined here.
3. **`<name>.css`** — module-prefixed, descriptive class names (`.foo-row`, not
   `.f-r`).
4. **Mount.** An overlay/screen entry does `new View().render(host)` (imperative
   mount) or the parent renders `<Child/>` as a JSX child (reactive).

## 5. gea gotchas (learned the hard way — put these in every migration prompt)

- **A store-reading gea component renders ASYNCHRONOUSLY.** `new View().render(host)`
  returns before the DOM commits, so `host.firstElementChild` is `null` synchronously.
  Fine for e2e (Playwright waits) and for overlays; **incompatible with any consumer
  that needs a synchronous DOM handle** (this is why `diff-pane/file-search` stays an
  imperative controller).
- **Reactive markup must be a JSX CHILD.** A top-level, imperatively-mounted component
  (`new X().render()`) does NOT re-subscribe to store writes. Put reactive rendering
  in a JSX child (`<Body/>`) that reads the store — the child re-renders itself (the
  board-column pattern). A parent whose `template()` root is a child Component (not an
  intrinsic element) yields no synchronous DOM — wrap it in a `<div>`.
- **A bare `void store.rev` read is NOT tracked.** To subscribe a reactive column to a
  counter, read it INTO the output: `data-rev={String(store.rev)}` on the root.
- **`new X({...})` does NOT populate `this.props`.** An imperatively-mounted component
  reads plain constructor fields (`constructor(opts){ super(); this.foo = opts.foo }`).
  Only a component rendered from a PARENT template (`<X foo={...}/>`) gets `this.props`
  — so a JSX-child component uses `declare props` + `this.props.foo`.
- **Refs are assigned around `onAfterRender`, not synchronously after `render()`.** Any
  post-mount work reading a `ref` (mounting a widget, focus, positioning) runs in
  `onAfterRender()` (guard with a `started` flag), never right after `render()`.
- **`innerHTML={svg}` JSX prop is dropped.** Inject SVG via a `ref` + `onAfterRender`
  (`this.iconEl.innerHTML = SVG`).
- **`.map()` gotchas.** A handler on a NON-root child inside a keyed `.map()` mis-
  compiles (`el2` ReferenceError) → put the handler on the map-item root or use event
  delegation. A bare text child `{expr}` beside element siblings in a map item becomes
  an empty comment → wrap it in a `<span>`. A child Component inside a NESTED `.map()`
  (map-within-map) crashes → inline an intrinsic element or flatten. Single-child
  `key=` remount is unproven — force a remount with a single-element keyed `.map()`
  (`{[detailKey].map(k => <X key={k}/>)}`).
- **`d` and `root` are RESERVED identifiers — never name a local/param either.** The
  gea plugin emits its own `root` binding (the template's root element) and a `d`
  binding inside compiled `.map()`s. A source `const root = …` fails with "Identifier
  'root' has already been declared"; a `.map((d, …) => …)` param fails with "Argument
  name clash". **The plugin then logs `[gea-plugin] Failed to transform <file>` and
  SILENTLY drops that file out of the gea transform** — it still runs (via the plain
  JSX runtime) so tests stay green and the failure hides in build output. Use
  `repoRoot` / `dir` instead. (`i` is safe.) Grep the build log for
  "Failed to transform" — it must be empty.
- **Don't hand a proxied store object to IPC / a legacy mutator.** A `Store` field is a
  reactive Proxy; pass `{ ...obj }` (a fresh literal), not the proxy, across IPC
  ("object could not be cloned") or into an imperative widget.
- **`dataset={{...}}` is dropped** — use a literal `data-x={v}` attribute.

## 6. Enforcement

- `tests/.../views-gea-component.guard.test.ts` — no plain-DOM `el()`/`createElement`
  view code; every DOM-builder is a gea `.tsx`.
- `tests/.../views-store-structure.guard.test.ts` — no NEW `.state.ts` (fold into
  `.store.ts`), only the 6 documented `.controller` files. `GRANDFATHERED_STATE`
  shrinks to empty as the remaining `.state.ts` files fold into their `.store.ts`.

## 7. Migration status — DONE

The `.state.ts` → `.store.ts` fold is **complete**: all 66 `.state.ts` files were
folded (37 renamed to `.store.ts`, 26 merged into an existing `.store.ts`, and 3
cross-cutting ones — `commands`, `pickers/shared`, `settings/shared` — merged into
their plain `.ts`). `.state.ts` is fully retired; the guard now fails on any
occurrence. Verified: tsc web+node, build, vitest, playwright 126/126.
