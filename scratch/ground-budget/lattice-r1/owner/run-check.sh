#!/bin/zsh
# run-check.sh [tileGround copy] -- — runs this branch's check $CHECK (default claims-every-curb-edge-has-its-owner.mjs) on $TOWNS inside the
# main checkout's tree (the towns' data is not in the worktree), with a tileGround.js swapped in (default: this branch's).
# (In -e mode argv has no script slot; one is inserted so the check's argv.slice(2) reads the towns.) Only tileGround.js differs between the two trees among the modules the check loads. Gated: load < 8, free ≥ 40%.
W=${0:A:h:h:h:h:h}; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync; C=${CHECK:-claims-every-curb-edge-has-its-owner.mjs}
tg=$W/src/lib/tileGround.js; [[ $1 != -- ]] && { tg=${1:A}; shift }; shift
F=$(memory_pressure | awk -F': ' '/free percentage/ {print int($2)}')
(( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || F < 40 )) && { echo "not launched (free $F%)"; exit 2 }
cd $R; C=$C SWAP_MAP="{\"src/lib/tileGround.js\":\"$tg\",\"checks/$C\":\"$W/checks/$C\"}" \
  node --max-old-space-size=8000 --import $R/scratch/ground-budget/swap.mjs --input-type=module -e "process.argv.splice(1, 0, process.env.C); process.argv.push(...(process.env.TOWNS || '').split(' ').filter(Boolean).map(t => '--scene=' + t)); await import('./checks/' + process.env.C)" 
