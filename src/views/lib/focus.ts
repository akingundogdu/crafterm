// Focus an element that a gea component is about to render.
//
// gea renders ASYNCHRONOUSLY: right after `new View().render(host)` — or after a
// store write that opens a form — the element does not exist yet, so a plain
// `querySelector(...)?.focus()` silently does nothing. `onAfterRender` is no help
// either: it is mount-only, so it never fires for markup that appears on a later
// re-render. This polls for the element over a few animation frames and focuses it
// the moment it shows up (todomrkhe5mba9).

const MAX_FRAMES = 20

export function focusWhenReady(find: () => HTMLElement | null | undefined, selectAll = false): void {
  let frames = 0
  const tick = (): void => {
    const el = find()
    if (el) {
      el.focus()
      if (selectAll && el instanceof HTMLTextAreaElement) el.select()
      if (selectAll && el instanceof HTMLInputElement) el.select()
      return
    }
    if (++frames < MAX_FRAMES) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
