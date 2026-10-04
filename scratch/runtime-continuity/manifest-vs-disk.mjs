// READ-ONLY: does public/baked/<look>/manifest.json's files{} sha256 match the bytes on disk?
import { readFileSync, existsSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
const ROOT = new URL('../../', import.meta.url).pathname
for (const l of ['lafayette-square', 'hipointedemun', 'huron', 'provincetown', 'altadena']) {
  const mp = join(ROOT, 'public/baked', l, 'manifest.json')
  if (!existsSync(mp)) { console.log(l, 'no manifest.json'); continue }
  const m = JSON.parse(readFileSync(mp, 'utf8'))
  const bad = [], miss = []
  for (const [rel, f] of Object.entries(m.files || {})) {
    const p = join(ROOT, 'public/baked', l, rel)
    if (!existsSync(p)) { miss.push(rel); continue }
    if (createHash('sha256').update(readFileSync(p)).digest('hex') !== f.sha256) bad.push(rel)
  }
  console.log(l, 'writtenAt', m.writtenAt, 'files', Object.keys(m.files || {}).length, 'sha-mismatch:', bad.join(',') || '—', 'missing:', miss.join(',') || '—')
}
