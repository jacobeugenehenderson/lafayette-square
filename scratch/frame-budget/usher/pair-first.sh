#!/bin/zsh
# pair-first.sh <arm-label> <outdir> — the proof's arm: FIRST flights only (the only ones that pair), seeds 1-10, Huron and
# Provincetown, 4x, against :5180 as ward-kit stands now. Each line names the ward-kit sha it ran on.
H=${0:A:h}; ARM=$1; O=$2; mkdir -p $O
WK=/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/worktrees/ward-kit
low() { l=$(sysctl -n vm.loadavg | awk '{print $2}'); awk "BEGIN{exit !($l<4)}"; }
curl -s -o /dev/null http://localhost:5180/huron/; sleep 20
for t in huron provincetown; do for s in 1 2 3 4 5 6 7 8 9 10; do
  while ! low; do sleep 15; done
  printf '{"_arm":"%s","_wardKit":"%s","_dirty":%s,"_ward":"%s","_load":"%s"}\n' $ARM $(git -C $WK rev-parse --short=9 HEAD) $(git -C $WK status --short | grep -cv '^??') $(git -C ~/Desktop/dev.nosync/theward rev-parse --short HEAD) "$(sysctl -n vm.loadavg)" >> $O/pair-$ARM.jsonl
  node $H/pair.mjs $t $s 4 1 >> $O/pair-$ARM.jsonl 2>>$O/pair-$ARM.err
done; done
echo done
