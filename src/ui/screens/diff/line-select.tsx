// Shared line-selection engine — migrated to the gea tree
// (src/views/screens/diff). This legacy entry point is a thin re-export so
// existing @ui consumers (file-pane, diff-pane) keep importing
// createLineSelect/the types unchanged; the engine + its DOM now live entirely
// under @views.
export { createLineSelect } from '@views/screens/diff/line-select'
export type { LineRow, LineSelectOptions, LineSelectHandle } from '@views/screens/diff/line-select'
