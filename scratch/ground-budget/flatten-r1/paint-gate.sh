#!/bin/zsh
# paint-gate.sh — flatten-r1's paint-only gates (Boz, 2026-10-14): per town, HEAD vs this branch, bake-ground up to the
# paint stack (prep.mjs's copies: seconds-stamped lines, the flattened groups dumped, exit), from the main tree's data;
# the branch run swaps in this branch's bake-ground AND tileGround. --shore=pending as serve.js's 'ground' pass; scratch
# out-dir; data/<town> + public/ snapshotted before and after each. Gates: load < 8, free ≥ 40% to start; killed below 20%.
# Then compare.mjs on the two dumps.   paint-gate.sh [town …] → paint-gate.log beside this file
W=${0:A:h}; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync; LOG=$W/paint-gate.log; OUT=$R/scratch/ground-budget/paint/out; mkdir -p $OUT $W/dumps
TOWNS=(${@}); (( ${#TOWNS} )) || TOWNS=(huron hipointedemun provincetown)
node $W/prep.mjs || exit 1
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
for T in $TOWNS; do
  for TAG in HEAD r1; do
    while (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 40 )); do sleep 30; done
    M="{\"cartograph/bake-ground.js\":\"$W/bake-ground.$TAG.js\""; [[ $TAG == r1 ]] && M="$M,\"src/lib/tileGround.js\":\"$W/../../../src/lib/tileGround.js\""
    snap() { find -L $R/cartograph/data/$T $R/public -type f -exec stat -f '%m %z %N' {} + | sort -k3 }
    snap > $W/snap-before.txt; touch $W/snap-marker
    echo "$T $TAG start $(date +%H:%M:%S) · load $(sysctl -n vm.loadavg) · free $(free_pct)%" | tee -a $LOG
    L=$W/paint-$T-$TAG.log
    ( cd $R/cartograph; SWAP_MAP="$M}" FLATTEN_DUMP=$W/dumps/$T-$TAG.json exec /usr/bin/time -l node --max-old-space-size=14000 --import $R/scratch/ground-budget/swap.mjs bake-ground.js --look=$T --scene=$T --out-dir=$OUT --shore=pending ) > $L 2>&1 &
    PID=$!; while kill -0 $PID 2>/dev/null; do (( $(free_pct) < 20 )) && { echo "  ⛔ free < 20%: killing $T $TAG" | tee -a $LOG; kill $PID; }; sleep 15; done
    wait $PID; RC=$?; snap > $W/snap-after.txt
    echo "  exit $RC · pre-stack $(grep -m1 'progress\] flatten' $L | grep -o '^\[+[0-9.]*s\]') · $(grep -o 'paint stack pressed down.*' $L | tail -1) · real $(awk '/ real / {print $1}' $L) s · peak RSS $(awk '/maximum resident set size/ {print $1}' $L)" | tee -a $LOG
    echo "  [guard] changed $(diff $W/snap-before.txt $W/snap-after.txt | grep -c '^[<>]') · newer $(find -L $R/cartograph/data/$T $R/public -newer $W/snap-marker -type f | wc -l | tr -d ' ')" | tee -a $LOG
  done
  node --max-old-space-size=12000 $W/compare.mjs $W/dumps/$T-HEAD.json $W/dumps/$T-r1.json 2>&1 | tee -a $LOG
done; echo "ALLDONE $(date)" | tee -a $LOG
