import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('./src/data/landmarks.json', 'utf8'));
const cats = {};
for (const l of data.landmarks) {
  const key = (l.category || '?') + '/' + (l.subcategory || '(none)');
  if (cats[key] === undefined) cats[key] = [];
  const enriched = (l.description || (l.history && l.history.length) || (l.amenities && l.amenities.length)) ? 'ENRICHED' : 'BARE';
  cats[key].push(`${l.name} [${l.id}] — ${enriched}`);
}
const keys = Object.keys(cats).sort();
for (const k of keys) {
  console.log(`\n${k}:`);
  for (const n of cats[k]) console.log(`  - ${n}`);
}
console.log(`\nTotal: ${data.landmarks.length} landmarks`);
