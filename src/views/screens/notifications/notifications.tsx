import './notifications.css'
import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import NotificationCard from './components/notification-card'
import NotificationGroup from './components/notification-group'
import store from './notifications.store'

// gea Notifications (Alerts) list: a keyed list of terminal groups, reactive off the
// store — no filter chips, the list is always everything. A terminal with several
// notifications collapses
// into one NotificationGroup (todomr5sckyaei); a lone notification renders as the
// plain card it always was. Mounted by the shell into #notif-list. The root is
// display:contents so the cards lay out as direct children of the list host (§5.8
// layout parity). The list is rendered unconditionally with the empty hint as a
// sibling (§5.2).
export default class Notifications extends Component {
  created(): void {
    store.reload()
  }

  template() {
    const groups = store.groups
    return (
      <div class="notifications-root" style={{ display: 'contents' }}>
        {groups.map((g) =>
          g.items.length > 1 ? (
            <NotificationGroup key={g.key} group={g} />
          ) : (
            <NotificationCard key={g.key} notif={g.items[0]} />
          )
        )}
        {groups.length === 0 && <div class="notif-empty">{UITexts.Notifications.empty}</div>}
      </div>
    )
  }
}
