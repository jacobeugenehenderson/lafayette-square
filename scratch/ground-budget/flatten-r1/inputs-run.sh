#!/bin/zsh
# inputs-run.sh — one paint-only run of HEAD per town (bake-ground.inputs.js), dumping the disputed steps' raw inputs and
# the flatten's output; then truth.mjs against the branch's flatten dump from paint-gate.sh. Guards as paint-gate.sh.
#   inputs-run.sh <town> <comma list of group keys>
W=${0:A:h}; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync; T=$1; LOG=$W/truth.log; OUT=$R/scratch/ground-budget/paint/out
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
while (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 40 )); do sleep 30; done
snap() { find -L $R/cartograph/data/$T $R/public -type f -exec stat -f '%m %z %N' {} + | sort -k3 }
snap > $W/snap-before.txt; touch $W/snap-marker
echo "$T inputs start $(date +%H:%M:%S) · load $(sysctl -n vm.loadavg) · keys $2" | tee -a $LOG
( cd $R/cartograph; SWAP_MAP="{\"cartograph/bake-ground.js\":\"$W/bake-ground.inputs.js\"}" PAINT_DUMP_KEYS=$2 INPUTS_DUMP=$W/dumps/$T-inputs.json FLATTEN_DUMP=$W/dumps/$T-HEAD2.json exec /usr/bin/time -l node --max-old-space-size=14000 --import $R/scratch/ground-budget/swap.mjs bake-ground.js --look=$T --scene=$T --out-dir=$OUT --shore=pending ) > $W/inputs-$T.log 2>&1 &
PID=$!; while kill -0 $PID 2>/dev/null; do (( $(free_pct) < 20 )) && { echo "  ⛔ free < 20%: killing" | tee -a $LOG; kill $PID; }; sleep 15; done
wait $PID; RC=$?; snap > $W/snap-after.txt
echo "  exit $RC · real $(awk '/ real / {print $1}' $W/inputs-$T.log) s · [guard] changed $(diff $W/snap-before.txt $W/snap-after.txt | grep -c '^[<>]') · newer $(find -L $R/cartograph/data/$T $R/public -newer $W/snap-marker -type f | wc -l | tr -d ' ')" | tee -a $LOG
cmp -s $W/dumps/$T-HEAD.json $W/dumps/$T-HEAD2.json && echo "  the flatten reproduces paint-gate's HEAD dump byte for byte" | tee -a $LOG || echo "  ⛔ the flatten does NOT reproduce paint-gate's HEAD dump" | tee -a $LOG
node --max-old-space-size=12000 $W/truth.mjs $W/dumps/$T-inputs.json $W/dumps/$T-HEAD2.json $W/dumps/$T-r1.json 2>&1 | tee -a $LOG
