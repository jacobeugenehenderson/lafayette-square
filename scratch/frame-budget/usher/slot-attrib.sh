#!/bin/zsh
# slot-attrib.sh — take the heavy slot, CPU-profile the paired first flights that carried the worst frames (Huron s4 s5, PTown
# s2 s3 s4) at 4x on :5180 with ward-kit at the pin, release. Refuses to run if ward-kit is not the pin.
H=${0:A:h}; LOCK=/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/heavy-slot.lock
WK=/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/worktrees/ward-kit; PIN=ea8bd5199
live() { for p in $(pgrep -f "Google Chrome --headless=new"); do e=$(ps -o etime= -p $p | tr -d ' '); [[ $e == *-* ]] || return 0; done; return 1; }
low() { l=$(sysctl -n vm.loadavg | awk '{print $2}'); awk "BEGIN{exit !($l<4)}"; }
while :; do
  if [[ ! -e $LOCK ]] && ! live && low; then
    ( set -C; printf "name: Usher\nrun: CPU profile of the paired first flights' worst frames on :5180 at the pin (Huron s4 s5, PTown s2 s3 s4, 4x, headless)\nstart: %s\n" "$(date -u +%FT%TZ)" > $LOCK ) 2>/dev/null && break
  fi; sleep 30
done
trap 'rm -f $LOCK' EXIT
O=$H/attrib; mkdir -p $O; cd $O
k=$(git -C $WK rev-parse --short=9 HEAD); d=$(git -C $WK status --short | grep -cv '^??')
if [[ $k != $PIN || $d != 0 ]]; then echo "REFUSED: ward-kit is $k (dirty $d), not the pin $PIN" | tee refused.txt; exit 1; fi
: > attrib.jsonl
for spec in "huron 4" "huron 5" "provincetown 2" "provincetown 3" "provincetown 4"; do t=${spec% *}; s=${spec#* }
  while ! low; do sleep 15; done
  printf '{"_t":"%s","_seed":%s,"_wardKit":"%s","_ward":"%s","_load":"%s"}\n' $t $s $k $(git -C ~/Desktop/dev.nosync/theward rev-parse --short HEAD) "$(sysctl -n vm.loadavg)" >> attrib.jsonl
  SEED=$s node $H/spike.mjs $t 4 1 >> attrib.jsonl 2>>attrib.err
done
echo done
