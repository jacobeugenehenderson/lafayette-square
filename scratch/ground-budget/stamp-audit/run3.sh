#!/bin/zsh
# run2.sh (copy #3: the worktree code, past the line heights) <town> — one producer-only run (bake-ground.audit3.js exits after buildTileBakeShape) with the stamp-audit tileGround,
# into stamp-<town>.json. Gated: load < 8, free ≥ 40% at launch (waits); killed below 30% free. Nothing is written but scratch.
A=${0:A:h}; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync; T=$1
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
while (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 40 )); do sleep 20; done
echo "$T start $(date +%H:%M:%S) · load $(sysctl -n vm.loadavg) · free $(free_pct)%"
( cd $R/cartograph; SWAP_MAP="{\"cartograph/bake-ground.js\":\"$A/bake-ground.audit3.js\",\"src/lib/tileGround.js\":\"$A/tileGround.audit3.js\"}" STAMP_AUDIT=$A/stamp3-$T.json exec /usr/bin/time -l node --max-old-space-size=12000 --import $R/scratch/ground-budget/swap.mjs bake-ground.js --look=$T --scene=$T --out-dir=$A/out-$T --shore=pending ) > $A/run3-$T.log 2>&1 &
PID=$!; while kill -0 $PID 2>/dev/null; do (( $(free_pct) < 30 )) && { echo "⛔ free < 30%: killing"; kill $PID; }; sleep 10; done
wait $PID; echo "exit $? · $(grep -o '\[stamp-audit\].*' $A/run3-$T.log) · real $(awk '$2 == "real" {print $1}' $A/run3-$T.log) s"
