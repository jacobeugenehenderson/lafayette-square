#!/bin/zsh
# cf-batch.sh — the (i)/(ii) counterfactuals on the sweep bake's refined mesh, one at a time: waits (≤ 2 h) for no OTHER node over
# 1 GB and free ≥ 70%, then per variant: reheight · walls by group · walk gate · road crease · stripe. Killed below 30% free.
G=${0:A:h}; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync; cd $R; W=.claude/worktrees/hpdm-gate
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
wait_clear() { for i in {1..360}; do big=$(ps -axo pid,rss,command | awk -v me=$$ '$2>1000000 && /node/ && !/cf-batch|reheight|walls-by-group|claims-the/' | wc -l | tr -d ' '); (( big == 0 && $(free_pct) >= 70 )) && return 0; sleep 20; done; echo "⛔ not clear after 2 h"; exit 2; }
run() { local V=$1 DEF=$2 LINE=$3; wait_clear; echo "== $V start $(date +%H:%M:%S) · free $(free_pct)%"
  node --max-old-space-size=6000 $G/reheight.mjs --slab=$G/slab-hipointedemun-full-sweep --dump=$G/bands-sweep.json --deformer=$DEF ${LINE:+--line=$LINE} --out=$G/slab-cf-$V 2>&1 | grep -v 'scene not' | sed -E 's/"stations".*"noarc"/… "noarc"/' | cut -c1-400 &
  local P=$!; while kill -0 $P 2>/dev/null; do (( $(free_pct) < 30 )) && { echo "⛔ free < 30%: killing"; kill $P; }; sleep 5; done; wait $P
  node --max-old-space-size=6000 $G/walls-by-group.mjs $G/slab-cf-$V 2>&1 | grep -v 'scene not' | cut -c1-200
  node --max-old-space-size=6000 checks/claims-the-walk-is-level-across.mjs --dir=$G/slab-cf-$V 2>&1 | grep 'THE GATE' | sed 's/.*over the limit/walk: over the limit/'
  node $W/checks/claims-the-road-meets-itself-across-its-centreline.mjs --dir=$G/slab-cf-$V --show=0 2>&1 | grep STEP | cut -c1-110
  node $W/checks/claims-the-stripe-lies-on-its-road.mjs --dir=$G/slab-cf-$V --show=0 2>&1 | grep 'off the road by' | cut -c1-110; }
# the variants, by name (default: all four of 2026-10-17's first pass); `line-shipped` = the committed lineHeight (aebf81a7)
for V in ${@:-noarc-band noarc-road line-cont noarc-road+line-cont}; do case $V in
  noarc-band) run $V $G/groundDeformer.cf-noarc-band.mjs ;;
  noarc-road) run $V $G/groundDeformer.cf-noarc-road.mjs ;;
  line-cont) run $V $W/cartograph/groundDeformer.mjs $G/lineHeight.cf-cont.mjs ;;
  noarc-road+line-cont) run $V $G/groundDeformer.cf-noarc-road.mjs $G/lineHeight.cf-cont.mjs ;;
  line-shipped) run $V $W/cartograph/groundDeformer.mjs $W/cartograph/lineHeight.mjs ;;
  *) echo "⛔ unknown variant $V"; exit 2 ;; esac; done
echo "batch end $(date +%H:%M:%S)"
