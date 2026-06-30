// Shared terminal-targeting helpers for the file/diff viewer panes — migrated to
// the gea tree (src/views/screens/diff). This legacy entry point is a thin
// re-export so existing @ui consumers (file-pane, diff-pane) keep importing
// resolveTarget/targetCwd/sendRef unchanged; the helpers now live entirely under
// @views.
export { resolveTarget, targetCwd, sendRef } from '@views/screens/diff/pane-ref'
