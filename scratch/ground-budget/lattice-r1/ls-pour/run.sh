#!/bin/zsh
# run.sh pour|cap — Lafayette Square poured, then captured, inside tree/ (git archive of swale/flatten-paths-r1 67a6566a, with
# cartograph/data/lafayette-square/ copied from .claude/worktree-salvage/2026-10-17/ls-data). The tree's own cartograph runs, so
# __dirname — and with it every CLEAN_DIR / RAW_DIR write — is the tree; guard.mjs throws on any write outside WRITE_ALLOW.
# Gate: load < 8, free ≥ 40%, no bake-ground running; watchdog aborts under 30% free. Never touches public/ or cartograph/data/.
#   pour: node tree/cartograph/pipeline.js --scene=lafayette-square                       → tree/…/clean/map.json
#   cap:  Lath's make-cap.mjs on the tree's tileGround.js, then the tree's bake-ground.js to the end of the ① producer,
#         authoring loaded from the tree's public/looks/lafayette-square/design.json (blockCustoms)  → cap-r1-lafayette-square.json
# After either: verify.sh checks the real cartograph/data/lafayette-square/ against the salvage manifests (sha256 + mtime).
step=$1; H=${0:A:h}; T=$H/tree; R=${H:h:h:h:h}
F=$(memory_pressure | awk -F': ' '/free percentage/ {print int($2)}')
if (( $(sysctl -n vm.loadavg | awk '{print int($2)}') >= 8 || F < 40 )) || pgrep -f '[n]ode .*(bake-ground|pipeline)\.js' >/dev/null; then echo "not launched ($(sysctl -n vm.loadavg) free $F%)"; exit 2; fi
export WRITE_ALLOW=$T:$H/out
mkdir -p $H/out
if [[ $step == pour ]]; then
  cmd=(node --max-old-space-size=8192 --import $H/guard.mjs pipeline.js --scene=lafayette-square)
elif [[ $step == cap ]]; then
  node $T/scratch/ground-budget/lattice-r1/make-cap.mjs $T/src/lib/tileGround.js $H/out/tileGround.cap.js || exit 1
  rm -rf $H/out/slab-cap; mkdir -p $H/out/slab-cap
  export CAP_OUT=$H/out/cap-r1-lafayette-square.json SWAP_MAP="{\"src/lib/tileGround.js\":\"$H/out/tileGround.cap.js\"}"
  cmd=(node --max-old-space-size=8000 --import $H/guard.mjs --import $T/scratch/ground-budget/swap.mjs bake-ground.js --look=lafayette-square --scene=lafayette-square --out-dir=$H/out/slab-cap --shore=pending)
else echo "run.sh pour|cap"; exit 2; fi
cd $T/cartograph; t0=$SECONDS
/usr/bin/time -l $cmd > $H/out/$step.log 2> $H/out/$step.err &
pid=$!
while kill -0 $pid 2>/dev/null; do free=$(memory_pressure | tail -1 | grep -oE '[0-9]+')
  echo "$(date +%T) load $(sysctl -n vm.loadavg | awk '{print $2}') free ${free}%" >> $H/out/$step.load
  if [ "$free" -lt 30 ]; then echo "ABORT: free ${free}% < 30%" | tee -a $H/out/$step.load; pkill -P $pid; kill $pid; exit 2; fi; sleep 10; done
wait $pid; rc=$?
echo "$step rc $rc · $((SECONDS - t0)) s"; grep -E "real|maximum resident" $H/out/$step.err
grep -c '^\[guard\] write' $H/out/$step.err | sed 's/^/guarded writes: /'; grep '^\[guard\] write' $H/out/$step.err | awk '{print $4}' | sort -u | sed "s|^$T/|  tree/|; s|^$H/|  ls-pour/|"
grep -E "⛔|^Error|refus" $H/out/$step.err $H/out/$step.log | head -5 | cut -c1-400
zsh $H/verify.sh
exit $rc
