#!/bin/zsh
# run.sh <producer|full> [town=hipointedemun] — Boz's HPDM diagnostic gate (2026-10-17): the boz/hpdm-gate worktree's code
# (bake-ground · tileGround · streetProfiles · groundDeformer · bake-shore-median, the five modules it differs from the main tree in) swapped
# in memory over the main tree, --shore=pending as serve.js's 'ground' pass, into SCRATCH out-dirs beside this file. Nothing
# served, staged or published. `producer` stops after buildDeformer (bake-ground.producer.js, make-producer.mjs).
# Gates: load < 8 and free ≥ 40% at launch, checked once; explicit heap; killed below 30% free. data/<town> + public/
# snapshotted before and after.
setopt pipefail; G=${0:A:h}; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync; WT=$R/.claude/worktrees/hpdm-gate; MODE=$1; T=${2:-hipointedemun}
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
[[ -n "$(cd $R && git status --porcelain -- cartograph src | grep -v '^??')" ]] && { echo "⛔ the main tree's cartograph/ or src/ is dirty"; exit 2; }
(( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 70 )) && { echo "⛔ not launched: load $(sysctl -n vm.loadavg) · free $(free_pct)%"; exit 2; }
BG=$WT/cartograph/bake-ground.js; [[ $MODE == producer ]] && { node $G/make-producer.mjs $BG $DUMP || exit 1; BG=$G/bake-ground.producer.js; }
[[ $MODE == full ]] && { node $G/make-gate.mjs $BG || exit 1; BG=$G/bake-ground.gate.js; }
M="{\"cartograph/bake-ground.js\":\"$BG\",\"src/lib/tileGround.js\":\"$WT/src/lib/tileGround.js\",\"src/cartograph/streetProfiles.js\":\"$WT/src/cartograph/streetProfiles.js\",\"cartograph/groundDeformer.mjs\":\"${DEFORMER:-$WT/cartograph/groundDeformer.mjs}\",\"cartograph/bake-shore-median.mjs\":\"$WT/cartograph/bake-shore-median.mjs\"}"
O=$G/slab-$T-$MODE${TAG:+-$TAG}; L=$G/$MODE-$T${TAG:+-$TAG}.log; rm -rf $O; mkdir -p $O
snap() { find -L $R/cartograph/data/$T $R/public -type f -exec stat -f '%m %z %N' {} + | sort -k3 }
snap > $G/snap-before.txt; touch $G/snap-marker
echo "$T $MODE start $(date +%H:%M:%S) · main $(cd $R && git rev-parse --short HEAD) · gate $(cd $WT && git rev-parse --short HEAD)$( [[ -n "$(cd $WT && git status --porcelain -- cartograph src)" ]] && echo '+dirty') · load $(sysctl -n vm.loadavg) · free $(free_pct)%"
( cd $R/cartograph; SWAP_MAP="$M" /usr/bin/time -l node --max-old-space-size=10000 --import $R/scratch/ground-budget/swap.mjs bake-ground.js --look=$T --scene=$T --out-dir=$O --shore=pending 2>&1 | perl -MTime::HiRes=time -ne '$|=1; printf "%.2f %s", time, $_' ) > $L 2>&1 &
PID=$!; MINF=100; while kill -0 $PID 2>/dev/null; do F=$(free_pct); (( F < MINF )) && MINF=$F; (( F < 30 )) && { echo "⛔ free $F% < 30%: killing"; pkill -f "out-dir=$O"; }; sleep 10; done
wait $PID; RC=$?; snap > $G/snap-after.txt
echo "exit $RC · real $(awk '$3 == "real" {print $2}' $L) s · peak RSS $(awk '/maximum resident set size/ {print $2}' $L) B · min free $MINF%"
echo "[guard] changed $(diff $G/snap-before.txt $G/snap-after.txt | grep -c '^[<>]') · newer $(find -L $R/cartograph/data/$T $R/public -newer $G/snap-marker -type f | wc -l | tr -d ' ')"
grep -E '⛔|PROTO②|producer-only|deform\]|\[line\]|unowned' $L | cut -c1-400 | head -20
