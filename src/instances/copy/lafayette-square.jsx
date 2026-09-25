/**
 * LAFAYETTE SQUARE'S OWN COPY — its About text and its legal documents, moved here
 * VERBATIM from the shared app components (2026-09-24, `BRIEF-ls-bleed-excision` site 8,
 * `HANDOFF-blank-app-instance-decoupling` Phase 4).
 *
 * ⛔ WHY IT LIVES HERE: the components rendered this text for EVERY installation, so a
 * Hi-Pointe visitor read Lafayette Square's mission and, at /privacy and /terms, LS's
 * Missouri contracts. An installation now shows only the copy it declares in
 * `./index.js`; one with none shows a loud "not declared" notice, never another town's.
 * ⛔ Legal wording is Jacob's and counsel's (`cary/legal/README.md` is its canon). This
 * file is a STORAGE move: change the text in the canon first, then here.
 * Browser-only (JSX): Node-side code imports `../registry.js`, never this.
 */
import { INSTANCE } from '../../instance.js'

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

const RESTAURANT_SECTIONS = [
  {
    title: '1. Purpose',
    body: 'Lafayette Square Deliveries is a neighborhood-based delivery coordination service connecting restaurants, independent couriers, and customers within Lafayette Square, St. Louis. The Platform operates as a digital marketplace that facilitates order transmission and payment processing between participating restaurants, couriers, and customers. The Platform does not prepare food, sell goods, or perform deliveries. The Platform provides technology services only and does not control the manner or method of restaurant operations or courier transportation. Restaurants remain the merchant of record for all food and beverage sales.',
  },
  {
    title: '2. Restaurant Status',
    body: 'The Restaurant is solely responsible for food preparation, food safety, menu accuracy, pricing, packaging, compliance with health regulations, and alcohol licensing and compliance.',
  },
  {
    title: '3. Service Area',
    body: 'Delivery services are limited to the Lafayette Square neighborhood: Chouteau Avenue to Interstate 44, Jefferson Avenue to Truman Parkway, including adjacent buildings. Delivery availability depends on courier participation and restaurant operating hours.',
  },
  {
    title: '4. Ordering and Payment',
    body: 'Customers place orders through the Platform. At checkout, customers pay the food subtotal, applicable sales tax, a payment processing fee (if applicable), and a service charge as described in the current fee schedule. The Restaurant receives 100% of the food subtotal and applicable sales tax. The Platform does not deduct a commission from restaurant food sales.',
    subsections: [
      { title: '4.1 Minimum Order', body: 'The Platform requires a minimum order amount, currently $40 before tax and fees, to ensure fair compensation for participating couriers.' },
      { title: '4.2 Payment Processing and Limited Agency', body: 'The Platform acts as the Restaurant\u2019s limited payment agent solely for the purpose of collecting customer payments through the checkout system and distributing those funds to the Restaurant and courier as described in this Agreement. Customer payments collected through the Platform are considered payments made directly to the Restaurant for amounts owed to the Restaurant. Payment processing is performed by a third-party payment processor. Any disclosed payment processing fee is charged to the customer at checkout and is used solely to cover payment processing costs.' },
    ],
  },
  {
    title: '5. Service Charge Distribution',
    body: 'The service charge supports delivery operations. The service charge is separate from the Restaurant\u2019s food sale. Customer tips, if provided, belong entirely to the courier.',
    subsections: [
      { title: '5.1 Current Fee Schedule', body: 'As of the effective date, the service charge is 22% of the food subtotal. Of this, 75% is paid to the courier performing the delivery and 25% is retained by the Platform. The minimum order amount is $40 before tax and fees.' },
      { title: '5.2 Right to Modify Fees', body: 'The Platform reserves the right to modify the service charge percentage, the courier/platform split, the minimum order amount, or to introduce, adjust, or remove fees applicable to Restaurants, Couriers, or customers at any time. Changes to the fee schedule will be communicated to the Restaurant through the Platform before taking effect.' },
    ],
  },
  {
    title: '6. Restaurant Menu Control',
    body: 'Restaurants manage their own menus, prices, specials, and availability through their designated Guardian account. The Guardian is a trusted manager or representative authorized by the Restaurant to maintain the listing. Restaurants are responsible for the accuracy of all menu listings, prices, and descriptions provided through the Platform.',
  },
  {
    title: '7. Restaurant Availability',
    body: 'Restaurants control their own delivery availability. Orders are only available to customers when the Restaurant is accepting orders and couriers are available. Delivery timing may vary depending on courier availability, restaurant preparation time, and other operational conditions.',
  },
  {
    title: '8. Order Preparation',
    body: 'Restaurants agree to prepare orders promptly, package food appropriately for transport, and clearly label orders for pickup. Restaurants are responsible for providing orders to couriers in a condition suitable for transport.',
  },
  {
    title: '9. Alcohol Orders',
    body: 'If alcohol is offered, the Restaurant remains responsible for alcohol compliance. Couriers must verify ID at delivery and delivery must be refused if the recipient is underage or intoxicated. Alcohol returns must follow Restaurant policy.',
  },
  {
    title: '10. Refunds and Errors',
    body: 'Responsibility for order issues is generally allocated as follows. Restaurant responsible for: incorrect orders, missing items, food quality issues. Courier responsible for: delivery mishandling. The Platform may issue refunds at its discretion to preserve customer goodwill. Before deducting any refund amount from future Restaurant payouts, the Platform will provide notice to the Restaurant describing the basis for the deduction. The Restaurant may dispute the deduction within five (5) business days of notice.',
  },
  {
    title: '11. Privacy',
    body: 'Lafayette Square Deliveries is designed as a privacy-respecting neighborhood service. The Platform does not retain personal customer data beyond what is temporarily required to complete transactions. Customer payment data is processed by the payment processor.',
  },
  {
    title: '12. Marketing',
    body: 'Restaurants may promote their participation in Lafayette Square Deliveries. The Platform may feature participating restaurants within the system.',
  },
  {
    title: '13. Termination',
    body: 'Either party may discontinue participation in the Lafayette Square Deliveries system at any time. The Platform may modify platform features, operational policies, or service procedures from time to time. The Platform may suspend or remove participants if necessary to protect the integrity, safety, or lawful operation of the service.',
  },
  {
    title: '14. Liability',
    body: 'The Platform provides order coordination and technology services only. The Platform is not responsible for food preparation, food safety, restaurant compliance, menu accuracy, order accuracy, or courier transportation or vehicle operation. The Platform does not operate as a restaurant, delivery service, or employer of participating couriers.',
  },
  {
    title: '15. Indemnification',
    body: 'The Restaurant agrees to defend, indemnify, and hold harmless the Platform and its owners, officers, employees, and agents from and against any claims, damages, losses, liabilities, costs, or expenses (including reasonable attorneys\u2019 fees) arising out of or related to the preparation, packaging, sale, or service of food or beverages by the Restaurant, food safety or foodborne illness claims, alcohol sales or alcohol compliance, inaccurate menu descriptions or pricing, violations of health regulations or other applicable laws, or the Restaurant\u2019s breach of this Agreement. This indemnification obligation applies to claims brought by customers, couriers, regulators, or third parties. The indemnifying party agrees to reasonably cooperate in the defense of any such claim.',
  },
  {
    title: '16. Dispute Resolution',
    body: 'The parties agree to attempt to resolve disputes informally. If a dispute cannot be resolved informally, either party may bring a claim in a court of competent jurisdiction in the State of Missouri, including small claims court where applicable.',
  },
  {
    title: '17. Acceptance',
    body: 'This Agreement becomes effective when the Restaurant or its authorized Guardian accepts the Agreement through the Platform onboarding process or by written acceptance.',
  },
  {
    title: '18. Force Majeure',
    body: 'The Platform shall not be liable for delays, service interruptions, or failures caused by circumstances beyond its reasonable control, including but not limited to weather events, power outages, internet or technical failures, courier availability, restaurant closures, or payment processor interruptions.',
  },
  {
    title: '19. Governing Law',
    body: 'This Agreement is governed by the laws of the State of Missouri.',
  },
  {
    title: '20. Severability',
    body: 'If any provision of this Agreement is held invalid or unenforceable, the remaining provisions remain in full force and effect.',
  },
  {
    title: '21. Amendments',
    body: 'The Platform may modify this Agreement from time to time by providing notice through the Platform or by email. Unless otherwise required for safety or legal compliance, changes will become effective no earlier than thirty (30) days after notice.',
  },
]

