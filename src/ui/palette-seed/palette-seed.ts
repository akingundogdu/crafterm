import type { PaletteCommand } from '@ui/types/types'

// Default command-palette cheatsheet shipped on first run. Users can edit, add,
// remove, or recategorize these from Settings → Command palette. Selecting an
// entry types its `command` into the active terminal (without running it).
export const PALETTE_SEED: PaletteCommand[] = [
  // ---- git ----
  { id: 'seed-git-status', category: 'git', name: 'status', command: 'git status' },
  { id: 'seed-git-add', category: 'git', name: 'stage all', command: 'git add -A' },
  { id: 'seed-git-commit', category: 'git', name: 'commit', command: 'git commit -m ""' },
  { id: 'seed-git-push', category: 'git', name: 'push current branch', command: 'git push -u origin HEAD' },
  { id: 'seed-git-pull', category: 'git', name: 'pull', command: 'git pull' },
  { id: 'seed-git-fetch', category: 'git', name: 'fetch + prune', command: 'git fetch --all --prune' },
  { id: 'seed-git-log', category: 'git', name: 'log (graph)', command: 'git log --oneline --graph --decorate -20' },
  { id: 'seed-git-branches', category: 'git', name: 'list branches', command: 'git branch -a' },
  { id: 'seed-git-switch', category: 'git', name: 'switch branch', command: 'git switch ' },
  { id: 'seed-git-newbranch', category: 'git', name: 'new branch', command: 'git switch -c ' },
  { id: 'seed-git-diff', category: 'git', name: 'diff (staged)', command: 'git diff --staged' },
  { id: 'seed-git-stash', category: 'git', name: 'stash with message', command: 'git stash push -m ""' },
  { id: 'seed-git-stashpop', category: 'git', name: 'stash pop', command: 'git stash pop' },
  { id: 'seed-git-reset', category: 'git', name: 'undo last commit (keep changes)', command: 'git reset --soft HEAD~1' },
  { id: 'seed-git-restore', category: 'git', name: 'discard file changes', command: 'git restore ' },
  // ---- linux ----
  { id: 'seed-lin-ls', category: 'linux', name: 'list (long, hidden)', command: 'ls -lah' },
  { id: 'seed-lin-find', category: 'linux', name: 'find by name', command: 'find . -name "" ' },
  { id: 'seed-lin-grep', category: 'linux', name: 'recursive grep', command: 'grep -rn "" .' },
  { id: 'seed-lin-ps', category: 'linux', name: 'processes', command: 'ps aux | grep ' },
  { id: 'seed-lin-kill', category: 'linux', name: 'kill by port', command: 'lsof -ti:PORT | xargs kill -9' },
  { id: 'seed-lin-df', category: 'linux', name: 'disk free', command: 'df -h' },
  { id: 'seed-lin-du', category: 'linux', name: 'folder sizes here', command: 'du -sh *' },
  { id: 'seed-lin-tarc', category: 'linux', name: 'create tar.gz', command: 'tar -czvf archive.tar.gz ' },
  { id: 'seed-lin-tarx', category: 'linux', name: 'extract tar.gz', command: 'tar -xzvf ' },
  { id: 'seed-lin-chmod', category: 'linux', name: 'make executable', command: 'chmod +x ' },
  { id: 'seed-lin-symlink', category: 'linux', name: 'symlink', command: 'ln -s ' },
  { id: 'seed-lin-curl', category: 'linux', name: 'curl (headers)', command: 'curl -I ' },
  { id: 'seed-lin-tail', category: 'linux', name: 'follow log', command: 'tail -f ' },
  { id: 'seed-lin-chmodr', category: 'linux', name: 'recursive chmod 755', command: 'chmod -R 755 ' }
]
