#!/bin/zsh
# A/B: what writing per-pixel depth costs the hero cards (Grain, 2026-10-05). Alternates ON/OFF twice per surface so
# drift during the session shows up as the A–A spread, not as an effect. Run on a QUIET machine.
cd "$(dirname $0)/../.."
for mode in desktop phone-hi; do
  px=$([ $mode = desktop ] && echo "1,0.5" || echo "1,4.8")
  for round in 1 2; do
    for q in "" "treeDebug=noHeroDepth"; do
      echo "### $mode round $round ${q:-depth ON}"
      node scratch/tree-cost/probe.mjs --town=lafayette-square --shot=hero --mode=$mode --px=$px ${q:+--q=$q} 2>&1 | grep -E "frame \(|off hero|off all trees @px|SHADER"
    done
  done
done
