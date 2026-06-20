// User-facing copy for the Database screen (sidebar Database mode + connection form).
export const Database = {
  menu: {
    newConnection: 'New connection…',
    newFolder: 'New folder…',
    rename: 'Rename…',
    delete: 'Delete',
    newQuery: 'New query',
    editConnection: 'Edit connection…',
    preview: 'Preview (SELECT *)',
    open: 'Open'
  },
  fieldName: 'Name',
  renameTitle: 'Rename',
  renameConfirm: 'Rename',
  newFolderTitle: 'New folder',
  newProjectTitle: 'New project',
  createConfirm: 'Create',
  emptyHint: 'No connections. Add a project, then a connection.',
  engines: { postgres: 'PostgreSQL', mysql: 'MySQL' },
  fields: { host: 'Host', port: 'Port', user: 'User', password: 'Password', database: 'Database' },
  ph: {
    name: 'movve-db-production',
    host: 'localhost',
    port: '5432 / 3306',
    user: 'postgres',
    password: '••••••••',
    database: 'mydb',
    file: '~/path/to/db.sqlite'
  },
  testing: 'Testing…',
  connected: 'Connected ✓',
  failed: (e?: string): string => `Failed: ${e ?? ''}`,
  save: 'Save',
  add: 'Add',
  editHeading: 'Edit connection',
  newHeading: 'New connection'
} as const
