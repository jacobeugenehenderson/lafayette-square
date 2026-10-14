#!/bin/zsh
# full-gate.sh — the flatten fix's slab gates (Boz, 2026-10-14; the scratch full bakes as authorized 2026-10-13): per town,
# the FULL ground bake, HEAD (the main tree's code, refused if cartograph/ or src/ is dirty) and/or `branch` (this
# worktree's bake-ground + tileGround swapped in memory), each to its own SCRATCH out-dir (slabs/<town>-<tag>); nothing
# served, staged or published. --shore=pending as serve.js's 'ground' pass. data/<town> + public/ snapshotted before and
# after every run. Gates: load < 8 and free ≥ 55% at launch, checked once (no wait, no retry); explicit heap; killed below 20% free. Every log line is stamped
# with epoch seconds, so each paint step's time is the gap between its `[progress] flatten` line and the next.
# Then on each slab: claims-the-ground-is-painted-once, claims-the-ground-has-no-cross-polygon-t-junctions,
# claims-the-ground-tiles-without-a-gap (--dir), and whether ground.bin is byte-identical between the tags.
#   TAGS="HEAD branch" full-gate.sh <town …> → full-gate.log beside this file
setopt pipefail; W=${0:A:h}; R=/Users/jacobhenderson/Desktop/lafayette-square.nosync; WT=${W:h:h:h}; LOG=$W/full-gate.log; mkdir -p $W/slabs
node $W/prep-gate.mjs || exit 1
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
for T in $@; do
  for TAG in ${=TAGS:-HEAD branch}; do
    if [[ $TAG == HEAD && -n "$(cd $R && git status --porcelain -- cartograph src | grep -v '^??')" ]]; then
      echo "  ⛔ $T HEAD: the main tree's cartograph/ or src/ is dirty — not HEAD; skipped" | tee -a $LOG; continue; fi
    # Boz, 2026-10-14 (Jacob in Photoshop): launch only at load < 8 and free ≥ 55%, checked ONCE — no waiting, no retry
    if (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 55 )); then
      echo "  ⛔ $T $TAG not launched: load $(sysctl -n vm.loadavg) · free $(free_pct)% (needs load < 8, free ≥ 55%)" | tee -a $LOG; exit 2; fi
    O=$W/slabs/$T-$TAG; rm -rf $O; mkdir -p $O; L=$W/full-$T-$TAG.log
    # GATE-ONLY (Boz's clear, option (b)): both sides run prep-gate.mjs's copy — the deformer's unowned throw printed as a count,
    # the manifest stamped gateOnly — applied identically, so the flatten is gated while every town refuses on that class
    M="{\"cartograph/bake-ground.js\":\"$W/bake-ground.gate-HEAD.js\"}"
    [[ $TAG == branch ]] && M="{\"cartograph/bake-ground.js\":\"$W/bake-ground.gate-branch.js\",\"src/lib/tileGround.js\":\"$WT/src/lib/tileGround.js\"}"
    snap() { find -L $R/cartograph/data/$T $R/public -type f -exec stat -f '%m %z %N' {} + | sort -k3 }
    snap > $W/snap-before.txt; touch $W/snap-marker
    echo "$T $TAG start $(date +%H:%M:%S) · HEAD $(cd $R && git rev-parse --short HEAD) · branch $(cd $WT && git rev-parse --short HEAD)$( [[ -n "$(cd $WT && git status --porcelain -- cartograph src)" ]] && echo '+dirty') · load $(sysctl -n vm.loadavg) · free $(free_pct)%" | tee -a $LOG
    ( cd $R/cartograph; SWAP_MAP="$M" /usr/bin/time -l node --max-old-space-size=14000 --import $R/scratch/ground-budget/swap.mjs bake-ground.js --look=$T --scene=$T --out-dir=$O --shore=pending 2>&1 | perl -MTime::HiRes=time -ne '$|=1; printf "%.2f %s", time, $_' ) > $L 2>&1 &
    PID=$!; while kill -0 $PID 2>/dev/null; do (( $(free_pct) < 20 )) && { echo "  ⛔ free < 20%: killing $T $TAG" | tee -a $LOG; pkill -f "out-dir=$O"; }; sleep 15; done
    wait $PID; RC=$?; snap > $W/snap-after.txt
    echo "  exit $RC · real $(awk '$3 == "real" {print $2}' $L) s · peak RSS $(awk '/maximum resident set size/ {print $2}' $L) · $(grep -o 'paint stack pressed down.*' $L | tail -1) · $(grep -o 'unowned refusal suppressed: [0-9]*' $L | tail -1) · gateOnly stamp $(grep -c 'gate-only: unowned' $O/ground.json 2>/dev/null)" | tee -a $LOG
    grep -E '⛔|refus|REFUSED|T-junction' $L | head -5 | sed 's/^/    /' | tee -a $LOG
    echo "  [guard] changed $(diff $W/snap-before.txt $W/snap-after.txt | grep -c '^[<>]') · newer $(find -L $R/cartograph/data/$T $R/public -newer $W/snap-marker -type f | wc -l | tr -d ' ')" | tee -a $LOG
    if [[ -f $O/ground.json ]]; then
      ( cd $WT; node --max-old-space-size=8000 checks/claims-the-ground-is-painted-once.mjs --dir=$O --show=40 2>&1 | sed "s/^/    [once $TAG] /" ) | tee -a $LOG
      ( cd $R; node checks/claims-the-ground-has-no-cross-polygon-t-junctions.mjs --dir=$O 2>&1 | head -6 | sed "s/^/    [tj $TAG] /" ) | tee -a $LOG
      ( cd $R; node checks/claims-the-ground-tiles-without-a-gap.mjs --dir=$O 2>&1 | tail -4 | sed "s/^/    [tiles $TAG] /" ) | tee -a $LOG
    fi
  done
  [[ -f $W/slabs/$T-HEAD/ground.bin && -f $W/slabs/$T-branch/ground.bin ]] && { cmp -s $W/slabs/$T-HEAD/ground.bin $W/slabs/$T-branch/ground.bin && echo "  $T ground.bin IDENTICAL" || echo "  $T ground.bin differs ($(stat -f %z $W/slabs/$T-HEAD/ground.bin) vs $(stat -f %z $W/slabs/$T-branch/ground.bin) bytes)"; } | tee -a $LOG
done; echo "ALLDONE $(date)" | tee -a $LOG
