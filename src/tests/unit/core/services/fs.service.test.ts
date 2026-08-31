import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// fs:trash routes through electron's shell.trashItem; stub it so the unit test
// stays on a temp dir (and records what would have been trashed).
const trashed: string[] = []
vi.mock('electron', () => ({
  shell: { trashItem: vi.fn(async (p: string) => { trashed.push(p) }) },
  // Reached through paths.service (the pasted-images dir lives beside the state dir).
  app: { isPackaged: false }
}))

import * as fsService from '@core/services/fs/fs.service'

let base: string

beforeEach(() => {
  trashed.length = 0
  base = mkdtempSync(join(tmpdir(), 'fs-svc-test-'))
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

describe('fs.service listing', () => {
  it('lists entries with dirs sorted first', () => {
    mkdirSync(join(base, 'zdir'))
    writeFileSync(join(base, 'a.txt'), 'x')
    const { path, entries } = fsService.listEntries(base)
    expect(path).toBe(base)
    expect(entries.map((e) => `${e.isDir ? 'd' : 'f'}:${e.name}`)).toEqual(['d:zdir', 'f:a.txt'])
  })

  it('findFiles walks recursively, skipping excluded + dotfiles', () => {
    mkdirSync(join(base, 'src'))
    mkdirSync(join(base, 'node_modules'))
    writeFileSync(join(base, 'src', 'app.ts'), '')
    writeFileSync(join(base, 'node_modules', 'dep.js'), '')
    writeFileSync(join(base, '.hidden'), '')
    const { files } = fsService.findFiles(base)
    expect(files.map((f) => f.name)).toEqual(['app.ts'])
  })
})

describe('fs.service read/write', () => {
  it('readMd only reads markdown extensions', () => {
    writeFileSync(join(base, 'doc.md'), '# hi')
    writeFileSync(join(base, 'code.ts'), 'const x = 1')
    expect(fsService.readMd(join(base, 'doc.md'))).toBe('# hi')
    expect(fsService.readMd(join(base, 'code.ts'))).toBe('')
  })

  it('writeMd refuses non-markdown paths', () => {
    expect(fsService.writeMd(join(base, 'a.ts'), 'x')).toBe(false)
    expect(fsService.writeMd(join(base, 'a.md'), 'x')).toBe(true)
    expect(readFileSync(join(base, 'a.md'), 'utf8')).toBe('x')
  })

  it('readText caps size and rejects binary content', () => {
    writeFileSync(join(base, 'ok.txt'), 'hello')
    expect(fsService.readText(join(base, 'ok.txt'))).toEqual({ ok: true, text: 'hello' })

    writeFileSync(join(base, 'bin'), Buffer.from([104, 0, 105]))
    expect(fsService.readText(join(base, 'bin'))).toEqual({ ok: false, error: 'Binary file — cannot preview.' })

    expect(fsService.readText(join(base, 'nope'))).toEqual({ ok: false, error: 'File not found.' })
  })

  it('writeText only overwrites existing regular files', () => {
    expect(fsService.writeText(join(base, 'new.txt'), 'x')).toBe(false) // does not exist
    writeFileSync(join(base, 'ex.txt'), 'old')
    expect(fsService.writeText(join(base, 'ex.txt'), 'new')).toBe(true)
    expect(readFileSync(join(base, 'ex.txt'), 'utf8')).toBe('new')
  })
})

describe('fs.service mutations', () => {
  it('createFile/mkdir/rename refuse to clobber existing paths', () => {
    expect(fsService.createFile(join(base, 'f.txt'))).toBe(true)
    expect(fsService.createFile(join(base, 'f.txt'))).toBe(false)

    expect(fsService.mkdir(join(base, 'd'))).toBe(true)
    expect(fsService.mkdir(join(base, 'd'))).toBe(false)

    expect(fsService.rename(join(base, 'f.txt'), join(base, 'g.txt'))).toBe(true)
    expect(existsSync(join(base, 'g.txt'))).toBe(true)
    writeFileSync(join(base, 'h.txt'), '')
    expect(fsService.rename(join(base, 'g.txt'), join(base, 'h.txt'))).toBe(false) // dest exists
  })

  it('trash routes existing paths through shell.trashItem', async () => {
    writeFileSync(join(base, 't.txt'), '')
    expect(await fsService.trash(join(base, 't.txt'))).toBe(true)
    expect(trashed).toEqual([join(base, 't.txt')])
    expect(await fsService.trash(join(base, 'missing.txt'))).toBe(false)
  })
})

describe('fs.service resolution', () => {
  it('resolveFile finds a file against an ancestor dir', () => {
    mkdirSync(join(base, 'pkg', 'docs'), { recursive: true })
    writeFileSync(join(base, 'pkg', 'docs', 'x.md'), '')
    // cwd is deeper than where the relative path is rooted
    const found = fsService.resolveFile(join(base, 'pkg', 'docs'), 'docs/x.md')
    expect(found).toBe(join(base, 'pkg', 'docs', 'x.md'))
    expect(fsService.resolveFile(base, 'nope/missing.md')).toBeNull()
  })

  it('resolveImport probes extensions and finds a symbol line', () => {
    writeFileSync(join(base, 'from.ts'), '')
    writeFileSync(join(base, 'mod.ts'), 'const a = 1\nexport function target() {}\n')
    const r = fsService.resolveImport(join(base, 'from.ts'), './mod')
    expect(r).toEqual({ path: join(base, 'mod.ts'), line: 1 })

    const withSym = fsService.resolveImport(join(base, 'from.ts'), './mod', 'target')
    expect(withSym).toEqual({ path: join(base, 'mod.ts'), line: 2 })

    expect(fsService.resolveImport(join(base, 'from.ts'), 'react')).toBeNull() // bare module
  })
})

describe('fs.service pasted images', () => {
  const batches: string[] = []

  afterEach(() => {
    batches.splice(0).forEach((b) => rmSync(join(tmpdir(), 'crafterm-pasted-images', b), { recursive: true, force: true }))
  })

  function write(data: string, ext: string, name = 'image-1', batch = 'batch1'): string | null {
    if (!batches.includes(batch)) batches.push(batch)
    return fsService.writePastedImage(data, ext, name, batch)
  }

  it('writes the base64 bytes out as <batch>/<name>.<ext> under the pasted-images dir', () => {
    const path = write(Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'), 'png', 'image-2', 'batch1')

    expect(path).toBe(join(tmpdir(), 'crafterm-pasted-images', 'batch1', 'image-2.png'))
    expect([...readFileSync(path!)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('keeps each batch in its own dir, so the same name in a later ticket is a new file', () => {
    const first = write('AAAA', 'png', 'image-1', 'batch1')
    const second = write('AAAA', 'png', 'image-1', 'batch2')

    expect(first).not.toBe(second)
    expect(existsSync(first!)).toBe(true)
    expect(existsSync(second!)).toBe(true)
  })

  it('strips anything that could climb out of the dir from the name, batch and extension', () => {
    const path = write('AAAA', '../../etc/passwd', '../../../evil', '../escape')

    expect(path).toBe(join(tmpdir(), 'crafterm-pasted-images', 'escape', 'evil.png'))
    batches.push('escape')
  })

  it('falls back when the name or batch strips down to nothing', () => {
    expect(write('AAAA', 'png', '///', '...')).toBe(
      join(tmpdir(), 'crafterm-pasted-images', 'batch', 'image.png')
    )
    batches.push('batch')
  })

  it('drops an empty payload', () => {
    expect(fsService.writePastedImage('', 'png', 'image-1', 'batch1')).toBeNull()
  })
})
