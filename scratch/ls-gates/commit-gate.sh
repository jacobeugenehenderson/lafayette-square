#!/bin/zsh
# Commit ONE gate through a private index (Argon): $1 = message file, $2 = a file listing "path<TAB>source", where source is
# WT (the working tree), DEL (delete), or a file holding that path's content for this gate. Nothing else enters the commit.
set -e
msg=$1; list=$2; idx=$(mktemp /tmp/argon-idx.XXXX); rm -f $idx
export GIT_INDEX_FILE=$idx
git read-tree HEAD
while IFS=$'\t' read -r p src; do
  [[ -z "$p" ]] && continue
  if [[ "$src" == DEL ]]; then git update-index --force-remove -- "$p"
  else f="$p"; [[ "$src" != WT ]] && f="$src"
    h=$(git hash-object -w -- "$f"); git update-index --add --cacheinfo 100644,$h,"$p"; fi
done < $list
git commit -q -F $msg
unset GIT_INDEX_FILE; rm -f $idx
# the shared index: these paths now match HEAD (the working tree keeps everything)
cut -f1 $list | xargs git reset -q -- 2>/dev/null || true
git show --name-status --format="%h %s" HEAD | head -30
