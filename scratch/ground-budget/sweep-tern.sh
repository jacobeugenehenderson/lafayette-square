#!/bin/zsh
# The ground-budget points on another deformer, guarded (Brace, 2026-10-13): sweep-tern.sh <worktree> <tag>:<env,comma-separated> ...
# Each point logs the worktree's HEAD and the deformer's sha256 at its start; every 30 s it re-reads both, and a point whose
# worktree moved or whose deformer changed is STOPPED and said (Boz). Gates as sweep.sh: load < 8 and free >= 40% to start,
# killed below 20% free. Logs: scratch/ground-budget/acc-<tag>.log.
cd /Users/jacobhenderson/Desktop/lafayette-square.nosync
WT=$1; shift; TD=$WT/cartograph/groundDeformer.mjs
D=$PWD/scratch/ground-budget; DUMP=$PWD/scratch/huron-cost/dump-shore; CONF=$PWD/cartograph/groundConformity.js
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
gate() { while (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 40 )); do sleep 30; done }
state() { echo "$(cat $WT/SOURCE 2>/dev/null || git -C $WT rev-parse --short HEAD) $(shasum -a 256 $TD | cut -c1-16)" }
for R in "$@"; do
  T=${R%%:*}; E=${R#*:}
  gate; S0=$(state); echo "$T (${E}) start $(date) · worktree HEAD + deformer sha256: $S0 · free $(free_pct)% · load $(sysctl -n vm.loadavg)"
  ( for kv in ${(s:,:)E}; do export $kv; done; export ACCURACY=1 DEFORMER=$TD
    exec /usr/bin/time -l node --max-old-space-size=14000 $PWD/scratch/huron-cost/conform-alone.mjs $DUMP deform $CONF ) > $D/acc-$T.log 2>&1 &
  P=$!; n=0
  while kill -0 $P 2>/dev/null; do
    (( $(free_pct) < 20 )) && { echo "  ⛔ free $(free_pct)% < 20%: killing $T"; pkill -P $P; kill $P; }
    (( n++ % 2 == 0 )) && { S=$(state); [[ $S != $S0 ]] && { echo "  ⛔ $T: the worktree moved or the deformer changed ($S0 → $S): STOPPED"; pkill -P $P; kill $P; } }
    sleep 15
  done
  wait $P; echo "$T exit $? $(date) · free $(free_pct)% · end state $(state)"
done; echo ALLDONE
