# gea — Problems found (candidates for upstream issues / PRs)

Discovered while migrating crafterm's `src/views` to gea (`@geajs/core` 1.4.0,
`@geajs/vite-plugin` 1.4.1). Each entry: **symptom → minimal repro → workaround
→ severity**. Ordered roughly by impact. These are the reason a generic
component (the treeview) cannot render an adapter-provided slot component, and why
several DOM factories had to fall back to `document.createElement`.

---

## 1. Dynamic component tags (`<Var/>`) mis-compile — `X is not defined` (vite-plugin) — BLOCKER

**Symptom:** A JSX tag whose name is a local variable (not a static import) is
lifted by the plugin into a generated create-fn that references the variable in a
scope where it is not defined → `ReferenceError: X is not defined`, thrown from
`Proxy.render`, crashing the whole render. **Two** dynamic tags in one template
crash deterministically; a **single** dynamic tag is inconsistent (compiled OK in
some template shapes, `X is not defined` in others).

```tsx
template() {
  const Trailing = this.props.adapter.trailingComponent // a Component class
  const Below = this.props.adapter.belowComponent
  return (
    <div>
      {Trailing ? <Trailing node={node}/> : null}   {/* generated create-fn: insertComponent(Trailing, anchor, …) */}
      {Below ? <Below node={node}/> : null}          {/* → "Trailing is not defined" */}
    </div>
  )
}
```

Reproduces on both 1.3.x and 1.4.x. Unconditional (`<Trailing/>` without the
ternary) also crashes. Static/imported tags (`<TreeRow/>`) are fine — the plugin
captures module-level bindings but not local consts in the lifted create-fn.

**Workaround:** none that composes. You cannot render a component chosen at
runtime. We had to keep the sidebar's slot components imperative (`el()` /
`document.createElement`) because the generic row cannot render them.

**Severity:** blocker for any "render a component passed in as data" pattern
(slots, adapters, plugin systems, dynamic dispatch).

---

## 2. Conditionals in a manually-mounted root never materialize (core) — BLOCKER

