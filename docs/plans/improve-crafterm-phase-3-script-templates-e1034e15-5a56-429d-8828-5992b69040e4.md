# Phase 3 — Script template externalization (HR-4)

> Part of [Architecture & Component Refactor](./improve-crafterm-architecture-refactor-e1034e15-5a56-429d-8828-5992b69040e4.md) · **Branch:** `improve-crafterm`
> **Goal:** move inline shell-command strings out of code into `resources/scripts/templates/*.tmpl` with `{{placeholder}}` tokens. Generated commands must be byte-identical. Zero behavior change.
> **Depends on:** Phase 0. **Independent of** other phases (isolated, low-risk) — can run any time after 0.

## Scope
- **In:** a `loadScript()` helper, externalized templates, migrating in-code command assembly.
- **Out:** data file writers (state.json, SQL save, notebook files) that write *data*, not commands — those stay.

## Steps
1. **`main/services/scripts.ts`** — `loadScript(name: string, vars: Record<string,string>): string` reads `join(scriptsDir(), 'templates', name)` and replaces every `{{token}}`. Throw on unknown placeholder left unreplaced (catches typos). Reuse the existing `scriptsDir()` (`index.ts` / `iosWorktree:scriptPath` resolver) so packaging via `extraResources` already works.
2. **Inventory & migrate** each inline command (confirm full list by grepping `execFile`/`spawn`/`writeFileSync` of shell bodies in `src/main/`):
   - Self-update `steps` multi-line string → `resources/scripts/templates/self-update.sh.tmpl` (`index.ts:1370`).
   - `ensureClaudeShim` shim body → `claude-shim.zsh.tmpl` (`index.ts:256`).
   - `zsh -lic` one-liners: `markdown {{path}}` (`index.ts:1435`), the open/launch helper (`index.ts:1034`).
   - Any other assembled command bodies surfaced by the grep.
3. **Keep `ios-worktree.sh`** as the precedent; align new templates with the same `scriptsDir()` + `extraResources` packaging.
4. **HR-4 readability:** templates are plain `.sh`/`.zsh` with `{{cwd}}`, `{{path}}`, `{{version}}`-style tokens.

## Tests added (Vitest node)
- `loadScript` substitutes all tokens; throws on missing template; throws on leftover `{{…}}`.
- **Byte-identical golden tests:** for each migrated command, assert `loadScript(tmpl, vars)` equals the exact string the old inline code produced (capture the pre-refactor string as the golden).
- HR-5: tests read templates from `resources/`, write nothing to `~/.crafterm`.

## features.md checklist slice
- Self-update flow runs (in a throwaway/dev context) and produces the same steps.
- Markdown-open and external-open helpers still work.
- Claude shim still generated correctly and Claude session detection works.

## Acceptance criteria
- No assembled shell-command strings remain inline in `src/main/` (data writers excepted).
- Golden tests prove byte-for-byte parity (HR-1).
- `pnpm dist:dir` ships the new templates via `extraResources`; packaged app finds them via `scriptsDir()`.
