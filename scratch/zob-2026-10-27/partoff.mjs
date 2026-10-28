// Zob, 2026-10-27: chains partly off grade (some source ways off, some at grade). node scratch/zob-2026-10-27/partoff.mjs <town>=<clean/skeleton.json> …
import { readFileSync } from 'node:fs'
const { isOffGradeWay } = await import('../../src/cartograph/streetClass.js')
for (const [t, f] of process.argv.slice(2).map(a => a.split('='))) { const S = JSON.parse(readFileSync(f, 'utf8'))
  const part = S.streets.filter(s => { const ws = Object.values(s.ways || {}); const off = ws.filter(w => isOffGradeWay(w)).length; return off > 0 && off < ws.length })
  console.log(`${t}: chains partly off grade (some source ways off, some at grade): ${part.length}${part.length ? ' · ' + part.slice(0, 6).map(s => s.id).join(' · ') : ''}${S.streets[0].ways ? '' : ' (this skeleton carries no per-way tags)'}`) }
