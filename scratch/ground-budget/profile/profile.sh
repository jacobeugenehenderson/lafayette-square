#!/bin/zsh
# CPU profile of HEAD's paint stack on Huron, stopped when the step after <stop key> begins (Brace, 2026-10-14; Boz).
# Scratch copies of bake-ground + tileGround (counters, per-step flatten sizes/times, hrtime marks) swapped in memory;
# --shore=pending as serve.js's 'ground' pass; scratch out-dir. Gates: load < 8, free >= 40%; load every 60 s; killed
# below 20%; data/huron + public/ snapshotted before and after.   profile.sh [stop key] → scratch/ground-budget/profile/
cd /Users/jacobhenderson/Desktop/lafayette-square.nosync
STOP=${1:-mat:treelawn:underived}; R=$PWD; D=$R/scratch/ground-budget/profile; OUT=$R/scratch/ground-budget/paint/out; mkdir -p $OUT $D/cpu
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
snap() { find -L $R/cartograph/data/huron $R/public -type f -exec stat -f '%m %z %N' {} + | sort -k3 }
while (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 40 )); do sleep 30; done
snap > $D/snap-before.txt; touch $D/snap-marker; rm -f $D/cpu/*.cpuprofile
echo "start $(date +%H:%M:%S) · load $(sysctl -n vm.loadavg) · free $(free_pct)% · stop after $STOP"
export SWAP_MAP="{\"cartograph/bake-ground.js\":\"$D/bake-ground.prof.js\",\"src/lib/tileGround.js\":\"$D/tileGround.prof.js\"}"
( cd cartograph; PAINT_DUMP_KEY=mat:asphalt PAINT_DUMP_PATH=$D/dump-asphalt.json PAINT_STOP_AFTER=$STOP exec /usr/bin/time -l node --max-old-space-size=14000 --cpu-prof --cpu-prof-dir=$D/cpu --import $R/scratch/ground-budget/swap.mjs bake-ground.js --look=huron --scene=huron --out-dir=$OUT --shore=pending ) > $D/profile.log 2>&1 &
PID=$!; n=0
while kill -0 $PID 2>/dev/null; do (( n % 4 == 0 )) && echo "  [load] $(date +%H:%M:%S) $(sysctl -n vm.loadavg) · free $(free_pct)%"
  (( $(free_pct) < 20 )) && { echo "  ⛔ free < 20%: killing"; kill $PID; }; (( n++ )); sleep 15; done
wait $PID; RC=$?; snap > $D/snap-after.txt
echo "  [guard] changed $(diff $D/snap-before.txt $D/snap-after.txt | grep -c '^[<>]') · newer $(find -L $R/cartograph/data/huron $R/public -newer $D/snap-marker -type f | wc -l | tr -d ' ')"
echo "exit $RC $(date +%H:%M:%S) · $(ls $D/cpu/*.cpuprofile 2>/dev/null | wc -l | tr -d ' ') profile(s)"
