import { describe, it, expect } from 'vitest'
import { iconCategory, iconFor, FOLDER_SVG } from '@ui/screens/explorer/file-icons'

describe('iconCategory', () => {
  it('maps known extensions to their category', () => {
    expect(iconCategory('app.ts')).toBe('ts')
    expect(iconCategory('app.tsx')).toBe('ts')
    expect(iconCategory('main.js')).toBe('js')
    expect(iconCategory('data.json')).toBe('json')
    expect(iconCategory('README.md')).toBe('md')
    expect(iconCategory('index.html')).toBe('web')
    expect(iconCategory('run.sh')).toBe('sh')
    expect(iconCategory('config.yaml')).toBe('data')
    expect(iconCategory('logo.png')).toBe('img')
    expect(iconCategory('main.py')).toBe('py')
    expect(iconCategory('app.swift')).toBe('swift')
    expect(iconCategory('lib.rs')).toBe('rust')
  })

  it('matches is case-insensitive on the extension', () => {
    expect(iconCategory('APP.TS')).toBe('ts')
    expect(iconCategory('Photo.JPG')).toBe('img')
  })

  it('maps special config filenames without a normal extension', () => {
    expect(iconCategory('Dockerfile')).toBe('config')
    expect(iconCategory('dockerfile.dev')).toBe('config')
    expect(iconCategory('.env')).toBe('config')
    expect(iconCategory('.env.local')).toBe('config')
    expect(iconCategory('.gitignore')).toBe('config')
    expect(iconCategory('Makefile')).toBe('config')
  })

  it('falls back to default for unknown names', () => {
    expect(iconCategory('mystery')).toBe('default')
    expect(iconCategory('archive.zip')).toBe('default')
  })
})

describe('iconFor', () => {
  it('returns a category glyph for known types and a generic outline otherwise', () => {
    expect(iconFor('app.ts')).toContain('<svg')
    // unknown type falls back to the generic file outline (distinct from a folder)
    const generic = iconFor('mystery')
    expect(generic).toContain('<svg')
    expect(generic).not.toBe(FOLDER_SVG)
  })
})
