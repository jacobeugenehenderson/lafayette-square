// onesided-frozen.mjs — the pre-move baseline: the frozen shape (pieces cut from the raw evidence, no stamp) under onesided.mjs
import { readFileSync, existsSync } from 'fs'
import { makeRim, oneSided } from './onesided.mjs'
const M = '/Users/jacobhenderson/Desktop/lafayette-square.nosync'
for (const town of ['hipointedemun', 'huron', 'jacksonheights', 'provincetown']) {
  const rib = JSON.parse(readFileSync(`${M}/cartograph/data/${town}/clean/ribbons.json`, 'utf8')), T = JSON.parse(readFileSync(`${M}/public/baked/${town}/shape.json`, 'utf8')).tiles
  const raw = new Set(rib.landEvidence.flatMap(e => e.rings.flatMap(r => r.map(v => v.join(','))))), onRim = makeRim(rib.protopolygon?.boundaryRing)
  const acc = { tiles: 0, rim: 0, interior: 0, poured: 0 }
  for (const t of T) { if (!Array.isArray(t?.evidenceByPiece) || !t.iA?.length) continue; acc.tiles++
    const o = oneSided(t.iA, t.evidenceByPiece, raw, onRim); acc.rim += o.rim; acc.interior += o.interior; acc.poured += o.poured }
  console.log(town.padEnd(16), JSON.stringify(acc))
}
