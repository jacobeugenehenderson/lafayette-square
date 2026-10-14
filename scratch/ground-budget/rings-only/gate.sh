#!/bin/zsh
# gate.sh — the rings-only offsetRingByRects gate (Boz's ruling 2026-10-14): everything bake-ground's buildTileBakeShape
# returns (byMaterial · byFaceUse · shapeArtifact · highwayRings · blockRings · curbCutRamps · kerb), hashed in order with
# exact doubles, for HPDM, Huron and LS — HEAD's tileGround vs the branch's — must be IDENTICAL. Runs from the main tree
# (its data), the gate copy of bake-ground and the branch's tileGround swapped in memory (scratch/ground-budget/swap.mjs);
# exits before the paint stack; --shore=pending as serve.js's 'ground' pass; scratch out-dir. ⛔ Read-only: each town's
# data dir and public/ are snapshotted before and after every run, and any change is printed. One job at a time;
# waits while load ≥ 8 or free < 40%.   gate.sh [town …] → gate.log beside this file
W=${0:A:h}; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync; LOG=$W/gate.log; OUT=$R/scratch/ground-budget/paint/out; mkdir -p $OUT
TOWNS=(${@}); (( ${#TOWNS} )) || TOWNS=(hipointedemun huron lafayette-square)
node $W/prep.mjs || exit 1
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
echo "gate $(date) · branch tileGround $(git -C $W hash-object $W/../../../src/lib/tileGround.js) · HEAD's $(git -C $R hash-object $R/src/lib/tileGround.js)" | tee -a $LOG
TAGS=(${=GATE_TAGS:-HEAD rings-only})
for T in $TOWNS; do for TAG in $TAGS; do
  while (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 40 )); do sleep 30; done
  M="{\"cartograph/bake-ground.js\":\"$W/bake-ground.gate.js\""; [[ $TAG == rings-only ]] && M="$M,\"src/lib/tileGround.js\":\"$W/../../../src/lib/tileGround.js\""
  [[ $TAG == mutant ]] && M="$M,\"src/lib/tileGround.js\":\"$W/tileGround.mutant.js\""
  snap() { find -L $R/cartograph/data/$T $R/public -type f -exec stat -f '%m %z %N' {} + | sort -k3 }
  snap > $W/snap-before.txt; touch $W/snap-marker
  echo "$T $TAG start $(date +%H:%M:%S) · load $(sysctl -n vm.loadavg)" | tee -a $LOG
  ( cd $R/cartograph; SWAP_MAP="$M}" exec /usr/bin/time -l node --max-old-space-size=14000 --import $R/scratch/ground-budget/swap.mjs bake-ground.js --look=$T --scene=$T --out-dir=$OUT --shore=pending ) > $W/run-$T-$TAG.log 2>&1
  RC=$?; snap > $W/snap-after.txt
  echo "  exit $RC · $(grep -o '\[rings-only-gate\].*' $W/run-$T-$TAG.log) · peak RSS $(awk '/maximum resident set size/ {print $1}' $W/run-$T-$TAG.log)" | tee -a $LOG
  echo "  [guard] changed $(diff $W/snap-before.txt $W/snap-after.txt | grep -c '^[<>]') · newer $(find -L $R/cartograph/data/$T $R/public -newer $W/snap-marker -type f | wc -l | tr -d ' ')" | tee -a $LOG
done
  for X in $TAGS; do [[ $X == HEAD ]] && continue; a=$(grep -o "\[rings-only-gate\] $T sha256 [0-9a-f]*" $W/run-$T-HEAD.log | awk '{print $4}'); b=$(grep -o "\[rings-only-gate\] $T sha256 [0-9a-f]*" $W/run-$T-$X.log | awk '{print $4}')
  [[ -n $a && $a == $b ]] && echo "  ✅ $T $X IDENTICAL to HEAD ($a)" | tee -a $LOG || echo "  ⛔ $T $X DIFFERS (HEAD ${a:-none} · $X ${b:-none})" | tee -a $LOG; done
done; echo "ALLDONE $(date)" | tee -a $LOG
