import { readFileSync, writeFileSync } from 'fs';

const lmkPath = './src/data/landmarks.json';
const bldgPath = './src/data/buildings.json';
const lmkData = JSON.parse(readFileSync(lmkPath, 'utf8'));
const bldgData = JSON.parse(readFileSync(bldgPath, 'utf8'));

// Fields to migrate from building → landmark (business-specific, not architectural)
const BUSINESS_FIELDS = [
  'rating', 'review_count', 'hours', 'reviews', 'photos', 'amenities', 'history', 'description'
];

// Step 1: For all dining landmarks that have building-level business data,
// copy those fields onto the landmark (so each business is self-contained)
const dining = lmkData.landmarks.filter(l => l.category === 'dining');
for (const lm of dining) {
  const bldg = bldgData.buildings.find(b => b.id === lm.building_id);
  if (!bldg) continue;

  let copied = [];
  for (const field of BUSINESS_FIELDS) {
    if (bldg[field] && !lm[field]) {
      lm[field] = bldg[field];
      copied.push(field);
    }
  }
  if (copied.length > 0) {
    console.log(`✓ Migrated ${copied.join(', ')} → ${lm.id} (${lm.name})`);
  }
}

// Step 2: Fix Winnie's Wine Bar (lmk-021) — it inherited Hamilton's data from bldg-0082.
// Replace with Winnie's own data.
const winnies = lmkData.landmarks.find(l => l.id === 'lmk-021');
if (winnies) {
  // Clear inherited Hamilton's data first
  for (const field of BUSINESS_FIELDS) delete winnies[field];

  Object.assign(winnies, {
    phone: "(314) 242-9463",
    website: "https://winnieswinebar.com",
    rating: 4.5,
    review_count: 65,
    hours: {
      tuesday: { open: "15:00", close: "21:00" },
      wednesday: { open: "15:00", close: "21:00" },
      thursday: { open: "15:00", close: "21:00" },
      friday: { open: "15:00", close: "22:00" },
      saturday: { open: "15:00", close: "22:00" }
    },
    amenities: [
      "30+ wines by the glass with Coravin system",
      "8 curated wine flights",
      "14 draft and craft cocktails",
      "Shareable small plates from Hamilton's kitchen",
      "625 sq ft outdoor patio",
      "Private dining room (30 guests)",
      "Retro aviation-themed decor"
    ],
    photos: [
      "/photos/winnies/01.jpg",
      "/photos/winnies/02.jpg",
      "/photos/winnies/03.jpg"
    ],
    reviews: [
      {
        author: "Karen L.",
        rating: 5,
        text: "A fantastic spot that opens at 3:00 and offers a great selection of drinks and delectable food. The Kale and Parmesan dip is a must-try, and their mac and cheese is simply fantastic.",
        time: "2024"
      },
      {
        author: "Dawn M.",
        rating: 5,
        text: "Not only did we have great food but our server made our dining experience extra special! She was pleasant, funny, helpful, and even took us on a tour of Hamilton's Bourbon Bar.",
        time: "2024"
      },
      {
        author: "Steve R.",
        rating: 5,
        text: "The bar's unique backstory adds a charming touch. Whether you're into Old World or New World wines, Winnie's is a delightful place to unwind and enjoy great company.",
        time: "2023"
      },
      {
        author: "Lisa T.",
        rating: 4,
        text: "Thoughtfully designed space with comfortable seating, cozy couches, and warm incandescent lighting. Wine flights are a great way to explore. Service can be slow during peak hours.",
        time: "2025"
      }
    ],
    history: [
      { year: 1900, event: "Building constructed as a machine shop for trucks in Lafayette Square's industrial corridor along Chouteau Avenue." },
      { year: 2016, event: "Paul Hamilton purchases the building at 2101 Chouteau Avenue and begins Hamilton Hospitality's transformation of the Chouteau corridor." },
      { year: 2017, event: "Charleville Brewing Company opens in a portion of the renovated space." },
      { year: 2022, event: "Winnie's Wine Bar opens in the former Charleville space, named after Wendy Hamilton's childhood nickname. Designed with retro aviation theme featuring 3-D world map, vintage propellers, and suitcase tables." }
    ]
  });
  console.log('✓ Replaced Winnie\'s inherited data with own business data');
}

