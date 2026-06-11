import { EditorView, basicSetup } from 'codemirror'
import { keymap } from '@codemirror/view'
import { EditorState, Compartment, Prec, type Extension } from '@codemirror/state'
import { sql, PostgreSQL, MySQL, SQLite, type SQLDialect } from '@codemirror/lang-sql'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { DbEngine } from './types'

// CodeMirror 6 SQL editor with dialect-aware highlighting, keyword/schema
// autocomplete (IntelliSense), and a swappable color theme (toolbar picker).

function dialectOf(e: DbEngine): SQLDialect {
  return e === 'mysql' ? MySQL : e === 'sqlite' ? SQLite : PostgreSQL
}

// ---- Theme palettes -------------------------------------------------------
// Each entry pairs a CodeMirror EditorView.theme (chrome: bg, gutter, caret,
// selection) with a HighlightStyle (token colors: keyword/string/number/…).

interface SqlThemePalette {
  bg: string
  text: string
  caret: string
  selection: string
  gutterText: string
  activeLine: string
  keyword: string
  string: string
  number: string
  comment: string
  operator: string
  identifier: string
  function: string
  bool: string
}

const PALETTES: Record<string, SqlThemePalette> = {
  Default: {
    bg: 'var(--bg-term)',
    text: 'var(--text)',
    caret: 'var(--accent)',
    selection: 'rgba(88,166,255,0.28)',
    gutterText: 'var(--text-faint)',
    activeLine: 'rgba(255,255,255,0.035)',
    keyword: '#ff7b72',
    string: '#a5d6ff',
    number: '#79c0ff',
    comment: '#8b949e',
    operator: '#ff7b72',
    identifier: '#e8edf4',
    function: '#d2a8ff',
    bool: '#79c0ff'
  },
  'One Dark': {
    bg: '#282c34',
    text: '#abb2bf',
    caret: '#528bff',
    selection: 'rgba(82,139,255,0.28)',
    gutterText: '#5c6370',
    activeLine: 'rgba(255,255,255,0.04)',
    keyword: '#c678dd',
    string: '#98c379',
    number: '#d19a66',
    comment: '#7f848e',
    operator: '#56b6c2',
    identifier: '#abb2bf',
    function: '#61afef',
    bool: '#d19a66'
  },
  Dracula: {
    bg: '#282a36',
    text: '#f8f8f2',
    caret: '#ff79c6',
    selection: 'rgba(255,121,198,0.28)',
    gutterText: '#6272a4',
    activeLine: 'rgba(255,255,255,0.05)',
    keyword: '#ff79c6',
    string: '#f1fa8c',
    number: '#bd93f9',
    comment: '#6272a4',
    operator: '#ff79c6',
    identifier: '#f8f8f2',
    function: '#50fa7b',
    bool: '#bd93f9'
  },
  'GitHub Dark': {
    bg: '#0d1117',
    text: '#e6edf3',
    caret: '#58a6ff',
    selection: 'rgba(88,166,255,0.28)',
    gutterText: '#6e7681',
    activeLine: 'rgba(110,118,129,0.1)',
    keyword: '#ff7b72',
    string: '#a5d6ff',
    number: '#79c0ff',
    comment: '#8b949e',
    operator: '#ff7b72',
    identifier: '#e6edf3',
    function: '#d2a8ff',
    bool: '#79c0ff'
  }
}

export const SQL_THEME_NAMES = Object.keys(PALETTES)
export const DEFAULT_SQL_THEME = 'Default'

function buildThemeExtension(p: SqlThemePalette): Extension {
  const editorTheme = EditorView.theme(
    {
      '&': { backgroundColor: p.bg, color: p.text, height: '100%' },
      '.cm-scroller': {
        fontFamily: 'var(--mono, Menlo, Monaco, monospace)',
        fontSize: '13px',
        lineHeight: '1.6'
      },
      '.cm-content': { caretColor: p.caret },
      '.cm-gutters': { backgroundColor: 'transparent', color: p.gutterText, border: 'none' },
      '.cm-activeLine': { backgroundColor: p.activeLine },
      '.cm-activeLineGutter': { backgroundColor: p.activeLine },
      '&.cm-focused': { outline: 'none' },
      '.cm-cursor': { borderLeftColor: p.caret },
      '.cm-selectionBackground, .cm-content ::selection': { backgroundColor: p.selection },
      '&.cm-focused .cm-selectionBackground': { backgroundColor: p.selection },
      '.cm-tooltip': {
        backgroundColor: 'var(--bg)',
        border: '1px solid var(--border-strong)',
        borderRadius: '8px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)'
      },
      '.cm-tooltip-autocomplete > ul': {
        fontFamily: 'var(--mono, Menlo, monospace)',
        fontSize: '12px'
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: 'var(--accent-soft)',
        color: 'var(--text)'
      },
      '.cm-completionIcon': { opacity: '0.6' }
    },
    { dark: true }
  )
  const highlight = HighlightStyle.define([
    { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.modifier], color: p.keyword, fontWeight: '600' },
    { tag: [t.string, t.special(t.string)], color: p.string },
    { tag: [t.number, t.integer, t.float], color: p.number },
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: p.comment, fontStyle: 'italic' },
    { tag: [t.operator, t.compareOperator, t.arithmeticOperator, t.logicOperator], color: p.operator },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: p.function },
    { tag: [t.bool, t.null], color: p.bool },
    { tag: [t.variableName, t.propertyName, t.typeName], color: p.identifier },
    { tag: t.punctuation, color: p.text }
  ])
  return [editorTheme, syntaxHighlighting(highlight)]
}

function themeExtensionByName(name: string): Extension {
  return buildThemeExtension(PALETTES[name] ?? PALETTES[DEFAULT_SQL_THEME])
}

export interface SqlEditor {
  view: EditorView
  getValue(): string
  setSchema(engine: DbEngine, schema: Record<string, string[]>): void
  setTheme(name: string): void
  focus(): void
}

export function createSqlEditor(opts: {
  parent: HTMLElement
  doc: string
  engine: DbEngine
  themeName?: string
  onRun: () => void
}): SqlEditor {
  const langConf = new Compartment()
  const themeConf = new Compartment()
  const view = new EditorView({
    parent: opts.parent,
    state: EditorState.create({
      doc: opts.doc,
      extensions: [
        // Cmd/Ctrl+Enter runs the query (wins over default bindings).
        Prec.highest(
          keymap.of([
            {
              key: 'Mod-Enter',
              preventDefault: true,
              run: () => {
                opts.onRun()
                return true
              }
            }
          ])
        ),
        basicSetup,
        themeConf.of(themeExtensionByName(opts.themeName ?? DEFAULT_SQL_THEME)),
        langConf.of(sql({ dialect: dialectOf(opts.engine), upperCaseKeywords: true }))
      ]
    })
  })
  return {
    view,
    getValue: () => view.state.doc.toString(),
    setSchema: (engine, schema) => {
      view.dispatch({
        effects: langConf.reconfigure(
          sql({ dialect: dialectOf(engine), schema, upperCaseKeywords: true })
        )
      })
    },
    setTheme: (name) => {
      view.dispatch({ effects: themeConf.reconfigure(themeExtensionByName(name)) })
    },
    focus: () => view.focus()
  }
}
