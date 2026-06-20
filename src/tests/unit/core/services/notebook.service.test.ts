import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import * as notebook from '@core/services/notebook/notebook.service'

let base: string

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'notebook-test-'))
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

describe('notebook.service path resolution', () => {
  it('resolves a relative path inside the base', () => {
    expect(notebook.resolve(base, 'a/b.md')).toBe(join(base, 'a/b.md'))
    expect(notebook.resolve(base, '')).toBe(base)
  })

  it('rejects traversal outside the base', () => {
    expect(notebook.resolve(base, '../escape.md')).toBeNull()
    expect(notebook.resolve(base, '../../etc/passwd')).toBeNull()
  })
})

describe('notebook.service tree', () => {
  it('walks dirs and md files, hides dotfiles + non-markdown, dirs sort first', () => {
    mkdirSync(join(base, 'sub'), { recursive: true })
    writeFileSync(join(base, 'sub', 'nested.md'), '# n')
    writeFileSync(join(base, 'note.md'), '# a')
    writeFileSync(join(base, 'readme.mdx'), 'x')
    writeFileSync(join(base, 'ignore.txt'), 'nope')
    writeFileSync(join(base, '.hidden.md'), 'secret')

    const tree = notebook.tree(base)
    expect(tree.map((n) => `${n.kind}:${n.name}`)).toEqual(['dir:sub', 'file:note.md', 'file:readme.mdx'])

    const sub = tree[0]
    expect(sub.children?.map((n) => n.name)).toEqual(['nested.md'])
    expect(sub.children?.[0].path).toBe(join('sub', 'nested.md'))
  })

  it('returns an empty list for a missing dir', () => {
    expect(notebook.tree(join(base, 'does-not-exist'))).toEqual([])
  })
})

describe('notebook.service operations', () => {
  it('create defaults to .md and write/read round-trips', () => {
    expect(notebook.create(base, 'folder/idea')).toBe(true)
    expect(existsSync(join(base, 'folder/idea.md'))).toBe(true)

    notebook.write(base, 'folder/idea.md', 'hello world')
    expect(notebook.read(base, 'folder/idea.md')).toBe('hello world')
  })

  it('read returns empty string for a missing note', () => {
    expect(notebook.read(base, 'nope.md')).toBe('')
  })

  it('rename keeps the file in its parent folder', () => {
    notebook.create(base, 'folder/old')
    expect(notebook.rename(base, 'folder/old.md', 'new.md')).toBe(true)
    expect(existsSync(join(base, 'folder/new.md'))).toBe(true)
    expect(existsSync(join(base, 'folder/old.md'))).toBe(false)
  })

  it('move relocates into a target folder and rejects collisions + self-descendant', () => {
    mkdirSync(join(base, 'src'), { recursive: true })
    writeFileSync(join(base, 'src', 'doc.md'), 'x')
    mkdirSync(join(base, 'dest'), { recursive: true })

    expect(notebook.move(base, 'src/doc.md', 'dest')).toBe(true)
    expect(existsSync(join(base, 'dest/doc.md'))).toBe(true)

    // collision: another doc.md already in dest
    writeFileSync(join(base, 'src2.md'), 'y')
    writeFileSync(join(base, 'dest', 'src2.md'), 'z')
    expect(notebook.move(base, 'src2.md', 'dest')).toBe(false)

    // moving a folder into its own descendant is rejected
    mkdirSync(join(base, 'parent/child'), { recursive: true })
    expect(notebook.move(base, 'parent', 'parent/child')).toBe(false)
  })

  it('mkdir creates a folder; delete removes paths but never the base root', () => {
    expect(notebook.mkdir(base, 'deep/folder')).toBe(true)
    expect(existsSync(join(base, 'deep/folder'))).toBe(true)

    notebook.create(base, 'deep/folder/n')
    expect(notebook.del(base, 'deep/folder')).toBe(true)
    expect(existsSync(join(base, 'deep/folder'))).toBe(false)

    // guard: deleting the root ('' resolves to base) is refused
    expect(notebook.del(base, '')).toBe(false)
    expect(existsSync(base)).toBe(true)
  })

  it('refuses to write or read outside the base', () => {
    notebook.write(base, '../escape.md', 'leak')
    expect(existsSync(join(base, '..', 'escape.md'))).toBe(false)
    expect(notebook.read(base, '../escape.md')).toBe('')
  })
})
