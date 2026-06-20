// Shared color palettes for the Monaco code + SQL editors. Monaco themes are
// built from these in monacoSetup.ts; keeping the data here lets both editors
// (and the theme picker) stay in sync.

export interface EditorThemePalette {
  bg: string
  text: string
  keyword: string
  string: string
  number: string
  comment: string
  operator: string
  identifier: string
  function: string
  bool: string
  type: string // types, classes, tag names
  property: string // object/struct properties, attributes
  meta: string // decorators/annotations (@main, @State), preprocessor
}

export const PALETTES: Record<string, EditorThemePalette> = {
  Default: {
    bg: 'var(--bg-term)',
    text: 'var(--text)',
    keyword: '#ff7b72',
    string: '#a5d6ff',
    number: '#79c0ff',
    comment: '#8b949e',
    operator: '#ff7b72',
    identifier: '#e8edf4',
    function: '#d2a8ff',
    bool: '#79c0ff',
    type: '#ffa657',
    property: '#79c0ff',
    meta: '#d2a8ff'
  },
  'One Dark': {
    bg: '#282c34',
    text: '#abb2bf',
    keyword: '#c678dd',
    string: '#98c379',
    number: '#d19a66',
    comment: '#7f848e',
    operator: '#56b6c2',
    identifier: '#abb2bf',
    function: '#61afef',
    bool: '#d19a66',
    type: '#e5c07b',
    property: '#e06c75',
    meta: '#61afef'
  },
  Dracula: {
    bg: '#282a36',
    text: '#f8f8f2',
    keyword: '#ff79c6',
    string: '#f1fa8c',
    number: '#bd93f9',
    comment: '#6272a4',
    operator: '#ff79c6',
    identifier: '#f8f8f2',
    function: '#50fa7b',
    bool: '#bd93f9',
    type: '#8be9fd',
    property: '#ffb86c',
    meta: '#ff79c6'
  },
  'GitHub Dark': {
    bg: '#0d1117',
    text: '#e6edf3',
    keyword: '#ff7b72',
    string: '#a5d6ff',
    number: '#79c0ff',
    comment: '#8b949e',
    operator: '#ff7b72',
    identifier: '#e6edf3',
    function: '#d2a8ff',
    bool: '#79c0ff',
    type: '#ffa657',
    property: '#79c0ff',
    meta: '#d2a8ff'
  }
}

export const EDITOR_THEME_NAMES = Object.keys(PALETTES)
export const DEFAULT_EDITOR_THEME = 'Default'
