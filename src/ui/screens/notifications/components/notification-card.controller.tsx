import { relTime } from '../notif-format'
import { UITexts } from '@texts'
import { buildSnoozeRow } from './snooze-row'
import type { AppNotification } from '@ui/types/types'
import type { NotificationCardProps } from './notification-card'

// Builds a single notification card: collapsible header (chevron + title +
// time), body message, source chips, and per-kind action rows (remind / open /
// snooze).
export class NotificationCardController {
  private readonly props: NotificationCardProps
  private readonly card: HTMLDivElement

  constructor(props: NotificationCardProps) {
    this.props = props
    const { notif: n, tone, expanded } = props

    const close = (
      <button class="notif-card-close" title={UITexts.Notifications.dismiss} onClick={props.onDismissClick(n.id)}>
        ×
      </button>
    ) as HTMLButtonElement

    // Always-visible header: chevron toggle + terminal name + relative time.
    // Collapsed, this is the entire card; the chevron reveals the body.
    const chevron = (
      <button
        class="notif-card-chevron"
        innerHTML={props.chevronSvg}
        title={expanded ? UITexts.Notifications.hideDetails : UITexts.Notifications.showDetails}
        onClick={props.onChevronClick(n.id)}
      />
    ) as HTMLButtonElement

    const statusIcon = props.statusIcon
    const titleText = (<span>{n.title}</span>) as HTMLSpanElement
    const title = (
      <span class="notif-card-title">
        {statusIcon && <span class={'notif-card-status notif-status-' + tone} innerHTML={statusIcon} />}
        {titleText}
      </span>
    ) as HTMLSpanElement
    if (n.projectColor) title.style.color = n.projectColor

    const time = (<span class="notif-card-time">{relTime(n.time)}</span>) as HTMLSpanElement
    const head = (
      <div class="notif-card-head">
        {chevron}
        {title}
        {time}
      </div>
    ) as HTMLDivElement

    // Collapsible body: message, source chips and per-card actions. Hidden via
    // CSS until the card carries the `expanded` class.
    const body = (
      <div class="notif-card-body">
        <div class="notif-card-msg">{n.message}</div>
      </div>
    ) as HTMLDivElement

    const card = (
      <div class={'notif-card' + (tone ? ' notif-' + tone : '') + (expanded ? ' expanded' : '')}>
        {close}
        {head}
        {body}
      </div>
    ) as HTMLDivElement
    // Status drives the left bar (via the notif-<tone> CSS class); the project
    // colour drives the title + background fill so the two readings stay distinct.
    if (n.projectColor) {
      card.style.background = `color-mix(in srgb, ${n.projectColor} 9%, transparent)`
    }

    // Detail line: rendered as small categorical chips so the source info
    // (project · branch · worktree · cwd) reads at a glance.
    if (props.chips.length) {
      const detail = (
        <div class="notif-card-detail">
          {props.chips.map((c) => {
            const el = (<span class={'notif-chip notif-chip-' + c.cls}>{c.text}</span>) as HTMLSpanElement
            if (c.title) el.title = c.title
            return el
          })}
        </div>
      ) as HTMLDivElement
      body.append(detail)
    }

    // "Remind me" only makes sense for pane cards — reminder cards already
    // carry a snooze row.
    if (n.kind !== 'reminder') body.append(buildRemindButton(n, props.showRemindPicker))

    if (n.kind === 'reminder') {
      const opener = props.opener
      if (opener) {
        const openRow = (
          <div class="notif-card-snooze notif-open-row">
            <button class="notif-snooze-chip notif-open-chip" onClick={props.onOpenerClick(opener, n.id)}>
              {opener.label}
            </button>
          </div>
        ) as HTMLDivElement
        body.append(openRow)
        card.addEventListener('click', props.onReminderCardClick(opener, n.id))
      }
      body.append(
        buildSnoozeRow({
          text: n.reminderText ?? n.message,
          notifId: n.id,
          payload: n.payload,
          onSnoozeClick: props.onSnoozeChipClick
        })
      )
    } else {
      card.addEventListener('click', props.onPaneCardClick(n))
    }

    this.card = card
  }

  render = (): HTMLElement => this.card
}

// Labeled "Remind me" button in a pane card's detail body. Clicking it pops a
// time-picker that creates a reminder pointing back at the same pane — when it
// fires later, the resulting card carries an Open button (see resolvePayloadOpener).
function buildRemindButton(
  n: AppNotification,
  showRemindPicker: (anchor: HTMLElement, n: AppNotification) => void
): HTMLElement {
  const btn = (
    <button
      class="notif-card-remind"
      innerHTML={`<span class="notif-remind-icon">⏰</span><span>${UITexts.Notifications.remindMe}</span>`}
      title={UITexts.Notifications.remindMeAbout}
      onClick={(e: MouseEvent) => {
        e.stopPropagation()
        showRemindPicker(btn, n)
      }}
    />
  ) as HTMLButtonElement
  return (<div class="notif-card-remind-row">{btn}</div>) as HTMLDivElement
}
