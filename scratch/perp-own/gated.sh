#!/bin/zsh
# gated.sh <scene> — the heavy-job gate, then one run with an explicit heap, killed if free memory drops under 30%
P=${0:A:h}
f=$(memory_pressure | tail -1 | grep -oE '[0-9]+'); l=$(sysctl -n vm.loadavg | awk '{print int($2)}'); big=$(ps -axo rss,command | grep -E '[n]ode' | awk '$1>1000000' | wc -l | tr -d ' ')
echo "gate: free $f% load $l other node >1GB $big"
if [ "$f" -lt 70 ] || [ "$l" -ge 8 ] || [ "$big" != 0 ]; then echo "gate closed — not run"; exit 3; fi
node --max-old-space-size=2500 $P/${RUN:-run.mjs} "$@" & pid=$!
while kill -0 $pid 2>/dev/null; do f=$(memory_pressure | tail -1 | grep -oE '[0-9]+'); [ "$f" -lt 30 ] && { kill $pid; echo "ABORTED: free $f%"; }; sleep 5; done
wait $pid
