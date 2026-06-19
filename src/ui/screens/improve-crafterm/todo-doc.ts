// Pure model + transforms for the improve-crafterm todo store. The backing file
// is JSON (todo-list.json); the working model is a section-based TodoDoc. These
// helpers expand/flatten/parse with no state/IPC/DOM, so they unit-test cleanly.

export interface Section {
  heading: string
  items: string[]
}
export interface TodoDoc {
  preamble: string
  sections: Section[]
}

export interface TodoItemJson {
  id: string
  text: string
  status: string // section heading the item lives under
  priority: number // order within its status bucket
  createdAt: number
  updatedAt: number
}
export interface TodoFileJson {
  version: 1
  preamble: string
  sectionsOrder: string[]
  items: TodoItemJson[]
}

export const DEFAULT_SECTIONS = ['In progress', 'Ready to test', 'Backlog', 'Done']

export function emptyDoc(): TodoDoc {
  return {
    preamble: '# crafterm — Todo List',
    sections: [
      { heading: 'In progress', items: [] },
      { heading: 'Backlog', items: [] },
      { heading: 'Done', items: [] }
    ]
  }
}

// Expand a parsed JSON file into the section-based working model.
export function jsonToDoc(file: TodoFileJson): TodoDoc {
  const order = file.sectionsOrder?.length ? file.sectionsOrder : DEFAULT_SECTIONS
  const sections: Section[] = order.map((heading) => ({
    heading,
    items: file.items
      .filter((it) => it.status === heading)
      .sort((a, b) => a.priority - b.priority)
      .map((it) => it.text)
  }))
  // Surface any items whose status isn't in the known order under their own bucket.
  for (const it of file.items) {
    if (!order.includes(it.status)) {
      let s = sections.find((x) => x.heading === it.status)
      if (!s) {
        s = { heading: it.status, items: [] }
        sections.push(s)
      }
      s.items.push(it.text)
    }
  }
  return { preamble: file.preamble || emptyDoc().preamble, sections }
}

const SECTION_RE = /^##\s+(.*)$/
const BULLET_RE = /^\s*[*-]\s+(.+?)\s*$/

export function parseTodo(raw: string): TodoDoc {
  const lines = raw.split('\n')
  let i = 0
  const pre: string[] = []
  while (i < lines.length && !SECTION_RE.test(lines[i])) pre.push(lines[i++])
  const sections: Section[] = []
  let cur: Section | null = null
  for (; i < lines.length; i++) {
    const head = lines[i].match(SECTION_RE)
    if (head) {
      cur = { heading: head[1].trim(), items: [] }
      sections.push(cur)
      continue
    }
    const bullet = lines[i].match(BULLET_RE)
    if (bullet && cur) {
      const text = bullet[1].trim()
      // skip italic placeholders like _(nothing right now)_
      if (text && !/^_.*_$/.test(text)) cur.items.push(text)
    }
  }
  return { preamble: pre.join('\n'), sections }
}

export function sectionBy(doc: TodoDoc, kw: string): Section | undefined {
  return doc.sections.find((s) => s.heading.toLowerCase().includes(kw))
}

export function ensureSection(doc: TodoDoc, heading: string): Section {
  const found = doc.sections.find((s) => s.heading.toLowerCase() === heading.toLowerCase())
  if (found) return found
  const s: Section = { heading, items: [] }
  doc.sections.push(s)
  return s
}

// Items carry a leading priority number in the file (e.g. "1. add a button").
// We surface that number as a badge and show the rest as the readable text.
export function splitOrder(text: string): { num: string | null; body: string } {
  const m = text.match(/^(\d+)[.)]\s+(.+)$/s)
  if (m) return { num: m[1], body: m[2].trim() }
  return { num: null, body: text }
}
