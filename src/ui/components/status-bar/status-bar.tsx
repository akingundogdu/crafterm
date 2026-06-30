// Status bar — migrated to gea tree (src/views/components/status-bar). This legacy
// entry point is a thin re-export shim so existing @ui consumers (main.state, the
// notifications shell) keep importing mountStatusBar / updateNotifBadge unchanged.
export { mountStatusBar, updateNotifBadge } from '@views/components/status-bar/status-bar'
