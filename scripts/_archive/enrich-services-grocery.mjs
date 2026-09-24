import { readFileSync, writeFileSync } from 'fs';

const lmkPath = './src/data/landmarks.json';
const data = JSON.parse(readFileSync(lmkPath, 'utf8'));

function enrich(id, fields) {
  const lm = data.landmarks.find(l => l.id === id);
  if (!lm) { console.error(`${id} not found!`); return; }
  Object.assign(lm, fields);
  console.log(`✓ Enriched ${id} (${lm.name})`);
}

// Frontenac Cleaners West End (lmk-009) — 1937 Park Ave, bldg-0419
enrich('lmk-009', {
  address: "1937 Park Avenue",
  phone: "(314) 436-1355",
  description: "Neighborhood dry cleaner established in 1950, one of the longest-running businesses in Lafayette Square. Full-service garment care including dry cleaning, alterations, shirt laundering, shoe and leather repair, and drapery cleaning. Pick-up and delivery available. Now under new ownership.",
  hours: {
    monday: { open: "07:30", close: "19:00" },
    tuesday: { open: "07:30", close: "19:00" },
    wednesday: { open: "07:30", close: "19:00" },
    thursday: { open: "07:30", close: "19:00" },
    friday: { open: "07:30", close: "19:00" },
    saturday: { open: "08:00", close: "16:00" }
  },
  photos: [
    "/photos/frontenac-cleaners/01.jpg",
    "/photos/frontenac-cleaners/02.jpg",
    "/photos/frontenac-cleaners/03.jpg"
  ],
  amenities: [
    "Dry cleaning (suits, dresses, formal wear)",
    "Clothing alterations and tailoring",
    "Laundered and pressed shirts",
    "Shoe and leather repair",
    "Drapery and tablecloth cleaning",
    "Pick-up and delivery service"
  ],
  history: [
    { year: 1950, event: "Frontenac Cleaners established, operating from Park Avenue in Lafayette Square." },
    { year: 1972, event: "Lafayette Square designated a historic district, one of St. Louis's first protected neighborhoods. Frontenac Cleaners continues as a neighborhood anchor." }
  ]
});

// Nu-Look Cleaners (lmk-017) — 1817 Park Ave, bldg-0380
enrich('lmk-017', {
  address: "1817 Park Avenue",
  phone: "(314) 621-1488",
  description: "Family-owned dry cleaner and self-service laundromat operating in Lafayette Square since 1984. A+ BBB rating with zero complaints over 41 years. Full-service dry cleaning, alterations, leather cleaning, and coin-operated washers and dryers.",
  hours: {
    monday: { open: "07:00", close: "19:00" },
    tuesday: { open: "07:00", close: "19:00" },
    wednesday: { open: "07:00", close: "19:00" },
    thursday: { open: "07:00", close: "19:00" },
    friday: { open: "07:00", close: "19:00" }
  },
  photos: [
    "/photos/nu-look-cleaners/01.jpg",
    "/photos/nu-look-cleaners/02.jpg",
    "/photos/nu-look-cleaners/03.jpg"
  ],
  amenities: [
    "Full-service dry cleaning",
    "Clothing alterations",
    "Leather and purse cleaning",
    "Wedding gown preservation",
    "Self-service laundromat (coin-op washers and dryers)",
    "Same-day and next-day rush service",
    "Hanger recycling program"
  ],
  reviews: [
    {
      author: "Local Resident",
      rating: 5,
      text: "I LOVE Nu-Look and walk there if I must, so worth it.",
      time: "2023"
    },
    {
      author: "Foursquare User",
      rating: 5,
      text: "Excellent service. The quality of the dry cleaning is the best I've ever seen.",
      time: "2022"
    }
  ],
  history: [
    { year: 1984, event: "Nu-Look Cleaners Inc. founded by Steven Krekorian on Park Avenue in Lafayette Square, offering dry cleaning and self-service laundry." },
    { year: 1996, event: "Better Business Bureau opens file on the business, which maintains zero complaints and an A+ rating throughout its history." }
  ]
});

