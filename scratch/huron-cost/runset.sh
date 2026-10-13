#!/bin/zsh
# Conformity alone on the dump, several runs one after another: runset.sh <tag>:<raw|deform>:<module> ...
# Each run is gated as run.sh (load < 8, memory_pressure free ≥ 40%), logs to conform-<tag>.log under /usr/bin/time -l,
# and records free % and vm_stat Swapins/Swapouts before and after. Scratch only; the dump comes from run.sh.
cd /Users/jacobhenderson/Desktop/lafayette-square.nosync
D=$PWD/scratch/huron-cost
DUMP=$D/${DUMP:-dump}
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
swp() { vm_stat | awk '/Swapins|Swapouts/ {print $1, $2}' | tr '\n' ' ' }
gate() { while (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 40 )); do sleep 30; done }
[[ -f $DUMP/meta.json ]] || { echo "no dump: run run.sh first"; exit 1 }
for R in "$@"; do
  T=${R%%:*}; rest=${R#*:}; S=${rest%%:*}; M=${rest#*:}
  gate; echo "$T ($S, $M) start $(date) · free $(free_pct)% · $(swp)"
  /usr/bin/time -l node --max-old-space-size=14000 $D/conform-alone.mjs $DUMP $S $M > $D/conform-$T.log 2>&1
  echo "$T exit $? $(date) · free $(free_pct)% · $(swp)"
done; echo ALLDONE
