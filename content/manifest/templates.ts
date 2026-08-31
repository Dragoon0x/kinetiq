import type { KinetiqItem } from "./types";

/**
 * Complete landing sites, serials KT-001+. Each is a single page composed
 * end to end from shipped sections, with a `target` so the CLI writes it
 * where a landing page belongs.
 *
 * A template contributes a running order and nothing else — no page-local
 * markup. If one needed custom markup, that would mean a missing section.
 */
export const templates: KinetiqItem[] = [
  {
    name: "template-instrument",
    type: "registry:page",
    title: "Instrument Template",
    description:
      "The full argument, top to bottom, for a product that has to be believed before it is bought: claim, proof of who runs it, what it does, how a day goes, the same morning before and after, the numbers, one customer at length, price, the four honest questions, and two doors out.",
    files: [
      {
        path: "registry/templates/template-instrument/template-instrument.tsx",
        type: "registry:page",
        target: "app/page.tsx",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: [
      "utils",
      "nav-split-desk",
      "hero-split-ledger",
      "logo-segment-shelf",
      "features-bento-field",
      "how-day-clock",
      "usecase-two-mornings",
      "stats-signal-band",
      "testimonial-case-column",
      "pricing-meridian-tiers",
      "faq-last-word",
      "cta-split-doors",
      "footer-terrace",
    ],
    categories: ["saas"],
    meta: { serial: "KT-001" },
    tagline: "Eleven sections, one argument.",
    keywords: ["template", "landing page", "saas", "marketing", "site"],
    usageNotes: [
      "Eleven shipped sections and no page-local markup — replace the narrative through each section's typed props, not the layout.",
      "The order is the argument: claim, proof, mechanism, evidence, price, objections, close. Reordering weakens it.",
      "Drop sections rather than adding markup. A page that needs new markup needs a new section.",
    ],
  },
  {
    name: "template-launch",
    type: "registry:page",
    title: "Launch Template",
    description:
      "One announcement, one ask, and as little else as the page can survive on. Deliberately short — for the weeks when there is not much to show, a long page mostly advertises how little there is, and the only conversion that matters is the address.",
    files: [
      {
        path: "registry/templates/template-launch/template-launch.tsx",
        type: "registry:page",
        target: "app/page.tsx",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: [
      "utils",
      "announce-launch-rail",
      "nav-dock-pill",
      "hero-launch-beacon",
      "features-proof-strip",
      "how-plain-steps",
      "proof-live-floor",
      "newsletter-pressroom",
      "cta-launch-window",
      "footer-quiet-close",
    ],
    categories: ["launch"],
    meta: { serial: "KT-002" },
    tagline: "Short on purpose.",
    keywords: ["template", "launch", "waitlist", "landing page", "site"],
    usageNotes: [
      "Resist lengthening it. Before there is much to show, page length advertises the gap.",
      "Two asks maximum — the newsletter and the close. A launch page with five conversion points has none.",
      "The live floor needs real events; seed it with the shape of what actually happens or cut it.",
    ],
  },
  {
    name: "template-agent",
    type: "registry:page",
    title: "Agent Template",
    description:
      "For products whose core act is a conversation: the hero is a live composer, how-it-works is a transcript the reader advances, and pricing is metered in work rather than seats. The incident log sits mid-page on purpose — anything acting on a customer's behalf has to answer for acting wrongly.",
    files: [
      {
        path: "registry/templates/template-agent/template-agent.tsx",
        type: "registry:page",
        target: "app/page.tsx",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: [
      "utils",
      "nav-glass-rail",
      "hero-agent-bench",
      "how-exchange-script",
      "features-persona-switch",
      "usecase-job-stories",
      "trust-incident-log",
      "pricing-credit-packs",
      "faq-counter-desk",
      "cta-book-slot",
      "footer-drift-mark",
    ],
    categories: ["agent"],
    meta: { serial: "KT-003" },
    tagline: "Demonstrated in its own medium.",
    keywords: ["template", "agent", "ai", "landing page", "site"],
    usageNotes: [
      "The hero composer is live — wire it to something real or the page opens on a promise it immediately breaks.",
      "Keep the incident log above pricing. Burying it is what makes buyers suspicious of the whole category.",
      "Credits price work; swap to seats only if the product genuinely meters that way.",
    ],
  },
  {
    name: "template-studio",
    type: "registry:page",
    title: "Studio Template",
    description:
      "Image-first, where the work has to carry the page: a bleeding wall, a contact sheet showing the frames nobody chose, and one written passage in between. On a page selling images, prose competing with the images is prose in the way.",
    files: [
      {
        path: "registry/templates/template-studio/template-studio.tsx",
        type: "registry:page",
        target: "app/page.tsx",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: [
      "utils",
      "nav-atlas-panel",
      "hero-gallery-wall",
      "gallery-contact-sheet",
      "content-margin-notes",
      "gallery-cover-shelf",
      "testimonial-two-dates",
      "contact-open-hours",
      "footer-quiet-close",
    ],
    categories: ["studio"],
    meta: { serial: "KT-004" },
    tagline: "The copy gets out of the way.",
    keywords: ["template", "studio", "portfolio", "gallery", "site"],
    usageNotes: [
      "Swap every wash for real artwork; the aspect boxes are already sized for it.",
      "One written passage, about the work rather than the studio. Two is one too many here.",
      "The contact sheet earns its place by showing rejected frames — filling it with selects makes it a second portfolio.",
    ],
  },
  {
    name: "template-ledger",
    type: "registry:page",
    title: "Ledger Template",
    description:
      "For instruments rather than apps: the product is shown working — a real sortable grid, a trend per row, standings that re-rank — before it is described. Buyers of data tools have been shown too many screenshots, and the fastest way past that is a page where the table on it actually sorts.",
    files: [
      {
        path: "registry/templates/template-ledger/template-ledger.tsx",
        type: "registry:page",
        target: "app/page.tsx",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: [
      "utils",
      "nav-split-desk",
      "hero-signal-ridge",
      "logo-receipt-wall",
      "datatable-ops-desk",
      "datatable-run-history",
      "stats-rank-race",
      "integrations-two-way",
      "trust-data-residency",
      "pricing-usage-dial",
      "cta-last-objection",
      "footer-terrace",
    ],
    categories: ["data"],
    meta: { serial: "KT-005" },
    tagline: "The table on the page actually sorts.",
    keywords: ["template", "data", "dashboard", "analytics", "site"],
    usageNotes: [
      "Feed the grids real-shaped data. A working table with obviously fake rows is worse than a screenshot.",
      "Two data tables is the ceiling — the ops desk operates, the run history reads a trend, and a third repeats one of them.",
      "Data residency belongs on this page specifically; it is the question this buyer asks third.",
    ],
  },
  {
    name: "template-field",
    type: "registry:page",
    title: "Field Template",
    description:
      "The honest play, assembled: the price in the first screen, where that money goes in the second, who the product is not for in the third, and the failures published before anyone asks. The argument is cumulative — a page that has already told you the price, the margins, and the outages arrives at the close having earned it.",
    files: [
      {
        path: "registry/templates/template-field/template-field.tsx",
        type: "registry:page",
        target: "app/page.tsx",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: [
      "utils",
      "nav-glass-rail",
      "hero-price-forward",
      "pricing-where-it-goes",
      "usecase-not-for-you",
      "features-quiet-grid",
      "content-principles-list",
      "trust-incident-log",
      "proof-unprompted",
      "cta-postscript",
      "footer-quiet-close",
    ],
    categories: ["transparency"],
    meta: { serial: "KT-006" },
    tagline: "Everything given away, and the close still lands.",
    keywords: ["template", "transparency", "pricing", "honest", "site"],
    usageNotes: [
      "Only use it if all of it is true. A transparency page with one evasion on it is worse than a conventional page.",
      "The order is load-bearing: price, margins, misfits, then failures. Softening any step breaks the cumulative effect.",
      "Keep the critical mention in proof-unprompted; a curated version of this page persuades nobody.",
    ],
  },
  {
    name: "template-signature",
    type: "registry:page",
    title: "Signature Template",
    description:
      "The personal site as a signature: one column, monochrome, over in two scrolls. The name takes the sheen, the bio takes one rolling word, and everything else is rows — work that leads with the outcome instead of the logo, writing as titles and dates, and a footer that is an email and three elsewheres. On a personal page the person is the product, and rows read as confidence where cards read as effort.",
    files: [
      {
        path: "registry/templates/template-signature/template-signature.tsx",
        type: "registry:page",
        target: "app/page.tsx",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "gradient-title",
      "hover-swap",
      "status-pip",
    ],
    categories: ["personal"],
    meta: { serial: "KT-007" },
    tagline: "One column, and the person is the product.",
    keywords: ["template", "personal", "portfolio", "writing", "minimal"],
    usageNotes: [
      "Work rows lead with the outcome line, revealed under the hand — the sentence is the portfolio, so write those four sentences hardest.",
      "Dates are pre-formatted strings; nothing on the page reads a clock.",
      "Resist adding a nav. Four headings on one column do not need wayfinding, and the restraint is the design.",
    ],
  },
  {
    name: "template-causeway",
    type: "registry:page",
    title: "Causeway Template",
    description:
      "A whole small site in one install: three routed pages — the product, the changelog, the price — that already know each other through a shared nav with real hrefs. The argument is spread across routes the way real sites spread it, and the changelog is written in the same voice as the features, because a record kept differently from the marketing is an admission.",
    files: [
      {
        path: "registry/templates/template-causeway/home.tsx",
        type: "registry:page",
        target: "app/page.tsx",
      },
      {
        path: "registry/templates/template-causeway/changelog.tsx",
        type: "registry:page",
        target: "app/changelog/page.tsx",
      },
      {
        path: "registry/templates/template-causeway/pricing.tsx",
        type: "registry:page",
        target: "app/pricing/page.tsx",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: [
      "utils",
      "nav-glass-rail",
      "hero-compare-wipe",
      "features-quiet-grid",
      "proof-live-floor",
      "cta-postscript",
      "announce-ship-note",
      "newsletter-ledger-note",
      "pricing-meridian-tiers",
      "faq-last-word",
      "footer-quiet-close",
    ],
    categories: ["multipage"],
    meta: { serial: "KT-008" },
    tagline: "Three routes, one install, already acquainted.",
    keywords: ["template", "multipage", "changelog", "pricing", "site"],
    usageNotes: [
      "The three files install to app/page.tsx, app/changelog/page.tsx, and app/pricing/page.tsx — a navigable site, not three orphans.",
      "Keep the nav links identical across the pages; the shared rail is what makes three routes read as one site.",
      "The docs demo flips routes with a switcher; the installed template navigates with real hrefs.",
    ],
  },
];
