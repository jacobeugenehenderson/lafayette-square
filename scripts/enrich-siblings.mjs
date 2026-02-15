import { readFileSync, writeFileSync } from 'fs';

const lmkPath = './src/data/landmarks.json';
const data = JSON.parse(readFileSync(lmkPath, 'utf8'));

function enrich(id, fields) {
  const lm = data.landmarks.find(l => l.id === id);
  if (!lm) { console.error(`${id} not found!`); return; }
  Object.assign(lm, fields);
  console.log(`✓ Enriched ${id} (${lm.name})`);
}

// Master G's Styling Studio (lmk-005) — shares bldg-1594 with Jefferson Chop Suey
enrich('lmk-005', {
  phone: "+13146699174",
  website: "https://booksy.com/en-us/261565_master-g-s-styling-studio_hair-salon_117221_st-louis",
  description: "Neighborhood hair salon specializing in natural hair care with unique and fun styles for every occasion. Services include blowouts, sew-in weaves, braids, retwists, relaxer & style, press & curl, and protective styling. Book via Booksy.",
  // Empty objects prevent inheriting JCS data from the building
  hours: {},
  reviews: [],
  photos: [],
  amenities: [
    "Natural hair care specialist",
    "Sew-in weaves and quick weave installations",
    "Custom braid styles and protective styling",
    "Retwist services (locs/twists)",
    "Walk-ins and appointments via Booksy"
  ],
  history: []
});

// 33 Wine Shop & Bar (lmk-012) — shares bldg-0385 with Chad Lawson Fine Art
enrich('lmk-012', {
  website: "https://www.33wine.com",
  category: "dining",
  subcategory: "bars",
  rating: 4.5,
  review_count: 107,
  hours: {
    tuesday: { open: "17:00", close: "22:00" },
    wednesday: { open: "17:00", close: "22:00" },
    thursday: { open: "17:00", close: "22:00" },
    friday: { open: "17:00", close: "01:00" },
    saturday: { open: "17:00", close: "01:00" }
  },
  description: "Beloved neighborhood wine bar celebrating 25 years in Lafayette Square. 500+ curated wines, craft beers, and cocktails with an 85-page list. Free tastings every Tuesday. Spacious patio reminiscent of a New Orleans courtyard.",
  photos: [
    "/photos/33-wine/01.jpg",
    "/photos/33-wine/02.jpg",
    "/photos/33-wine/03.jpg"
  ],
  amenities: [
    "500+ curated wines from around the world",
    "Retail wine shop with to-go pricing ($15 corkage)",
    "Free wine tastings every Tuesday 5:30-7:30 PM",
    "Spacious outdoor patio",
    "Cheese and charcuterie boards (Volpi, Salume Beddu)",
    "Food by Khana (butter chicken flatbread, Brussels sprouts)",
    "Monthly wine club"
  ],
  reviews: [
    {
      author: "Catherine R.",
      rating: 5,
      text: "We sat at the bar and were served by the owner who clearly has a great passion for wine. He recommended a couple and each one was fantastic! The Riesling was probably the best I have ever tried.",
      time: "2024"
    },
    {
      author: "Mark D.",
      rating: 5,
      text: "A charming little wine bar in a boutique row of shops in beautifully historic Lafayette Square. You'd never know they have an 85-page wine, spirits and beer list!",
      time: "2024"
    },
    {
      author: "Jessica L.",
      rating: 5,
      text: "The patio is wonderful — feels like a New Orleans courtyard. Great cheese boards with Union Loafers bread. Staff is incredibly knowledgeable and never pretentious.",
      time: "2025"
    }
  ],
  history: [
    { year: 1870, event: "Victorian commercial building constructed on Park Avenue during Lafayette Square's golden age." },
    { year: 2001, event: "Jake Hafner (later of Civil Life Brewing Co.) opens 33 Wine Shop & Bar, bringing a curated wine experience to Lafayette Square." },
    { year: 2013, event: "Sommeliers James Smallwood and Jessica Spitzer purchase the bar — the second time it was sold to a loyal customer." },
    { year: 2024, event: "Expands food program with Khana chefs Nhat Nguyen and Remy Javed, adding butter chicken flatbread and shareable plates." },
    { year: 2026, event: "Celebrates 25 years as a Lafayette Square institution." }
  ]
});

