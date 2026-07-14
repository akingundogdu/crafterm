import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '@views/markdown/markdown'

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

  // A rendered document is untrusted: it can come from any cloned repo. A URL must never be
  // able to close its attribute and add an event handler, nor carry an executable scheme.
  it('does not let an image or link URL break out of its attribute', () => {
    // The quote makes it fail the scheme allowlist, so the URL is dropped outright.
    expect(renderMarkdown('![x](a"onerror=alert`1`)')).not.toContain('onerror=')
    expect(renderMarkdown('[x](a"onmouseover=alert`1`)')).not.toContain('onmouseover=')

    // A quote inside an otherwise allowed URL is escaped, so the payload stays inert text
    // inside the attribute value instead of closing it and becoming a handler.
    const ok = renderMarkdown('[x](https://ok.dev/a"onmouseover=alert)')
    expect(ok).toContain('&quot;')
    expect(ok).not.toContain('" onmouseover')
    expect(ok).not.toMatch(/<a[^>]*\son\w+=/)
  })

  it('drops executable URL schemes but keeps ordinary ones', () => {
    expect(renderMarkdown('[x](javascript:alert(1))')).toContain('href=""')
    expect(renderMarkdown('[x](JaVaScRiPt:alert(1))')).toContain('href=""')
    expect(renderMarkdown('![x](data:text/html;base64,PHN2Zz4=)')).toContain('src=""')

    expect(renderMarkdown('[x](https://ok.dev)')).toContain('href="https://ok.dev"')
    expect(renderMarkdown('[x](./notes/a.md)')).toContain('href="./notes/a.md"')
    expect(renderMarkdown('[x](#anchor)')).toContain('href="#anchor"')
    expect(renderMarkdown('[x](mailto:a@b.dev)')).toContain('href="mailto:a@b.dev"')
  })

  it('escapes quotes in an image alt text', () => {
    expect(renderMarkdown('![a"b](x.png)')).toContain('alt="a&quot;b"')
  })

  it('returns an empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('')
  })
})