**Symptom:** For a component mounted via `new X().render(host)` (not rendered as a
child of another component's template), `{cond ? <a/> : null}` and `.map()`
children in **its own `template()`** render as empty `<!---->` comment
placeholders and **never fill** — even when the condition is `true`, even after
`requestAnimationFrame`, even if the host is attached to `document`, even on a
later reactive re-render (the placeholder count updates, e.g. `data-rev` bumps,
but the conditional stays a comment).

Children rendered as part of the **main reactive tree** (a `<Child/>` tag inside a
parent that gea itself rendered) DO fill their conditionals. So the same component
works as a child but not as a manually-mounted root.

**Repro:** render a component with `{true ? <span>x</span> : null}` via
`new C().render(host)`; inspect `host` → `<...><!----></...>` forever.

**Workaround:** only put reactive/conditional markup in a component that gea
renders as a child (the "reactive markup must live in a JSX child" rule). For
detached nodes, build with `document.createElement`.

**Severity:** blocker for the node-returning-factory pattern (mount + extract a
built node) when the content is conditional.

---

## 3. `render()` is asynchronous — `firstElementChild` is null right after (core) — HIGH

**Symptom:** `new X().render(host); host.firstElementChild` is `null`
synchronously after `render()`. gea flushes the render on a microtask/rAF, not
synchronously. In **happy-dom / vitest** even a single fresh mount defers; in the
real DOM a single fresh static mount is usually sync, but **many `render()` calls
in a tight synchronous loop** defer (host still empty when read).

**Repro (happy-dom):** the "render into a throwaway host, return
`host.firstElementChild`" factory returns `null` under vitest.

**Workaround:** don't read the DOM synchronously after `render()`. For factories
that must return a node now, use `document.createElement`. For post-render work,
use `requestAnimationFrame` (a microtask still sees the previous frame in our
tests).

**Severity:** high — breaks the common "build a detached node via a component"
factory in unit tests and in loops.

---

## 4. Rendering a gea tree into a gea-rendered (extracted) node → reconciler conflict (core) — HIGH

**Symptom:** If you `new A().render(hostA)`, take `hostA.firstElementChild` as
`node`, move it into the live DOM, then later `new B().render(node)` (render
another gea tree into that node), gea's reconciler fights the inner render
(stale/duplicated content; in some shapes `Failed to execute 'insertBefore' … not
a child`).

**Workaround:** containers that other renderers mount into must be plain,
un-managed nodes (`document.createElement`), not gea-rendered/extracted ones.

**Severity:** high — surfaces whenever a gea-built container hosts another gea
subtree (screens/panels that compose independently-rendered widgets).

---

## 5. `onAfterRender` is mount-only; does not re-run on update or re-key (core) — MEDIUM

**Symptom:** `onAfterRender()` fires once when the instance mounts. It does **not**
re-run on a reactive re-render, and changing a child's `key` does **not** force a
remount that re-runs it (gea reuses the instance). So imperative post-mount work
(SVG `innerHTML`, appending an external node, wiring a widget) can't be refreshed
there when the underlying data changes.

**Workaround:** drive updates through the reactive `template()`; do external-node
sync in a controller-owned `requestAnimationFrame` pass after each render, not in
`onAfterRender`.

**Severity:** medium — forces an out-of-band sync layer for any imperative,
per-render DOM work.

---

## 6. `innerHTML={svg}` JSX prop emits a literal attribute (vite-plugin) — MEDIUM

**Symptom:** `<span innerHTML={SVG}/>` renders `<span innerhtml="&lt;svg…">` (a
literal attribute); the markup is not parsed, so the glyph is invisible.

**Workaround:** property `ref` + `onAfterRender` → `this.el.innerHTML = SVG`.
(Costs you #5 if the SVG ever needs to change.)

**Severity:** medium — inline SVG icons are common.

---

## 7. Interpolating an external DOM node renders an empty comment (core) — MEDIUM

**Symptom:** `{someHTMLElement}` (a real DOM node passed in, e.g. an adapter's
returned node) renders as `<!---->`, not the node.

**Workaround:** append via property `ref` + `onAfterRender`.

**Severity:** medium — blocks embedding externally-built nodes declaratively.

---

## 8. Handler on a non-root child inside a keyed `.map()` → `el2 is not defined` (vite-plugin) — MEDIUM

**Symptom:** `list.map(x => <div><input onKeyDown={…}/></div>)` — an `onX` handler
on a **non-root** element of a mapped item — generates a create-fn referencing an
undefined element var (`const evt = el2; …`) → runtime `ReferenceError: el2 is not
defined` from `Proxy.render`, crashing the render. Handlers on the **map-item
root** are fine; `.map()`s of child Components are fine.

**Workaround:** put the handler on the map-item root, or attach via event
delegation in `onAfterRender`.

**Severity:** medium — easy to hit with form rows / lists.

---

## 9. Bare text child `{expr}` beside element siblings in a keyed `.map()` → comment (vite-plugin) — LOW/MEDIUM

**Symptom:** `defs.map(d => <label><input/>{d.label}</label>)` — the `{d.label}`
text expression is compiled to an empty `<!--…-->` comment (text invisible).

**Workaround:** wrap dynamic text in an element (`<span>{d.label}</span>`), or move
the item into a child Component.

**Severity:** low/medium.

---

## 10. Child Component inside a NESTED `.map()` (map-within-map) → "Class constructor cannot be invoked without 'new'" (vite-plugin) — MEDIUM

**Symptom:** a `<Foo/>` child Component used in a `.map()` whose callback is itself
inside another `.map()` is mis-compiled to a plain `jsx(Foo, …)` call that invokes
the class without `new` → `TypeError: Class constructor Foo cannot be invoked
without 'new'`, crashing the render. Components in a single top-level `.map()` are
fine.

**Workaround:** inline an intrinsic element in the inner map, or flatten so there
is no map-within-map.

**Severity:** medium.

---

## 11. Reactivity / API sharp edges (core) — LOW

- **Manual `new X({...})` does not populate `this.props`** — only framework-driven
  rendering (`<X foo=…/>` from a parent template) sets props. Imperatively-mounted
  components must take constructor args and read plain fields.
- **Callback refs don't fire** — only property refs (`ref={this.el}`) are assigned.
- **A bare `void store.rev` read is not tracked** — a reactive field must be read
  *into the output* (e.g. `data-rev={store.rev}`) to establish a subscription; a
  discarded read does not re-render on change.
- **A top-level imperatively-mounted component does not re-subscribe** to a store
  on writes — reactive reads must live in a child component to re-render.
- **`dataset={{x:y}}` is dropped** — the element gets `data-x === null`; use a
  literal `data-x={y}` attribute.

**Severity:** low individually, but collectively they make the imperative-mount
path (mount into an overlay, extract a node) full of traps.

---

## Summary for maintainers

The two hard blockers are **#1 (dynamic tags)** and **#2 (manual-mount
conditionals)**: together they mean a generic/reusable component cannot render a
component supplied to it at runtime — no slots, no adapter-provided views, no
plugin dispatch — the exact case a tree/list widget needs. **#3/#4** make the
"build a node with a component, hand it back" factory unreliable (async render +
reconciler conflicts), forcing `document.createElement`. The vite-plugin
create-fn scoping bugs (#1, #8, #9, #10) look like one class of issue: lifted
create-fns lose bindings from the enclosing template scope.
