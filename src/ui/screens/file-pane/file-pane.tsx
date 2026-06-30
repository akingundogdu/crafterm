// Thin shim — the file-pane screen now lives in the self-contained @views tree.
// Re-exports the gea port so legacy @ui consumers keep their import path and the
// consumer-facing names (createFilePane, destroyFilePane, CreateFilePaneOptions).
export type { CreateFilePaneOptions } from '@views/screens/file-pane/file-pane'
export { createFilePane, destroyFilePane } from '@views/screens/file-pane/file-pane'
