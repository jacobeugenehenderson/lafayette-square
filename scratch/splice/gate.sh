#!/bin/zsh
# Splice: run the two corner gates on ONE town with a given tileGround.js commit and a given ribbons file, one job at a time.
#   scratch/splice/gate.sh <scene> <commit> <ribbons.json> <out-prefix>
# Stages the ribbons where ribbonsPathOf(scene) reads them (LS: the tracked src/data/ribbons.json, restored after) and the
# commit's tileGround.js (restored to HEAD after). Peak memory from /usr/bin/time -l.
set -e
cd ${0:a:h}/../..
sc=$1; c=$2; rb=$3; out=$4
dst=$([ $sc = lafayettesquare ] && echo src/data/ribbons.json || echo cartograph/data/$sc/clean/ribbons.json)
mkdir -p ${dst:h}
trap 'git checkout HEAD -- src/lib/tileGround.js; [ $sc = lafayettesquare ] && git checkout HEAD -- src/data/ribbons.json || rm -f $dst' EXIT
git show ${c}:src/lib/tileGround.js > src/lib/tileGround.js
cp $rb $dst
for g in every-corner-is-one-of-three proto-corner-is-authored-radius; do
  # one-of-three through its scratch twin, which lists EVERY failing corner (the check lists 25)
  src=checks/claims-$g.mjs; [ $g = every-corner-is-one-of-three ] && src=scratch/splice/one-of-three-all.mjs
  SECTION_DUMP=1 /usr/bin/time -l node --max-old-space-size=12288 $src $sc --list > $out.$g.txt 2> $out.$g.err || true
  grep -qE "(✅|⛔)" $out.$g.txt || { echo "⛔ $g printed no verdict — see $out.$g.err"; continue }
  echo "$g: $(grep -E 'maximum resident' $out.$g.err | awk '{printf "%.1f GB peak", $1/1073741824}') · $(grep -cE '⛔' $out.$g.txt) ⛔ lines"
done
