import { readFileSync, writeFileSync } from 'fs';

const lmkPath = './src/data/landmarks.json';
const data = JSON.parse(readFileSync(lmkPath, 'utf8'));

// Malt House Lofts (lmk-025)
const maltHouse = data.landmarks.find(l => l.id === 'lmk-025');
if (maltHouse) {
  Object.assign(maltHouse, {
    website: "https://malthousecellar.com",
    description: "Historic 1876 brewery malt house, now a mixed-use landmark with loft apartments, event venues, and ground-floor restaurants including Extra Wavy and Prohibition speakeasy.",
    photos: [
      "/photos/malt-house-lofts/01.jpg",
      "/photos/malt-house-lofts/02.jpg",
      "/photos/malt-house-lofts/03.jpg"
    ],
    amenities: [
      "17 loft apartments (upper floors)",
      "46,000 sq ft historic building",
      "7 event venues (Malt House Cellar)",
      "Rooftop with Gateway Arch views",
      "Extra Wavy restaurant (ground floor)",
      "Prohibition speakeasy bar",
      "Solar carport parking"
    ],
    history: [
      { year: 1876, event: "Centennial Malt House built by Joseph Schnaider as part of his Chouteau Avenue Brewery, named to commemorate the U.S. Centennial. Designed by Fred W. Wolf (Chicago) and Louis Kledus (St. Louis)." },
      { year: 1881, event: "Joseph Schnaider dies, leaving wife Elizabeth a prosperous brewery with a nationally-known open-air beer garden — one of St. Louis's most successful entertainment venues." },
      { year: 1889, event: "Schnaider's brewery merges with St. Louis Brewing Association, ranking among the top three local breweries." },
      { year: 2005, event: "Paul and Wendy Hamilton purchase the long-vacant malt house and begin a $4 million restoration." },
      { year: 2006, event: "Vin de Set restaurant opens — St. Louis's first rooftop restaurant with 4,000 sq ft rooftop patio. Named to Landmarks Association's 'Eleven Most Enhanced Places.'" },
      { year: 2022, event: "Major fire in September damages the building, permanently closing all Hamilton Hospitality venues (Vin de Set, PW Pizza, 21st Street Brewer's Bar)." },
      { year: 2024, event: "Malt House Lofts LLC (Rich Conyers / BOTI Architecture) purchases property for $2.2M and announces $2M renovation: 17 loft apartments, restaurant space, and event venues." },
      { year: 2025, event: "Extra Wavy opens October 15 on the ground floor. Prohibition speakeasy opens in the cellar. Loft construction continues on upper floors." }
    ]
  });
  console.log('✓ Enriched Malt House Lofts');
}

// Seib House (lmk-038)
const seibHouse = data.landmarks.find(l => l.id === 'lmk-038');
if (seibHouse) {
  Object.assign(seibHouse, {
    description: "Historic 1882 Romanesque Revival mansion, home to the Seib family for over 90 years. Carrie Seib ran the Independent Church of Truth from the third-floor ballroom (1933–1964), channeling poetry and spiritual messages. Beautifully restored in 2019.",
    photos: [
      "/photos/seib-house/01.jpg",
      "/photos/seib-house/02.jpg",
      "/photos/seib-house/03.jpg"
    ],
    history: [
      { year: 1882, event: "Mansion built for a German-born steamboat captain during Lafayette Square's golden age, featuring a grand third-floor ballroom and 8,000 square feet of living space." },
      { year: 1923, event: "Carrie Seib, a German immigrant who made her fortune in the bakery business, purchases the mansion and moves in with her large extended family." },
      { year: 1933, event: "Carrie establishes the Independent Church of Truth, holding Sunday evening services in the third-floor ballroom. She performs clairvoyant readings, spiritual healing, and channels poetry from an entity she calls the 'Eastern Star.'" },
      { year: 1964, event: "After 31 years of weekly services, the Independent Church of Truth holds its final gathering." },
      { year: 1969, event: "Carrie Seib dies. Daughter Edna (Washington University art graduate) becomes matriarch, maintaining the house with brother Dr. George Seib, a Washington University anatomy professor." },
      { year: 2015, event: "Artist Lew Blink discovers 13 boxes of Carrie's reel-to-reel sermon recordings in a dumpster outside the house, launching the 'Dumpster Archaeology' art project that brings renewed attention to Lafayette Square's spiritualist history." },
      { year: 2019, event: "New owners complete a major restoration, featured on the Lafayette Square house tour. The Seib family approves of the careful renovation." }
    ]
  });
  console.log('✓ Enriched Seib House');
}

// Chad M. Lawson Fine Art (lmk-015)
const chadLawson = data.landmarks.find(l => l.id === 'lmk-015');
if (chadLawson) {
  Object.assign(chadLawson, {
    website: "https://www.chadmlawson.com",
    description: "Contemporary art studio of Chad M. Lawson, known for striking abstract paintings on salvaged wooden doors. His layered, gestural work in oil and acrylic incorporates the wood's imperfections, with recurring sankofa symbols representing wisdom in learning from the past.",
    photos: [
      "/photos/chad-lawson/01.jpg",
      "/photos/chad-lawson/02.jpg",
      "/photos/chad-lawson/03.jpg"
    ],
    amenities: [
      "Working artist studio (viewings by appointment)",
      "Abstract paintings on salvaged wooden doors",
      "Limited commissioned projects accepted annually",
      "25+ years creating art",
      "Installations at Cortex Innovation District"
    ],
    history: [
      { year: 1880, event: "Victorian townhouse constructed on Park Avenue during Lafayette Square's peak development, part of the neighborhood's finest residential row." },
      { year: 1972, event: "Building becomes part of Lafayette Square Historic District, one of St. Louis's first protected neighborhoods and the city's oldest historic district." },
      { year: 2010, event: "Chad M. Lawson establishes his fine art studio in the building, bringing contemporary abstract art to Lafayette Square's historic Park Avenue corridor." }
    ]
  });
  console.log('✓ Enriched Chad M. Lawson Fine Art');
}

writeFileSync(lmkPath, JSON.stringify(data));
console.log('\nDone! landmarks.json updated.');
