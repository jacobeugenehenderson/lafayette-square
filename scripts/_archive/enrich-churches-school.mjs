import { readFileSync, writeFileSync } from 'fs';

const lmkPath = './src/data/landmarks.json';
const data = JSON.parse(readFileSync(lmkPath, 'utf8'));

function enrich(id, fields) {
  const lm = data.landmarks.find(l => l.id === id);
  if (!lm) { console.error(`${id} not found!`); return; }
  Object.assign(lm, fields);
  console.log(`✓ Enriched ${id} (${lm.name})`);
}

// Saint Joseph's Church (lmk-029) — formerly Lithuanian Catholic, now closed
enrich('lmk-029', {
  address: "2123 Park Avenue",
  description: "Former Church of the Unity (Unitarian, 1869) turned St. Joseph Lithuanian Catholic Church (1916–1970). A small stone Gothic Revival chapel at the corner of Park Avenue and MacKay Place, with stained glass windows and attached rectory. Closed since 1970 when the Lithuanian community moved out of the neighborhood.",
  photos: [
    "/photos/st-josephs/01.jpg",
    "/photos/st-josephs/02.jpg",
    "/photos/st-josephs/03.jpg"
  ],
  history: [
    { year: 1869, event: "Built as the Church of the Unity, a Unitarian chapel, for $8,000. Founded with assistance from Rev. William Greenleaf Eliot and the Church of the Messiah." },
    { year: 1884, event: "One-story addition constructed for $4,000, expanding the chapel's capacity." },
    { year: 1896, event: "The Great Cyclone of May 27 tears the roof off the church. Rebuilt in the following months." },
    { year: 1916, event: "Lithuanian Catholic community acquires the building, renaming it St. Joseph Lithuanian Catholic Church. Serves immigrants who had previously attended St. John Nepomuk." },
    { year: 1970, event: "Church closes as the Lithuanian community, now prosperous, moves out of Lafayette Square during the neighborhood's period of decline." }
  ]
});

// Lafayette Park United Methodist Church (lmk-030)
enrich('lmk-030', {
  address: "2300 Lafayette Avenue",
  phone: "(314) 771-9214",
  website: "https://www.lp-umc.org",
  description: "Active Reconciling United Methodist congregation in a stunning Romanesque Revival limestone church with Gothic tower inspired by Notre Dame. Features a theater-style octagonal sanctuary with four balconies, colorful stained glass, cherry pews, and a restored 1901 Kilgen pipe organ.",
  photos: [
    "/photos/lafayette-park-umc/01.jpg",
    "/photos/lafayette-park-umc/02.jpg",
    "/photos/lafayette-park-umc/03.jpg"
  ],
  amenities: [
    "Sunday worship at 9:30 AM",
    "Reconciling congregation (welcoming all since 1998)",
    "Lafayette Park Preschool",
    "Bridge Bread community program",
    "1901 Kilgen pipe organ (restored 1999)",
    "Fellowship Hall and bowling alley (1950s basement)"
  ],
  history: [
    { year: 1839, event: "Founded as Wesley Chapel Society, a small Methodist group meeting at the home of Elizabeth Carter." },
    { year: 1888, event: "Congregation relocates to 2300 Lafayette Avenue on Easter Sunday, marching from their previous Chouteau Avenue location. Adopts the name Lafayette Park Methodist Church." },
    { year: 1896, event: "The Great Cyclone of May 27 severely damages and unroofs the building. August Busch Sr., a member and choir singer, helps fund reconstruction." },
    { year: 1900, event: "New stone sanctuary fronting Lafayette Avenue completed, designed in Romanesque Revival style with a Gothic tower inspired by Notre Dame. Architect attributed to Theodore C. Link (designer of Union Station)." },
    { year: 1901, event: "Kilgen pipe organ installed — a 2-manual, 14-rank instrument that remains in use today after professional restoration in 1999." },
    { year: 1998, event: "Church joins the Reconciling Ministries Network, formally welcoming all people regardless of age, gender, race, or sexual orientation." }
  ]
});

