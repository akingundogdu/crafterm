// Reminders screen UI copy.
export const Reminders = {
  notifyTitle: 'Reminder',
  empty: 'No reminders',
  pastSection: 'Past reminders',
  card: {
    remindAgain: 'Remind again',
    edit: 'Edit',
    delete: 'Delete'
  },
  remindModalTitle: 'Remind me about this',
  defaultBookmarkTitle: 'Bookmark',
  defaultTaskTitle: 'Task',
  form: {
    editTitle: 'Edit reminder',
    newTitle: 'New reminder',
    remindAgainTitle: 'Remind again',
    textPlaceholder: 'e.g. Stand-up meeting',
    cancel: 'Cancel',
    save: 'Save',
    add: 'Add',
    remindAgain: 'Remind again',
    labelWhen: 'When',
    labelReminder: 'Reminder',
    labelType: 'Type',
    labelRepeat: 'Repeat',
    type: {
      normal: 'Reminder only',
      bookmark: 'Bookmark',
      link: 'Link',
      dailyTask: 'Daily task'
    },
    repeat: {
      none: 'No repeat',
      daily: 'Daily',
      weekly: 'Weekly',
      biweekly: 'Every 2 weeks',
      monthly: 'Monthly',
      interval: 'Every N minutes'
    }
  }
} as const