const COURIER_SECTIONS = [
  {
    title: '1. Independent Contractor Status',
    body: 'Couriers are independent contractors. Nothing in this Agreement creates employment, partnership, agency, or joint venture. Couriers control when they work, whether they accept deliveries, and how they perform deliveries. The Platform provides technology services only and does not control the manner or method of courier transportation.',
    subsections: [
      { title: '1.1 Freedom to Work Elsewhere', body: 'Couriers are free to perform delivery services for any other business or platform.' },
      { title: '1.2 Marketplace Role', body: 'The Platform operates as a digital marketplace that allows restaurants to request delivery services and allows independent couriers to view and claim available delivery opportunities. The Platform does not assign deliveries to couriers, require couriers to accept any delivery, or control how a courier performs a delivery.' },
    ],
  },
  {
    title: '2. Courier Eligibility',
    body: 'Couriers must be at least 16 years old, complete identity verification, provide valid government identification, and complete onboarding requirements. Additional verification may be required for expanded services.',
  },
  {
    title: '3. Transportation',
    body: 'Couriers may use bicycle, walking, scooter, car, or other lawful transportation. Couriers are responsible for maintaining their transportation and must comply with all applicable laws and traffic regulations while performing deliveries.',
  },
  {
    title: '4. Insurance',
    body: 'Couriers operating motor vehicles must maintain any legally required insurance. Couriers assume all risks associated with transportation.',
  },
  {
    title: '5. Delivery Claiming',
    body: 'Restaurants submit delivery requests through the Platform. Couriers may independently choose to claim available delivery opportunities. When a courier claims a delivery, the courier agrees to make a good-faith effort to complete it or, if the delivery cannot be completed, to return the order to the restaurant.',
    subsections: [
      { title: '5.1 Pickup Confirmation', body: 'After claiming a delivery request, the Courier is expected to confirm pickup promptly. If pickup is not confirmed within a reasonable time, the Platform may return the delivery request to the queue for reassignment.' },
      { title: '5.2 Order Handling', body: 'Couriers agree to transport orders with reasonable care and to deliver orders in the condition received from the restaurant. Couriers must not open, tamper with, or alter any order.' },
    ],
  },
  {
    title: '6. Cancellation',
    body: 'A Courier may cancel a claimed delivery if the Courier cannot complete it. Repeated acceptance and cancellation of deliveries that materially disrupt service may result in warnings, temporary restrictions, or removal from the Platform.',
  },
  {
    title: '7. Compensation',
    body: 'A service charge is collected from the customer on each order. The Courier receives a percentage of the service charge as described in the current fee schedule. Any customer tips belong entirely to the Courier. Payments are typically distributed through automated nightly payouts through the Platform\u2019s payment system.',
    subsections: [
      { title: '7.1 Current Fee Schedule', body: 'As of the effective date, the service charge is 22% of the food subtotal. The Courier receives 75% of the service charge and the Platform retains 25%. The minimum order amount is $40 before tax and fees.' },
      { title: '7.2 Right to Modify Fees', body: 'The Platform reserves the right to modify the service charge percentage, the courier/platform split, the minimum order amount, or any other fee or rate at any time. Changes to the fee schedule will be communicated to Couriers through the Platform before taking effect.' },
    ],
  },
  {
    title: '8. Alcohol Deliveries',
    body: 'Couriers performing alcohol deliveries must verify government-issued identification and refuse delivery if the recipient is underage or intoxicated. If delivery is refused, the Courier must return the alcohol to the restaurant. Failure to comply may result in removal from the Platform.',
  },
  {
    title: '9. Conduct',
    body: 'Couriers must act respectfully toward customers, restaurants, and other couriers. The Platform may remove couriers for conduct that harms the service.',
  },
  {
    title: '10. Theft or Misconduct',
    body: 'Intentional interference with deliveries may result in immediate removal from the Platform. The Platform may investigate incidents before determining outcomes.',
  },
  {
    title: '11. Privacy',
    body: 'The Platform minimizes the collection of customer data. Couriers agree not to store, retain, disclose, or misuse customer information except as necessary to complete a delivery.',
  },
  {
    title: '12. Assumption of Risk',
    body: 'Couriers perform deliveries at their own risk and are responsible for their transportation choices and compliance with law. The Platform is not responsible for injuries, accidents, property damage, or other incidents arising from courier transportation activities, nor for food preparation, food safety, or restaurant order accuracy.',
  },
  {
    title: '13. Indemnification',
    body: 'The Courier agrees to defend, indemnify, and hold harmless the Platform and its owners, officers, employees, and agents from and against any claims, damages, losses, liabilities, costs, or expenses arising out of or related to the Courier\u2019s transportation activities, accidents or injuries during delivery, violations of law, failure to verify identification for alcohol deliveries, theft or mishandling of orders, or breach of this Agreement.',
  },
  {
    title: '14. Platform Authority',
    body: 'The Platform may suspend, restrict, or remove access to the service at its discretion to protect the safety, reliability, and integrity of the Lafayette Square Deliveries system.',
  },
  {
    title: '15. Service Availability',
    body: 'The Platform is not liable for delays or failures caused by circumstances beyond its control, including weather, technical outages, restaurant closures, or courier availability.',
  },
  {
    title: '16. Dispute Resolution',
    body: 'The parties agree to attempt to resolve disputes informally. If a dispute cannot be resolved informally, either party may bring a claim in a court of competent jurisdiction in the State of Missouri, including small claims court where applicable.',
  },
  {
    title: '17. Acceptance',
    body: 'This Agreement becomes effective when the Courier accepts the Agreement through the Platform onboarding process.',
  },
  {
    title: '18. Governing Law',
    body: 'This Agreement is governed by the laws of the State of Missouri.',
  },
  {
    title: '19. Severability',
    body: 'If any provision of this Agreement is held invalid or unenforceable, the remaining provisions remain in full force and effect.',
  },
  {
    title: '20. Amendments',
    body: 'The Platform may modify this Agreement from time to time by providing notice through the Platform or by email. Unless otherwise required for safety or legal compliance, changes will become effective no earlier than thirty (30) days after notice.',
  },
]

