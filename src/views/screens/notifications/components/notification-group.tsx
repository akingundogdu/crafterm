import { Component } from '@geajs/core'
import './notification-group.css'
import { UITexts } from '@texts'
import type { NotifGroup } from '../notifications.types'
import { relTime } from '../notif-format'
import { CHEVRON_SVG, GONE_TITLE, groupCountLabel, goToGroup } from './notification-group.store'
import NotificationCard from './notification-card'
import store from '../notifications.store'

// One terminal's notifications, collapsed into a single card (todomr5sckyaei): the
// terminal's live name and how many alerts it has, in one row exactly as tall as a
// single card.
//
// Clicking the card GOES TO THE TERMINAL and clears the group, the same as a single
// card — the chevron is what expands it. It used to be the other way round (the whole
// head toggled), which left a grouped terminal unreachable from the panel. Expanding
// lists every notification as its own card, so each keeps its own actions (remind /
// snooze / dismiss); the × on the head drops them all.
export default class NotificationGroup extends Component {
  declare props: { group: NotifGroup }
  chevronEl: HTMLElement | null = null

  onAfterRender(): void {
    if (this.chevronEl) this.chevronEl.innerHTML = CHEVRON_SVG
  }

  template({ group }: this['props']) {
    const expanded = store.isExpanded(group.key)
    const isGone = group.paneId === null
    const titleStyle = group.projectColor ? { color: group.projectColor } : {}
    const cardStyle = group.projectColor
      ? { background: `color-mix(in srgb, ${group.projectColor} 9%, transparent)` }
      : {}
    return (
      <div
        class={'notif-group' + (expanded ? ' expanded' : '') + (isGone ? ' gone' : '')}
        style={cardStyle}
        title={isGone ? GONE_TITLE : undefined}
        onClick={() => goToGroup(group)}
      >
        <div class="notif-group-head">
          <button
            class="notif-group-chevron"
            ref={this.chevronEl}
            title={expanded ? UITexts.Notifications.hideDetails : UITexts.Notifications.showDetails}
            onClick={(e: MouseEvent) => {
              e.stopPropagation()
              store.toggleExpanded(group.key)
            }}
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
