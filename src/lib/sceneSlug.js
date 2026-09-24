// A neighborhood's scene id is a deterministic slug of its NAME — the display name
// the operator types in Extent, kept verbatim in neighborhood.json. Never of the
// search text, which is often a ZIP or a list of them ("02657", "44839, 44870").
// Jacob: "Naming the scene from the ZIP isn't acceptable."
//
// Rules: diacritics folded ("Księży Młyn" → ksiezy-mlyn) · lowercase · every run of
// anything else → one hyphen · no leading/trailing hyphen · no article stripping
// ("The Cloisters" → the-cloisters). Examples: checks/claims-a-scene-is-named-not-numbered.mjs
//
// Shared by the Extent panel and serve.js so the scene and its Look agree.

// Letters Unicode decomposition does not split into base + mark.
const FOLD = {
  ł: 'l', Ł: 'l', ø: 'o', Ø: 'o', đ: 'd', Đ: 'd', ð: 'd', Ð: 'd', þ: 'th', Þ: 'th',
  ß: 'ss', æ: 'ae', Æ: 'ae', œ: 'oe', Œ: 'oe', ı: 'i', ħ: 'h', Ħ: 'h',
}

export function slugifyName(name) {
  return String(name ?? '')
    .replace(/[łŁøØđĐðÐþÞßæÆœŒıħĦ]/g, (c) => FOLD[c])
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '')
}

// A scene id made only of digits and hyphens is a postcode (or a list of them),
// never a place's name.
export const isNumericId = (id) => /^[0-9-]+$/.test(String(id ?? ''))

// The scene id for a display name, or an error saying why there is none.
// ⛔ No fallback: an empty or numeric-only name is refused, not patched.
export function sceneIdForName(name) {
  const display = String(name ?? '').trim()
  if (!display) return { error: 'Name this neighborhood first — the scene is named after it.' }
  const id = slugifyName(display)
  if (!id) return { error: `"${display}" has no letters or digits to name a scene with.` }
  if (isNumericId(id)) return { error: `"${display}" is a number, not a place name — a scene is named after the place, never a ZIP.` }
  return { id }
}

// Suggest a display name from a geocode: the first part of each match's
// displayName that is not a postcode ("02657, Provincetown, Barnstable County…" →
// "Provincetown"). Several anchors (comma-separated ZIPs) suggest a name only when
// they all agree; otherwise '' and the operator names it.
export function suggestedName(anchors) {
  const names = (anchors || [])
    .filter((a) => a && a.ok !== false && a.displayName)
    .map((a) => String(a.displayName).split(',').map((s) => s.trim()).find((p) => p && !/^[0-9][0-9 -]*$/.test(p)) || '')
  if (!names.length || names.some((n) => !n)) return ''
  const first = names[0]
  return names.every((n) => slugifyName(n) === slugifyName(first)) ? first : ''
}
