#!/bin/zsh
# bake.sh <before|after> <scene> — one scratch terrain bake, heap explicit, timed (/usr/bin/time -l: wall, peak RSS);
# a watchdog kills it if free memory falls under 30% (Boz's bound). Output: scratch/ground-budget/terrain-mean/<which>/<scene>/
which=$1; scene=$2
here=${0:A:h}; root=${here:h:h:h}
out=$here/$which/$scene; mkdir -p $out
script=$root/cartograph/bake-terrain.js; [ $which = before ] && script=$here/before/bake-terrain.js
cd $root/cartograph
/usr/bin/time -l node --max-old-space-size=4096 $script --scene=$scene --out-dir=$out > $out/bake.log 2> $out/time.log &
pid=$!
while kill -0 $pid 2>/dev/null; do
  free=$(memory_pressure | tail -1 | grep -oE '[0-9]+')
  echo "$(date +%T) load $(sysctl -n vm.loadavg | awk '{print $2}') free ${free}%" >> $out/load.log
  if [ "$free" -lt 30 ]; then echo "ABORT: free memory ${free}% < 30%" | tee -a $out/load.log; pkill -P $pid; kill $pid; exit 2; fi
  sleep 5
done
wait $pid; rc=$?
grep -E "real|maximum resident" $out/time.log
exit $rc
