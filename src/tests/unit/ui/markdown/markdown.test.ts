import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '@ui/markdown/markdown'

// Pure string → HTML renderer (no DOM). Asserts stable substrings (whitespace may
// vary) + the HTML-escaping / XSS-safety contract.
describe('renderMarkdown', () => {
  it('renders headings with a data-mdline', () => {
    expect(renderMarkdown('# Hello')).toContain('<h1 data-mdline="1">Hello</h1>')
    expect(renderMarkdown('### Sub')).toContain('<h3 data-mdline="1">Sub</h3>')
  })

  it('renders inline emphasis, code, and strikethrough', () => {
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>')
    expect(renderMarkdown('*it*')).toContain('<em>it</em>')
    expect(renderMarkdown('`code`')).toContain('<code>code</code>')
    expect(renderMarkdown('~~gone~~')).toContain('<del>gone</del>')
  })

  it('renders links and images', () => {
    expect(renderMarkdown('[t](http://x.com)')).toContain('<a href="http://x.com" rel="noreferrer">t</a>')
    expect(renderMarkdown('![alt](img.png)')).toContain('<img src="img.png" alt="alt" />')
  })

  it('renders ordered and unordered lists', () => {
    const ul = renderMarkdown('- a\n- b')
    expect(ul).toContain('<ul>')
    expect(ul).toContain('<li data-mdline="1">a</li>')
    expect(ul).toContain('<li data-mdline="2">b</li>')
    expect(renderMarkdown('1. one')).toContain('<ol>')
  })

  it('renders task-list items (checked / unchecked)', () => {
    expect(renderMarkdown('- [x] done')).toContain('checked')
    const todo = renderMarkdown('- [ ] todo')
    expect(todo).toContain('type="checkbox"')
    expect(todo).not.toContain('checked')
  })

  it('renders blockquote, hr, fenced code, and table', () => {
    expect(renderMarkdown('> quote')).toContain('<blockquote data-mdline="1">quote</blockquote>')
    expect(renderMarkdown('---')).toContain('<hr data-mdline="1" />')
    expect(renderMarkdown('```\nx=1\n```')).toContain('<pre data-mdline="1"><code>x=1</code></pre>')
    const table = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |')
    expect(table).toContain('<table')
    expect(table).toContain('<th>a</th>')
    expect(table).toContain('<td>1</td>')
  })

  it('escapes HTML and is XSS-safe', () => {
    const out = renderMarkdown('<script>alert(1)</script>')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
    expect(renderMarkdown('a & b')).toContain('a &amp; b')
  })

  it('returns an empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('')
  })
})
