import { describe, it, expect } from 'vitest'
import {
  jsonToDoc,
  parseTodo,
  sectionBy,
  ensureSection,
  splitOrder,
  emptyDoc,
  type TodoFileJson
} from '@ui/screens/improve-crafterm/todo-doc'

const item = (text: string, status: string, priority = 0) => ({
  id: text,
  text,
  status,
  priority,
  createdAt: 0,
  updatedAt: 0
})

describe('jsonToDoc', () => {
  it('orders sections by sectionsOrder and sorts items by priority', () => {
    const file: TodoFileJson = {
      version: 1,
      preamble: '# Todo',
      sectionsOrder: ['Backlog', 'Done'],
      items: [item('b', 'Backlog', 1), item('a', 'Backlog', 0), item('d', 'Done')]
    }
    const doc = jsonToDoc(file)
    expect(doc.sections.map((s) => s.heading)).toEqual(['Backlog', 'Done'])
    expect(doc.sections[0].items).toEqual(['a', 'b'])
  })
  it('surfaces items with an unknown status under their own bucket', () => {
    const file: TodoFileJson = {
      version: 1,
      preamble: '',
      sectionsOrder: ['Backlog'],
      items: [item('x', 'Weird')]
    }
    const doc = jsonToDoc(file)
    expect(doc.sections.find((s) => s.heading === 'Weird')?.items).toEqual(['x'])
  })
})

describe('parseTodo', () => {
  it('splits preamble, headings, and bullets', () => {
    const doc = parseTodo('# Title\nintro\n## Backlog\n- one\n* two\n## Done\n- three')
    expect(doc.preamble).toBe('# Title\nintro')
    expect(doc.sections.map((s) => s.heading)).toEqual(['Backlog', 'Done'])
    expect(doc.sections[0].items).toEqual(['one', 'two'])
  })
  it('skips italic placeholder bullets', () => {
    const doc = parseTodo('## Backlog\n- _(nothing right now)_\n- real')
    expect(doc.sections[0].items).toEqual(['real'])
  })
})

describe('splitOrder', () => {
  it('peels a leading priority number', () => {
    expect(splitOrder('1. add a button')).toEqual({ num: '1', body: 'add a button' })
    expect(splitOrder('12) fix bug')).toEqual({ num: '12', body: 'fix bug' })
  })
  it('returns null num when unnumbered', () => {
    expect(splitOrder('plain task')).toEqual({ num: null, body: 'plain task' })
  })
})

describe('sectionBy / ensureSection', () => {
  it('finds a section by case-insensitive keyword', () => {
    const doc = emptyDoc()
    expect(sectionBy(doc, 'progress')?.heading).toBe('In progress')
  })
  it('ensureSection returns existing or appends a new one', () => {
    const doc = emptyDoc()
    const before = doc.sections.length
    expect(ensureSection(doc, 'in progress')).toBe(doc.sections[0])
    expect(doc.sections.length).toBe(before)
    ensureSection(doc, 'Brand New')
    expect(doc.sections.length).toBe(before + 1)
  })
})
