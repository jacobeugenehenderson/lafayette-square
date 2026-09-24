import { readFileSync, writeFileSync } from 'fs';

const lmkPath = './src/data/landmarks.json';
const data = JSON.parse(readFileSync(lmkPath, 'utf8'));

const fixes = [
  { id: 'lmk-006', category: 'shopping', subcategory: 'grocery' },        // Save-A-Lot
  { id: 'lmk-009', category: 'services', subcategory: null },             // Frontenac Cleaners
  { id: 'lmk-017', category: 'services', subcategory: null },             // Nu-Look Cleaners
  { id: 'lmk-038', category: 'historic', subcategory: 'notable-homes' },  // Seib House
];

for (const fix of fixes) {
  const lm = data.landmarks.find(l => l.id === fix.id);
  if (!lm) { console.error(fix.id + ' not found'); continue; }
  const oldCat = lm.category + '/' + (lm.subcategory || '?');
  lm.category = fix.category;
  if (fix.subcategory) {
    lm.subcategory = fix.subcategory;
  } else {
    delete lm.subcategory;
  }
  const newCat = lm.category + '/' + (lm.subcategory || '(none)');
  console.log(`${lm.name}: ${oldCat} → ${newCat}`);
}

writeFileSync(lmkPath, JSON.stringify(data));
console.log('\nDone! landmarks.json updated.');
