import { Component } from '@geajs/core'
import './notification-group.css'
import { UITexts } from '@texts'
import type { NotifGroup } from '../notifications.types'
import { relTime } from '../notif-format'
import { CHEVRON_SVG, groupCountLabel, groupSummary } from './notification-group.store'
import NotificationCard from './notification-card'
import store from '../notifications.store'

// Several notifications from the SAME terminal, collapsed into one card
// (todomr5sckyaei): the terminal's name, how many alerts it has and the newest
// message. Expanding it lists every notification as its own card, so each keeps its
// own actions (remind / snooze / dismiss). Dismissing the group drops them all.
export default class NotificationGroup extends Component {
  declare props: { group: NotifGroup }
  chevronEl: HTMLElement | null = null

  onAfterRender(): void {
    if (this.chevronEl) this.chevronEl.innerHTML = CHEVRON_SVG
  }

  template({ group }: this['props']) {
    const expanded = store.isExpanded(group.key)
    const titleStyle = group.projectColor ? { color: group.projectColor } : {}
    const cardStyle = group.projectColor
      ? { background: `color-mix(in srgb, ${group.projectColor} 9%, transparent)` }
      : {}
    return (
      <div class={'notif-group' + (expanded ? ' expanded' : '')} style={cardStyle}>
        <div class="notif-group-head" onClick={() => store.toggleExpanded(group.key)}>
          <button
            class="notif-group-chevron"
            ref={this.chevronEl}
            title={expanded ? UITexts.Notifications.hideDetails : UITexts.Notifications.showDetails}
          />
          <span class="notif-group-title" style={titleStyle}>
            {group.title}
          </span>
          <span class="notif-group-count">{groupCountLabel(group.items.length)}</span>
          <span class="notif-group-time">{relTime(group.latest)}</span>
          <button
            class="notif-group-close"
            title={UITexts.Notifications.dismiss}
            onClick={(e: MouseEvent) => {
              e.stopPropagation()
              store.dismissGroup(group)
            }}
          >
            ×
          </button>
        </div>
        {!expanded && <div class="notif-group-summary">{groupSummary(group)}</div>}
        {expanded && (
          <div class="notif-group-items">
            {group.items.map((n) => (
              <NotificationCard key={n.id} notif={n} />
            ))}
          </div>
        )}
      </div>
    )
  }
}
