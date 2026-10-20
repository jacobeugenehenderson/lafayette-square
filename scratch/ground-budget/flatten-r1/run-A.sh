#!/bin/zsh
# run-A.sh — option (A)'s live capture, one town at a time: the bake runs to the end of the ① producer with tileGround.A.js
# swapped in, writes A-<town>.json, exits. Gates checked once per town (load < 8, free ≥ 55%, no bake running); logged.
W=${0:A:h}; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync
for T in $@; do
  F=$(memory_pressure | awk -F': ' '/free percentage/ {print int($2)}'); L=$(sysctl -n vm.loadavg)
  if (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || F < 55 )) || pgrep -f "bake-ground.js --look" >/dev/null; then echo "not launched $T ($L $F%)" | tee -a $W/overnight.log; exit 2; fi
  echo "$(date '+%F %T') START A-$T (option A capture) · load $L · free $F%" >> $W/overnight.log
  O=$W/slabs/diag; rm -rf $O; mkdir -p $O
  snap() { find -L $R/cartograph/data/$T $R/public -type f -exec stat -f '%m %z %N' {} + | sort -k3 }; snap > $W/snap-before.txt
  ( cd $R/cartograph; A_OUT=$W/A-$T.json SWAP_MAP="{\"cartograph/bake-ground.js\":\"$W/bake-ground.gate-branch.js\",\"src/lib/tileGround.js\":\"$W/tileGround.A.js\"}" node --max-old-space-size=8000 --import $R/scratch/ground-budget/swap.mjs bake-ground.js --look=$T --scene=$T --out-dir=$O --shore=pending > $W/A-$T.log 2>&1 ); rc=$?
  snap > $W/snap-after.txt; g=$(diff $W/snap-before.txt $W/snap-after.txt | grep -c '^[<>]')
  echo "$(date '+%F %T') END A-$T · rc $rc · guard $g" >> $W/overnight.log; tail -1 $W/overnight.log; grep -E "\[A\]|Error" $W/A-$T.log | head -3 | cut -c1-400
  (( rc == 0 && g == 0 )) || { echo "⛔ stopped at $T"; exit 1; }
done
