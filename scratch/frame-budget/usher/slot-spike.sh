#!/bin/zsh
LOCK=/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/heavy-slot.lock
live() { for p in $(pgrep -f "Google Chrome --headless=new"); do e=$(ps -o etime= -p $p | tr -d ' '); [[ $e == *-* ]] || return 0; done; return 1; }
low() { l=$(sysctl -n vm.loadavg | awk '{print $2}'); awk "BEGIN{exit !($l<4)}"; }
while :; do
  if [[ ! -e $LOCK ]] && ! live && low; then
    ( set -C; echo "Usher — CPU profile of the Home->Society flight spike on :5180, Huron + PTown at 4x, headless (BRIEF-a-frame-budget-for-every-shot) — started $(date '+%F %T')" > $LOCK ) 2>/dev/null && break
  fi
  sleep 30
done
echo "lock taken $(date +%T)"
trap 'rm -f $LOCK' EXIT
: > spike.jsonl
for t in huron provincetown; do
  while ! low; do sleep 20; done
  echo "{\"_load\":\"$(sysctl -n vm.loadavg)\",\"_at\":\"$(date +%T)\",\"_t\":\"$t\",\"_otherLive\":$(live && echo true || echo false)}" >> spike.jsonl
  node spike.mjs $t 4 3 >> spike.jsonl 2>>spike.err
done
echo "done $(date +%T)"