// Save-A-Lot (lmk-006) — 1631 S Jefferson Ave, bldg-1606
enrich('lmk-006', {
  address: "1631 South Jefferson Avenue",
  phone: "(314) 776-3217",
  website: "https://savealot.com/stores/30222",
  description: "Discount grocery store anchoring the Jefferson Commons development. Opened in 2013 to address a federally designated food desert after the space sat vacant for nearly a decade. Recently remodeled with a $1M investment. Accepts EBT, WIC, and offers delivery via DoorDash and Instacart.",
  rating: 4.1,
  review_count: 922,
  hours: {
    monday: { open: "08:00", close: "22:00" },
    tuesday: { open: "08:00", close: "22:00" },
    wednesday: { open: "08:00", close: "22:00" },
    thursday: { open: "08:00", close: "22:00" },
    friday: { open: "08:00", close: "22:00" },
    saturday: { open: "08:00", close: "22:00" },
    sunday: { open: "08:00", close: "22:00" }
  },
  photos: [
    "/photos/save-a-lot/01.jpg",
    "/photos/save-a-lot/02.jpg",
    "/photos/save-a-lot/03.jpg"
  ],
  amenities: [
    "Full grocery including fresh produce and meat counter",
    "Accepts EBT, WIC, and healthy benefits cards",
    "Delivery via DoorDash, Instacart, and Uber Eats",
    "Partners with Too Good To Go (surplus food bags $6.99)",
    "Recently remodeled interior",
    "Bike parking available"
  ],
  reviews: [
    {
      author: "Google Reviewer",
      rating: 4,
      text: "The produce section is much better than expected, beautifully displayed at the entry. Recommended meat counter.",
      time: "2024"
    },
    {
      author: "Google Reviewer",
      rating: 4,
      text: "Staff is friendly and it's less crowded than other stores. Recent remodel resembling Aldi's layout was a nice improvement.",
      time: "2025"
    }
  ],
  history: [
    { year: 1984, event: "Building constructed as a Kroger supermarket on South Jefferson Avenue." },
    { year: 1986, event: "Kroger exits St. Louis; store sold to National Supermarkets." },
    { year: 1999, event: "National chain goes out of business; store closes. Neighborhood classified as a USDA food desert." },
    { year: 2004, event: "Foodland, the last tenant, closes. Building sits vacant for nearly a decade." },
    { year: 2012, event: "Green Streets Development Group purchases the property. TIF Commission approves $1.7M in public funds. Save-A-Lot commits to lease the space as anchor of the new Jefferson Commons development." },
    { year: 2013, event: "Save-A-Lot opens in the 17,600 sq ft space, hiring 20-25 community residents and ending the neighborhood's food desert status." },
    { year: 2024, event: "Save-A-Lot exercises early lease renewal and invests approximately $1M in a full interior remodel." }
  ]
});

// Acosta Hair Design (lmk-013) — 1901 Park Ave Suite 1R, bldg-0384
enrich('lmk-013', {
  address: "1901 Park Avenue, Suite 1R",
  phone: "(314) 899-5016",
  website: "https://acostahairdesign.com",
  description: "Boutique hair salon founded in 2017 by Josie Acosta, who trained at one of the Top 200 Salons in North America (Bobby Cooper Salon, Indianapolis) and with top technicians in New York and Chicago. Specializes in color, cutting, extensions, and Brazilian blowouts. Nextdoor Neighborhood Favorite 2018 and 2019.",
  rating: 5.0,
  review_count: 67,
  hours: {
    tuesday: { open: "13:00", close: "20:00" },
    thursday: { open: "12:00", close: "19:00" },
    friday: { open: "09:30", close: "15:30" }
  },
  photos: [
    "/photos/acosta-hair-design/01.jpg",
    "/photos/acosta-hair-design/02.jpg",
    "/photos/acosta-hair-design/03.jpg"
  ],
  amenities: [
    "Expert hair coloring (all techniques)",
    "Precision cutting and styling",
    "Hair extensions (consultation required)",
    "Brazilian blowout treatments",
    "Online booking via Square",
    "Gift cards available"
  ],
  reviews: [
    {
      author: "Yelp Reviewer",
      rating: 5,
      text: "Josie is incredibly talented — her color work is the best I've found in St. Louis. She takes the time to understand exactly what you want.",
      time: "2024"
    }
  ],
  history: [
    { year: 2017, event: "Josie and Israel Acosta move from Indianapolis to St. Louis and open Acosta Hair Design at 1901 Park Avenue in Lafayette Square." },
    { year: 2018, event: "Named a Nextdoor Neighborhood Favorite by residents of the Lafayette Square area." },
    { year: 2019, event: "Receives Nextdoor Neighborhood Favorite award for a second consecutive year." }
  ]
});

writeFileSync(lmkPath, JSON.stringify(data));
console.log('\nDone! landmarks.json updated.');
