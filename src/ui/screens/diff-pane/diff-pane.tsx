// PR diff pane — migrated to the gea tree (src/views/screens/diff-pane). This
// legacy entry point is a thin re-export so existing @ui consumers (commands)
// keep importing createDiffPane/destroyDiffPane unchanged; the pane + its CSS now
// live entirely under @views.
export { createDiffPane, destroyDiffPane } from '@views/screens/diff-pane/diff-pane'
export type { CreateDiffPaneOptions } from '@views/screens/diff-pane/diff-pane'
