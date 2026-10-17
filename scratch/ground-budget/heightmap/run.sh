#!/bin/zsh
# run.sh <scene> [env...] — one town, heap explicit; a watchdog kills it if free memory falls under 30% (Boz's bound).
scene=$1; shift
env "$@" node --max-old-space-size=4096 residual-by-distance.mjs $scene &
pid=$!
while kill -0 $pid 2>/dev/null; do
  free=$(memory_pressure | tail -1 | grep -oE '[0-9]+')
  echo "$(date +%T) load $(sysctl -n vm.loadavg | awk '{print $2}') free ${free}%" >> $scene.load.log
  if [ "$free" -lt 30 ]; then echo "ABORT: free memory ${free}% < 30%" | tee -a $scene.load.log; kill $pid; exit 2; fi
  sleep 15
done
wait $pid