export const legal = {
  homeLabel: 'lafayette-square.com',
  publisherLines: ['Jacob Henderson LLC, DBA Lafayette Square Deliveries', 'Lafayette Square, St. Louis, Missouri'],
  privacySubtitle: 'How Lafayette Square handles your information',
  courierSubtitle: 'Between Jacob Henderson LLC, DBA Lafayette Square Deliveries (“Platform”) and the Courier',
  restaurantSubtitle: 'Between Jacob Henderson LLC, DBA Lafayette Square Deliveries (“Platform”) and the participating Restaurant',
  // The onboarding step's header line and its at-a-glance summary (the agreement's key terms).
  courierParties: 'Between Jacob Henderson LLC, DBA Lafayette Square Deliveries (“Platform”) and you (“Courier”).',
  CourierSummary: () => (
    <div className="rounded-lg bg-surface-container border border-outline-variant px-3 py-3 space-y-3 text-body-sm text-on-surface-variant">
      <div>
        <p className="text-on-surface font-medium mb-0.5">Independent contractor</p>
        <p>You are not an employee. You control when, whether, and how you deliver.</p>
      </div>
      <div>
        <p className="text-on-surface font-medium mb-0.5">Eligibility</p>
        <p>Must be 16+ with valid ID. 21+ required for alcohol deliveries.</p>
      </div>
      <div>
        <p className="text-on-surface font-medium mb-0.5">Compensation</p>
        <p>You earn the majority of the service charge on every order. Tips are 100% yours. Nightly payouts. Rates are detailed in the agreement.</p>
      </div>
      <div>
        <p className="text-on-surface font-medium mb-0.5">Conduct & safety</p>
        <p>Respect everyone. Follow traffic laws. Handle orders with care. Zero tolerance for theft, harassment, or impairment.</p>
      </div>
      <div>
        <p className="text-on-surface font-medium mb-0.5">Alcohol deliveries</p>
        <p>Verify government ID on every alcohol delivery. Refuse if underage or intoxicated. Return refused orders to the restaurant.</p>
      </div>
    </div>
  ),
  courierSections: COURIER_SECTIONS,
  restaurantSections: RESTAURANT_SECTIONS,
  // `ContactBit` is the page's (it owns the null-contact rule); passed in, not copied.
  PrivacyBody: ({ ContactBit }) => (
    <div className="space-y-6 text-[13px] leading-relaxed text-[#e0ddd8]/60">
      <section>
        <h2 className="text-[14px] font-medium text-[#e0ddd8]/90 mb-2">Data Philosophy</h2>
        <p>This site is intentionally designed to collect as little personal data as possible. The goal is to support neighborly communication without surveillance or data extraction. Participation should feel lightweight, safe, and respectful of everyone's privacy.</p>
      </section>

      <section>
        <h2 className="text-[14px] font-medium text-[#e0ddd8]/90 mb-2">Identity & Anonymity</h2>
        <p>Users of Lafayette-Square.com appear within the system as Townies, represented only by emoji-based identities. These identities are intentionally simple and are not connected to real names or personal information within the platform.</p>
        <p className="mt-2">Some Townies may choose to claim a Place within the neighborhood map, becoming the Guardian of that specific Place. Guardianship is local to that Place only. Outside of their own Place, a Guardian appears exactly the same as any other Townie.</p>
      </section>

      <section>
        <h2 className="text-[14px] font-medium text-[#e0ddd8]/90 mb-2">Protecting Your Privacy</h2>
        <p>Users are encouraged to keep their participation anonymous. For your own privacy and safety, please avoid including personally identifiable information such as full names, home addresses, phone numbers, email addresses, or other details that could link your account to your real-world identity.</p>
      </section>

      <section>
        <h2 className="text-[14px] font-medium text-[#e0ddd8]/90 mb-2">Real-World Interaction</h2>
        <p>Some posts on the Community Bulletin Board may involve exchanging items, meeting neighbors, or participating in activities. If you plan to meet someone in person, please use common-sense precautions and consider meeting in public locations such as Lafayette Park, neighborhood cafes, or other well-trafficked areas.</p>
        <p className="mt-2">This project does not verify identities and cannot guarantee the behavior of participants.</p>
      </section>

      <section>
        <h2 className="text-[14px] font-medium text-[#e0ddd8]/90 mb-2">Cary Delivery Service — Data Handling</h2>
        <p>Cary is Lafayette Square's neighborhood delivery service. When you use Cary, the following data practices apply:</p>
        <ul className="list-disc list-outside ml-5 mt-2 space-y-1.5">
          <li><strong className="text-[#e0ddd8]/80">Phone number:</strong> Collected during courier sign-up for identity verification and account notifications. Not shared with third parties.</li>
          <li><strong className="text-[#e0ddd8]/80">Identity verification:</strong> Performed by Stripe Identity. Your ID image is processed by Stripe and never stored on our servers. Cary receives only a pass/fail result and your verified age.</li>
          <li><strong className="text-[#e0ddd8]/80">Background checks:</strong> Performed by Checkr for Drive-tier couriers. Results are sent directly to Cary. Records are retained only as required for compliance.</li>
          <li><strong className="text-[#e0ddd8]/80">Location data:</strong> Collected only while a courier is actively on a delivery. Not tracked when offline.</li>
          <li><strong className="text-[#e0ddd8]/80">Payment data:</strong> All payment processing is handled by Stripe. Cary does not store credit card numbers.</li>
          <li><strong className="text-[#e0ddd8]/80">Customer delivery addresses:</strong> Used only to complete the delivery. Not retained after delivery completion.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-[14px] font-medium text-[#e0ddd8]/90 mb-2">SMS Communications</h2>
        <p>By providing your phone number through the Cary sign-up process, you consent to receive SMS messages from Lafayette Square Deliveries for the following purposes only:</p>
        <ul className="list-disc list-outside ml-5 mt-2 space-y-1">
          <li>One-time verification codes during sign-up</li>
          <li>Credential expiry reminders for active couriers</li>
          <li>Delivery status updates triggered by your activity</li>
        </ul>
        <p className="mt-2">No marketing or promotional messages are sent. Message frequency varies. Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for support.</p>
        <p className="mt-2">Contact: <ContactBit href={`mailto:${INSTANCE.cary.email}`} value={INSTANCE.cary.email} /> · <ContactBit href={`tel:${INSTANCE.cary.smsNumber}`} value={INSTANCE.cary.smsNumber} display={INSTANCE.cary.smsNumberDisplay} /></p>
      </section>

      <section>
        <h2 className="text-[14px] font-medium text-[#e0ddd8]/90 mb-2">Your Credentials Belong to You</h2>
        <p>Verification credentials obtained through the Cary onboarding process (identity verification, background checks) are independently issued by third-party providers. If you leave the platform, your verification history is yours.</p>
      </section>
    </div>
  ),
}
