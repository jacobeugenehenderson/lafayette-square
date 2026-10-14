#!/bin/zsh
# full-gate.sh — flatten-r1's slab gates (Boz, 2026-10-14; Jacob authorized tonight's bakes): per town, the FULL ground bake,
# HEAD (the main tree's bake-ground, as is) then this branch (its bake-ground + tileGround swapped in memory), each to its
# own SCRATCH out-dir (slabs/<town>-<tag>); nothing served, staged or published. --shore=pending as serve.js's 'ground'
# pass. data/<town> + public/ snapshotted before and after every run. Gates: load < 8, free ≥ 40% to start, explicit heap;
# killed below 20% free. Records the wall time (a budget reading). Then on each slab: claims-the-ground-has-no-cross-
# polygon-t-junctions and claims-the-ground-tiles-without-a-gap (--dir), and whether ground.bin is byte-identical.
#   full-gate.sh <town …> → full-gate.log beside this file
W=${0:A:h}; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync; LOG=$W/full-gate.log; mkdir -p $W/slabs
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
for T in $@; do
  for TAG in HEAD r1; do
    while (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 40 )); do sleep 30; done
    O=$W/slabs/$T-$TAG; rm -rf $O; mkdir -p $O; L=$W/full-$T-$TAG.log
    M='{}'; [[ $TAG == r1 ]] && M="{\"cartograph/bake-ground.js\":\"$W/../../../cartograph/bake-ground.js\",\"src/lib/tileGround.js\":\"$W/../../../src/lib/tileGround.js\"}"
    snap() { find -L $R/cartograph/data/$T $R/public -type f -exec stat -f '%m %z %N' {} + | sort -k3 }
    snap > $W/snap-before.txt; touch $W/snap-marker
    echo "$T $TAG start $(date +%H:%M:%S) · load $(sysctl -n vm.loadavg) · free $(free_pct)%" | tee -a $LOG
    ( cd $R/cartograph; SWAP_MAP="$M" exec /usr/bin/time -l node --max-old-space-size=14000 --import $R/scratch/ground-budget/swap.mjs bake-ground.js --look=$T --scene=$T --out-dir=$O --shore=pending ) > $L 2>&1 &
    PID=$!; while kill -0 $PID 2>/dev/null; do (( $(free_pct) < 20 )) && { echo "  ⛔ free < 20%: killing $T $TAG" | tee -a $LOG; kill $PID; }; sleep 15; done
    wait $PID; RC=$?; snap > $W/snap-after.txt
    echo "  exit $RC · real $(awk '/ real / {print $1}' $L) s · peak RSS $(awk '/maximum resident set size/ {print $1}' $L) · $(grep -o 'paint stack pressed down.*' $L | tail -1) · $(grep -o '\[bake-ground\] look=.*' $L | tail -1)" | tee -a $LOG
    grep -E '⛔|refus|T-junction' $L | head -5 | sed 's/^/    /' | tee -a $LOG
    echo "  [guard] changed $(diff $W/snap-before.txt $W/snap-after.txt | grep -c '^[<>]') · newer $(find -L $R/cartograph/data/$T $R/public -newer $W/snap-marker -type f | wc -l | tr -d ' ')" | tee -a $LOG
    if [[ -f $O/ground.json ]]; then
      ( cd $R; node checks/claims-the-ground-has-no-cross-polygon-t-junctions.mjs --dir=$O 2>&1 | head -6 | sed "s/^/    [tj $TAG] /" ) | tee -a $LOG
      ( cd $R; node checks/claims-the-ground-tiles-without-a-gap.mjs --dir=$O 2>&1 | tail -4 | sed "s/^/    [tiles $TAG] /" ) | tee -a $LOG
    fi
  done
  [[ -f $W/slabs/$T-HEAD/ground.bin && -f $W/slabs/$T-r1/ground.bin ]] && { cmp -s $W/slabs/$T-HEAD/ground.bin $W/slabs/$T-r1/ground.bin && echo "  $T ground.bin IDENTICAL" || echo "  $T ground.bin differs ($(stat -f %z $W/slabs/$T-HEAD/ground.bin) vs $(stat -f %z $W/slabs/$T-r1/ground.bin) bytes)"; } | tee -a $LOG
done; echo "ALLDONE $(date)" | tee -a $LOG
