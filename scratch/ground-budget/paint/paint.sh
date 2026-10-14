#!/bin/zsh
# PAINT-ONLY timing, HEAD vs d09644cc, back to back on the same machine (Brace, 2026-10-13; Boz). Each run is bake-ground
# up to the paint stack and no further (the copies exit before the deformer and write nothing), every console line stamped
# with seconds since start. Gates: load < 8 and free >= 40% to start each; load + free logged every 60 s; killed below 20%.
#   paint.sh <town> → scratch/ground-budget/paint/paint-<tag>.log
cd /Users/jacobhenderson/Desktop/lafayette-square.nosync
TOWN=$1; R=$PWD; P=$R/scratch/ground-budget/paint; X=$R/scratch/ground-budget/tern-d09644cc; OUT=$P/out; mkdir -p $OUT
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
for TAG in HEAD d09644cc; do
  while (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 40 )); do sleep 30; done
  if [[ $TAG == HEAD ]]; then export SWAP_MAP="{\"cartograph/bake-ground.js\":\"$P/bake-ground.paint-HEAD.js\"}"
  else export SWAP_MAP="{\"cartograph/bake-ground.js\":\"$P/bake-ground.paint-d09644cc.js\",\"cartograph/groundDeformer.mjs\":\"$X/cartograph/groundDeformer.mjs\",\"cartograph/lineHeight.mjs\":\"$X/cartograph/lineHeight.mjs\",\"cartograph/shoreGusset.mjs\":\"$X/cartograph/shoreGusset.mjs\",\"cartograph/surfaces.mjs\":\"$X/cartograph/surfaces.mjs\",\"cartograph/waterLevel.mjs\":\"$X/cartograph/waterLevel.mjs\",\"src/lib/tileGround.js\":\"$X/src/lib/tileGround.js\"}"; fi
  echo "$TAG start $(date) · load $(sysctl -n vm.loadavg) · free $(free_pct)%"
  ( cd cartograph; exec /usr/bin/time -l node --max-old-space-size=14000 --import $R/scratch/ground-budget/swap.mjs bake-ground.js --look=$TOWN --scene=$TOWN --out-dir=$OUT ) > $P/paint-$TAG.log 2>&1 &
  PID=$!; n=0
  while kill -0 $PID 2>/dev/null; do (( n % 4 == 0 )) && echo "  [load] $TAG $(date +%H:%M:%S) $(sysctl -n vm.loadavg) · free $(free_pct)%"
    (( $(free_pct) < 20 )) && { echo "  ⛔ free < 20%: killing $TAG"; pkill -P $PID; kill $PID; }; (( n++ )); sleep 15; done
  wait $PID; echo "$TAG exit $? $(date) · $(grep -o 'paint stack pressed down.*' $P/paint-$TAG.log | tail -1)"
done; echo ALLDONE
