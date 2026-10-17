#!/bin/zsh
# run.sh <scene> <tag> [extra env assignments…] — overnight jobs 3/4 (Boz): one throwaway ground bake into a SCRATCH slab,
# scratch/ground-budget/true-mean-ground/<scene>-<tag>/, on the true-mean terrain (eb5aa261's scratch bake) unless tag = served, heap explicit,
# timed (/usr/bin/time -l), watchdog: abort under 30% free. Never touches public/baked. Writes bake-timings.json beside the
# slab in serve.js's schema so checks/claims-the-ground-stays-in-budget.mjs can judge it.
scene=$1; tag=$2; shift 2
here=${0:A:h}; root=${here:h:h:h}
out=$here/$scene-$tag; mkdir -p $out
tdir=$root/scratch/ground-budget/terrain-mean/after/$scene
# tag `served` = the CONTROL: the town's own clean/ terrain and its served shore median, HEAD's code
if [ $tag = served ]; then cp -n $root/public/baked/$scene/shore-median.json $out/; tenv=(); else
  [ -f $out/shore-median.json ] || cp $tdir/shore-median/shore-median.json $out/; tenv=(CARTOGRAPH_TERRAIN_DIR=$tdir); fi
cd $root/cartograph
t0=$(python3 -c 'import time;print(int(time.time()*1000))')
env $tenv "$@" /usr/bin/time -l node --max-old-space-size=8192 bake-ground.js --look=$scene --scene=$scene --out-dir=$out > $out/ground.log 2> $out/time.log &
pid=$!
while kill -0 $pid 2>/dev/null; do
  free=$(memory_pressure | tail -1 | grep -oE '[0-9]+')
  echo "$(date +%T) load $(sysctl -n vm.loadavg | awk '{print $2}') free ${free}%" >> $out/load.log
  if [ "$free" -lt 30 ]; then echo "ABORT: free memory ${free}% < 30%" | tee -a $out/load.log; pkill -P $pid; kill $pid; exit 2; fi
  sleep 10
done
wait $pid; rc=$?
t1=$(python3 -c 'import time;print(int(time.time()*1000))')
[ $rc = 0 ] && echo "{\"$scene:ground\": {\"ms\": $((t1 - t0)), \"at\": \"$(date -u +%FT%TZ)\"}}" > $out/bake-timings.json
grep -E "real|maximum resident" $out/time.log; tail -3 $out/ground.log
exit $rc
