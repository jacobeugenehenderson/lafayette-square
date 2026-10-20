#!/bin/zsh
# paint-time.sh — the rings-only gain, timed with Brace's paint-only kit (scratch/ground-budget/paint/: bake-ground up to
# the paint stack and no further, every console line stamped with seconds since start), HEAD's tileGround vs the
# branch's, back to back on the same machine, from the main tree's data; --shore=pending as serve.js's 'ground' pass;
# scratch out-dir; data/<town> + public/ snapshotted before and after each. Gates: load < 8, free ≥ 40% to start each.
#   paint-time.sh [town=huron] → paint-time.log beside this file
W=${0:A:h}; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync; P=$R/scratch/ground-budget/paint; T=${1:-huron}; LOG=$W/paint-time.log; OUT=$P/out; mkdir -p $OUT
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
snap() { find -L $R/cartograph/data/$T $R/public -type f -exec stat -f '%m %z %N' {} + | sort -k3 }
for TAG in HEAD rings-only; do
  while (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 40 )); do sleep 30; done
  M="{\"cartograph/bake-ground.js\":\"$P/bake-ground.paint-HEAD.js\""; [[ $TAG == rings-only ]] && M="$M,\"src/lib/tileGround.js\":\"$W/../../../src/lib/tileGround.js\""
  snap > $W/snap-before.txt; touch $W/snap-marker
  echo "$T $TAG start $(date +%H:%M:%S) · load $(sysctl -n vm.loadavg) · free $(free_pct)%" | tee -a $LOG
  ( cd $R/cartograph; SWAP_MAP="$M}" exec /usr/bin/time -l node --max-old-space-size=14000 --import $R/scratch/ground-budget/swap.mjs bake-ground.js --look=$T --scene=$T --out-dir=$OUT --shore=pending ) > $W/paint-$T-$TAG.log 2>&1
  RC=$?; snap > $W/snap-after.txt
  L=$W/paint-$T-$TAG.log
  echo "  exit $RC · pre-stack (to the first flatten line) $(grep -m1 'progress\] flatten' $L | grep -o '^\[+[0-9.]*s\]') · $(grep -o 'paint stack pressed down.*' $L | tail -1) · real $(awk '/ real / {print $1}' $L) s · peak RSS $(awk '/maximum resident set size/ {print $1}' $L)" | tee -a $LOG
  echo "  [guard] changed $(diff $W/snap-before.txt $W/snap-after.txt | grep -c '^[<>]') · newer $(find -L $R/cartograph/data/$T $R/public -newer $W/snap-marker -type f | wc -l | tr -d ' ')" | tee -a $LOG
done; echo "ALLDONE $(date)" | tee -a $LOG
