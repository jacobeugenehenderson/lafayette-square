import { readFileSync } from 'fs'
globalThis.__CALIPER = []
const { buildTileGround } = await import('./tg-instr.mjs')
const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const design = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const r = buildTileGround(ribbons, {
  curbWidth: design.curbWidth, smooth: 0, blockLandUse: design.blockLandUse,
  cornerRadiusScale: design.cornerRadiusScale, cornerRadiusOverrides: design.cornerRadiusOverrides,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides, blockCustoms: design.blockCustoms,
})
const C = globalThis.__CALIPER
console.log('tiles instrumented:', C.length)
const sum = (k) => C.reduce((a, t) => a + t[k], 0)
console.log('SUM tileConvexCorners:', sum('tileConvexCorners'))
console.log('SUM fSinkCount:', sum('fSinkCount'))
console.log('SUM distinctKeys:', sum('distinctKeys'))
console.log('SUM keyCollisions (fSink lost to same-key overwrite, within tile):', sum('keyCollisions'))
console.log('SUM unmappedCorners (sharp tile-ring corner with NO fillet apex):', sum('unmappedCornerCount'))
console.log('actual cornerFillets stamped (global, cross-tile keys merged):', Object.keys(r.cornerFillets).length)

// classify tiles by failure mode
const wholeCollapse = C.filter(t => t.blockRingCount === 0)
const partialDrop = C.filter(t => t.blockRingCount > 0 && t.unmappedCornerCount > 0)
console.log('\n=== WHOLE-TILE COLLAPSE (blockRings dropped <0.5m2 => 0 fillets) ===')
console.log('count:', wholeCollapse.length, '| corners lost:', wholeCollapse.reduce((a,t)=>a+t.tileConvexCorners,0))
for (const t of wholeCollapse) console.log(`  tile#${t.tileIdx} area=${t.tileArea} convexCorners=${t.tileConvexCorners}`)

console.log('\n=== PARTIAL DROP (blockRing present, but some sharp corner unmapped) ===')
console.log('tiles:', partialDrop.length, '| unmapped corners:', partialDrop.reduce((a,t)=>a+t.unmappedCornerCount,0))
for (const t of partialDrop.sort((a,b)=>b.unmappedCornerCount-a.unmappedCornerCount)) {
  console.log(`  tile#${t.tileIdx} area=${t.tileArea} convex=${t.tileConvexCorners} fSink=${t.fSinkCount} blockRings=${t.blockRingCount}[${t.blockRingAreas}] unmapped=${t.unmappedCornerCount} pts=${JSON.stringify(t.unmappedCornerPts)}`)
}

console.log('\n=== KEY COLLISIONS (two fillets => one key, within a tile) ===')
const coll = C.filter(t => t.keyCollisions > 0)
for (const t of coll) console.log(`  tile#${t.tileIdx} fSink=${t.fSinkCount} distinctKeys=${t.distinctKeys} collisions=${t.keyCollisions}`)
console.log('total within-tile collisions:', sum('keyCollisions'))
