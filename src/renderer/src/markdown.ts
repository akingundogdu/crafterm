// Minimal, dependency-free Markdown → HTML renderer (headings, lists, task
// lists, code, blockquotes, hr, GFM tables, images, bold/italic/strike/code/
// links). Intentionally simple.

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// inline formatting on an already HTML-escaped string
function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" />') // images before links
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>')
}

// A GFM table separator row, e.g. `| --- | :--: | ---: |`.
function isTableSep(line: string): boolean {
  const t = line.trim()
  if (!t.includes('-')) return false
  return /^\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?$/.test(t)
}

// Split a `| a | b |` row into trimmed cells (outer pipes optional).
function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

function alignFor(sep: string): '' | 'left' | 'center' | 'right' {
  const s = sep.trim()
  const l = s.startsWith(':')
  const r = s.endsWith(':')
  if (l && r) return 'center'
  if (r) return 'right'
  if (l) return 'left'
  return ''
}

// Build a <table> from the header row at `start` (separator at start+1).
// Returns the HTML and the index of the last consumed line.
function parseTable(lines: string[], start: number): { html: string; end: number } {
  const headers = splitRow(lines[start])
  const aligns = splitRow(lines[start + 1]).map(alignFor)
  let i = start + 2
  const bodyRows: string[][] = []
  for (; i < lines.length; i++) {
    const l = lines[i]
    if (!l.trim() || !l.includes('|')) break
    bodyRows.push(splitRow(l))
  }
  const style = (idx: number): string => (aligns[idx] ? ` style="text-align:${aligns[idx]}"` : '')
  const thead =
    '<thead><tr>' +
    headers.map((h, idx) => `<th${style(idx)}>${inline(esc(h))}</th>`).join('') +
    '</tr></thead>'
  const tbody =
    '<tbody>' +
    bodyRows
      .map(
        (row) =>
          '<tr>' +
          headers.map((_, idx) => `<td${style(idx)}>${inline(esc(row[idx] ?? ''))}</td>`).join('') +
          '</tr>'
      )
      .join('') +
    '</tbody>'
  return { html: `<table>${thead}${tbody}</table>`, end: i - 1 }
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let listType: 'ul' | 'ol' | null = null
  const listBuf: string[] = []
  let inCode = false
  let codeBuf: string[] = []
  let codeStart = 0

  const flushList = (): void => {
    if (listType) {
      out.push(`<${listType}>${listBuf.join('')}</${listType}>`)
      listBuf.length = 0
      listType = null
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    // fenced code blocks
    const fence = raw.match(/^```/)
    if (fence) {
      if (inCode) {
        out.push(`<pre data-mdline="${codeStart + 1}"><code>${esc(codeBuf.join('\n'))}</code></pre>`)
        codeBuf = []
        inCode = false
      } else {
        flushList()
        inCode = true
        codeStart = i
      }
      continue
    }
    if (inCode) {
      codeBuf.push(raw)
      continue
    }

    const line = raw.trimEnd()
    if (!line.trim()) {
      flushList()
      continue
    }

    // GFM table: a `|` row immediately followed by a separator row.
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushList()
      const { html, end } = parseTable(lines, i)
      out.push(html.replace('<table>', `<table data-mdline="${i + 1}">`))
      i = end
      continue
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      flushList()
      const lvl = h[1].length
      out.push(`<h${lvl} data-mdline="${i + 1}">${inline(esc(h[2]))}</h${lvl}>`)
      continue
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushList()
      out.push(`<hr data-mdline="${i + 1}" />`)
      continue
    }
    if (/^>\s?/.test(line)) {
      flushList()
      out.push(
        `<blockquote data-mdline="${i + 1}">${inline(esc(line.replace(/^>\s?/, '')))}</blockquote>`
      )
      continue
    }
    const ul = line.match(/^\s*[-*+]\s+(.*)$/)
    const ol = line.match(/^\s*\d+\.\s+(.*)$/)
    if (ul || ol) {
      const t = ul ? 'ul' : 'ol'
      if (listType && listType !== t) flushList()
      listType = t
      const item = (ul ?? ol)![1]
      const task = item.match(/^\[([ xX])\]\s+(.*)$/)
      if (task) {
        const checked = task[1].toLowerCase() === 'x' ? ' checked' : ''
        listBuf.push(
          `<li class="task" data-mdline="${i + 1}"><input type="checkbox" disabled${checked} /> ${inline(esc(task[2]))}</li>`
        )
      } else {
        listBuf.push(`<li data-mdline="${i + 1}">${inline(esc(item))}</li>`)
      }
      continue
    }

    flushList()
    out.push(`<p data-mdline="${i + 1}">${inline(esc(line))}</p>`)
  }
  if (inCode) out.push(`<pre><code>${esc(codeBuf.join('\n'))}</code></pre>`)
  flushList()
  return out.join('\n')
}
