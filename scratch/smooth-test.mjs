import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const ribbons = JSON.parse(readFileSync('src/data/ribbons.json','utf8'))
for (const sm of [0, 1.5]) {
  try {
    const tg = buildTileGround(ribbons, { smooth: sm, emitArtifact: true })
    const st = tg?.shapeTiles || tg?._shapeTiles || tg?.artifact?.tiles
    console.log(`smooth=${sm}: keys=${Object.keys(tg||{}).join(',')}`)
    console.log(`  tiles?`, Array.isArray(tg?.tiles)?tg.tiles.length:'n/a', '| shapeTiles?', st?.length ?? 'n/a')
  } catch (e) {
    console.log(`smooth=${sm}: THREW ${e.message}\n${e.stack?.split('\n').slice(1,4).join('\n')}`)
  }
}
