// Spine bridge (§6 sanctioned exception). The SINGLE file under src/views allowed
// to import the legacy state singletons; every other @views module imports the
// spine from here, never from @ui. During co-existence the legacy state.ts in
// @ui/state/state stays the source of truth (legacy code still mutates it), so
// this re-exports the live singletons (state, settings, uid, pushNotification, the
// pane maps, hooks, …) — reads AND mutations go through to the one real store.
// At teardown (Phase 9) state.ts physically moves into @views and this file's
// state.ts now lives in @views/state/state (moved); this re-exports it so the
// existing `@views/state/spine` import path keeps working tree-wide.
export * from '@views/state/state'
