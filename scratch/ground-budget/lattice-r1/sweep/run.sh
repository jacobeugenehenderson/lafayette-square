#!/bin/zsh
# run.sh <tileGround copy> [out.json] — (ARGS='…' appends verbatim args, e.g. a check's positional scenes) — this branch's needle check (or $CHECK) on $TOWNS, inside the main checkout's tree
# (the towns' data is there). Swapped in: every code module this branch differs from main in, DERIVED FROM GIT by
# hpdm-gate/swapset.mjs (it refuses on a file it cannot carry, and prints the list), with tileGround.js pinned to the given
# copy, plus this branch's _proto-feed.mjs and the check. ⛔ The hand-kept list this replaces missed groundConformity.js
# and lineHeight.mjs (Boz, 2026-10-18).
# ⛔ Gated as a heavy job (Boz, 2026-10-18): load < 8, free ≥ 70% and no other node over 1 GB at launch; KILLED under 30% free.
W=${0:A:h:h:h:h:h}; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync; C=${CHECK:-claims-the-built-ground-has-no-needles.mjs}; [[ $C == */* ]] || C=checks/$C   # CHECK: a checks/ name, or a repo-relative path
tg=${1:A}; out=; [[ -n $2 ]] && out=${2:A}
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
F=$(free_pct); BIG=$(ps -axo rss,command | awk '$1 > 1000000 && /node/' | wc -l | tr -d ' ')
(( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || F < 70 || BIG > 0 )) && { echo "not launched (load $(sysctl -n vm.loadavg) · free $F% · other node > 1 GB: $BIG)"; exit 2 }
M=$(TG=$tg ENTRY="$C=$W/$C scratch/_proto-feed.mjs=$W/scratch/_proto-feed.mjs" node $R/scratch/ground-budget/hpdm-gate/swapset.mjs $W $R) || { echo "not launched: the swap set refused (above)"; exit 2 }
M=$(node -e "const m = JSON.parse(process.argv[1]); m['scratch/_proto-feed.mjs'] = process.argv[2] + '/scratch/_proto-feed.mjs'; m[process.argv[3]] = process.argv[2] + '/' + process.argv[3]; console.log(JSON.stringify(m))" "$M" $W $C)
cd $R; C=$C NEEDLE_OUT=$out SWAP_MAP="$M" \
  node --max-old-space-size=8000 --import $R/scratch/ground-budget/swap.mjs --input-type=module -e "process.argv.splice(1, 0, process.env.C); process.argv.push(...(process.env.TOWNS || '').split(' ').filter(Boolean).map(t => '--scene=' + t)); process.argv.push(...(process.env.ARGS || '').split(' ').filter(Boolean)); await import('./' + process.env.C)" &
PID=$!
while kill -0 $PID 2>/dev/null; do F=$(free_pct); (( F < 30 )) && { echo "⛔ free $F% < 30%: killing"; kill $PID; }; sleep 10; done
wait $PID
