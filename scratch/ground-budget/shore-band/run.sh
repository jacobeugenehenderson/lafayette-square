#!/bin/zsh
# run.sh <scene> <landW> <waterW> — one scratch band bake (bake-band.mjs), heap explicit, timed (/usr/bin/time -l), a
# watchdog killing it under 30% free memory (Boz's bound). Log: <scene>-<landW>-<waterW>.log
scene=$1; L=$2; Wt=$3; here=${0:A:h}; root=${here:h:h:h}
log=$here/$scene-$L-$Wt.log
/usr/bin/time -l node --max-old-space-size=4096 $here/bake-band.mjs $scene $root/scratch/ground-budget/terrain-mean/after/$scene $L $Wt > $log 2>&1 &
pid=$!
while kill -0 $pid 2>/dev/null; do
  free=$(memory_pressure | tail -1 | grep -oE '[0-9]+')
  if [ "$free" -lt 30 ]; then echo "ABORT: free memory ${free}% < 30%" | tee -a $log; pkill -P $pid; kill $pid; exit 2; fi
  sleep 5
done
wait $pid; rc=$?
grep -E "band \(|regimes|real|maximum resident|Error" $log
exit $rc
