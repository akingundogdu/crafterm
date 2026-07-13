// Accounts screen UI copy.
export const Accounts = {
  copied: 'Copied',
  unavailable: 'Unavailable',
  show: 'Show',
  hide: 'Hide',
  notStored: '(not stored yet)',
  deleteTitle: 'Delete entry',
  deleteConfirm: 'Delete',
  filter: {
    all: 'All',
    accounts: 'Accounts',
    secrets: 'Secrets'
  },
  emptyNone: 'No accounts yet. Use the + buttons below to add an account or secret.',
  emptyNoMatches: 'No matches',
  form: {
    editTitle: (kind: string) => `Edit ${kind}`,
    newTitle: (kind: string) => `New ${kind}`,
    keyPlaceholder: 'key (e.g. api_token)',
    keepExisting: '(keep existing — type to replace)',
    newSecret: 'new secret value',
    value: 'value',
    cancel: 'Cancel',
    save: 'Save',
    add: 'Add',
    fields: 'Fields'
  }
} as const