// Step 3: Enrich Planter's House (lmk-033)
const planters = lmkData.landmarks.find(l => l.id === 'lmk-033');
if (planters) {
  Object.assign(planters, {
    phone: "(314) 696-2603",
    website: "https://www.plantershousestl.com",
    rating: 4.6,
    review_count: 392,
    hours: {
      tuesday: { open: "16:00", close: "00:00" },
      wednesday: { open: "16:00", close: "00:00" },
      thursday: { open: "16:00", close: "00:00" },
      friday: { open: "16:00", close: "01:00" },
      saturday: { open: "16:00", close: "01:00" },
      sunday: { open: "16:00", close: "22:00" }
    },
    amenities: [
      "Award-winning craft cocktail program",
      "12 signature cocktails + 30 house classics",
      "Happy hour Tue-Fri 4-6pm, all day Sunday",
      "The Bullock Room — hidden second bar behind velvet curtain",
      "Reservations via Tock (groups up to 6)",
      "Patio seating",
      "Contemporary American cuisine"
    ],
    photos: [
      "/photos/planters-house/01.jpg",
      "/photos/planters-house/02.jpg",
      "/photos/planters-house/03.jpg"
    ],
    reviews: [
      {
        author: "Catherine P.",
        rating: 5,
        text: "After a round of cocktails at Planter's House, you'll never want to order a cocktail anywhere else. Their cocktails are so interesting and original! Incredible take on an old-fashioned.",
        time: "2025"
      },
      {
        author: "Mark S.",
        rating: 5,
        text: "Two of us had specialty cocktails that were dynamite, and two had classic Rye Old Fashioneds made to perfection. Our bartender Brandy was truly a top-notch mixologist.",
        time: "2025"
      },
      {
        author: "Kelly W.",
        rating: 5,
        text: "We frequent Planter's House and no matter the time of day, there are always impeccably crafted, creative cocktails. The atmosphere and service are charming and great.",
        time: "2024"
      },
      {
        author: "James H.",
        rating: 5,
        text: "The food was very good — the fries are a must order. The house Manhattan was excellent. Five stars based on drinks alone. Happy hour deals are amazing.",
        time: "2025"
      }
    ],
    history: [
      { year: 1817, event: "Original Planter's House Hotel opens on Second Street in downtown St. Louis, becoming a legendary gathering place for travelers, politicians, and businessmen." },
      { year: 1861, event: "Pivotal Civil War meeting at the Planter's Hotel: Union Col. Nathaniel Lyon tells Missouri Governor Claiborne Jackson 'This means war,' a moment that helped keep Missouri in the Union." },
      { year: 1922, event: "Original Planter's House Hotel closes after over a century of operation." },
      { year: 2013, event: "Ted Kilgore, Jamie Kilgore, and Ted Charak open the modern Planter's House on December 5 (Repeal Day), paying tribute to the historic hotel with an award-winning cocktail program." },
      { year: 2019, event: "Named James Beard Award semifinalist for Outstanding Bar Program, one of the highest honors in the American food and drink industry." }
    ]
  });
  console.log('✓ Enriched Planter\'s House');
}

// Step 4: Enrich Rhone Rum Bar (lmk-022)
const rhone = lmkData.landmarks.find(l => l.id === 'lmk-022');
if (rhone) {
  Object.assign(rhone, {
    phone: "(314) 241-7867",
    website: "https://www.rhonerumbar.com",
    subcategory: "bars",
    rating: 4.4,
    review_count: 38,
    status: "private_events_only",
    hours: {},
    amenities: [
      "101+ rums from 20+ ports of origin",
      "Caribbean-inspired small plates",
      "Indoor sand volleyball court (Wallyball)",
      "5,000 sq ft with 100-seat capacity",
      "Outdoor patio with operable garage door",
      "Private event and concert space",
      "Upper floor event room"
    ],
    photos: [
      "/photos/rhone-rum-bar/01.jpg",
      "/photos/rhone-rum-bar/02.jpg",
      "/photos/rhone-rum-bar/03.jpg"
    ],
    reviews: [
      {
        author: "Chris M.",
        rating: 5,
        text: "Our server was very knowledgeable about the many rums they have. Great place to step out of the cold and pretend you are in the Caribbean for a little while.",
        time: "2019"
      },
      {
        author: "Ashley R.",
        rating: 5,
        text: "We used this venue for our ten-year high school reunion and the whole experience was easy and fun. Debbie with Moulin Events was beyond helpful and accommodating.",
        time: "2019"
      },
      {
        author: "Paul D.",
        rating: 4,
        text: "Food was tasty though limited in options and quantity. Staff was wonderful and knowledgeable. The patio feels like you're at a beach in the Caribbean.",
        time: "2019"
      },
      {
        author: "Monica J.",
        rating: 4,
        text: "The conch fritters with Key lime remoulade are excellent, and the frozen cocktails are creative and refreshing. Named after the famous RMS Rhone shipwreck dive site.",
        time: "2019"
      }
    ],
    history: [
      { year: 1896, event: "Building at 2107 Chouteau Avenue constructed to house Champ Spring Company, a buggy spring manufacturer that would operate for over 100 years." },
      { year: 2018, event: "Rhone Rum Bar opens December 7, featuring 101+ rums and Caribbean-inspired cuisine. Named after the RMS Rhone, a legendary 1871 shipwreck in the British Virgin Islands." },
      { year: 2019, event: "Wins St. Louis Magazine's A-List award for Best Rum Selection. Transitions to private events only in October 2019." }
    ]
  });
  console.log('✓ Enriched Rhone Rum Bar (private events only)');
}

writeFileSync(lmkPath, JSON.stringify(lmkData));
console.log('\nDone! landmarks.json updated with per-landmark business data.');
