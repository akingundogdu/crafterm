#!/bin/bash
# The shell every demo terminal spawns (state.defaultShell points here). node-pty
# launches it as a login shell; the `-l` argument is intentionally ignored so the
# developer's real zsh profile — prompt, aliases, user@host — never reaches a frame.
export BASH_SILENCE_DEPRECATION_WARNING=1
exec /bin/bash --noprofile --rcfile "$(dirname "$0")/demo-bashrc" -i
