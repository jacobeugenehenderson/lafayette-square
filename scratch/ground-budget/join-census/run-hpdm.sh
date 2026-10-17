#!/bin/zsh
# run-hpdm.sh — one producer-only run on HPDM (stamp-audit's bake-ground.audit.js exits after buildTileBakeShape) with the
# join-census tileGround built from the screed-arc worktree → census-hipointedemun.json. Gated: load < 8, free ≥ 40%; killed under 30%.
J=${0:A:h}; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync; A=$R/scratch/ground-budget/stamp-audit
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
while (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 40 )); do sleep 20; done
( cd $R/cartograph; SWAP_MAP="{\"cartograph/bake-ground.js\":\"$A/bake-ground.audit.js\",\"src/lib/tileGround.js\":\"$J/tileGround.census.hpdm.js\"}" STAMP_AUDIT=$J/stamp-hipointedemun.json CENSUS_OUT=$J/census-hipointedemun.json exec /usr/bin/time -l node --max-old-space-size=12000 --import $R/scratch/ground-budget/swap.mjs bake-ground.js --look=hipointedemun --scene=hipointedemun --out-dir=$J/out-hpdm --shore=pending ) > $J/run-hpdm.log 2>&1 &
PID=$!; while kill -0 $PID 2>/dev/null; do (( $(free_pct) < 30 )) && { echo "⛔ free < 30%: killing"; kill $PID; }; sleep 10; done
wait $PID; echo "exit $? · $(ls -la $J/census-hipointedemun.json 2>&1) · real $(awk '$2 == "real" {print $1}' $J/run-hpdm.log) s"
