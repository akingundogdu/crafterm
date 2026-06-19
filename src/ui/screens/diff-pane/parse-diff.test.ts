import { describe, it, expect } from 'vitest'
import { parseDiff } from './parse-diff'

const patch = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 context one
-removed line
+added line
+second added
 context two
diff --git a/src/b.ts b/src/b.ts
new file mode 100644
--- /dev/null
+++ b/src/b.ts
@@ -0,0 +1,2 @@
+brand new
+another`

describe('parseDiff', () => {
  it('splits the patch into one section per file', () => {
    const files = parseDiff(patch)
    expect(files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('classifies rows and tracks new-file line numbers', () => {
    const [a] = parseDiff(patch)
    expect(a.rows).toEqual([
      { kind: 'hunk', text: '@@ -1,3 +1,4 @@', line: null },
      { kind: 'ctx', text: 'context one', line: 1 },
      { kind: 'del', text: 'removed line', line: null },
      { kind: 'add', text: 'added line', line: 2 },
      { kind: 'add', text: 'second added', line: 3 },
      { kind: 'ctx', text: 'context two', line: 4 }
    ])
  })

  it('numbers an added-only file from the hunk start', () => {
    const [, b] = parseDiff(patch)
    expect(b.rows).toEqual([
      { kind: 'hunk', text: '@@ -0,0 +1,2 @@', line: null },
      { kind: 'add', text: 'brand new', line: 1 },
      { kind: 'add', text: 'another', line: 2 }
    ])
  })

  it('ignores file-metadata lines (index/mode/rename) outside any diff header', () => {
    expect(parseDiff('index abc..def\nold mode 100644')).toEqual([])
  })

  it('returns an empty list for an empty patch', () => {
    expect(parseDiff('')).toEqual([])
  })
})
