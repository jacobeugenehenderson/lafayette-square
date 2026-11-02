#!/bin/zsh
# ab.sh <arm-label> — one A/B arm: spike.mjs on Huron + PTown at 4x, 3 flights, against :5180 as ward-kit stands now.
S=${0:A:h}; ARM=$1; D=$S/ab-$ARM; mkdir -p $D; cd $D
WK=/Users/jacobhenderson/Desktop/lafayette-square.nosync/.claude/worktrees/ward-kit
echo "{\"_arm\":\"$ARM\",\"_wardKit\":\"$(git -C $WK rev-parse HEAD)\",\"_dirty\":\"$(git -C $WK status --short | grep -v '^??' | wc -l | tr -d ' ')\",\"_ward\":\"$(git -C ~/Desktop/dev.nosync/theward rev-parse --short HEAD)\",\"_at\":\"$(date +%T)\"}" > spike.jsonl
curl -s -o /dev/null http://localhost:5180/huron/; sleep 20   # let vite settle on the new checkout
for t in huron provincetown; do
  echo "{\"_load\":\"$(sysctl -n vm.loadavg)\",\"_t\":\"$t\"}" >> spike.jsonl
  node $S/spike.mjs $t 4 3 >> spike.jsonl 2>>spike.err
done
for t in huron provincetown; do node $S/spike-analyse.mjs spike-$t-x4.cpuprofiles.json > analyse-$t.txt 2>&1; done
echo done
