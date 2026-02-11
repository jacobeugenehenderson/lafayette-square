const fs = require("fs");
const data = JSON.parse(fs.readFileSync("./src/data/buildings.json", "utf8"));

// Victorian-appropriate floor heights for Lafayette Square
const floorHeights = {
  1: 4.5,   // single story + cornice
  2: 8.5,   // ground 4.0 + upper 3.5 + cornice 1.0
  3: 11.5,  // ground 4.0 + 2x upper 3.3 + cornice 0.9
  4: 15.0,  // ground 4.0 + 3x upper 3.3 + cornice 1.1
  5: 18.5,
  6: 22.0,
};

let updated = 0;
for (const b of data.buildings) {
  const oldH = b.size[1];
  const stories = b.stories || 3;
  const targetH = floorHeights[stories] || stories * 3.5;

  // Use max so we don't shrink buildings with good Overture data
  let newH = Math.max(oldH, targetH);

  // Churches: high ceilings + steeple
  const isChurch = b.name && /church|cathedral|chapel|temple|synagogue|mosque/i.test(b.name);
  if (isChurch) {
    newH = Math.max(newH * 1.4, 18);
  }

  newH = Math.round(newH * 10) / 10;
  if (newH > oldH) {
    b.size[1] = newH;
    updated++;
  }
}

fs.writeFileSync("./src/data/buildings.json", JSON.stringify(data, null, 2));
console.log("Updated", updated, "of", data.buildings.length, "buildings");

// Verify
const verify = JSON.parse(fs.readFileSync("./src/data/buildings.json", "utf8"));
const heights = verify.buildings.map(b => b.size[1]);
const dist = {};
heights.forEach(h => {
  const k = Math.round(h);
  dist[k] = (dist[k] || 0) + 1;
});
console.log("New height distribution:", JSON.stringify(dist));

verify.buildings
  .filter(b => b.name && /church|cathedral/i.test(b.name))
  .forEach(b => console.log(b.name, "| stories:", b.stories, "| height:", b.size[1]));