// City Church (lmk-031) — in the former Immaculate Conception rectory
enrich('lmk-031', {
  address: "1916 Lafayette Avenue",
  website: "https://citychurchstl.org",
  description: "Evangelical Presbyterian congregation meeting in the former Immaculate Conception Catholic Church rectory. The original Gothic Revival church complex (1908) was designed by Barnett, Haynes & Barnett, one of St. Louis's most prominent architectural firms. City Church's mission: 'Seeing the Gospel bring renewal to St. Louis.'",
  photos: [
    "/photos/city-church/01.jpg",
    "/photos/city-church/02.jpg",
    "/photos/city-church/03.jpg"
  ],
  amenities: [
    "Sunday School at 9:00 AM (Sept–May)",
    "Corporate Worship at 10:15 AM",
    "Community Groups",
    "Family, Men's, and Women's Ministries"
  ],
  history: [
    { year: 1904, event: "Immaculate Conception Parish founded as St. Kevin in Lafayette Square." },
    { year: 1908, event: "Gothic Revival church designed by Barnett, Haynes & Barnett (architects of the Cathedral Basilica of St. Louis) completed at Lafayette Avenue." },
    { year: 1924, event: "Classical Revival rectory completed adjacent to the church, featuring 13 bedrooms across two upper floors." },
    { year: 2005, event: "Immaculate Conception Catholic Parish closes; parishioners transfer to St. Margaret of Scotland." },
    { year: 2010, event: "City Church, an evangelical Presbyterian congregation, establishes itself in the former rectory building, bringing new life to the historic complex." }
  ]
});

// Saint Mary's Assumption Catholic Church (lmk-035)
enrich('lmk-035', {
  address: "1126 Dolman Street",
  phone: "(314) 436-4544",
  website: "http://smastl.org",
  description: "English Gothic Revival church built in 1871 as St. John's Episcopal Church, later serving Lithuanian and Ukrainian Catholic communities. Since 1997, home to a Society of St. Pius X (SSPX) traditionalist Catholic chapel offering the Latin Mass. Features a truncated Gothic tower, engaged buttresses, and a restored pipe organ.",
  photos: [
    "/photos/st-marys-assumption/01.jpg",
    "/photos/st-marys-assumption/02.jpg",
    "/photos/st-marys-assumption/03.jpg"
  ],
  amenities: [
    "Sunday Low Mass at 7:30 AM",
    "Sunday High Mass at 10:00 AM",
    "Traditional Latin Mass (Tridentine Rite)",
    "Confessions 30 min before Mass",
    "Restored pipe organ"
  ],
  history: [
    { year: 1871, event: "Built as St. John's Episcopal Church. First service held Easter Sunday 1872 by Rev. J.P.T. Ingraham. Construction plagued by cost overruns from unexpected foundation problems." },
    { year: 1907, event: "Acquired by the Ruthenian Catholic community and renamed St. Mary's Assumption. First Liturgy celebrated on the Feast of the Assumption." },
    { year: 1984, event: "Purchased by the Metropolitan Community Church of Greater St. Louis, serving a congregation of approximately 130 members." },
    { year: 1997, event: "Building purchased and restored by the Society of St. Pius X (SSPX), who install a new pipe organ and establish a traditionalist Catholic chapel offering the Latin Mass." }
  ]
});

// Lafayette Preparatory Academy (lmk-036)
enrich('lmk-036', {
  address: "1900 Lafayette Avenue",
  phone: "(314) 880-4458",
  website: "https://lafayetteprep.org",
  description: "Top-ranked public charter school (PK–8) in a renovated 1868 Baptist church complex. Ranked #1 among St. Louis City schools in reading, science, and math. Sponsored by UMSL, serving 400+ students with a 7:1 student-teacher ratio.",
  photos: [
    "/photos/lafayette-prep/01.jpg",
    "/photos/lafayette-prep/02.jpg",
    "/photos/lafayette-prep/03.jpg"
  ],
  amenities: [
    "PK–8 public charter school (tuition-free)",
    "400+ students, 7:1 student-teacher ratio",
    "#1 in St. Louis City for reading, science, and math",
    "Full-sized gymnasium",
    "Athletics: basketball, cheerleading, cross country, soccer, volleyball",
    "Art, music, and technology programs",
    "Responsive Classroom social-emotional learning"
  ],
  history: [
    { year: 1868, event: "Lafayette Baptist Church (originally Park Avenue Baptist Church) founded. The congregation eventually builds a church complex at the corner of Lafayette and Mississippi avenues." },
    { year: 1896, event: "Great Cyclone causes $8,000 in damage and partially collapses the school building. Both structures rebuilt the same year." },
    { year: 1933, event: "Peak membership of 1,300 with 1,400 Sunday School students. Additional classroom buildings constructed in the 1940s and 1960s." },
    { year: 2012, event: "Group of parents and community members secure a charter from UMSL to create Lafayette Preparatory Academy, supporting Lafayette Square's neighborhood revitalization." },
    { year: 2016, event: "School moves to its 'forever home' at 1900 Lafayette Avenue after a $2.1M renovation of the former Baptist church complex, converting Sunday School buildings into modern classrooms." },
    { year: 2020, event: "Middle school and gymnasium expansion completed. First 8th grade class graduates in May." },
    { year: 2024, event: "Ranked #1 among all St. Louis City schools in reading, science, and math on state MAP tests. Charter renewed for a 10-year term." }
  ]
});

writeFileSync(lmkPath, JSON.stringify(data));
console.log('\nDone! landmarks.json updated.');
