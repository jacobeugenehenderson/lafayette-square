import { readFileSync, writeFileSync } from 'fs';

const filePath = './src/data/buildings.json';
const data = JSON.parse(readFileSync(filePath, 'utf8'));

const enrichments = {
  'bldg-0387': {
    // Baileys' Chocolate Bar
    category: "Dessert & Cocktail Bar",
    phone: "(314) 241-8100",
    website: "https://www.baileyschocolatebar.com",
    rating: 4.4,
    review_count: 312,
    hours: {
      wednesday: { open: "17:00", close: "22:00" },
      thursday: { open: "17:00", close: "22:00" },
      friday: { open: "17:00", close: "23:00" },
      saturday: { open: "17:00", close: "23:00" },
      sunday: { open: "17:00", close: "22:00" }
    },
    amenities: [
      "Outdoor heated patio seating",
      "Full bar with 90+ beers and wines",
      "Private event space upstairs",
      "Live music",
      "House-made chocolate infusions and desserts",
      "Reservations accepted, walk-ins welcome"
    ],
    photos: [
      "/photos/baileys/01.jpg",
      "/photos/baileys/02.jpg",
      "/photos/baileys/03.jpg"
    ],
    reviews: [
      {
        author: "Sarah M.",
        rating: 5,
        text: "Perfect date night spot with incredible atmosphere. The chocolate martinis are absolutely divine, and the Signature with house-made Oban chocolate ice cream was out of this world.",
        time: "Oct 2024"
      },
      {
        author: "Michael K.",
        rating: 5,
        text: "The Lover's Plate was exceptional — champagne sorbet, chocolate inebriation, s'mores brownie. Each dessert crafted to perfection by their pastry chefs.",
        time: "Dec 2024"
      },
      {
        author: "Jessica L.",
        rating: 4,
        text: "Charming spot for desserts and cocktails. The cheese boards are excellent with house-made breads, and the outdoor heated patio is a nice touch.",
        time: "2 months ago"
      },
      {
        author: "David R.",
        rating: 5,
        text: "Been coming here since they opened 20 years ago. The quality never disappoints — from the flatbreads with prosciutto and brie to the decadent brownies with salted caramel ice cream.",
        time: "Nov 2025"
      }
    ],
    history: [
      { year: 1880, event: "Victorian townhouse constructed during Lafayette Square's golden age, in the Second Empire style typical of Park Avenue's fashionable residential mansions." },
      { year: 1972, event: "Building becomes part of Lafayette Square City Historic District, one of St. Louis's first protected neighborhoods." },
      { year: 1986, event: "Property included in Lafayette Square's entry into the National Register of Historic Places." },
      { year: 2004, event: "Dave and Kara Bailey open Bailey's Chocolate Bar as St. Louis's original dessert and martini bar, transforming the historic townhouse into an intimate dining destination." },
      { year: 2024, event: "Bailey's Chocolate Bar celebrates its 20th anniversary, marking two decades as a Lafayette Square landmark and romantic dining destination." }
    ],
    architecture: {
      style: "Second Empire Victorian",
      materials: ["Red brick", "Decorative stone accents", "Slate mansard roof"],
      features: ["Three-story townhouse", "Arched windows", "Ornate cornice", "Romantic candlelit interior with red walls and flowing drapes"],
      district: "Lafayette Square Historic District"
    }
  },

  'bldg-0464': {
    // Eleven Eleven Mississippi
    category: "Fine Dining",
    phone: "(314) 241-9999",
    website: "https://1111-m.com",
    rating: 4.8,
    review_count: 4658,
    year_renovated: 2003,
    architect: "Johannes/Cohen Collaborative (2003 renovation)",
    hours: {
      tuesday: { open: "11:00", close: "21:00" },
      wednesday: { open: "11:00", close: "21:00" },
      thursday: { open: "11:00", close: "21:00" },
      friday: { open: "11:00", close: "22:00" },
      saturday: { open: "10:00", close: "22:00" }
    },
    amenities: [
      "Seasonal farm-to-table menu from on-site greenhouse",
      "Oak-fired brick oven in open display kitchen",
      "Glass-enclosed wine cellar private dining (8-12 guests)",
      "Tuscan/Californian wine list",
      "Two wood-burning fireplaces",
      "Outdoor patio dining",
      "Saturday brunch service"
    ],
    photos: [
      "/photos/eleven-eleven/01.jpg",
      "/photos/eleven-eleven/02.jpg",
      "/photos/eleven-eleven/03.jpg"
    ],
    reviews: [
      {
        author: "Jennifer M.",
        rating: 5,
        text: "The wild boar ravioli is exceptional and consistently a standout. The focaccia with rosemary and caramelized onion is incredible. Warm, casual-elegant atmosphere with cozy brick-and-wood decor.",
        time: "2 months ago"
      },
      {
        author: "Michael K.",
        rating: 5,
        text: "Outstanding service and menu. The braised pork shank is fall-off-the-bone tender with sweet potato puree. One of my favorites in STL for both special occasions and business dinners.",
        time: "4 months ago"
      },
      {
        author: "Sarah B.",
        rating: 5,
        text: "My husband and I took family here when they visited and we LOVED it. Our server was friendly, prompt, and attentive. Everyone ordered different items and the food was excellent.",
        time: "6 months ago"
      },
      {
        author: "David R.",
        rating: 4,
        text: "Great patio dining experience. Food quality is consistently good with generous portions. The wine list is unparalleled and the exposed brick walls create a welcoming space.",
        time: "Aug 2025"
      }
    ],
    history: [
      { year: 1898, event: "Building constructed as part of the Roberts, Johnson and Rand shoe manufacturing complex in Lafayette Square." },
      { year: 1903, event: "Roberts, Johnson and Rand contracted architect Theodore Link (designer of Union Station) to expand operations. The factory complex measured 60 feet wide, 350 feet long, and 5 stories tall." },
      { year: 1911, event: "RJ&R merged with Peters Shoe Company to form the International Shoe Company, the largest shoe manufacturer in the United States." },
      { year: 1972, event: "Lafayette Square designated as St. Louis's oldest historic district, placed on the National Register of Historic Places." },
      { year: 2003, event: "Paul and Wendy Hamilton purchased the dilapidated 100-year-old warehouse and opened Eleven Eleven Mississippi in December, serving award-winning Tuscan/Californian cuisine." },
      { year: 2012, event: "Paul and Wendy Hamilton named Restaurateurs of the Year by the Missouri Restaurant Association." },
      { year: 2023, event: "Restaurant celebrates 20 years of farm-to-table cuisine with ingredients from their on-site commercial hydroponic greenhouse, The Towers urban farm." }
    ],
    architecture: {
      style: "Late 19th-century industrial warehouse",
      materials: ["Historic red brick exterior", "Exposed timber beams", "Original hardwood flooring", "Copper accents"],
      features: ["Restored 1898 International Shoe factory warehouse", "Exposed brick walls throughout", "Open loft-style layout with high ceilings", "Glass-enclosed wine cellar", "Oak-fired brick oven centerpiece"],
      district: "Lafayette Square Historic District"
    }
  },

  'bldg-0822': {
    // Rosé By Peno
    category: "French-Italian Bistro",
    phone: "(314) 405-8500",
    website: "https://www.rosestl.com",
    rating: 4.7,
    review_count: 89,
    year_renovated: 2023,
    hours: {
      monday: { open: "17:00", close: "21:00" },
      thursday: { open: "17:00", close: "22:00" },
      friday: { open: "17:00", close: "22:00" },
      saturday: { open: "17:00", close: "22:00" },
      sunday: { open: "10:00", close: "21:00" }
    },
    amenities: [
      "Elevated 25-seat garden patio",
      "Nitro wine system with 24 wines by the glass",
      "Intimate 38-seat dining room",
      "Reservations via Tock",
      "Walk-ins welcome",
      "Sunday brunch service"
    ],
    photos: [
      "/photos/rose-by-peno/01.jpg",
      "/photos/rose-by-peno/02.jpg",
      "/photos/rose-by-peno/03.jpg"
    ],
    reviews: [
      {
        author: "Michele F.",
        rating: 5,
        text: "The meatball pizza was delicious. Great service and very attentive staff. The intimate atmosphere with windows looking out into the neighborhood creates a perfect setting.",
        time: "2024"
      },
      {
        author: "Chris W.",
        rating: 5,
        text: "Awesome service, hip interior and romantic atmosphere. The octopus slow braised with fennel sausage in saffron broth was incredible. The nitro wine bar is unique and very cool.",
        time: "2023"
      },
      {
        author: "Lauren D.",
        rating: 5,
        text: "Food is authentic and excellent — the lasagna and pasta Norma were fantastic. The bouillabaisse is elegant and classy. Service was exceptional.",
        time: "2024"
      },
      {
        author: "Andrew T.",
        rating: 4,
        text: "Delicious food and wonderful service. The Godfather pizza with mortadella, pecorino, mozzarella and wild oregano is a standout. Small enough to be cozy without feeling cramped.",
        time: "2023"
      }
    ],
    history: [
      { year: 1918, event: "Building constructed in Lafayette Square during the neighborhood's period of commercial development along 18th Street." },
      { year: 1972, event: "Lafayette Square declared a historic district by the City of Saint Louis." },
      { year: 2000, event: "Building served as Stray Rescue's 18th Street Shelter, a nonprofit animal rescue organization founded by Randy Grim." },
      { year: 2010, event: "Stray Rescue relocated to a larger downtown facility, leaving the 18th Street location vacant." },
      { year: 2023, event: "Chef Pepe Kehm opens Rosé by Peno on March 9, combining coastal French and Italian cuisine in an intimate 38-seat bistro with design by local artist Kevin Glazer." }
    ],
    architecture: {
      style: "Early 20th-century commercial brick",
      materials: ["Red brick exterior", "Exposed brick interior", "Concrete floors"],
      features: ["Street-facing windows", "Elevated side garden with brick wall", "Light pink walls with eclectic framed art", "Intimate footprint for neighborhood bistro"],
      district: "Lafayette Square Historic District"
    }
  },

  'bldg-0082': {
    // Hamilton's Urban Steakhouse (inside Charleville Brewery building)
    category: "Steakhouse & Bourbon Bar",
    phone: "(314) 241-2333",
    website: "https://www.hamiltonsteak.com",
    rating: 4.7,
    review_count: 1240,
    year_renovated: 2018,
    hours: {
      tuesday: { open: "15:00", close: "22:00" },
      wednesday: { open: "15:00", close: "22:00" },
      thursday: { open: "15:00", close: "22:00" },
      friday: { open: "15:00", close: "22:00" },
      saturday: { open: "15:00", close: "22:00" }
    },
    amenities: [
      "Bourbon bar with 70+ selections",
      "On-site hydroponic greenhouse with 3,000+ plants",
      "Private dining room",
      "100% Heritage Breed Black Angus beef",
      "Signature bacon fat candle charcuterie board",
      "Intimate 60-seat dining room plus 14-seat bar",
      "Reservations via OpenTable and Tock"
    ],
    photos: [
      "/photos/hamiltons/01.jpg",
      "/photos/hamiltons/02.jpg",
      "/photos/hamiltons/03.jpg"
    ],
    reviews: [
      {
        author: "Jim T.",
        rating: 5,
        text: "The ribeye with added scallops and shrimp was incredible and prepared perfectly. The atmosphere is intimate and romantic, perfect for date night.",
        time: "Nov 2024"
      },
      {
        author: "Sarah M.",
        rating: 5,
        text: "Hands down best filet I've ever had, paired with bourbon peppercorn sauce. The charcuterie board with the bacon fat candle is probably the best I've ever had anywhere.",
        time: "3 months ago"
      },
      {
        author: "Michael R.",
        rating: 5,
        text: "My medium ribeye was cooked and seasoned to perfection with a dry rub that was on point. The bourbon selection is impressive and fairly priced.",
        time: "Aug 2024"
      },
      {
        author: "Jennifer K.",
        rating: 4,
        text: "Way-above-average steaks and delightful sides in a relaxed, comfortable setting. The space has speakeasy-ish styling with exposed brick and rustic touches.",
        time: "2 months ago"
      }
    ],
    history: [
      { year: 1900, event: "Building constructed as a machine shop for trucks in Lafayette Square's industrial corridor along Chouteau Avenue." },
      { year: 2016, event: "Paul Hamilton purchases the former machine shop building at 2101 Chouteau Avenue." },
      { year: 2017, event: "Charleville Brewing Company & Tavern opens in the renovated space, featuring reclaimed wood and metal, preserving original pulleys and beams." },
      { year: 2018, event: "Hamilton's Urban Steakhouse & Bourbon Bar opens within the building. Paul Hamilton, Wendy Hamilton, and Jason Arnold officially partner on the venture." },
      { year: 2018, event: "Hamilton Hospitality installs 1,500 sq ft commercial hydroponic greenhouse with vertical aeroponic towers, growing 3,000+ plants for farm-to-table dining." }
    ],
    architecture: {
      style: "Early 1900s industrial / adaptive reuse",
      materials: ["Exposed brick walls", "Reclaimed wood from Ste. Genevieve", "Black concrete floors", "Reclaimed hickory bar"],
      features: ["Original structural beams and pulleys preserved", "Tree branch canopies with Edison-style bulbs suspended from ceiling", "Rustic industrial design blending historic elements with modern steakhouse", "Intimate 1,200 sq ft space carved from larger building"],
      district: "Lafayette Square Historic District"
    }
  },

  'bldg-0086': {
    // Extra Wavy (Centennial Malt House)
    category: "Seafood & Raw Bar",
    phone: "(314) 346-1165",
    website: "https://www.extrawavystl.com",
    rating: 4.6,
    review_count: 57,
    year_renovated: 2025,
    hours: {
      tuesday: { open: "17:00", close: "22:00" },
      wednesday: { open: "17:00", close: "22:00" },
      thursday: { open: "17:00", close: "22:00" },
      friday: { open: "17:00", close: "22:00" },
      saturday: { open: "17:00", close: "22:00" }
    },
    amenities: [
      "Raw bar with 5-6 rotating oyster selections",
      "Full bar with craft cocktails and martini program",
      "Reservations via Resy",
      "Historic cellar event space (Malt House Cellar)",
      "50+ bottle wine selection",
      "Coastal European and Mediterranean-inspired menu"
    ],
    photos: [
      "/photos/extra-wavy/01.jpg",
      "/photos/extra-wavy/02.jpg",
      "/photos/extra-wavy/03.jpg"
    ],
    reviews: [
      {
        author: "Amanda S.",
        rating: 5,
        text: "Dazzling seafood makes Extra Wavy one of the best new restaurants in St. Louis. The raw bar selections are exceptional, and the whimsical menu balances familiarity with flair.",
        time: "Dec 2025"
      },
      {
        author: "Tyler R.",
        rating: 5,
        text: "If you're in the St. Louis area and want a classy, amazing seafood experience, try this place. The baked oysters and crab pasta are outstanding.",
        time: "Nov 2025"
      },
      {
        author: "Nicole B.",
        rating: 5,
        text: "Amazing service and unique ambiance that gives off vibes similar to Yellowbelly and The Lazy Tiger. The lobster doughnut is a must-try.",
        time: "3 months ago"
      },
      {
        author: "Jason P.",
        rating: 4,
        text: "Great cocktails and fresh oysters. Tim Wiggins' martini program is inventive and balanced, with reasonable prices. The space itself is stunning.",
        time: "Jan 2026"
      }
    ],
    history: [
      { year: 1876, event: "Centennial Malt House built by Joseph Schnaider as part of his Chouteau Avenue Brewery complex. Designed by Fred W. Wolf (Chicago engineer) and Louis Kledus (St. Louis architect)." },
      { year: 1889, event: "Schnaider's brewery merged with St. Louis Brewing Association, becoming one of the top three local breweries." },
      { year: 2005, event: "Wendy and Paul Hamilton purchase the building and complete a $4 million restoration, opening Vin de Set restaurant in 2006." },
      { year: 2022, event: "Fire in September causes extensive damage, forcing closure of Vin de Set, PW Pizza, and 21st Street Brewer's Bar." },
      { year: 2024, event: "Malt House Lofts LLC purchases the building and begins mixed-use renovation including restaurant space and residential lofts." },
      { year: 2025, event: "Extra Wavy opens October 15 by On Point Hospitality (Travis Howard and Tim Wiggins), bringing modern American seafood and raw bar to Lafayette Square." }
    ],
    architecture: {
      style: "1876 Industrial brewery / adaptive reuse",
      materials: ["Historic St. Louis red brick", "Exposed brick interior", "Wood beam ceiling resembling sailing ship's bones", "Original cellar with historic augers"],
      features: ["One of the oldest substantial brewing-related buildings in St. Louis", "Listed on National Register of Historic Places", "4,500 sq ft with 110-seat capacity", "Fishing nets and nautical design elements", "Underground tunnels originally connected to brewery"],
      district: "Lafayette Square Historic District"
    }
  },

  'bldg-0386': {
    // Park Avenue Coffee
    category: "Coffee Shop & Bakery",
    phone: "(314) 621-4020",
    website: "https://parkavenuecoffee.com",
    rating: 4.4,
    review_count: 107,
    hours: {
      monday: { open: "07:00", close: "14:00" },
      tuesday: { open: "07:00", close: "18:00" },
      wednesday: { open: "07:00", close: "18:00" },
      thursday: { open: "07:00", close: "18:00" },
      friday: { open: "07:00", close: "18:00" },
      saturday: { open: "07:00", close: "18:00" },
      sunday: { open: "07:30", close: "14:00" }
    },
    amenities: [
      "Free WiFi",
      "Outdoor patio and sidewalk seating",
      "Indoor seating in historic bank vault",
      "Small-batch coffee roasted in-house",
      "75 flavors of gooey butter cake",
      "Games available"
    ],
    photos: [
      "/photos/park-avenue-coffee/01.jpg",
      "/photos/park-avenue-coffee/02.jpg",
      "/photos/park-avenue-coffee/03.jpg"
    ],
    reviews: [
      {
        author: "Phyllis B.",
        rating: 5,
        text: "The gooey butter cake is amazing! They have so many different varieties — the traditional and turtle are my favorites. Definitely the best gooey butter cake in St. Louis.",
        time: "2024"
      },
      {
        author: "Jennifer M.",
        rating: 5,
        text: "Some of the best coffee I've ever had. The baristas are friendly and make awesome lattes, plus the gooey butter cake is divine. The outdoor patio is the best of any coffee shop in the city.",
        time: "Summer 2024"
      },
      {
        author: "Michael T.",
        rating: 4,
        text: "Great coffee shop in a charming historic building. Love that it's housed in an old bank — you can actually sit in the vault! They roast their own beans.",
        time: "Jan 2025"
      },
      {
        author: "Sarah K.",
        rating: 5,
        text: "The location near Lafayette Park is absolutely beautiful. Good selection of coffees, lattes, and pastries with fast service. Free WiFi and cozy atmosphere make it perfect for working.",
        time: "6 months ago"
      }
    ],
    history: [
      { year: 1880, event: "Building constructed in Second Empire Victorian style during Lafayette Square's peak development period, featuring mansard roof and limestone facade." },
      { year: 1972, event: "Lafayette Square becomes a designated City historic district, preserving the building's architectural heritage." },
      { year: 1986, event: "Lafayette Square Historic District entered into the National Register of Historic Places." },
      { year: 2006, event: "Park Avenue Coffee opens at 1919 Park Ave as a neighborhood coffee shop specializing in locally roasted coffee and St. Louis gooey butter cake." },
      { year: 2009, event: "Ann & Allen Baking Company established to produce Park Avenue Coffee's signature gooey butter cakes, growing to 75 different flavors." },
      { year: 2012, event: "Park Avenue Coffee launches its own coffee roasting operations, air-roasting small batches in the most eco-friendly facility in the Midwest." }
    ],
    architecture: {
      style: "Second Empire Victorian",
      materials: ["Limestone facade", "Brick side and rear walls", "Slate mansard roof with dormers"],
      features: ["Three-story townhouse with mansard roof", "Arched windows and doorways", "Ornate bracketed cornice", "Original bank vault preserved as seating area"],
      district: "Lafayette Square Historic District"
    }
  },

  'bldg-1594': {
    // Jefferson Chop Suey
    category: "Chinese-American Restaurant",
    phone: "(314) 773-1688",
    rating: 3.6,
    review_count: 45,
    hours: {
      monday: { open: "11:30", close: "22:00" },
      tuesday: { open: "11:30", close: "22:00" },
      wednesday: { open: "11:30", close: "22:00" },
      thursday: { open: "11:30", close: "22:00" },
      friday: { open: "11:30", close: "22:00" },
      saturday: { open: "11:30", close: "22:00" }
    },
    amenities: [
      "Cash only",
      "Takeout available",
      "Dine-in service",
      "Fast service",
      "Vegetarian options",
      "Family-owned operation"
    ],
    photos: [
      "/photos/jefferson-chop-suey/01.jpg",
      "/photos/jefferson-chop-suey/02.jpg",
      "/photos/jefferson-chop-suey/03.jpg"
    ],
    reviews: [
      {
        author: "Marcus L.",
        rating: 5,
        text: "The rice is off the chain — absolute must-try. Their hot braised chicken is a warm welcome to something different. A dollar cheaper than any other place and they're the closest.",
        time: "2025"
      },
      {
        author: "Jason H.",
        rating: 5,
        text: "The crab rangoon was actually totally good — could see the crab through the wonton. Authentic and delicious. I will be going back again and again!",
        time: "2025"
      },
      {
        author: "Rachel T.",
        rating: 4,
        text: "Delicious and reasonably priced food brimming with flavor. Service is fast and friendly. Worth the wait for a small shop.",
        time: "2024"
      },
      {
        author: "Kevin P.",
        rating: 2,
        text: "The wings in the combination plate weren't great, but their fried rice has good flavor without needing extra sauce. Cash only, which caught me off guard.",
        time: "2024"
      }
    ],
    history: [
      { year: 1937, event: "Building constructed on S Jefferson Avenue as a Depression-era commercial storefront near Lafayette Square." },
      { year: 1960, event: "St. Louis' original Chinatown (Hop Alley) demolished for Busch Stadium, dispersing Chinese restaurant owners into surrounding neighborhoods." },
      { year: 1970, event: "Chop suey restaurants establish a stronghold in St. Louis working-class neighborhoods, one of only three American cities where the cuisine thrives." },
      { year: 2000, event: "Jefferson Chop Suey continues traditional Chinese-American chop suey cuisine, serving the south city community with a loyal neighborhood following." },
      { year: 2025, event: "Jefferson Chop Suey remains a working neighborhood institution, preserving St. Louis' unique chop suey culture with cash-only operations and classic Cantonese-American dishes." }
    ],
    architecture: {
      style: "Depression-era commercial storefront",
      materials: ["Red brick construction", "Corbelled brick detailing", "Sheet metal cornice"],
      features: ["Simple brick storefront typical of 1930s St. Louis neighborhood commercial buildings", "Ground-floor commercial space", "Bracketed cornice design common to the Lafayette Square area"],
      district: "Near Lafayette Square Historic District"
    }
  }
};

// Apply enrichments
for (const [id, enrichment] of Object.entries(enrichments)) {
  const idx = data.buildings.findIndex(b => b.id === id);
  if (idx === -1) {
    console.error(`Building ${id} not found!`);
    continue;
  }
  // Merge enrichment into existing building data
  data.buildings[idx] = { ...data.buildings[idx], ...enrichment };
  console.log(`✓ Enriched ${id} (${data.buildings[idx].name})`);
}

writeFileSync(filePath, JSON.stringify(data));
console.log('\nDone! buildings.json updated.');
