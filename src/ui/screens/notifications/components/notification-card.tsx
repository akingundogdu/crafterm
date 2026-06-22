import type { AppNotification, ReminderPayload } from '@ui/types/types'
import type { PayloadOpener, NotifChip } from '../notifications.types'
import { NotificationCardController } from './notification-card.controller'

export interface NotificationCardProps {
  notif: AppNotification
  tone: string
  expanded: boolean
  chevronSvg: string
  statusIcon: string
  chips: NotifChip[]
  opener: PayloadOpener | null
  onDismissClick: (id: string) => (e: MouseEvent) => void
  onChevronClick: (id: string) => (e: MouseEvent) => void
  onOpenerClick: (opener: PayloadOpener, id: string) => (e: MouseEvent) => void
  onReminderCardClick: (opener: PayloadOpener, id: string) => (e: MouseEvent) => void
  onPaneCardClick: (n: AppNotification) => (e: MouseEvent) => void
  onSnoozeChipClick: (
    text: string,
    at: number,
    payload: ReminderPayload | undefined,
    notifId: string
  ) => (e: MouseEvent) => void
  showRemindPicker: (anchor: HTMLElement, n: AppNotification) => void
}

export function buildNotificationCard(props: NotificationCardProps): HTMLElement {
  return new NotificationCardController(props).render()
}
