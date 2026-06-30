// Migration shim (§6). The code-pane screen now lives in the self-contained
// @views tree; this file re-exports it so legacy callers (commands, main, …)
// transparently get the migrated implementation. At teardown this file is
// deleted and callers import from @views directly.
export { createCodePane, destroyCodePane } from '@views/screens/code-pane/code-pane'
export type { CreateCodePaneOptions } from '@views/screens/code-pane/code-pane'
