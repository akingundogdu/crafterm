import { Component } from '@geajs/core'
import type { AppNotification } from '@views/types/types'
import { UITexts } from '@texts'
import { panes, poppedOut } from '@views/state/spine'
import { selectPane } from '@views/commands/commands'
import { terminalService } from '@services'
import { snoozeOptions, snoozeReminder } from '@views/screens/reminders/reminders.engine'
import { relTime } from '../notif-format'
import { CHEVRON_SVG, toneOf, statusIconFor, buildNotifChips, resolvePayloadOpener } from '../notifications.state'
import { showPaneRemindPicker } from './remind-popover.open'
import store from '../notifications.store'

// gea port of a single notification card: collapsible header (chevron + status
// icon + title + time), body message, source chips, and per-kind action rows
// (remind / open / snooze). The chevron + status-icon SVGs are set imperatively in
// onAfterRender (no innerHTML JSX prop). Read flows take the reactive prop; the
// reminder/pane navigation flows are read-only hand-offs so no raw resolve needed.
export default class NotificationCard extends Component {
  declare props: { notif: AppNotification }
  chevronEl: HTMLElement | null = null
  statusEl: HTMLElement | null = null
  remindEl: HTMLElement | null = null

  onAfterRender(): void {
    if (this.chevronEl) this.chevronEl.innerHTML = CHEVRON_SVG
    if (this.statusEl) this.statusEl.innerHTML = statusIconFor(toneOf(this.props.notif))
    if (this.remindEl) {
      this.remindEl.innerHTML =
        `<span class="notif-remind-icon">⏰</span><span>${UITexts.Notifications.remindMe}</span>`
    }
  }

  private onCardClick = (opener: { open: () => void } | null): void => {
    const n = this.props.notif
    if (n.kind === 'reminder') {
      if (opener) {
        opener.open()
        store.dismiss(n.id)
      }
      return
    }
    // Jump to the pane (focus its pop-out window when popped out), then dismiss.
    if (poppedOut.has(n.paneId)) terminalService.popoutFocus(n.paneId)
    else if (panes.has(n.paneId)) selectPane(n.paneId)
    store.dismiss(n.id)
  }

  template({ notif: n }: this['props']) {
    const tone = toneOf(n)
    const statusIcon = statusIconFor(tone)
    const expanded = store.isExpanded(n.id)
    const chips = buildNotifChips(n)
    const opener = resolvePayloadOpener(n.payload)
    const cardClass = 'notif-card' + (tone ? ' notif-' + tone : '') + (expanded ? ' expanded' : '')
    // Status drives the left bar (notif-<tone> class); the project colour drives the
    // title + a faint background fill so the two readings stay distinct.
    const cardStyle = n.projectColor
      ? { background: `color-mix(in srgb, ${n.projectColor} 9%, transparent)` }
      : {}
    const titleStyle = n.projectColor ? { color: n.projectColor } : {}
    const snoozeText = n.reminderText ?? n.message
    return (
      <div class={cardClass} style={cardStyle} onClick={() => this.onCardClick(opener)}>
        <button
          class="notif-card-close"
          title={UITexts.Notifications.dismiss}
          onClick={(e: MouseEvent) => {
            e.stopPropagation()
            store.dismiss(n.id)
          }}
        >
          ×
        </button>
        <div class="notif-card-head">
          <button
            class="notif-card-chevron"
            ref={this.chevronEl}
            title={expanded ? UITexts.Notifications.hideDetails : UITexts.Notifications.showDetails}
            onClick={(e: MouseEvent) => {
              e.stopPropagation()
              store.toggleExpanded(n.id)
            }}
          />
          <span class="notif-card-title" style={titleStyle}>
            {statusIcon && <span class={'notif-card-status notif-status-' + tone} ref={this.statusEl} />}
            <span>{n.title}</span>
          </span>
          <span class="notif-card-time">{relTime(n.time)}</span>
        </div>
        <div class="notif-card-body">
          <div class="notif-card-msg">{n.message}</div>
          {chips.length > 0 && (
            <div class="notif-card-detail">
              {chips.map((c) => (
                <span key={c.cls + c.text} class={'notif-chip notif-chip-' + c.cls} title={c.title}>
                  {c.text}
                </span>
              ))}
            </div>
          )}
          {n.kind !== 'reminder' && (
            <div class="notif-card-remind-row">
              <button
                class="notif-card-remind"
                ref={this.remindEl}
                title={UITexts.Notifications.remindMeAbout}
                onClick={(e: MouseEvent) => {
                  e.stopPropagation()
                  showPaneRemindPicker(e.currentTarget as HTMLElement, n)
                }}
              />
            </div>
          )}
          {n.kind === 'reminder' && opener && (
            <div class="notif-card-snooze notif-open-row">
              <button
                class="notif-snooze-chip notif-open-chip"
                onClick={(e: MouseEvent) => {
                  e.stopPropagation()
                  opener.open()
                  store.dismiss(n.id)
                }}
              >
                {opener.label}
              </button>
            </div>
          )}
          {n.kind === 'reminder' && (
            <div class="notif-card-snooze">
              <span class="notif-snooze-label">{UITexts.Notifications.remindMeLater}</span>
              <div class="notif-snooze-chips">
                {snoozeOptions().map((opt) => (
                  <button
                    key={opt.label}
                    class="notif-snooze-chip"
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation()
                      snoozeReminder(snoozeText, opt.at, n.payload)
                      store.dismiss(n.id)
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }
}
