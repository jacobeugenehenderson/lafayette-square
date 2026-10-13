#!/bin/zsh
# Cairn's Huron sweep re-run with ACCURACY=1 (Brace, 2026-10-13): sweep.sh <tag>:<raw|deform>:<env assignments, comma-separated> ...
# Gate before each run: load < 8 and free >= 40%. Watchdog: kills the run if free drops below 20% (Boz). Logs: scratch/ground-budget/acc-<tag>.log.
cd /Users/jacobhenderson/Desktop/lafayette-square.nosync
D=$PWD/scratch/ground-budget; DUMP=$PWD/scratch/huron-cost/dump-shore; CONF=$PWD/cartograph/groundConformity.js
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
gate() { while (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 40 )); do sleep 30; done }
for R in "$@"; do
  T=${R%%:*}; rest=${R#*:}; S=${rest%%:*}; E=${rest#*:}; [[ $E == $S ]] && E=""
  gate; echo "$T ($S · ${E:-as dumped}) start $(date) · free $(free_pct)% · load $(sysctl -n vm.loadavg)"
  ( for kv in ${(s:,:)E}; do export $kv; done; export ACCURACY=1
    exec /usr/bin/time -l node --max-old-space-size=14000 $PWD/scratch/huron-cost/conform-alone.mjs $DUMP $S $CONF ) > $D/acc-$T.log 2>&1 &
  P=$!
  while kill -0 $P 2>/dev/null; do (( $(free_pct) < 20 )) && { echo "  ⛔ free $(free_pct)% < 20%: killing $T"; pkill -P $P; kill $P; }; sleep 15; done
  wait $P; echo "$T exit $? $(date) · free $(free_pct)%"
done; echo ALLDONE
