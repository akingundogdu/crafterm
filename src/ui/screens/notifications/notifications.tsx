// Notifications right-panel — migrated to gea (src/views/screens/notifications).
// This legacy entry point is a thin re-export shim: the imperative panel shell +
// the gea Alerts card list now live entirely under @views. Existing @ui consumers
// (main.state) keep importing initNotifications/renderNotifications/toggleNotifPanel
// unchanged.
export {
  initNotifications,
  renderNotifications,
  toggleNotifPanel,
  clearNotifications,
  applyNotifSize,
  applyNotifPanel
} from '@views/screens/notifications/notifications.shell'
