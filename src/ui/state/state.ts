// Spine moved to the gea tree. The renderer state singletons (panes/browsers/docs
// maps, `state`, `settings`, `notifications`, `hooks`, `paneActions`, `uid`,
// `pushNotification`, render-orchestration chokepoints, …) now LIVE in
// @views/state/state — the single source of truth. This legacy module is a thin
// re-export so the remaining un-migrated @ui code keeps its import path until the
// shell migrates and src/ui is deleted (§9/§10 teardown).
export * from '@views/state/state'
