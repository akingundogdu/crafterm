# Contributing to Crafterm

Thanks for your interest in improving Crafterm! This is a macOS Electron app
(TypeScript). The notes below should get you productive quickly.

## Development setup

```bash
npm install     # installs deps + rebuilds node-pty for Electron (postinstall)
npm run dev     # run the app with hot reload
```

Requirements: macOS, Node.js 18+, and Xcode Command Line Tools
(`xcode-select --install`) for the native `node-pty` build.

## Before opening a pull request

1. **Typecheck both configs** (the build does not typecheck):
   ```bash
   npx tsc --noEmit -p tsconfig.web.json
   npx tsc --noEmit -p tsconfig.node.json
   ```
2. **Build**:
   ```bash
   npm run build
   ```
3. **Run the app** (`npm run dev`) and exercise the feature you changed.

There is currently no automated test framework in the repo; verify changes by
running the app. If you want to add a test framework, please open an issue to
discuss it first.

## Code style

- **TypeScript strict mode.** Avoid `any`; prefer precise types and `unknown` +
  narrowing.
- **English only** in all committed code: identifiers, strings, comments,
  log/error messages, and commit messages.
- No file headers; modules start directly with imports.
- Comments describe what the code does, not its history (no `// REMOVED:` /
  `// NEW:` changelog comments).
- `camelCase` for variables/functions, `UpperCamelCase` for types, boolean props
  start with `is`/`has`/`should`.

## Adding an IPC call

Anything touching the OS lives in the main process. A new IPC call means three
edits in lockstep:

1. Handler in `src/main/index.ts`
2. Method in `src/preload/index.ts`
3. Signature in `src/preload/api.d.ts` (and `SavedState` there if it is
   persisted)

## Commits & pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`. Short, imperative
  subject.
- Every PR description should include: a one-line summary, what changed and why,
  and how you tested it.
- Keep PRs focused; unrelated changes belong in separate PRs.

## Reporting bugs & requesting features

Use the GitHub issue templates. For security issues, see
[SECURITY.md](SECURITY.md) — please do **not** open a public issue.
