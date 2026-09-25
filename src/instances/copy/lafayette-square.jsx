/**
 * LAFAYETTE SQUARE'S OWN ABOUT TEXT — the About, Guidelines and Privacy sections of the
 * info panel, moved here VERBATIM from InfoModal (2026-09-24, `BRIEF-ls-bleed-excision`
 * site 8). ⛔ LS's alone: another installation with no About text shows "not declared",
 * never this. Its LEGAL documents are not here — they are a jurisdiction document,
 * `./legal/cary-missouri.jsx`, which an installation declares in its instance module.
 * Browser-only (JSX): Node-side code imports `../registry.js`, never this.
 */
export const about = (
              <div className="space-y-3 text-body-sm text-on-surface-variant leading-relaxed">
  <p>Lafayette-Square.com is an independent project created by a neighbor for neighbors.</p>
  <p>It is not affiliated with any company, advertiser, or government entity, and it is not funded by grants or sponsorships. The information used to build this project comes from public records, historical materials, and other openly available sources rather than corporate data services. The goal is simple: to celebrate and document one of the most extraordinary neighborhoods in America while building tools that help our community stay connected and resilient.</p>
  <p>The site includes several systems designed for everyday neighborhood life:</p>
  <ul className="list-disc list-outside ml-5 space-y-1">
    <li><strong className="text-on-surface-medium">The Almanac</strong> — live connections to weather and astronomical services, providing daily environmental context for the Square.</li>
    <li><strong className="text-on-surface-medium">The Community Bulletin Board</strong> — a place to share announcements, ideas, offers, and requests with neighbors.</li>
    <li><strong className="text-on-surface-medium">The Property Atlas</strong> — listings for all ~1,000 buildings in Lafayette Square, forming the foundation of a shared historical and architectural record.</li>
  </ul>
  <p>The map also includes a carefully modeled version of Lafayette Park itself, with trees placed in their real-world locations and tagged with their actual species. One of the major goals of the project is to continue developing the park portion of the map as a living record of the extraordinary volunteer work that maintains it — including the efforts of neighbors and the Lafayette Square Conservancy.</p>
  <p>As the system grows, park spaces will function just like other places in the neighborhood, allowing community activities and events to be listed directly within the park itself.</p>
  <p>Over time, the hope is that neighbors will contribute stories, photos, and knowledge so that the site becomes a living digital twin of Lafayette Square — a collective record of the place we share.</p>
  <p>Eventually, the goal is not just a website but a tool that helps move activity from the internet back into real neighborhood life.</p>
  <p>Everything here is free to use. Anyone in Lafayette Square — residents, businesses, caretakers, and friends of the neighborhood — is welcome to post announcements, highlight local projects, promote events, or share useful information.</p>
  <p>With a neighborhood of roughly 2,000 residents, even a simple message can reach the people who matter most: your neighbors.</p>
  <p className="text-on-surface-subtle italic">Cities are ultimately made of people, memory, and shared space. This project is an attempt to honor all three in Lafayette Square.</p>
              </div>
)

export const guidelines = (
              <div className="space-y-3 text-body-sm text-on-surface-variant leading-relaxed">
  <p>This project is operated by a single individual and provided free of charge to the community.</p>
  <p>Because of that, moderation is intentionally simple.</p>
  <p>The goal is to maintain a neighborly, respectful space that reflects the spirit of Lafayette Square.</p>
  <p>Posts may be removed if they include:</p>
  <ul className="list-disc list-outside ml-5 space-y-1">
    <li>harassment or abusive behavior</li>
    <li>personal attacks</li>
    <li>discrimination or hate speech</li>
    <li>scams or deceptive activity</li>
    <li>spam or excessive promotion</li>
    <li>anything that undermines the safety or trust of the community</li>
  </ul>
  <p>Moderation decisions are made at the sole discretion of the site operator.</p>
  <p>If a post is removed repeatedly, posting privileges may be revoked.</p>
  <p className="text-on-surface-medium font-medium">A general guideline:</p>
  <p className="italic text-on-surface-subtle">If you wouldn't say it to someone on the sidewalk in Lafayette Square, don't post it here.</p>
  <p>If you encounter a post that violates these guidelines, you may flag it by contacting me directly.</p>
              </div>
)

export const privacy = (
              <div className="space-y-3 text-body-sm text-on-surface-variant leading-relaxed">
  <p>This project is designed with privacy in mind.</p>
  <p>Users of Lafayette-Square.com appear within the system as Townies, represented only by emoji-based identities. These identities are intentionally simple and are not connected to real names or personal information within the platform.</p>
  <p>Some Townies may choose to claim a Place within the neighborhood map. When this happens, they become the Guardian of that specific Place.</p>
  <p>Guardianship is local to that Place only. Outside of their own Place, a Guardian appears exactly the same as any other Townie. Other users cannot see who is or is not a Guardian elsewhere in the neighborhood.</p>
  <p>This structure allows neighbors to help care for the information associated with particular locations without creating visible hierarchies or permanent personal profiles.</p>

  <h3 className="text-body-sm font-semibold text-on-surface-medium tracking-wide uppercase mt-5">Protecting Your Privacy</h3>
  <p>Users are encouraged to keep their participation anonymous within the app, even if they are the real-world resident, owner, or steward of a Place.</p>
  <p>For your own privacy and safety, please avoid including personally identifiable information such as:</p>
  <ul className="list-disc list-outside ml-5 space-y-1">
    <li>full names</li>
    <li>home addresses</li>
    <li>phone numbers</li>
    <li>email addresses</li>
    <li>other details that could link your account to your real-world identity</li>
  </ul>
  <p>The goal is to allow neighbors to interact and share information without creating permanent digital identities tied to real people.</p>

  <h3 className="text-body-sm font-semibold text-on-surface-medium tracking-wide uppercase mt-5">Real-World Interaction</h3>
  <p>Some posts on the Community Bulletin Board may involve exchanging items, meeting neighbors, or participating in activities.</p>
  <p>If you plan to meet someone in person, please use common-sense precautions. Consider meeting in public or neutral locations, such as:</p>
  <ul className="list-disc list-outside ml-5 space-y-1">
    <li>Lafayette Park</li>
    <li>neighborhood cafes or businesses</li>
    <li>other well-trafficked areas</li>
  </ul>
  <p>This project does not verify identities and cannot guarantee the behavior of participants.</p>
  <p>As with any online platform, please exercise reasonable judgment when interacting with others.</p>

  <h3 className="text-body-sm font-semibold text-on-surface-medium tracking-wide uppercase mt-5">Data Philosophy</h3>
  <p>This site is intentionally designed to collect as little personal data as possible.</p>
  <p>The goal is to support neighborly communication without surveillance or data extraction.</p>
  <p>Participation should feel lightweight, safe, and respectful of everyone's privacy.</p>
              </div>
)
