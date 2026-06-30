// Co-existence shim (§5 / §6): the legacy settings entry now mounts the gea
// (@views) settings screen. Kept as a thin re-export so the shell/menu's
// `openSettings` import path (`@ui/screens/settings/settings`) stays stable. At
// teardown the @ui settings tree is deleted and consumers import @views directly.
export { openSettings } from '@views/screens/settings/settings'
