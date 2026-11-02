#!/bin/zsh
LOCK=/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/heavy-slot.lock
live() { for p in $(pgrep -f "Google Chrome --headless=new"); do e=$(ps -o etime= -p $p | tr -d ' '); [[ $e == *-* ]] || return 0; done; return 1; }
low() { l=$(sysctl -n vm.loadavg | awk '{print $2}'); awk "BEGIN{exit !($l<4)}"; }
while :; do
  if [[ ! -e $LOCK ]] && ! live && low; then
    ( set -C; echo "Usher — staging load+flight+Browse probe, 12 headless runs (desktop 1x, 4x, half-size 1x) (BRIEF-a-frame-budget-for-every-shot) — started $(date '+%F %T')" > $LOCK ) 2>/dev/null && break
  fi
  sleep 30
done
echo "lock taken $(date +%T)"
trap 'rm -f $LOCK' EXIT
: > runs.jsonl
for spec in "desktop 1" "desktop 4" "half 1"; do dev=${spec% *}; thr=${spec#* }; for t in lafayette-square huron provincetown hipointedemun; do
  while ! low; do sleep 20; done
  echo "{\"_load\":\"$(sysctl -n vm.loadavg)\",\"_at\":\"$(date +%T)\",\"_t\":\"$t\",\"_thr\":$thr,\"_dev\":\"$dev\",\"_otherLive\":$(live && echo true || echo false)}" >> runs.jsonl
  node probe.mjs $t $dev $thr >> runs.jsonl 2>>runs.err
done; done
echo "done $(date +%T)"
