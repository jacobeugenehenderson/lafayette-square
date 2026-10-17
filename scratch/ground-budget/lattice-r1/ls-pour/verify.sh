#!/bin/zsh
# verify.sh — the real cartograph/data/lafayette-square/ against the salvage manifests taken 2026-10-17 before any run:
# ls-data.sha256 (every file's sha256) and ls-data.mtime (every file's and dir's mtime). Read-only. Exits 1 on any difference,
# and on a missing manifest (seen passing without one before the guard). VERIFY_DIR=<dir> checks another copy (its mutation test).
setopt pipefail
H=${0:A:h}; R=${H:h:h:h:h}; S=$R/.claude/worktree-salvage/2026-10-17; D=${VERIFY_DIR:-$R/cartograph/data/lafayette-square}
for m in ls-data.sha256 ls-data.mtime; do [[ -s $S/$m ]] || { echo "⛔ no manifest $S/$m — cannot verify"; exit 1 }; done
[[ -d $D ]] || { echo "⛔ no directory $D"; exit 1 }
a=$( (cd $D && find . -type f -print0 | sort -z | xargs -0 shasum -a 256) | diff - $S/ls-data.sha256 | grep '^[<>]' | wc -l | tr -d ' ')
b=$( (cd $D && find . -print0 | sort -z | xargs -0 stat -f '%m %N') | diff - $S/ls-data.mtime | grep '^[<>]' | wc -l | tr -d ' ')
echo "LS data vs manifest: $(wc -l < $S/ls-data.sha256 | tr -d ' ') files sha256 · $(wc -l < $S/ls-data.mtime | tr -d ' ') entries mtime → $a / $b lines differ"
(( a == 0 && b == 0 )) && echo "✅ cartograph/data/lafayette-square/ untouched" || { echo "⛔ cartograph/data/lafayette-square/ CHANGED"; exit 1 }
