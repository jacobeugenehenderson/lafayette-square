#!/bin/zsh
# simplify-x1.sh — phase-1 simplifier (simplify/simplify.mjs) at ×1 of the slab's own refineTol (7.8 mm, the bake log's
# "ped bands refine to") on slab-hipointedemun-full-<$1, default road>, into its -x1, then measure.mjs (with T-junctions).
# Gated: load < 8, free ≥ 70% at launch (waits up to 30 min), heap 6000; killed below 30% free. Scratch only.
cd /Users/jacobhenderson/Desktop/lafayette-square.nosync
G=scratch/ground-budget/hpdm-gate; IN=$G/slab-hipointedemun-full-${1:-road}; O=$G/slab-hipointedemun-full-${1:-road}-x1; S=public/baked/hipointedemun/scene.json
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
# waits up to 30 min for load < 8 and free ≥ 70% (Boz), then launches once; never launches below it
for i in {1..90}; do (( $(sysctl -n vm.loadavg | awk '{print int($2)}') < 8 && $(free_pct) >= 70 )) && break; sleep 20; done
(( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 70 )) && { echo "⛔ not launched after 30 min: load $(sysctl -n vm.loadavg) · free $(free_pct)%"; exit 2; }
echo "start $(date +%H:%M:%S) · load $(sysctl -n vm.loadavg) · free $(free_pct)%"
( /usr/bin/time -l node --max-old-space-size=6000 scratch/ground-budget/simplify/simplify.mjs --in=$IN --out=$O --tol=0.0078 --scene=$S && \
  node --max-old-space-size=6000 scratch/ground-budget/simplify/measure.mjs --a=$IN --b=$O --scene=$S --n=1000000 --tj ) > $G/simplify-x1${1:+-$1}.log 2>&1 &
PID=$!; MINF=100; while kill -0 $PID 2>/dev/null; do F=$(free_pct); (( F < MINF )) && MINF=$F; (( F < 30 )) && { echo "⛔ free $F% < 30%: killing"; pkill -P $PID; kill $PID; }; sleep 10; done
wait $PID; echo "exit $? · min free $MINF% · end $(date +%H:%M:%S)"
