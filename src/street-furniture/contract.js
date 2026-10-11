// The street-furniture asset contract (BRIEF-street-furniture §The work step 1). One module, read by the
// workstage (src/street-furniture/) and the server (street-furniture/serve.js), so the page and the
// server can't disagree about when an asset is ready.
//
// An asset's AUTHORED record (street-furniture/tags.json[id]):
//   { mount, forward, lod, pieces: { '<SGn>#<k>': role }, excluded?: '<why>' }
// ⛔ No field has a default. An asset with any field missing, or missing a role its family requires,
//    is REFUSED and says why.

// Each lit role and the colour it emits when ON. These are the meanings of the roles, not tunings.
export const ROLES = {
  glass:       { label: 'Lamp glass',   emissive: [1.0, 0.78, 0.45] },
  red:         { label: 'Red lens',     emissive: [1.0, 0.08, 0.04] },
  amber:       { label: 'Amber lens',   emissive: [1.0, 0.55, 0.0] },
  green:       { label: 'Green lens',   emissive: [0.1, 1.0, 0.45] },
  walk:        { label: 'Walk',         emissive: [0.95, 0.95, 0.9] },
  hand:        { label: "Don't walk",   emissive: [1.0, 0.45, 0.05] },
  'sign-face': { label: 'Sign face',    emissive: null },
}

export const MOUNTS = ['ground', 'wall', 'overhead']

// What each family must declare. Families with no lit or sign role need only mount/forward/lod.
export const REQUIRED_ROLES = {
  street_light:   ['glass'],
  street_lamp:    ['glass'],
  traffic_light:  ['red', 'amber', 'green'],
  street_pointer: ['sign-face'],
}

export function familyOf(id) { return id.replace(/_\d+$/, '') }

// → { ready: boolean, reasons: string[] }
export function assetStatus(asset, tags) {
  const t = tags?.[asset.id]
  if (t?.excluded) return { ready: false, excluded: true, reasons: [`excluded: ${t.excluded}`] }
  const reasons = []
  if (!t) return { ready: false, reasons: ['untagged'] }
  if (!MOUNTS.includes(t.mount)) reasons.push('mount not set')
  if (!Number.isFinite(t.forward)) reasons.push('forward not set')
  if (!asset.lods?.some(l => l.key === t.lod)) reasons.push('triangle budget (lod) not chosen')
  const pieces = new Set(asset.pieces.map(p => p.name))
  for (const [name, role] of Object.entries(t.pieces || {})) {
    if (!pieces.has(name)) reasons.push(`piece ${name} no longer exists in the model`)
    if (!(role in ROLES)) reasons.push(`piece ${name}: unknown role ${role}`)
  }
  const have = new Set(Object.values(t.pieces || {}))
  for (const r of REQUIRED_ROLES[familyOf(asset.id)] || []) if (!have.has(r)) reasons.push(`no piece tagged ${ROLES[r].label}`)
  return { ready: reasons.length === 0, reasons }
}
