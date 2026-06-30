// Legacy terminal entry — now a thin shim over the migrated gea-tree terminal
// subsystem (§Phase 8). The real implementation lives in @views/terminal/terminal.
// At teardown this file and the rest of @ui/terminal / @ui/pane are deleted.
export * from '@views/terminal/terminal'
