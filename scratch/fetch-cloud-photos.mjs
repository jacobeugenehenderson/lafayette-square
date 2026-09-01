// Download one representative photo per cloud preset id from Wikimedia Commons.
// Usage: node scratch/fetch-cloud-photos.mjs
import fs from 'node:fs';
import path from 'node:path';

const PRESETS = JSON.parse(
  fs.readFileSync(new URL('../public/clouds/presets.json', import.meta.url), 'utf8'),
);
// Authoring reference photos — repo-root authoring/cloud-photos/, NOT public/
// (moved 2026-09-01 so the production build cannot contain them).
const OUT = new URL('../authoring/cloud-photos/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });

// Per-id search query overrides where the literal id is too generic or too narrow.
const QUERY_OVERRIDES = {
  clear_sky: 'clear blue sky',
  cirrus_fibratus: 'Cirrus fibratus',
  cirrus_uncinus: 'Cirrus uncinus',
  cirrus_spissatus: 'Cirrus spissatus',
  cirrus_castellanus: 'Cirrus castellanus',
  cirrus_floccus: 'Cirrus floccus',
  cirrocumulus_stratiformis: 'Cirrocumulus stratiformis',
  cirrocumulus_lenticularis: 'Cirrocumulus lenticularis',
  cirrocumulus_floccus: 'Cirrocumulus floccus',
  cirrocumulus_castellanus: 'Cirrocumulus castellanus',
  cirrostratus_fibratus: 'Cirrostratus fibratus',
  cirrostratus_nebulosus: 'Cirrostratus nebulosus',
  cirrostratus_duplicatus: 'Cirrostratus duplicatus',
  altocumulus_stratiformis: 'Altocumulus stratiformis',
  altocumulus_lenticularis: 'Altocumulus lenticularis',
  altocumulus_castellanus: 'Altocumulus castellanus',
  altocumulus_floccus: 'Altocumulus floccus',
  altocumulus_translucidus: 'Altocumulus translucidus',
  altocumulus_opacus: 'Altocumulus opacus',
  altocumulus_lacunosus: 'Altocumulus lacunosus',
  altostratus_translucidus: 'Altostratus translucidus',
  altostratus_opacus: 'Altostratus opacus',
  nimbostratus: 'Nimbostratus cloud',
  stratocumulus_stratiformis: 'Stratocumulus stratiformis',
  stratocumulus_castellanus: 'Stratocumulus castellanus',
  stratocumulus_lenticularis: 'Stratocumulus lenticularis',
  stratocumulus_perlucidus: 'Stratocumulus perlucidus',
  stratocumulus_opacus: 'Stratocumulus opacus',
  stratocumulus_volutus: 'Volutus cloud',
  stratus_nebulosus: 'Stratus nebulosus',
  stratus_fractus: 'Stratus fractus',
  stratus_opacus: 'Stratus opacus',
  cumulus_humilis: 'Cumulus humilis',
  cumulus_mediocris: 'Cumulus mediocris',
  cumulus_congestus: 'Cumulus congestus',
  cumulus_fractus: 'Cumulus fractus',
  cumulonimbus_calvus: 'Cumulonimbus calvus',
  cumulonimbus_capillatus: 'Cumulonimbus capillatus',
  cumulonimbus_mammatus: 'Mammatus cloud',
  fog_ground: 'Ground fog',
  fog_valley: 'Valley fog',
  haze_summer: 'Summer haze landscape',
  haze_smoke: 'Wildfire smoke haze',
  rain_light: 'Light rain shower sky',
  rain_moderate: 'Rain falling clouds',
  rain_heavy: 'Heavy rainstorm sky',
  rain_squall: 'Rain squall line',
  snow_calm: 'Light snowfall sky',
  snow_heavy: 'Heavy snowfall sky',
  snow_blizzard: 'Blizzard whiteout',
  lightning_intracloud: 'Intracloud lightning',
  lightning_cloud_ground: 'Cloud to ground lightning',
};

const ids = PRESETS.presets.map((p) => p.id);
const UA = 'lafayette-square-cloud-photo-fetch/1.0 (jacob@jacobhenderson.studio)';

async function api(params) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`api ${r.status}`);
  return r.json();
}

async function findImage(query) {
  // Search file namespace for images matching the query, then resolve the
  // first hit's actual file URL via imageinfo.
  const search = await api({
    action: 'query',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '10',
    prop: 'imageinfo',
    iiprop: 'url|mime|size',
    iiurlwidth: '1600',
  });
  const pages = search?.query?.pages;
  if (!pages) return null;
  const hits = Object.values(pages).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  for (const h of hits) {
    const ii = h.imageinfo?.[0];
    if (!ii) continue;
    if (!/^image\/(jpe?g|png|webp)$/i.test(ii.mime)) continue;
    return { url: ii.thumburl || ii.url, page: h.title };
  }
  return null;
}

async function download(url, dest) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`dl ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

const report = [];
for (const id of ids) {
  const dest = path.join(OUT.pathname, `${id}.jpg`);
  if (fs.existsSync(dest)) {
    console.log(`skip ${id} (exists)`);
    report.push({ id, status: 'exists' });
    continue;
  }
  const q = QUERY_OVERRIDES[id] || id.replace(/_/g, ' ');
  try {
    const hit = await findImage(q);
    if (!hit) {
      console.log(`MISS  ${id}  q="${q}"`);
      report.push({ id, status: 'miss', query: q });
      continue;
    }
    await download(hit.url, dest);
    console.log(`ok    ${id}  <- ${hit.page}`);
    report.push({ id, status: 'ok', source: hit.page, url: hit.url });
  } catch (e) {
    console.log(`ERR   ${id}  ${e.message}`);
    report.push({ id, status: 'error', error: e.message });
  }
  await new Promise((r) => setTimeout(r, 1500));
}

fs.writeFileSync(
  path.join(OUT.pathname, 'SOURCES.json'),
  JSON.stringify(report, null, 2),
);
console.log(`\n${report.filter((r) => r.status === 'ok').length}/${ids.length} downloaded`);
