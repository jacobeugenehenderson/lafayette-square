#!/bin/zsh
# Splice: re-mint every town with the working tree's mint into $1, then the probes + both acceptance checks.
O=$1; mkdir -p $O; cd ${0:a:h}/../..
for s in lafayettesquare huron provincetown jacksonheights hipointedemun; do
  R=$([ $s = lafayettesquare ] && echo src/data/ribbons.json || echo ../integration/cartograph/data/$s/clean/ribbons.json)
  RIBP=$R CARTOGRAPH_SCENE=$s node scratch/splice/remint.mjs --data=../integration --out=$O/$s.json 2>&1 | grep -v wrote | grep -v "^\s*$" | cut -c1-220
done
node scratch/splice/short.mjs $O/*.json
for c in no-sub-ink-edge-between-two-owners a-chain-cut-keeps-its-owner-change; do
  for s in lafayettesquare huron provincetown jacksonheights hipointedemun; do node checks/claims-$c.mjs $s --ribbons=$O/$s.json 2>&1 | grep -E "^(✅|⛔) $s|first|rim" | cut -c1-260; done; done
