// salonLibraries.js — THE SALON'S LIBRARIES, READ OFF THE ARBORIST SERVER'S FOUR ANSWERS, or a refusal naming which one failed.
// ⛔ A failed answer is never an empty library (2026-10-28, "a message explains or goes away"): the loader used to read every
// body with `.json()` and default a missing list to [], so a dead or erroring server (a 500, a proxy page, a restart) drew
// "Chassis library is empty. Run node arborist/survey-deleaf.js" while public/trees/_chassis held 241 chassis
// (arborist/BACKLOG.md item 3). Pure, so a check can plant each answer.
//   answers: { chassis, bark, leaves, options } — each a fetch Response (or a Response-like { ok, status, json() })
//   → the libraries (the store's fields), or throws `⛔ the Salon's <kind> did not load: …`
export async function readSalonLibraries({ chassis, bark, leaves, options }) {
  const body = async (kind, r, key) => {
    if (!r?.ok) { let why = ''; try { why = (await r.json())?.error || '' } catch { /* the status alone says it */ }
      throw new Error(`⛔ the Salon's ${kind} did not load: the arborist server answered HTTP ${r?.status ?? '(none)'}${why ? ` (${why})` : ''}`) }
    let d; try { d = await r.json() } catch (e) { throw new Error(`⛔ the Salon's ${kind} did not load: the answer is not JSON (${e.message})`) }
    if (key && !Array.isArray(d?.[key])) throw new Error(`⛔ the Salon's ${kind} did not load: the answer carries no \`${key}\` list`)
    return d
  }
  const [cD, bD, lD, oD] = await Promise.all([body('chassis catalog', chassis, 'chassis'), body('bark library', bark, 'bark'), body('leaf library', leaves, 'leaves'), body('options', options, null)])
  return {
    salonChassisCatalog: cD.chassis,
    salonBarkRefs:       bD.bark,
    salonLeafPacks:      lD.leaves,
    // What the operator sees for a bark/leaf plate (anonymised id + trait), keyed by ref/packId.
    // Chassis carry theirs on the catalog items (`id`, `label`).
    salonPlateLabels:    { bark: bD.labels || {}, leaf: lD.labels || {} },
    // Forest Builder §9: the dossier (reference plates + required) + the
    // matcher's ranked options per part-type for this species (null if no dossier).
    salonDossier:        oD.dossier || null,
    salonOptions:        oD.options || null,
    // recommend-plates' ranking per part-type: { [partId]: { tier, reason, rank } }
    salonRecommend:      oD.recommend || null,
    salonRecommendError: oD.recommendError || null,
    salonChassisLoaded:  true,   // the catalog the server answered: only now may an EMPTY one be said to be empty
  }
}
