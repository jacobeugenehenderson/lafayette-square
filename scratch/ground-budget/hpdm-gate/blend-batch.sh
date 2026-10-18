#!/bin/zsh
# blend-batch.sh — the band blend (Boz, 2026-10-18), measure-only, on the bands bake's own mesh (slab-hipointedemun-full-bands,
# dac3525d) with the bands-blend.json dump (387bb54a, carries protoBandPieces): base (the worktree deformer) · blend (1/d) ·
# equal (the counterfactual weights), one at a time. cf-batch.sh's gates: waits (≤ 2 h) for no OTHER node over 1 GB and free
# ≥ 70%, then per variant: reheight · walls by group · walk gate · road crease · stripe. Killed below 30% free.
G=${0:A:h}; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync; cd $R; W=.claude/worktrees/hpdm-gate
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
wait_clear() { for i in {1..360}; do big=$(ps -axo pid,rss,command | awk -v me=$$ '$2>1000000 && /node/ && !/blend-batch|reheight|walls-by-group|claims-the/' | wc -l | tr -d ' '); (( big == 0 && $(free_pct) >= 70 )) && return 0; sleep 20; done; echo "⛔ not clear after 2 h"; exit 2; }
run() { local V=$1 DEF=$2; shift 2; wait_clear; echo "== $V start $(date +%H:%M:%S) · free $(free_pct)%"
  /usr/bin/time -l node --max-old-space-size=6000 $G/reheight.mjs --slab=$G/slab-hipointedemun-full-bands --dump=$G/bands-blend.json --deformer=$DEF --out=$G/slab-bb-$V $@ 2>&1 | grep -v 'scene not' | sed -E 's/"stations".*"noarc"/… "noarc"/' | cut -c1-900 &
  local P=$! MINF=100; while kill -0 $P 2>/dev/null; do F=$(free_pct); (( F < MINF )) && MINF=$F; (( F < 30 )) && { echo "⛔ free $F% < 30%: killing"; pkill -f "out=$G/slab-bb-$V"; }; sleep 5; done; wait $P; echo "   min free $MINF%"
  node --max-old-space-size=6000 $G/walls-by-group.mjs $G/slab-bb-$V 2>&1 | grep -v 'scene not' | cut -c1-200
  node --max-old-space-size=6000 checks/claims-the-walk-is-level-across.mjs --dir=$G/slab-bb-$V 2>&1 | grep 'THE GATE' | sed 's/.*over the limit/walk: over the limit/'
  node $W/checks/claims-the-road-meets-itself-across-its-centreline.mjs --dir=$G/slab-bb-$V --show=0 2>&1 | grep STEP | cut -c1-110
  node $W/checks/claims-the-stripe-lies-on-its-road.mjs --dir=$G/slab-bb-$V --show=0 2>&1 | grep 'off the road by' | cut -c1-110; }
VS=(${@}); (( ${#VS} )) || VS=(base blend equal)
for V in $VS; do case $V in
  base) run $V $W/cartograph/groundDeformer.mjs ;;
  blend) run $V $G/groundDeformer.cf-bandblend.mjs --pieces ;;
  equal) BAND_WEIGHTS=equal run $V $G/groundDeformer.cf-bandblend.mjs --pieces ;;
  *) echo "⛔ unknown variant $V"; exit 2 ;; esac; done
echo "batch end $(date +%H:%M:%S)"
