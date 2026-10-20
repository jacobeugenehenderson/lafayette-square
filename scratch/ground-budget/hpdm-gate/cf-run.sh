#!/bin/zsh
# cf-run.sh — cf-seams.mjs on the gate slab, gated (load < 8, free ≥ 70% at launch, per Boz), heap 6000, killed below 30% free.
G=${0:A:h}; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync; cd $R
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
(( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 70 )) && { echo "⛔ not launched: load $(sysctl -n vm.loadavg) · free $(free_pct)%"; exit 2; }
echo "start $(date +%H:%M:%S) · load $(sysctl -n vm.loadavg) · free $(free_pct)%"
/usr/bin/time -l node --max-old-space-size=6000 $G/cf-seams.mjs --slab=$G/slab-hipointedemun-full --dump=$G/bands-gate.json --deformer=$G/groundDeformer.base-78a20849.mjs --new=$R/.claude/worktrees/hpdm-gate/cartograph/groundDeformer.mjs --raw=$G/groundDeformer.cf-raw.mjs --road=$G/groundDeformer.cf-road.mjs ${@} > $G/cf-seams.log 2>&1 &
PID=$!; MINF=100; while kill -0 $PID 2>/dev/null; do F=$(free_pct); (( F < MINF )) && MINF=$F; (( F < 30 )) && { echo "⛔ free $F% < 30%: killing"; kill $PID; }; sleep 10; done
wait $PID; echo "exit $? · min free $MINF% · peak RSS $(awk '/maximum resident set size/ {print $1}' $G/cf-seams.log)"; grep -v 'scene not' $G/cf-seams.log | grep -E "^(base|raw|half|new|road)|seams by pair|worst by class|reach edge:|Error"
