# Version Display + Auto "Redeploy Needed" (Crafterm)

**Branch:** improve-crafterm · **Slug:** version-display

## Goal

Show the app version as a chip in the top content status bar
(`#content-statusbar`). The version auto-increments with code changes (no manual
`npm version`), and the chip flags **"redeploy needed"** whenever the running
build is behind the source repo — i.e. the installed app no longer reflects the
latest code. Clicking runs the existing self-update (deploy) flow.

## Mechanism (git-based)

- **Version shown** = `v<base>+<commitCount>` where `base` is `package.json`
  `version` and `commitCount` is `git rev-list --count HEAD`. Every commit
  auto-bumps the build number — no manual versioning.
- **Build stamp:** `scripts/deploy.sh` writes `out/build-info.json`
  (`{commit, commitCount}`) after `npm run build`, before packaging, so the
  packaged app knows which git state it was built from. (`out/` is gitignored;
  included in the bundle via `files: ["out/**/*"]`.)
- **Redeploy-needed** when the source repo (`settings.repoPath`) is ahead of the
  running build: `repoGit.commit !== built.commit` (new commits) **OR**
  `repoGit.dirty` (uncommitted edits — flags as soon as a file changes, before
  any commit). Re-checked on init, every 20s, and on window focus.
- In **dev** (`!app.isPackaged`) there is no build-info → no redeploy nag.

## Changes

### Main — `src/main/index.ts`
- `app:version` → `app.getVersion()` (base semver).
- `app:buildInfo` → reads `<bundle>/out/build-info.json`; null in dev/missing.
- `app:repoGit` → `git -C <repo>` `rev-parse HEAD` + `rev-list --count HEAD` +
  `status --porcelain` → `{commit, commitCount, dirty}` or null. Uses existing
  `run()` + `gitBin()`.

### Preload — `index.ts` + `api.d.ts`
- `appVersion()`, `appBuildInfo()`, `repoGit(repoPath)` with typed signatures.

### Renderer
- `index.html`: `#statusbar-version` chip (dot + `v—`) before the usage chip.
- `style.css`: chip styled like the usage pill + `.has-update` accent/dot.
- `notifications.ts`: `initStatusbarVersion()` — render `v<base>+<count>`,
  compute `needsRedeploy`, toggle `.has-update`, tooltip explains the reason
  (new commits vs uncommitted), poll (20s) + focus listener. Click →
  `runUpdate()` when stale or no repo set, else flash "up to date".
  Wired from `initNotifications()`.

### Build — `scripts/deploy.sh`
- Stamp `out/build-info.json` between build and package.

## Verification

- `npx tsc --noEmit` (web + node) clean. `npm run build` clean.
- `out/build-info.json` is gitignored (build artifact).
- Manual (packaged): deploy once → chip `vX+N` up to date; edit a file in the
  repo → chip turns accent ("redeploy needed — uncommitted changes"); click →
  deploy → back to up to date with a higher count.

## Notes

- No new dependency. Dirty-state check is what makes the nag fire "as soon as
  code changes," per user's request, even before committing.
