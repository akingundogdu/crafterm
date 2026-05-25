import { EditorView, basicSetup } from 'codemirror'
import { keymap } from '@codemirror/view'
import { EditorState, Compartment, Prec } from '@codemirror/state'
import { sql, PostgreSQL, MySQL, SQLite, type SQLDialect } from '@codemirror/lang-sql'
import type { DbEngine } from './types'

// CodeMirror 6 SQL editor: dialect-aware highlighting + keyword/schema
// autocomplete (IntelliSense). Themed to match the app's dark palette.

function dialectOf(e: DbEngine): SQLDialect {
  return e === 'mysql' ? MySQL : e === 'sqlite' ? SQLite : PostgreSQL
}

const theme = EditorView.theme(
  {
    '&': { backgroundColor: 'transparent', color: 'var(--text)', height: '100%' },
    '.cm-scroller': {
      fontFamily: 'var(--mono, Menlo, Monaco, monospace)',
      fontSize: '13px',
      lineHeight: '1.6'
    },
    '.cm-content': { caretColor: 'var(--accent)' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--text-faint)',
      border: 'none'
    },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.035)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,0.035)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor': { borderLeftColor: 'var(--accent)' },
    '.cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'rgba(88,166,255,0.28)'
    },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(88,166,255,0.28)' },
    '.cm-tooltip': {
      backgroundColor: 'var(--bg)',
      border: '1px solid var(--border-strong)',
      borderRadius: '8px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.45)'
    },
    '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--mono, Menlo, monospace)', fontSize: '12px' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: 'var(--accent-soft)',
      color: 'var(--text)'
    },
    '.cm-completionIcon': { opacity: '0.6' }
  },
  { dark: true }
)

export interface SqlEditor {
  view: EditorView
  getValue(): string
  setSchema(engine: DbEngine, schema: Record<string, string[]>): void
  focus(): void
}

export function createSqlEditor(opts: {
  parent: HTMLElement
  doc: string
  engine: DbEngine
  onRun: () => void
}): SqlEditor {
  const langConf = new Compartment()
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
        theme,
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
    focus: () => view.focus()
  }
}
