#!/bin/zsh
# overnight.sh — the stamp code's overnight queue (Boz, 2026-10-14): ONE town at a time through full-gate.sh (branch side,
# gate-only kit, scratch out-dir, snapshot guard), each launched only at load < 8 and free ≥ 55% (waiting at most 10 min
# for that, re-checking once a minute), explicit heap, killed below 20% free (full-gate.sh). STOPS at the first bake that
# exits non-zero, the first guard that trips, or the first launch the gate refuses — a failure never cascades.
# Each result: one line per town in overnight.log (plus the town's full log beside it).
#   zsh overnight.sh hipointedemun huron lafayette-square provincetown
W=${0:A:h}; LOG=$W/overnight.log
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
ld() { sysctl -n vm.loadavg | awk '{print int($2)}' }
echo "== overnight start $(date '+%F %T') · towns: $*" | tee -a $LOG
for T in $@; do
  for i in {1..10}; do (( $(ld) < 8 && $(free_pct) >= 55 )) && break; echo "  $T waiting: load $(sysctl -n vm.loadavg) · free $(free_pct)%" | tee -a $LOG; sleep 60; done
  [[ -d $W/slabs/$T-branch ]] && mv $W/slabs/$T-branch $W/slabs/$T-branch-prev-$(date +%H%M)
  t0=$(date +%s)
  ( cd $W && TAGS=branch zsh full-gate.sh $T > $W/overnight-$T.out 2>&1 )
  O=$W/overnight-$T.out; ex=$(grep -o 'exit [0-9]*' $O | head -1 | awk '{print $2}'); gd=$(grep -o 'changed [0-9]* · newer [0-9]*' $O | head -1)
  notl=$(grep -c 'not launched' $O)
  echo "$T $(date +%T) · $(( $(date +%s) - t0 )) s wall · $(grep -v PROTO $O | grep -E '^  exit' | cut -c1-260)" | tee -a $LOG
  echo "    guard: $gd · $(grep -E '\[once branch\]   (ok|⛔)' $O | head -1 | cut -c1-200)" | tee -a $LOG
  echo "    $(grep -E '\[tj branch\]   (ok|⛔)' $O | head -1 | cut -c1-160) · $(grep -E 'tiles branch\] (ok|⛔)' $O | head -1 | cut -c1-120)" | tee -a $LOG
  echo "    $(grep -o '\[tileGround\]\[stamp\] ⛔ the land-use evidence is NOT disjoint: [^—]*' $W/full-$T-branch.log | head -1 | cut -c1-200) · $(grep -o 'bow-ties below the lattice, all groups: [^(]*' $W/full-$T-branch.log | head -1)" | tee -a $LOG
  if (( notl )) || [[ -z $ex || $ex != 0 || $gd != 'changed 0 · newer 0' ]]; then echo "⛔ STOPPED at $T (exit ${ex:-none} · guard ${gd:-none} · not launched $notl) — the rest of the queue did not run" | tee -a $LOG; break; fi
done
echo "== overnight end $(date '+%F %T')" | tee -a $LOG
