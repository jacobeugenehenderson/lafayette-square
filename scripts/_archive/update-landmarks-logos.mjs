import { readFileSync, writeFileSync } from 'fs';

const filePath = './src/data/landmarks.json';
const data = JSON.parse(readFileSync(filePath, 'utf8'));

const updates = {
  'lmk-002': { logo: '/logos/park-avenue-coffee.png' },
  'lmk-004': { logo: '/logos/jefferson-chop-suey.png', phone: '+13147731688' },
  'lmk-032': { logo: '/logos/hamiltons.png' },
  'lmk-039': { logo: '/logos/rose-by-peno.png' },
};

for (const [id, update] of Object.entries(updates)) {
  const idx = data.landmarks.findIndex(l => l.id === id);
  if (idx === -1) {
    console.error(`Landmark ${id} not found!`);
    continue;
  }
  data.landmarks[idx] = { ...data.landmarks[idx], ...update };
  console.log(`✓ Updated ${id} (${data.landmarks[idx].name})`);
}

writeFileSync(filePath, JSON.stringify(data));
console.log('\nDone! landmarks.json updated.');
