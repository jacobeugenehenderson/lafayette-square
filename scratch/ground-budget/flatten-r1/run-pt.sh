#!/bin/zsh
W=/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/worktrees/rings-only/scratch/ground-budget/flatten-r1; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
ld() { sysctl -n vm.loadavg | awk '{print int($2)}' }
if (( $(ld) >= 8 )); then echo "load $(sysctl -n vm.loadavg) — waiting one minute"; sleep 60; fi
if (( $(ld) >= 8 || $(free_pct) < 55 )); then echo "⛔ not launched: load $(sysctl -n vm.loadavg) · free $(free_pct)%"; exit 2; fi
echo "launch $(date +%H:%M:%S) · load $(sysctl -n vm.loadavg) · free $(free_pct)%"
O=$W/slabs/diag; rm -rf $O; mkdir -p $O
snap() { find -L $R/cartograph/data/hipointedemun $R/public -type f -exec stat -f '%m %z %N' {} + | sort -k3 }; snap > $W/snap-before.txt
( cd $R/cartograph; PT_AT=-20.71,-587.62 PT_OUT=$W/pt-cluster.json SWAP_MAP="{\"cartograph/bake-ground.js\":\"$W/bake-ground.pt.js\",\"src/lib/tileGround.js\":\"$W/../../../src/lib/tileGround.js\"}" /usr/bin/time -l node --max-old-space-size=14000 --import $R/scratch/ground-budget/swap.mjs bake-ground.js --look=hipointedemun --scene=hipointedemun --out-dir=$O --shore=pending > $W/pt.log 2>&1 ) &
P=$!; minf=100; while kill -0 $P 2>/dev/null; do f=$(free_pct); (( f < minf )) && minf=$f; (( f < 20 )) && { echo KILL20; pkill -f "out-dir=$O"; }; sleep 10; done; wait $P; echo "exit $? · min free $minf% · $(date +%H:%M:%S)"
snap > $W/snap-after.txt; echo "guard $(diff $W/snap-before.txt $W/snap-after.txt | grep -c '^[<>]')"
grep -E '\[pt\]|^[A-Za-z]*Error| real | user |maximum resident' $W/pt.log | cut -c1-400
