#!/bin/zsh
# board.sh — the integration board (Lath, 2026-10-20): the safe tier, serially, under the heavy gate.
# ⛔ Launch only at free ≥ 70%, load < 8, no other node over 1 GB; every node child is killed under 30% free.
W=${0:A:h:h:h}; O=$W/scratch/integration-board/out; mkdir -p $O
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
F=$(free_pct); BIG=$(ps -axo rss,command | awk '$1 > 1000000 && /node/' | wc -l | tr -d ' ')
(( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || F < 70 || BIG > 0 )) && { echo "not launched (load $(sysctl -n vm.loadavg) · free $F% · node > 1 GB: $BIG)"; exit 2 }
cd $W
# The log's first line names the commit it ran on, so a later sort has a printed base, not one inferred from timestamps.
echo "board HEAD $(git rev-parse --short HEAD)$(git diff --quiet HEAD -- || echo ' + uncommitted tracked changes')" > $O/${TAG:-safe}.log
CHECKS_JOBS=1 node checks/run.mjs "$@" >> $O/${TAG:-safe}.log 2>&1 &
PID=$!; MINF=100
while kill -0 $PID 2>/dev/null; do
  F=$(free_pct); (( F < MINF )) && MINF=$F
  if (( F < 30 )); then echo "⛔ free $F% < 30%: killing the board" | tee -a $O/${TAG:-safe}.log; pkill -P $PID; kill $PID; fi
  sleep 5
done
wait $PID; echo "board rc=$? min-free=$MINF%" | tee -a $O/${TAG:-safe}.log
