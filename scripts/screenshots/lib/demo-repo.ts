import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, chmodSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_ROOT, SCRIPTS_DIR, assertThrowaway } from './paths.js'

// Builds the throwaway workspace every recording runs against: two real git repos
// (with real history and real worktrees), a notebook tree, a todo file and a fake
// ~/.claude session dir. Terminals in the recordings run REAL commands against
// this workspace — nothing about the terminal output is faked.

export interface DemoWorkspace {
  root: string
  stateDir: string
  webRepo: string
  apiRepo: string
  worktrees: { darkMode: string; checkout: string }
  notebooksDir: string
  todoFile: string
  claudeDir: string
  shell: string
  binDir: string
  zshDir: string
  sqliteFile: string
}

const AUTHOR = { name: 'Dana Reed', email: 'dana@acme.dev' }

function git(cwd: string, args: string[], date?: string): void {
  execFileSync('git', args, {
    cwd,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: AUTHOR.name,
      GIT_AUTHOR_EMAIL: AUTHOR.email,
      GIT_COMMITTER_NAME: AUTHOR.name,
      GIT_COMMITTER_EMAIL: AUTHOR.email,
      ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {})
    }
  })
}

function write(root: string, rel: string, body: string): void {
  const file = join(root, rel)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, body)
}

function commit(repo: string, message: string, day: number): void {
  git(repo, ['add', '-A'])
  git(repo, ['commit', '-m', message], `2026-07-${String(day).padStart(2, '0')}T10:00:00`)
}

// A realistic little web app. `npm test` and `npm run build` are real scripts —
// dependency-free Node, so they run instantly in a recorded terminal.
function buildWebRepo(repo: string): void {
  mkdirSync(repo, { recursive: true })
  git(repo, ['init', '-q', '-b', 'main'])

  write(repo, '.gitignore', 'node_modules\ndist\n')
  write(
    repo,
    'package.json',
    JSON.stringify(
      {
        name: 'acme-web',
        version: '2.4.0',
        private: true,
        scripts: {
          dev: 'node scripts/dev.js',
          build: 'node scripts/build.js',
          test: 'node scripts/test.js'
        }
      },
      null,
      2
    ) + '\n'
  )
  write(
    repo,
    'README.md',
    '# acme-web\n\nStorefront for the Acme checkout stack.\n\n```bash\nnpm run dev     # local server on :3000\nnpm test        # unit suite\n```\n'
  )
  commit(repo, 'chore: scaffold the storefront package', 2)

  write(
    repo,
    'src/lib/cart.ts',
    `export interface CartLine {
  sku: string
  qty: number
  unitPrice: number
}

export function subtotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0)
}

export function applyPromo(total: number, code: string): number {
  if (code === 'SUMMER25') return Math.round(total * 0.75)
  if (code === 'FREESHIP') return total
  return total
}
`
  )
  commit(repo, 'feat(cart): subtotal + promo code rules', 3)

  write(
    repo,
    'src/routes/checkout.ts',
    `import { subtotal, applyPromo, type CartLine } from '../lib/cart'

interface CheckoutRequest {
  lines: CartLine[]
  promo?: string
}

export async function checkout(req: CheckoutRequest): Promise<{ total: number }> {
  const base = subtotal(req.lines)
  const total = req.promo ? applyPromo(base, req.promo) : base
  if (total <= 0) throw new Error('empty cart')
  return { total }
}
`
  )
  commit(repo, 'feat(checkout): validate empty carts before charging', 5)

  write(
    repo,
    'src/app.ts',
    `import { checkout } from './routes/checkout'

const routes = {
  '/api/checkout': checkout
}

export function handle(path: string): unknown {
  const route = routes[path as keyof typeof routes]
  if (!route) return { status: 404 }
  return route
}
`
  )
  write(repo, 'src/styles.css', ':root {\n  --brand: #6aa9ff;\n  --surface: #12161c;\n}\n')
  commit(repo, 'feat(app): wire the checkout route', 6)

  write(
    repo,
    'scripts/test.js',
    `const files = [
  ['src/lib/cart.test.ts', 6],
  ['src/routes/checkout.test.ts', 4],
  ['src/app.test.ts', 3]
]
const green = (s) => '\\x1b[32m' + s + '\\x1b[0m'
const dim = (s) => '\\x1b[2m' + s + '\\x1b[0m'
let total = 0
for (const [file, count] of files) {
  total += count
  console.log(' ' + green('✓') + ' ' + file + ' ' + dim('(' + count + ' tests)'))
}
console.log('')
console.log(' Test Files  ' + green(files.length + ' passed') + ' (' + files.length + ')')
console.log('      Tests  ' + green(total + ' passed') + ' (' + total + ')')
console.log('   Duration  ' + dim('412ms'))
`
  )
  write(
    repo,
    'scripts/build.js',
    `const dim = (s) => '\\x1b[2m' + s + '\\x1b[0m'
console.log('acme-web ' + dim('v2.4.0') + ' building…')
console.log('  dist/app.js      ' + dim('18.4 kB'))
console.log('  dist/styles.css  ' + dim(' 2.1 kB'))
console.log('\\x1b[32m✓ built in 0.9s\\x1b[0m')
`
  )
  write(repo, 'scripts/dev.js', "console.log('acme-web dev server ready on http://localhost:3000')\n")
  commit(repo, 'chore(scripts): add build, dev and test entry points', 8)

  write(
    repo,
    'docs/checkout-notes.md',
    '# Checkout notes\n\n- Promo codes are validated server-side.\n- Empty carts must never reach the payment provider.\n'
  )
  commit(repo, 'docs: capture checkout constraints', 9)
}

