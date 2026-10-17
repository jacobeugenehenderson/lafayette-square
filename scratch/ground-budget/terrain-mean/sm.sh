#!/bin/zsh
# sm.sh <before|after> <scene> — one scratch shore-median bake (the same rules as bake.sh), into <which>/<scene>/shore-median/
# a watchdog kills it if free memory falls under 30% (Boz's bound). Output: scratch/ground-budget/terrain-mean/<which>/<scene>/
which=$1; scene=$2
here=${0:A:h}; root=${here:h:h:h}
out=$here/$which/$scene/shore-median; mkdir -p $out
script=$root/cartograph/bake-shore-median.mjs; [ $which = before ] && script=$here/before/bake-shore-median.mjs
cd $root/cartograph
/usr/bin/time -l node --max-old-space-size=4096 $script --scene=$scene --out=$out > $out/sm.log 2> $out/sm-time.log &
pid=$!
while kill -0 $pid 2>/dev/null; do
  free=$(memory_pressure | tail -1 | grep -oE '[0-9]+')
  echo "$(date +%T) load $(sysctl -n vm.loadavg | awk '{print $2}') free ${free}%" >> $out/sm-load.log
  if [ "$free" -lt 30 ]; then echo "ABORT: free memory ${free}% < 30%" | tee -a $out/sm-load.log; pkill -P $pid; kill $pid; exit 2; fi
  sleep 5
done
wait $pid; rc=$?
grep -E "real|maximum resident" $out/sm-time.log
exit $rc
