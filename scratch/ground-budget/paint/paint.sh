#!/bin/zsh
# PAINT-ONLY timing, HEAD vs d09644cc, back to back on the same machine (Brace, 2026-10-13; Boz). Each run is bake-ground
# up to the paint stack and no further (the copies exit before the deformer and write nothing), every console line stamped
# with seconds since start. Gates: load < 8 and free >= 40% to start each; load + free logged every 60 s; killed below 20%.
# served1011 = the worktree .claude/worktrees/served-huron-1011 at 5913f2ef (the commit Huron's served ground was baked on,
# 2026-10-11 01:25 CDT), its huron data dir linked to HEAD's so only the code differs; that commit's 'ground' pass took no shore flag.
# HEAD runs as serve.js's 'ground' pass does (--shore=pending: no shore-median.json yet, no sand); d09644cc has no shore median.
#   paint.sh <town> [HEAD|d09644cc ...] → scratch/ground-budget/paint/paint-<tag>.log
cd /Users/jacobhenderson/Desktop/lafayette-square.nosync
TOWN=$1; TAGS=(${@:2}); (( ${#TAGS} )) || TAGS=(HEAD d09644cc); R=$PWD; P=$R/scratch/ground-budget/paint; X=$R/scratch/ground-budget/tern-d09644cc; OUT=$P/out; mkdir -p $OUT
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
for TAG in $TAGS; do
  while (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 40 )); do sleep 30; done
  SHORE=; if [[ $TAG == HEAD ]]; then SHORE=--shore=pending; export SWAP_MAP="{\"cartograph/bake-ground.js\":\"$P/bake-ground.paint-HEAD.js\"}"
  else export SWAP_MAP="{\"cartograph/bake-ground.js\":\"$P/bake-ground.paint-d09644cc.js\",\"cartograph/groundDeformer.mjs\":\"$X/cartograph/groundDeformer.mjs\",\"cartograph/lineHeight.mjs\":\"$X/cartograph/lineHeight.mjs\",\"cartograph/shoreGusset.mjs\":\"$X/cartograph/shoreGusset.mjs\",\"cartograph/surfaces.mjs\":\"$X/cartograph/surfaces.mjs\",\"cartograph/waterLevel.mjs\":\"$X/cartograph/waterLevel.mjs\",\"src/lib/tileGround.js\":\"$X/src/lib/tileGround.js\"}"; fi
  CWD=cartograph; IMP=(--import $R/scratch/ground-budget/swap.mjs)
  if [[ $TAG == served1011 ]]; then unset SWAP_MAP; CWD=$R/.claude/worktrees/served-huron-1011/cartograph; IMP=(); fi
  if [[ $TAG == served1011 ]]; then   # Boz's guard: the linked data dir and public/ must come out untouched
    snap() { find -L $R/cartograph/data/huron $R/public -type f -exec stat -f '%m %z %N' {} + | sort -k3 }
    snap > $P/snap-before.txt; touch $P/snap-marker; fi
  echo "$TAG start $(date) · load $(sysctl -n vm.loadavg) · free $(free_pct)%"
  ( cd $CWD; exec /usr/bin/time -l node --max-old-space-size=14000 $IMP bake-ground.js --look=$TOWN --scene=$TOWN --out-dir=$OUT $SHORE ) > $P/paint-$TAG.log 2>&1 &
  PID=$!; n=0
  while kill -0 $PID 2>/dev/null; do (( n % 4 == 0 )) && echo "  [load] $TAG $(date +%H:%M:%S) $(sysctl -n vm.loadavg) · free $(free_pct)%"
    (( $(free_pct) < 20 )) && { echo "  ⛔ free < 20%: killing $TAG"; pkill -P $PID; kill $PID; }; (( n++ )); sleep 15; done
  wait $PID; RC=$?
  if [[ $TAG == served1011 ]]; then snap > $P/snap-after.txt
    echo "  [guard] files changed under data/huron or public/: $(diff $P/snap-before.txt $P/snap-after.txt | grep -c '^[<>]') · newer than the start: $(find -L $R/cartograph/data/huron $R/public -newer $P/snap-marker -type f | wc -l | tr -d ' ')"; fi
  echo "$TAG exit $RC $(date) · $(grep -o 'paint stack pressed down.*' $P/paint-$TAG.log | tail -1)"
done; echo ALLDONE
