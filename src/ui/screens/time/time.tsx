import Time from '@views/screens/time/time'
import timeStore from '@views/screens/time/time.store'

// Time panel — migrated to gea (src/views/screens/time). This legacy entry point
// mounts the gea component into the right-panel Time tab host; the store singleton
// keeps the timer / selection / auto-session state across remounts. The static
// markup left in index.html is replaced on the first render.

// Re-exported for main.state.ts, which imports openTrackModal from the time module.
export { openTrackModal } from '@views/screens/time/components/track-modal.open'

// Mount (or remount) the gea Time panel into its tab host.
export function renderTime(): void {
  const host = document.getElementById('notif-time-view')!
  host.replaceChildren()
  new Time().render(host)
}

// Listener wiring now lives inline in the gea component; nothing to do at startup.
export function initTime(): void {}

// Start the global activity listeners + the auto-tracking loop (once).
export function startAutoTracker(): void {
  timeStore.startAutoTracker()
}
