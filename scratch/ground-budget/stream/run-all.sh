#!/bin/zsh
# The streaming-slab measure (chunks.mjs) over four slabs, one at a time (Brace, 2026-10-14; Boz). Each run waits until
# no bake-ground or `node --max-old-space` process is up (Swale and the others), load < 8 and free >= 55%; one line per
# run in Swale's overnight.log. Read-only: chunks.mjs reads slabs and writes only its own .txt here.
cd /Users/jacobhenderson/Desktop/lafayette-square.nosync
D=scratch/ground-budget/stream; S=.claude/worktrees/rings-only/scratch/ground-budget/flatten-r1/slabs; LOG=$S/../overnight.log
free_pct() { memory_pressure | awk -F': ' '/free percentage/ {print int($2)}' }
# a NODE process only: a shell whose command text merely mentions these words (a peer's wait loop) is not a run
busy() { ps -axo command= | grep -qE '^(/usr/bin/time -l )?node .*(bake-ground|--max-old-space)' }
run() {
  while busy || (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || $(free_pct) < 55 )); do sleep 60; done
  local L="$(sysctl -n vm.loadavg) · free $(free_pct)%"
  echo "$(date '+%F %T') START Brace stream/chunks.mjs $3 (read-only, heap 3000) · load $L" >> $LOG
  echo "load $L" > $D/$3.txt
  /usr/bin/time -l node --max-old-space-size=3000 $D/chunks.mjs $1 $2 >> $D/$3.txt 2> $D/$3.time.txt; local rc=$?
  echo "$(date '+%F %T') END Brace $3 · rc $rc · $(grep -E 'real' $D/$3.time.txt | tr -s ' ' | cut -c1-12)· rss $(grep 'maximum resident' $D/$3.time.txt | awk '{print int($1/1e6)}') MB" >> $LOG
}
run $S/hipointedemun-HEAD public/baked/hipointedemun hpdm-HEAD
run public/baked/hipointedemun public/baked/hipointedemun hpdm-served
run public/baked/huron public/baked/huron huron-served
run scratch/ground-height/shore-today/huron-coast public/baked/huron huron-1012-deformer
echo done
