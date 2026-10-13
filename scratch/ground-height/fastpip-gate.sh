#!/bin/zsh
# fastpip-gate.sh — the faster resolveUncached's gate (Boz's ruling 3): conformity alone on Huron's dump-shore with the
# scratch deformer installed, against the 1f937056 baseline at the 0.5 m floor (Cairn's sweep). PASS = the output hash is
# byte-identical. Reports the time and peak RSS (/usr/bin/time -l) beside the baseline's (the frozen copies cost memory).
# ⛔ Run only once Cairn says the sweep is done: it installs the scratch deformer into cartograph/ (the tree the bake reads),
#   and restores HEAD's on any failure. One heavy job; waits while load ≥ 8.
#   scratch/ground-height/fastpip-gate.sh <baseline hash> <baseline peak RSS bytes> <baseline seconds>
cd /Users/jacobhenderson/Desktop/lafayette-square.nosync
[[ $# -eq 3 ]] || { echo "usage: $0 <baseline hash> <baseline peak RSS bytes> <baseline seconds>"; exit 2 }
D=scratch/ground-height; LOG=$D/fastpip-gate.log
[[ -z $(git log --oneline 1f937056..HEAD -- cartograph/groundConformity.js cartograph/groundDeformer.mjs) ]] || { echo "groundConformity.js or groundDeformer.mjs moved since 1f937056 — the baseline is void; re-take it"; exit 1 }
git diff --quiet HEAD -- cartograph/groundConformity.js || { echo "cartograph/groundConformity.js has uncommitted changes — refusing"; exit 1 }
git diff --quiet HEAD -- cartograph/groundDeformer.mjs || { echo "cartograph/groundDeformer.mjs is not HEAD's — refusing"; exit 1 }
echo "deformer: HEAD $(git hash-object cartograph/groundDeformer.mjs) → scratch $(git hash-object $D/groundDeformer.fastpip.mjs)" | tee $LOG
while (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 )); do sleep 30; done
cp $D/groundDeformer.fastpip.mjs cartograph/groundDeformer.mjs
echo "start $(date) · $(uptime)" >> $LOG
/usr/bin/time -l node --max-old-space-size=14000 scratch/huron-cost/conform-alone.mjs scratch/huron-cost/dump-shore deform cartograph/groundConformity.js >> $LOG 2>&1
rc=$?; echo "exit $rc $(date)" >> $LOG
h=$(awk '/^\[hash\]/ {print $2}' $LOG); rss=$(awk '/maximum resident set size/ {print $1}' $LOG); s=$(awk '/^\[conform\]/ {print $3}' $LOG)
echo "hash ${h:-none} vs $1 · ${s:-?} s vs $3 s · peak RSS ${rss:-?} vs $2 bytes ($(( ${rss:-0} - $2 )) bytes)" | tee -a $LOG
if [[ $rc -ne 0 || $h != $1 ]]; then git checkout -- cartograph/groundDeformer.mjs; echo "FAIL — HEAD's deformer restored" | tee -a $LOG; exit 1; fi
echo "PASS — the scratch deformer stays installed for the commit" | tee -a $LOG
