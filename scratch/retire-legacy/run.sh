#!/bin/zsh
# run.sh <tag> <town> — proof.mjs for ONE town, inside the main checkout's tree (the towns' data is there), with this worktree's
# HEAD swapped in by hpdm-gate/swapset.mjs (derived from git) and bake-ground.js replaced by patch-bg.mjs's recording copy of
# THIS worktree's bake-ground.js. Writes scratch/retire-legacy/out/<tag>-<town>.{json,log}. Modelled on lattice-r1/sweep/run.sh.
# ⛔ Heavy job (Boz): load < 8, free ≥ 70% and no other node over 1 GB at launch; KILLED under 30% free; one town per process.
W=${0:A:h:h:h}; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync; tag=$1; town=$2
[[ -n $tag && -n $town ]] || { echo "usage: run.sh <tag> <town>"; exit 2 }
O=$W/scratch/retire-legacy/out; mkdir -p $O
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
F=$(free_pct); BIG=$(ps -axo rss,command | awk '$1 > 1000000 && /node/' | wc -l | tr -d ' ')
(( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || F < 70 || BIG > 0 )) && { echo "not launched (load $(sysctl -n vm.loadavg) · free $F% · other node > 1 GB: $BIG)"; exit 2 }
BG=$O/bake-ground.rec.js; node $W/scratch/retire-legacy/patch-bg.mjs $W/cartograph/bake-ground.js $BG || exit 2
P=scratch/retire-legacy/proof.mjs
M=$(BG=$BG ENTRY="$P=$W/$P scratch/_proto-feed.mjs=$W/scratch/_proto-feed.mjs" node $W/scratch/retire-legacy/swapset.mjs $W $R) || { echo "not launched: the swap set refused (above)"; exit 2 }
M=$(node -e "const m = JSON.parse(process.argv[1]); m['scratch/_proto-feed.mjs'] = process.argv[2] + '/scratch/_proto-feed.mjs'; m[process.argv[3]] = process.argv[2] + '/' + process.argv[3]; console.log(JSON.stringify(m))" "$M" $W $P)
cd $R; P=$P SWAP_MAP="$M" PROOF_OUT=$O/$tag-$town.json PROOF_SHA=$(git -C $W rev-parse --short HEAD) \
  /usr/bin/time -l node --max-old-space-size=12000 --import $R/scratch/ground-budget/swap.mjs --input-type=module \
  -e "process.argv.splice(1, 0, process.env.P); process.argv.push('--scene=$town'); await import('./' + process.env.P)" > $O/$tag-$town.log 2>&1 &
PID=$!; MINF=100
while kill -0 $PID 2>/dev/null; do F=$(free_pct); (( F < MINF )) && MINF=$F; (( F < 30 )) && { echo "⛔ free $F% < 30%: killing"; pkill -P $PID; kill $PID; }; sleep 5; done
wait $PID; rc=$?
echo "$town rc=$rc min-free=$MINF% · $(grep -E 'maximum resident set size|real' $O/$tag-$town.log | tr -s ' ' | tr '\n' ' ')"
grep '^PROOF ' $O/$tag-$town.log | cut -c1-400
