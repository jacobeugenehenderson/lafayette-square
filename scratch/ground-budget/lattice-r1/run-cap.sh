#!/bin/zsh
# run-cap.sh <label> <tileGround copy> <bake-ground.js|-> <towns…> — runs the bake from the main checkout's cartograph/ with the
# capture copy swapped in (and the worktree's bake-ground.js when given), to the end of the ① producer. Gates once per town:
# load < 8, free ≥ 40%, no bake running; a guard that the run wrote nothing under cartograph/data/<town> or public/.
W=${0:A:h}; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync
lab=$1; tg=$2; bg=$3; shift 3
for T in $@; do
  F=$(memory_pressure | awk -F': ' '/free percentage/ {print int($2)}'); L=$(sysctl -n vm.loadavg)
  if (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || F < 40 )) || pgrep -f "bake-ground.js --look" >/dev/null; then echo "not launched $T ($L $F%)"; exit 2; fi
  O=$W/slabs/cap-$T; rm -rf $O; mkdir -p $O
  snap() { find -L $R/cartograph/data/$T $R/public -type f -exec stat -f '%m %z %N' {} + | sort -k3 }; snap > $W/snap-before.txt
  M="{\"src/lib/tileGround.js\":\"$tg\""; [[ $bg != - ]] && M="$M,\"cartograph/bake-ground.js\":\"$bg\""; M="$M}"
  t0=$SECONDS
  ( cd $R/cartograph; CAP_OUT=$W/cap-$lab-$T.json SWAP_MAP=$M node --max-old-space-size=8000 --import $R/scratch/ground-budget/swap.mjs bake-ground.js --look=$T --scene=$T --out-dir=$O --shore=pending > $W/cap-$lab-$T.log 2>&1 ); rc=$?
  snap > $W/snap-after.txt; g=$(diff $W/snap-before.txt $W/snap-after.txt | grep -c '^[<>]')
  echo "$lab $T · rc $rc · guard $g · $((SECONDS - t0)) s · load $L · free $F%"; grep -E "\[CAP\]|Error" $W/cap-$lab-$T.log | head -3 | cut -c1-600
  (( rc == 0 && g == 0 )) || { echo "⛔ stopped at $T"; exit 1; }
done
