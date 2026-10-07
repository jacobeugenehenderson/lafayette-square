// authorableSlot.js — a blockCustoms slot holds ONLY what the operator can author.
// The authorable fields are the store's own revert lists (`_SURVEY_FE_FIELDS ∪ _SECTION_FE_FIELDS`): a field no revert
// clears, the tool may not write — the invariant `checks/claims-revert-field-coverage.mjs` guards, enforced at the
// write. ⛔ Why: Section's side editor builds a side from the CHAIN measure merged with the custom, and the writers
// replaced the slot with that whole object, so derived fields (`tlClamped`, a skeleton flag) were persisted as authoring
// (LS ×18, found 2026-10-06). Pure, so the check calls the same function the store does.
export function keepAuthorable(measure, fields) {
  const out = {}
  for (const f of fields) if (measure && measure[f] !== undefined) out[f] = measure[f]
  return out
}
