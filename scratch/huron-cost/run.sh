#!/bin/zsh
# Huron conformity forensic (Boz's GO, queued behind Swale): dump the conformity input from HEAD's bake-ground (+ dump
# inserts) and HEAD's tileGround (the preswap copy, so the dump matches Swale's refusal), then conformity alone on it,
# with the raw sampler and with the deformer's. Scratch only; no served write. Start only when Swale releases the machine.
# Boz's gate (2026-10-12): memory_pressure free ≥ 40% and load < 8 before each step; vm_stat Swapins/Swapouts before and
# after each step (the delta says whether the step paged; swap "used" stays allocated and says nothing). Peak RSS: time -l.
cd /Users/jacobhenderson/Desktop/lafayette-square.nosync
D=$PWD/scratch/huron-cost
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
swp() { vm_stat | awk '/Swapins|Swapouts/ {print $1, $2}' | tr '\n' ' ' }
gate() { while (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 40 )); do sleep 30; done }
[[ $1 == --probe ]] && { echo "free $(free_pct)% · $(swp)"; exit 0 }

gate; echo "dump start $(date) · $(uptime) · free $(free_pct)% · $(swp)"
CONFORM_DUMP=$D/dump SWAP_MAP="{\"/cartograph/bake-ground.js\":\"$D/bake-ground.dump.js\",\"/src/lib/tileGround.js\":\"$PWD/scratch/ground-height/ribbons/tileGround.preswap.js\"}" \
  /usr/bin/time -l node --max-old-space-size=14000 --import ./scratch/kerb-cut/swap.mjs cartograph/bake-ground.js --look=huron --scene=huron --out-dir=$D/out > $D/dump.log 2>&1
echo "dump exit $? $(date) · free $(free_pct)% · $(swp)"
[[ -f $D/dump/meta.json ]] || { echo "no dump"; exit 1 }
for S in raw deform; do
  gate; echo "conform $S start $(date) · free $(free_pct)% · $(swp)"
  /usr/bin/time -l node --max-old-space-size=14000 $D/conform-alone.mjs $D/dump $S > $D/conform-$S.log 2>&1
  echo "conform $S exit $? $(date) · free $(free_pct)% · $(swp)"
done; echo ALLDONE