function buildApiRepo(repo: string): void {
  mkdirSync(repo, { recursive: true })
  git(repo, ['init', '-q', '-b', 'main'])
  write(
    repo,
    'package.json',
    JSON.stringify({ name: 'acme-api', version: '1.9.2', private: true }, null, 2) + '\n'
  )
  write(repo, 'src/server.ts', "export const port = 4000\n")
  commit(repo, 'chore: scaffold the api package', 4)
  write(repo, 'src/routes/orders.ts', "export const orders = () => []\n")
  commit(repo, 'feat(orders): list endpoint', 7)
}

export function buildDemoWorkspace(): DemoWorkspace {
  assertThrowaway(DEMO_ROOT)
  rmSync(DEMO_ROOT, { recursive: true, force: true })
  mkdirSync(DEMO_ROOT, { recursive: true })

  const webRepo = join(DEMO_ROOT, 'acme-web')
  const apiRepo = join(DEMO_ROOT, 'acme-api')
  buildWebRepo(webRepo)
  buildApiRepo(apiRepo)

  // Real git worktrees — the sidebar reconciles these from `git worktree list`.
  const wtDir = join(DEMO_ROOT, 'worktrees')
  const darkMode = join(wtDir, 'dark-mode')
  const checkout = join(wtDir, 'checkout-v2')
  git(webRepo, ['worktree', 'add', '-q', '-b', 'feature/dark-mode', darkMode])
  git(webRepo, ['worktree', 'add', '-q', '-b', 'feature/checkout-v2', checkout])

  // Uncommitted work in one worktree, so the sidebar shows a dirty branch.
  write(darkMode, 'src/styles.css', ':root {\n  --brand: #6aa9ff;\n  --surface: #12161c;\n  --surface-dark: #05070a;\n}\n')

  const stateDir = assertThrowaway(join(DEMO_ROOT, 'state'))
  const notebooksDir = join(stateDir, 'notebooks')
  mkdirSync(notebooksDir, { recursive: true })
  writeFileSync(
    join(notebooksDir, 'Checkout rewrite.md'),
    [
      '# Checkout rewrite',
      '',
      '## Open questions',
      '',
      '- Do we keep the legacy promo endpoint alive for one more release?',
      '- Who owns the migration of saved carts?',
      '',
      '## Decisions',
      '',
      '1. Ship behind the `checkout_v2` flag.',
      '2. Dark mode lands in the same release train.',
      '',
      '```ts',
      "const total = applyPromo(subtotal(lines), 'SUMMER25')",
      '```',
      ''
    ].join('\n')
  )
  mkdirSync(join(notebooksDir, 'Snippets'), { recursive: true })
  writeFileSync(
    join(notebooksDir, 'Snippets', 'Release checklist.md'),
    '# Release checklist\n\n- [x] Tag the release\n- [x] Run the smoke suite\n- [ ] Announce in #acme-releases\n'
  )

  const todoFile = join(DEMO_ROOT, 'todo-list.json')
  writeFileSync(
    todoFile,
    JSON.stringify(
      {
        items: [
          { id: 't1', text: 'Dark mode for the checkout summary', status: 'In progress' },
          { id: 't2', text: 'Group notifications per terminal', status: 'In progress' },
          { id: 't3', text: 'Promo codes: stack percentage + free shipping', status: 'Backlog' },
          { id: 't4', text: 'Retry failed payment webhooks', status: 'Backlog' },
          { id: 't5', text: 'Cart persistence across devices', status: 'Backlog' },
          { id: 't6', text: 'Ship the address autocomplete', status: 'Ready to test' },
          { id: 't7', text: 'Split the settings screen into tabs', status: 'Done' },
          { id: 't8', text: 'Worktree progress indicator', status: 'Done' }
        ]
      },
      null,
      2
    )
  )

  // Fake Claude session store (CRAFTERM_CLAUDE_DIR is the projects ROOT, and Claude
  // encodes a cwd into the dir name by replacing "/" and "." with "-" — see
  // src/services/claude/claude.utils.ts). The picker reads each jsonl's `cwd` plus a
  // custom-title / prompt record to build its summary.
  const claudeDir = join(DEMO_ROOT, 'claude')
  const sessionDir = join(claudeDir, webRepo.replace(/[/.]/g, '-'))
  mkdirSync(sessionDir, { recursive: true })
  const session = (id: string, prompt: string, minutesAgo: number): void => {
    const at = new Date(Date.now() - minutesAgo * 60_000).toISOString()
    const lines = [
      JSON.stringify({ type: 'custom-title', customTitle: prompt, sessionId: id, cwd: webRepo }),
      JSON.stringify({
        sessionId: id,
        cwd: webRepo,
        timestamp: at,
        type: 'user',
        message: { role: 'user', content: prompt }
      })
    ]
    writeFileSync(join(sessionDir, `${id}.jsonl`), lines.join('\n') + '\n')
  }
  session('7f0a2c11-3d5e-4a90-9c21-6b8f0d1e4a55', 'Add dark mode to the checkout summary', 12)
  session('1c9b7e42-8a10-4f33-b6d7-2e5c9a0b7311', 'Why does the promo code stack twice?', 95)
  session('5a4d6f08-2b71-49c6-8e0a-3f7b1c2d9e64', 'Refactor the cart into a store', 320)

  const shell = join(DEMO_ROOT, 'demo-shell.sh')
  copyFileSync(join(SCRIPTS_DIR, 'lib', 'demo-shell.sh'), shell)
  copyFileSync(join(SCRIPTS_DIR, 'lib', 'demo-bashrc'), join(DEMO_ROOT, 'demo-bashrc'))
  chmodSync(shell, 0o755)

  const binDir = join(DEMO_ROOT, 'bin')
  mkdirSync(binDir, { recursive: true })

  // The command palette lists the aliases/functions of an interactive zsh
  // (src/services/zsh/zsh.service.ts runs `/bin/zsh -ic alias`). Point ZDOTDIR at a
  // demo .zshrc so it lists these instead of the developer's real shell config —
  // which would put their home path and private project names in a published GIF.
  const zshDir = join(DEMO_ROOT, 'zsh')
  mkdirSync(zshDir, { recursive: true })
  writeFileSync(
    join(zshDir, '.zshrc'),
    [
      "alias gs='git status -sb'",
      "alias gl='git log --oneline --graph'",
      "alias gco='git checkout'",
      "alias gp='git push origin HEAD'",
      "alias nt='npm test'",
      "alias nb='npm run build'",
      "alias nd='npm run dev'",
      "alias dc='docker compose'",
      "alias dcl='docker compose logs -f --tail=100'",
      'deploy_staging() { npm run build && npm run deploy -- --env staging }',
      'reset_db() { npm run db:reset -- --seed demo }',
      ''
    ].join('\n')
  )

  return {
    root: DEMO_ROOT,
    stateDir,
    webRepo,
    apiRepo,
    worktrees: { darkMode, checkout },
    notebooksDir,
    todoFile,
    claudeDir,
    shell,
    binDir,
    zshDir,
    sqliteFile: join(DEMO_ROOT, 'acme.sqlite')
  }
}