// Vicini Pastaria (lmk-014) — shares bldg-0379 with Grow Hair Co
enrich('lmk-014', {
  phone: "(314) 827-6150",
  website: "https://www.vicinipastaria.com",
  category: "dining",
  subcategory: "restaurants",
  rating: 4.9,
  review_count: 58,
  hours: {
    friday: { open: "11:30", close: "18:00" },
    saturday: { open: "11:30", close: "17:30" },
    sunday: { open: "11:30", close: "17:30" }
  },
  description: "Handmade fresh pasta shop, café, and Italian market by chef Dawn Wilson, a molecular geneticist turned pasta artisan who trained in Tuscany. Best New Restaurant 2023 (Feast Magazine). Signature pici cacio e pepe.",
  photos: [
    "/photos/vicini-pastaria/01.jpg",
    "/photos/vicini-pastaria/02.jpg",
    "/photos/vicini-pastaria/03.jpg"
  ],
  amenities: [
    "Handmade fresh pasta sold by the pound",
    "16-seat counter-service lunch café",
    "Scratch-made pasta sauces (fresh and frozen)",
    "Italian specialty market and imported goods",
    "Friday Aperitivo happy hour 4-6 PM",
    "European-inspired antiques and home décor"
  ],
  reviews: [
    {
      author: "Anna K.",
      rating: 5,
      text: "The cacio e pepe is absolute perfection. Just pecorino Romano, black pepper, and pasta water come together in a way that's downright magical. The pasta is cooked just right, the sauce is creamy without being heavy.",
      time: "2024"
    },
    {
      author: "David M.",
      rating: 5,
      text: "The cacio e pepe and rigatoni in vodka sauce were both wonderful, with perfect pasta cook and luxurious sauces. Feels like you're in Rome.",
      time: "2024"
    },
    {
      author: "Lauren S.",
      rating: 5,
      text: "The pasta was well made and delicious. Cozy environment, delicious food, and friendly service. The mortadella and pistachio panino is a must-try.",
      time: "2025"
    }
  ],
  history: [
    { year: 1880, event: "Victorian commercial building constructed on Park Avenue during Lafayette Square's development." },
    { year: 2016, event: "Chef Dawn Wilson, a St. Louis native and former molecular genetics researcher, launches the original Vicini in Chicago after training in Tuscany." },
    { year: 2022, event: "Wilson returns to St. Louis and opens Vicini Pastaria, Café & Market at 1916 Park Avenue in November, bringing handmade fresh pasta to Lafayette Square." },
    { year: 2023, event: "Named Best New Restaurant by Feast Magazine's Feast 50 Readers' Choice Awards and Best Italian Restaurant by Riverfront Times." }
  ]
});

// Grow Hair Co (lmk-016) — shares bldg-0379 with Vicini Pastaria
enrich('lmk-016', {
  website: "https://growhairco.glossgenius.com",
  description: "Suite-style salon collective where independent beauty professionals collaborate. Services include hair coloring, cutting, styling, extensions, balayage, HydraFacials, brow lamination, and airbrush spray tans.",
  hours: {
    monday: { open: "09:00", close: "16:00" },
    tuesday: { open: "10:00", close: "19:00" },
    wednesday: { open: "10:00", close: "19:00" },
    friday: { open: "09:30", close: "15:00" },
    saturday: { open: "09:00", close: "14:00" }
  },
  photos: [],
  reviews: [],
  amenities: [
    "Hair coloring, cutting, and styling",
    "Hair extensions (consultation required)",
    "Balayage and advanced color techniques",
    "HydraFacial treatments",
    "Brow lamination and tinting",
    "Airbrush spray tans",
    "Online booking via GlossGenius"
  ],
  history: []
});

writeFileSync(lmkPath, JSON.stringify(data));
console.log('\nDone! landmarks.json updated.');
