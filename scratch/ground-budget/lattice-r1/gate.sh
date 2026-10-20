#!/bin/zsh
# gate.sh <scene> <tag> — one throwaway ground bake into a scratch slab (lattice-r1/<scene>-<tag>/) from the main checkout's
# cartograph/ (trunk: its terrain read and refusals) with the worktree's tileGround.js + bake-ground.js swapped in, the served
# shore median, heap explicit, timed (/usr/bin/time -l); watchdog aborts under 30% free. Never touches public/ or data/.
scene=$1; tag=$2; here=${0:A:h}; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync; W=${here:h:h:h}
out=$here/$scene-$tag; rm -rf $out; mkdir -p $out; if [ -n "$GATE_MED" ]; then cp $GATE_MED $out/shore-median.json; elif [ -f $R/public/baked/$scene/shore-median.json ]; then cp $R/public/baked/$scene/shore-median.json $out/; fi
F=$(memory_pressure | awk -F': ' '/free percentage/ {print int($2)}')
if (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || F < 40 )) || pgrep -f "bake-ground.js --look" >/dev/null; then echo "not launched ($F%)"; exit 2; fi
M="{\"src/lib/tileGround.js\":\"${GATE_TG:-$W/src/lib/tileGround.js}\",\"cartograph/bake-ground.js\":\"${GATE_BG:-$W/cartograph/bake-ground.js}\"}"
cd $R/cartograph; t0=$SECONDS
SWAP_MAP=$M /usr/bin/time -l node --max-old-space-size=8192 --import $R/scratch/ground-budget/swap.mjs bake-ground.js --look=$scene --scene=$scene --out-dir=$out > $out/ground.log 2> $out/time.log &
pid=$!
while kill -0 $pid 2>/dev/null; do free=$(memory_pressure | tail -1 | grep -oE '[0-9]+')
  echo "$(date +%T) load $(sysctl -n vm.loadavg | awk '{print $2}') free ${free}%" >> $out/load.log
  if [ "$free" -lt 30 ]; then echo "ABORT: free ${free}% < 30%" | tee -a $out/load.log; pkill -P $pid; kill $pid; exit 2; fi; sleep 10; done
wait $pid; rc=$?
echo "rc $rc · $((SECONDS - t0)) s"; grep -E "real|maximum resident" $out/time.log; grep -E "^Error|refus|REFUS" $out/time.log $out/ground.log | head -5 | cut -c1-500
exit $rc
