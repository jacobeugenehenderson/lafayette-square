/**
 * atlas-kind-classifier.js — shared LEAF / WOOD / AMBIGUOUS classification.
 *
 * Lifted out of survey-deleaf.js (2026-05-23, Adze, Brief 6.2) so publish-glb.js
 * can stamp `extras.atlasKind` on the raw vendor variantDoc BEFORE the
 * decimation levers run. Without this stamping pass Spindle's Lever 3 (leaf-card
 * reduction) and the new Lever 5 (bark decimation) both early-return on every
 * primitive — the gating mechanism only worked when called on chassis docs that
 * had already been through survey-deleaf.
 *
 * Per [[feedback_classifier_keyword_cross_check]] — single source of truth for
 * the classifier; survey-deleaf imports the same `classifyPrim` so the two
 * call-sites can't drift on keyword sets.
 *
 * Rules (LEAF/WOOD precedence; name signals strong, geometry fallback weak):
 *
 *   LEAF if:
 *     0. any ancestor node name matches /leaf|leaves|foliage/i
 *     1. material name matches /leaf|leaves|foliage|leafCard|branch/i
 *        (vendor packs use `Branches_*` for leaf-card clusters — atlas-survey.js
 *         convention)
 *     2. primitive extras.atlasKind === 'leaf'
 *     3. alphaMode in (MASK, BLEND) AND vertex count < 5000
 *     4. avg tri area < 0.001 m² AND tri count > 100
 *
 *   WOOD if:
 *     0. any ancestor node name matches /branch(es)?|caps?|trunk|wood|bark|stem/i
 *     1. material name matches /bark|trunk|wood|stem/i
 *     2. primitive extras.atlasKind === 'bark'
 *     3. opaque (no alphaMode set OR alphaMode === 'OPAQUE') AND material has a
 *        normal map texture binding
 *
 *   otherwise AMBIGUOUS.
 */

export function classifyPrim(prim, ancestorNodeNames = []) {
  const mat = prim.getMaterial()
  const matName = (mat?.getName() || '').toLowerCase()
  const alphaMode = mat?.getAlphaMode() || 'OPAQUE'
  const extras = prim.getExtras() || {}

  const posAttr = prim.getAttribute('POSITION')
  const vcount = posAttr ? posAttr.getCount() : 0
  const idx = prim.getIndices()
  const tcount = idx ? Math.floor(idx.getCount() / 3) : Math.floor(vcount / 3)
  const hasNormal = !!mat?.getNormalTexture()
  const avgTriArea = (tcount > 100 && posAttr && idx) ? avgTriangleArea(posAttr, idx) : null

  const base = { matName: mat?.getName() || '<unnamed>', alphaMode, vcount, tcount, hasNormal, avgTriArea }
  const mk = (cls, why) => ({ cls, why, ...base })

  if (ancestorNodeNames.some(n => /leaf|leaves|foliage/i.test(n))) return mk('LEAF', 'nodeName')
  if (ancestorNodeNames.some(n => /branch(es)?|caps?|trunk|wood|bark|stem/i.test(n))) return mk('WOOD', 'nodeName')
  if (/leaf|leaves|foliage|leafcard|branch/.test(matName)) return mk('LEAF', 'matName')
  if (/bark|trunk|wood|stem/.test(matName)) return mk('WOOD', 'matName')
  if (extras.atlasKind === 'leaf') return mk('LEAF', 'extras')
  if (extras.atlasKind === 'bark') return mk('WOOD', 'extras')

  if ((alphaMode === 'MASK' || alphaMode === 'BLEND') && vcount < 5000) {
    return mk('LEAF', `alphaMode=${alphaMode} vcount=${vcount}<5000`)
  }
  if (avgTriArea !== null && avgTriArea < 0.001 && tcount > 100) {
    return mk('LEAF', `avgTriArea=${avgTriArea.toExponential(2)} tcount=${tcount}`)
  }
  if (alphaMode === 'OPAQUE' && hasNormal) return mk('WOOD', 'opaque+normalMap')

  return mk('AMBIGUOUS', `mat="${matName}" alpha=${alphaMode} v=${vcount} normalMap=${hasNormal}`)
}

export function buildMeshAncestorNames(doc) {
  const out = new Map()
  function record(mesh, names) {
    if (!mesh) return
    if (!out.has(mesh)) out.set(mesh, [])
    for (const n of names) if (n) out.get(mesh).push(n)
  }
  function walk(node, ancestry) {
    const next = [...ancestry, node.getName() || '']
    record(node.getMesh(), next)
    for (const child of node.listChildren()) walk(child, next)
  }
  const inScene = new Set()
  for (const scene of doc.getRoot().listScenes()) {
    for (const root of scene.listChildren()) {
      const collect = (n) => { inScene.add(n); n.listChildren().forEach(collect) }
      collect(root)
    }
    for (const root of scene.listChildren()) walk(root, [])
  }
  for (const node of doc.getRoot().listNodes()) {
    if (!inScene.has(node) && node.getMesh()) {
      record(node.getMesh(), [node.getName() || ''])
    }
  }
  return out
}

// Stamp every primitive in `doc` with `extras.atlasKind = 'bark' | 'leaf'`
// based on the shared classifier. Idempotent: prims already carrying an
// atlasKind are skipped (so re-runs on chassis docs don't churn). Returns a
// small report for logging.
//
// AMBIGUOUS prims are NOT stamped — downstream decimators will skip them by
// default, which is the safe behavior (Spindle's Lever 3 + Adze's Lever 5
// both gate on equality with 'leaf' / 'bark').
export function stampAtlasKind(doc) {
  const ancestors = buildMeshAncestorNames(doc)
  const report = { bark: 0, leaf: 0, ambiguous: 0, alreadyStamped: 0 }
  for (const mesh of doc.getRoot().listMeshes()) {
    const names = ancestors.get(mesh) || []
    for (const prim of mesh.listPrimitives()) {
      const extras = prim.getExtras() || {}
      if (extras.atlasKind === 'bark' || extras.atlasKind === 'leaf') {
        report.alreadyStamped++
        continue
      }
      const c = classifyPrim(prim, names)
      if (c.cls === 'LEAF') { prim.setExtras({ ...extras, atlasKind: 'leaf' }); report.leaf++ }
      else if (c.cls === 'WOOD') { prim.setExtras({ ...extras, atlasKind: 'bark' }); report.bark++ }
      else { report.ambiguous++ }
    }
  }
  return report
}

function avgTriangleArea(posAttr, idx) {
  const pos = posAttr.getArray()
  const indices = idx.getArray()
  const n = indices.length
  if (n < 3) return 0
  let total = 0, count = 0
  const stride = Math.max(1, Math.floor((n / 3) / 1000))
  for (let i = 0; i + 2 < n / 3; i += stride) {
    const a = indices[i * 3] * 3
    const b = indices[i * 3 + 1] * 3
    const c = indices[i * 3 + 2] * 3
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2]
    const bx = pos[b], by = pos[b + 1], bz = pos[b + 2]
    const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2]
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    total += 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz)
    count++
  }
  return count > 0 ? total / count : 0
}
