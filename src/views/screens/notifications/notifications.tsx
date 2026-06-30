import '@views/screens/notifications/notifications.css'
import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import NotificationCard from './components/notification-card'
import store from './notifications.store'

// gea Notifications (Alerts) list: a keyed card list reactive off the store,
// replacing the legacy renderNotifications()/replaceChildren cycle. Mounted by the
// shell into #notif-list. The root is display:contents so the cards lay out as
// direct children of the list host (§5.8 layout parity). The card list is rendered
// unconditionally with the empty hint as a sibling (§5.2).
export default class Notifications extends Component {
  created(): void {
    store.reload()
  }

  template() {
    const items = store.items
    return (
      <div class="notifications-root" style={{ display: 'contents' }}>
        {items.map((n) => (
          <NotificationCard key={n.id} notif={n} />
        ))}
        {items.length === 0 && <div class="notif-empty">{UITexts.Notifications.empty}</div>}
      </div>
    )
  }
}
