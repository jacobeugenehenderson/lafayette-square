/**
 * slab-name-rule.mjs — A SLAB UPLOADS ONLY UNDER THE NAME IT WAS BAKED UNDER. A pure rule, read by the uploader's plan()
 * (which throws on it before anything is planned) and by its check, so the check stays in the safe tier.
 * ⛔ A slab carries its name inside its files, and the player keys every URL by it: a slab moved or copied under another
 * name keeps the old stamp and reads `baked/<old>/…` (for LS, the live site's prod keys; HPDM's rename, 2026-10-04). Every
 * root-level .json of a look is judged by SLAB_NAME_STAMPS wherever a STRING holds one, so a file a baker adds is judged
 * too. A non-string field is not a name (manifest.json's `look` is the look record); SLAB_REQUIRED_STAMPS is what
 * guarantees the name is read at all.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'

export const SLAB_NAME_STAMPS = ['look', 'scene', 'town', 'lookName']
export const SLAB_REQUIRED_STAMPS = { 'manifest.json': 'town', 'ground.json': 'look' }
export function slabNameMismatches(town, l) {
  const bad = []
  for (const e of readdirSync(town, { withFileTypes: true })) {
    if (!e.isFile() || extname(e.name) !== '.json') continue
    let j
    try { j = JSON.parse(readFileSync(join(town, e.name), 'utf8')) } catch { bad.push(`${e.name}: unparseable — a stamp that cannot be read is not a stamp that matched`); continue }
    if (!j || typeof j !== 'object' || Array.isArray(j)) continue
    for (const f of SLAB_NAME_STAMPS) if (typeof j[f] === 'string' && j[f] !== l) bad.push(`${e.name}:${f} = "${j[f]}"`)
  }
  for (const [file, f] of Object.entries(SLAB_REQUIRED_STAMPS)) {
    let j = null
    try { j = JSON.parse(readFileSync(join(town, file), 'utf8')) } catch { /* absent or unparseable: named here or above */ }
    if (!existsSync(join(town, file))) bad.push(`${file}: absent — it must carry the slab's name in "${f}"`)
    else if (j && typeof j[f] !== 'string') bad.push(`${file}:${f} missing — it must carry the slab's name`)
  }
  return bad
}
