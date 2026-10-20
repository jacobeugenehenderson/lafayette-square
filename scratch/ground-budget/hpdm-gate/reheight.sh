#!/bin/zsh
# reheight.sh <deformer> <tag> — reheight.mjs on the road slab (db0bebb6), gated (load < 8, free ≥ 70%), heap 6000, killed below 30% free
G=${0:A:h}; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync; cd $R
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
(( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 70 )) && { echo "⛔ not launched: load $(sysctl -n vm.loadavg) · free $(free_pct)%"; exit 2; }
node --max-old-space-size=6000 $G/reheight.mjs --slab=$G/slab-hipointedemun-full-road --dump=$G/bands-sweep.json --deformer=$1 --out=$G/slab-rh-$2 > $G/rh-$2.log 2>&1 &
PID=$!; MINF=100; while kill -0 $PID 2>/dev/null; do F=$(free_pct); (( F < MINF )) && MINF=$F; (( F < 30 )) && { echo "⛔ free $F% < 30%: killing"; kill $PID; }; sleep 5; done
wait $PID; echo "$2 exit $? · min free $MINF%"; grep -v 'scene not' $G/rh-$2.log | cut -c1-700
