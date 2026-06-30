// Legacy pane entry — now a thin shim over the migrated gea-tree pane subsystem
// (§Phase 8). The real implementation lives in @views/pane/pane; every legacy
// consumer that still imports '@ui/pane/pane' (content, sidebar, diff-pane,
// code-pane, commands, main, …) transparently gets the migrated impl. At teardown
// this file and the rest of @ui/pane / @ui/terminal are deleted.
export * from '@views/pane/pane'
