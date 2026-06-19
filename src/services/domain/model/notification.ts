import { z } from 'zod'
import { reminderPayloadSchema } from './reminder'

// Notification — mirrors `NotificationMeta` + `AppNotification` in types.ts
// exactly (HR-1). Persisted capped at the last 24h / 50 entries.

export const notificationMetaSchema = z.object({
  kind: z.enum(['pane', 'reminder']).optional(),
  event: z.enum(['question', 'done']).optional(),
  branch: z.string().nullable().optional(),
  worktree: z.string().nullable().optional(),
  cwd: z.string().nullable().optional(),
  reminderText: z.string().optional(),
  projectColor: z.string().optional(),
  payload: reminderPayloadSchema.optional()
})

export const appNotificationSchema = notificationMetaSchema.extend({
  id: z.string(),
  paneId: z.string(),
  title: z.string(),
  group: z.string(),
  message: z.string(),
  time: z.number()
})

export type NotificationMeta = z.infer<typeof notificationMetaSchema>
export type AppNotification = z.infer<typeof appNotificationSchema>
