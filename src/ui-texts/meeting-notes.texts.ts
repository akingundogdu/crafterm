// Meeting Notes screen — user-facing copy.
export const MeetingNotes = {
  title: 'Meeting Notes',
  newMeeting: '+ New meeting',
  empty: 'No meeting notes yet.',
  noProjectGroup: 'No project',
  untitled: '(untitled)',
  archived: (n: number) => `Archived (${n})`,
  card: {
    remind: 'Remind me',
    archive: 'Archive',
    unarchive: 'Unarchive',
    delete: 'Delete',
    remindSubjectFallback: 'meeting note',
    deleteNameFallback: 'untitled',
    deleteTitle: 'Delete meeting note',
    deleteConfirm: (name: string) => `Delete "${name}"?`,
    deleteConfirmText: 'Delete'
  },
  form: {
    editTitle: 'Edit meeting note',
    newTitle: 'New meeting note',
    save: 'Save',
    subjectPlaceholder: 'Meeting subject',
    attendeesPlaceholder: 'Alice, Bob, Carol',
    noneOption: '— None —',
    notesPlaceholder: 'Agenda, decisions, action items…',
    fieldTitle: 'Title',
    fieldDate: 'Date',
    fieldAttendees: 'Attendees',
    fieldProject: 'Project',
    fieldNotes: 'Notes',
    attendeesHint: '(comma separated)',
    projectHint: '(optional)'
  }
} as const
