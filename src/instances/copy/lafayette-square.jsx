/**
 * LAFAYETTE SQUARE'S OWN ABOUT TEXT — the About, Guidelines and Privacy sections of the
 * info panel, moved here VERBATIM from InfoModal (2026-09-24, `BRIEF-ls-bleed-excision`
 * site 8). The About is Jacob's "About The Ward" (2026-09-25), verbatim; its title is the
 * panel's "About" heading. ⛔ LS's alone: another installation with no About text shows "not declared",
 * never this. Its LEGAL documents are not here — they are a jurisdiction document,
 * `./legal/cary-missouri.jsx`, which an installation declares in its instance module.
 * Browser-only (JSX): Node-side code imports `../registry.js`, never this.
 */
export const about = (
              <div className="space-y-3 text-body-sm text-on-surface-variant leading-relaxed">
  <p>The Ward is a place for a community to have a presence of its own online.</p>
  <p>It brings together the places, people, businesses, institutions, events and everyday activity that already make a neighborhood what it is — without trying to turn that community into another social network.</p>
  <p>The Ward is community first, privacy forward, and people powered.</p>
  <p>It begins with the place itself. Streets, buildings, landmarks and other familiar parts of the neighborhood give every Ward a foundation from the start. From there, the people who know the place make it richer.</p>
  <p>Residents, businesses, institutions, artists and organizations can add to the record, take care of places, share what is happening and make themselves useful to the community. There are profiles here, but they are built for utility rather than vanity: a way to say who or what you are, where you belong, and what you can offer or take care of.</p>
  <p>Every Ward is shaped locally, by the people who actually know the place.</p>
  <p>The Ward is built to strengthen the network that is already here.</p>
  <p>A community powers its Ward, and its Ward should give something useful back.</p>
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
