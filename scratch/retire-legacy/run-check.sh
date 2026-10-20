#!/bin/zsh
# run-check.sh <tag> <town> — a check ($CHECK, default the band check) for ONE town, in the main tree with this worktree's HEAD
# swapped in (scratch/retire-legacy/swapset.mjs). BANDS_ALL / MUTANTS pass through. Out: scratch/retire-legacy/out/<tag>-<town>.log
# ⛔ Heavy job (Boz): load < 8, free ≥ 70%, no other node over 1 GB at launch; KILLED under 30% free.
W=${0:A:h:h:h}; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync; tag=$1; town=$2; C=${CHECK:-checks/claims-the-bands-are-held-by-their-owners.mjs}
O=$W/scratch/retire-legacy/out; mkdir -p $O
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
F=$(free_pct); BIG=$(ps -axo rss,command | awk '$1 > 1000000 && /node/' | wc -l | tr -d ' ')
(( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || F < 70 || BIG > 0 )) && { echo "not launched (load $(sysctl -n vm.loadavg) · free $F% · other node > 1 GB: $BIG)"; exit 2 }
M=$(ENTRY="$C=$W/$C scratch/_proto-feed.mjs=$W/scratch/_proto-feed.mjs" node $W/scratch/retire-legacy/swapset.mjs $W $R 2>/dev/null) || { echo "not launched: the swap set refused"; exit 2 }
M=$(node -e "const m = JSON.parse(process.argv[1]); m['scratch/_proto-feed.mjs'] = process.argv[2] + '/scratch/_proto-feed.mjs'; m[process.argv[3]] = process.argv[2] + '/' + process.argv[3]; console.log(JSON.stringify(m))" "$M" $W $C)
cd $R; C=$C SWAP_MAP="$M" /usr/bin/time -l node --max-old-space-size=12000 --import $R/scratch/ground-budget/swap.mjs --input-type=module \
  -e "process.argv.splice(1, 0, process.env.C); process.argv.push('--scene=$town', ...(process.env.ARGS || '').split(' ').filter(Boolean)); await import('./' + process.env.C)" > $O/$tag-$town.log 2>&1 &
PID=$!; MINF=100
while kill -0 $PID 2>/dev/null; do F=$(free_pct); (( F < MINF )) && MINF=$F; (( F < 30 )) && { echo "⛔ free $F% < 30%: killing"; pkill -P $PID; kill $PID; }; sleep 5; done
wait $PID; echo "$town rc=$? min-free=$MINF%"
