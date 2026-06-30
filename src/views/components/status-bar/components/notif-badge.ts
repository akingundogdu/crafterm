// Unread count on the notif toggle badge (shown while the panel is closed).
// Data lives in the notifications module; this only renders it.
export function updateNotifBadge(count: number): void {
  const badge = document.getElementById('notif-badge')
  if (!badge) return
  badge.textContent = count > 99 ? '99+' : String(count)
  badge.style.display = count > 0 ? 'flex' : 'none'
}
