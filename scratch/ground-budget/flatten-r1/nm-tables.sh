#!/bin/zsh
# nm-queue.sh — the near-miss check on the branch's tileGround and on HEAD's, then proof (3); gate at each launch, kill < 20%
W=/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/worktrees/rings-only; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync; D=$W/scratch/ground-budget/flatten-r1
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
gate() { if (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 55 )); then echo "⛔ $1 not launched: load $(sysctl -n vm.loadavg) · free $(free_pct)%"; exit 2; fi; echo "$1 launch $(date +%H:%M:%S) · load $(sysctl -n vm.loadavg) · free $(free_pct)%" }
nm() { local tag=$1 map=$2 out=$3; gate "near-miss $tag"
  ( cd $R && SWAP_MAP="$map" /usr/bin/time -l node --max-old-space-size=8000 --import $R/scratch/ground-budget/swap.mjs $D/run-nm.mjs hipointedemun "--expect=-879.641,-1074.934" "--out=$out" > $D/nm-$tag.out 2>&1 ) &
  local P=$! minf=100; while kill -0 $P 2>/dev/null; do f=$(free_pct); (( f < minf )) && minf=$f; (( f < 20 )) && { echo "KILL20 $tag"; pkill -f run-nm.mjs; }; sleep 10; done; wait $P; echo "  $tag rc=$? · min free $minf%"
  grep -E '^hipointedemun:|expected|real|maximum resident' $D/nm-$tag.out | sed 's/^/  /' }
NM="\"checks/claims-no-edge-is-drawn-twice.mjs\":\"$W/checks/claims-no-edge-is-drawn-twice.mjs\",\"cartograph/bake-ground.js\":\"$W/cartograph/bake-ground.js\""
nm tableBranch "{$NM,\"src/lib/tileGround.js\":\"$W/src/lib/tileGround.js\"}" $D/nm-table-branch
nm tableHEAD "{$NM}" $D/nm-table-HEAD
echo QUEUEDONE
