#!/bin/zsh
# run.sh <tileGround copy> [out.json] — this branch's needle check (or $CHECK) on $TOWNS, inside the main checkout's tree
# (the towns' data is there), with this branch's streetProfiles.js, _proto-feed.mjs and the check swapped in, and the given
# tileGround.js. Gated: load < 8, free ≥ 40%.
W=${0:A:h:h:h:h:h}; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync; C=${CHECK:-claims-the-built-ground-has-no-needles.mjs}
tg=${1:A}; out=; [[ -n $2 ]] && out=${2:A}
F=$(memory_pressure | awk -F': ' '/free percentage/ {print int($2)}')
(( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || F < 40 )) && { echo "not launched (free $F%)"; exit 2 }
cd $R; C=$C NEEDLE_OUT=$out SWAP_MAP="{\"src/lib/tileGround.js\":\"$tg\",\"src/cartograph/streetProfiles.js\":\"$W/src/cartograph/streetProfiles.js\",\"scratch/_proto-feed.mjs\":\"$W/scratch/_proto-feed.mjs\",\"checks/$C\":\"$W/checks/$C\"}" \
  node --max-old-space-size=8000 --import $R/scratch/ground-budget/swap.mjs --input-type=module -e "process.argv.splice(1, 0, process.env.C); process.argv.push(...(process.env.TOWNS || '').split(' ').filter(Boolean).map(t => '--scene=' + t)); await import('./checks/' + process.env.C)"
