import type { KinetiqItem } from "./types";

/** KB-101…KB-108 — composed instruments. */
export const blocks: KinetiqItem[] = [
  {
    name: "command-deck",
    type: "registry:block",
    title: "Command Deck",
    description:
      "A command palette that arms before it fires — a deliberate fill sweeps the selected row before execution, so destructive commands never feel accidental.",
    files: [
      {
        path: "registry/blocks/command-deck/command-deck.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["application"],
    meta: { serial: "KB-101" },
    tagline: "A palette that arms before it fires.",
    keywords: ["command palette", "cmdk", "search", "shortcuts", "launcher"],
    props: [
      {
        name: "commands",
        type: "DeckCommand[]",
        description:
          "{ id, label, hint?, icon?, section?, keywords?, destructive?, run } per command.",
      },
      {
        name: "open / defaultOpen / onOpenChange",
        type: "boolean / boolean / (open) => void",
        description: "Controlled or uncontrolled visibility.",
      },
      {
        name: "hotkey",
        type: "boolean",
        defaultValue: "true",
        description: "Global ⌘K / Ctrl+K toggle listener.",
      },
      {
        name: "inline / portal",
        type: "boolean",
        defaultValue: "false / true",
        description:
          "Inline renders just the panel (docs/demos); portal overlays into body with focus trap and scroll lock.",
      },
      {
        name: "recentKey",
        type: "string",
        defaultValue: '"kinetiq-deck-recents"',
        description: "localStorage key for the five most recent command ids.",
      },
    ],
    usageNotes: [
      "Full combobox semantics with focus trap and restore; Escape mid-arm cancels the sweep.",
      "Under reduced motion the arming sweep becomes an instant fill with a deliberate 120ms pause.",
    ],
  },
  {
    name: "access-panel",
    type: "registry:block",
    title: "Access Panel",
    description:
      "Sign-in that unlocks like a vault — steps ride a gantry rail, OTP digits drop into their cells, and the right code throws a breaker bolt open.",
    files: [
      {
        path: "registry/blocks/access-panel/access-panel.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "trace-input",
      "pressure-button",
      "code-cells",
    ],
    categories: ["authentication"],
    meta: { serial: "KB-102" },
    tagline: "Sign-in that unlocks like a vault.",
    keywords: ["auth", "otp", "login", "verification", "code"],
    props: [
      {
        name: "expectedCode",
        type: "string",
        defaultValue: '"246810"',
        description: "The six-digit code that throws the bolt.",
      },
      {
        name: "onVerify",
        type: "(code: string) => void",
        description: "Fires with the entered code on every attempt.",
      },
      {
        name: "onComplete",
        type: "(email: string) => void",
        description: "Fires once when the correct code lands.",
      },
      {
        name: "email",
        type: "string",
        description: "Prefills the email field.",
      },
    ],
    usageNotes: [
      'One hidden input with autocomplete="one-time-code" drives the six visual cells — the accessibility-correct OTP pattern.',
      "Under reduced motion the rail slides become fades and the rejection nudge is skipped; the alert still announces.",
    ],
  },
  {
    name: "iris-menu",
    type: "registry:block",
    title: "Iris Menu",
    description:
      "Actions bloom from where you pressed — items launch from the trigger's center to seats along the freest quadrant's arc, and fold back in on close.",
    files: [
      {
        path: "registry/blocks/iris-menu/iris-menu.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["menus"],
    meta: { serial: "KB-109" },
    tagline: "Actions bloom from where you pressed.",
    keywords: ["radial menu", "fab", "actions", "bloom", "quick actions"],
    props: [
      {
        name: "items",
        type: "IrisMenuItem[]",
        description:
          "Up to six: { id, icon, label, onSelect, disabled?, destructive? }.",
      },
      {
        name: "placement",
        type: '"auto" | quadrant',
        defaultValue: '"auto"',
        description:
          "Auto measures the viewport and blooms into the roomiest quadrant.",
      },
      {
        name: "radius",
        type: "number",
        defaultValue: "84",
        description: "Distance from trigger center to each seat.",
      },
    ],
    usageNotes: [
      "Arrow keys rotate focus around the ring; Escape closes and restores the trigger.",
      "Under reduced motion items fade in already seated — no travel.",
    ],
  },
  {
    name: "overflow-rail",
    type: "registry:block",
    title: "Overflow Rail",
    description:
      "More actions, sprung from the dots — the pill rail morphs open inline while primaries yield with a recoil part and secondaries cascade in.",
    files: [
      {
        path: "registry/blocks/overflow-rail/overflow-rail.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["menus"],
    meta: { serial: "KB-110" },
    tagline: "More actions, sprung from the dots.",
    keywords: ["toolbar", "actions", "overflow", "expandable", "rail"],
    props: [
      {
        name: "primary / secondary",
        type: "RailAction[]",
        description:
          "Always-visible actions and the set revealed by the ⋯ trigger.",
      },
      {
        name: "open / defaultOpen / onOpenChange",
        type: "boolean / boolean / (open) => void",
        description: "Controlled or uncontrolled expansion.",
      },
      {
        name: "label",
        type: "string",
        defaultValue: '"Actions"',
        description: "Accessible toolbar name.",
      },
    ],
    usageNotes: [
      "One toolbar: arrows rove across every visible action; Escape collapses and refocuses the trigger.",
      "Under reduced motion the width jumps and secondaries fade in place.",
    ],
  },
  {
    name: "signal-center",
    type: "registry:block",
    title: "Signal Center",
    description:
      "An inbox that files itself — signals arrive on the conveyor, swipe away with real velocity, and clear-all sweeps the floor in a cascade.",
    files: [
      {
        path: "registry/blocks/signal-center/signal-center.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "readout"],
    categories: ["application"],
    meta: { serial: "KB-103" },
    tagline: "An inbox that files itself.",
    keywords: ["notifications", "inbox", "feed", "swipe", "archive"],
    props: [
      {
        name: "signals / defaultSignals / onSignalsChange",
        type: "Signal[] / Signal[] / (signals) => void",
        description:
          "Controlled or uncontrolled feed; Signal = { id, source, title, detail?, time, read? }.",
      },
      {
        name: "onArchive",
        type: "(signal: Signal) => void",
        description: "Fires per archived signal, including clear-all.",
      },
      {
        name: "title",
        type: "string",
        defaultValue: '"Signals"',
        description: "Header title next to the live unread readout.",
      },
    ],
    usageNotes: [
      "Archiving is keyboard-reachable via a per-row button; swiping is the fast path, not the only path.",
      "Under reduced motion arrivals and exits become fades and clear-all loses its stagger.",
    ],
  },
  {
    name: "media-console",
    type: "registry:block",
    title: "Media Console",
    description:
      "A media island that unfolds into a console — the pill morphs open into transport, a caliper timeline, and a scope-scrubbed volume.",
    files: [
      {
        path: "registry/blocks/media-console/media-console.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "caliper-slider",
      "scope-scrubber",
    ],
    categories: ["application"],
    meta: { serial: "KB-104" },
    tagline: "A media island that unfolds into a console.",
    keywords: ["media", "player", "island", "audio", "waveform"],
    props: [
      {
        name: "tracks",
        type: "Track[]",
        description:
          "{ id, title, artist, duration } — playback is simulated; the JSDoc shows wiring a real audio element.",
      },
      {
        name: "defaultExpanded",
        type: "boolean",
        defaultValue: "false",
        description: "Start as the pill or the full console.",
      },
    ],
    usageNotes: [
      "Complete keyboard transport; Escape collapses the console back to the pill.",
      "Under reduced motion the morph becomes a crossfade and the waveform holds still.",
    ],
  },
  {
    name: "checkout-receipt",
    type: "registry:block",
    title: "Checkout Receipt",
    description:
      "Payment that prints its proof — hold to pay, then a receipt feeds out of the slot line by line, tears off, and takes a PAID stamp.",
    files: [
      {
        path: "registry/blocks/checkout-receipt/checkout-receipt.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "pressure-button",
      "readout",
    ],
    categories: ["commerce"],
    meta: { serial: "KB-105" },
    tagline: "Payment that prints its proof.",
    keywords: ["checkout", "payment", "receipt", "commerce", "confirmation"],
    props: [
      {
        name: "items",
        type: "ReceiptItem[]",
        description: "Line items ({ name, price }) summed into the total.",
      },
      {
        name: "currency",
        type: "string",
        defaultValue: '"$"',
        description: "Price prefix.",
      },
      {
        name: "onPay",
        type: "() => void",
        description: "Fires when the hold completes.",
      },
    ],
    usageNotes: [
      "The receipt is real text in a definition list; only the barcode is decorative.",
      "Under reduced motion the receipt appears whole and the stamp fades in.",
    ],
  },
  {
    name: "intake-tray",
    type: "registry:block",
    title: "Intake Tray",
    description:
      "Files land, physically — dropped files fall into the tray with a squash, shingle into a stack, fill their gauge rings, and slide to the processed rail.",
    files: [
      {
        path: "registry/blocks/intake-tray/intake-tray.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["forms"],
    meta: { serial: "KB-106" },
    tagline: "Files land, physically.",
    keywords: ["upload", "file", "dropzone", "progress", "drag and drop"],
    props: [
      {
        name: "onFiles",
        type: "(files: File[]) => void",
        description: "Receives each accepted batch.",
      },
      {
        name: "accept / maxFiles",
        type: "string / number",
        defaultValue: "— / 6",
        description: "Accepted types hint and tray capacity.",
      },
      {
        name: "simulate",
        type: "boolean",
        defaultValue: "true",
        description:
          "Hash-driven demo progress; the JSDoc documents wiring real uploads.",
      },
      {
        name: "ref",
        type: "Ref<IntakeTrayHandle>",
        description: "Imperative addFiles() for programmatic intake.",
      },
    ],
    usageNotes: [
      "The drop zone is a real button with a labeled native file input — fully keyboard operable.",
      "Under reduced motion chips stack neatly with fades; the gauge rings still fill.",
    ],
  },
  {
    name: "readout-grid",
    type: "registry:block",
    title: "Readout Grid",
    description:
      "Dashboard stats as instrument cards — a carry-rolling counter, a self-drawing sparkline, a split-flap delta, and a needle gauge, mounted with one cascade.",
    files: [
      {
        path: "registry/blocks/readout-grid/readout-grid.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "readout",
      "flapboard",
    ],
    categories: ["data"],
    meta: { serial: "KB-107" },
    tagline: "Dashboard stats as instrument cards.",
    keywords: ["dashboard", "stats", "metrics", "sparkline", "gauge"],
    props: [
      {
        name: "metrics",
        type: "ReadoutGridMetrics",
        description:
          "Optional full override of the four cards: counter, sparkline, flap, and gauge shapes.",
      },
    ],
    usageNotes: [
      "Each card is an article whose label reads naturally to screen readers; chart visuals carry sr-only values.",
      "Under reduced motion cards render in place, the sparkline arrives fully drawn, and the needle jumps.",
    ],
  },
  {
    name: "beacon",
    type: "registry:block",
    title: "Beacon",
    description:
      "One capsule, every live activity — the shell morphs between timer, upload, call, and now-playing views with blur crossfades, corners pinned.",
    files: [
      { path: "registry/blocks/beacon/beacon.tsx", type: "registry:block" },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "readout"],
    categories: ["application"],
    meta: { serial: "KB-111" },
    tagline: "One capsule, every live activity.",
    keywords: ["island", "capsule", "live activity", "status", "pill"],
    props: [
      {
        name: "activity",
        type: "BeaconActivity | null",
        description:
          "Discriminated union: timer (endsAt), upload (progress), call (accept/decline), playing (title/artist); null collapses to a standby pill.",
      },
      {
        name: "expanded / defaultExpanded / onExpandedChange",
        type: "boolean / boolean / (expanded) => void",
        description: "Controlled or uncontrolled detail row.",
      },
      {
        name: "onDismiss",
        type: "() => void",
        description: "Renders a dismiss action in the detail row.",
      },
    ],
    usageNotes: [
      "Call buttons are reachable while collapsed; activity changes announce once, debounced.",
      "Under reduced motion the shell resizes instantly and the loops hold still.",
    ],
  },
  {
    name: "field-report",
    type: "registry:block",
    title: "Field Report",
    description:
      "Feedback that files itself — a notch rating with a gliding indicator, a growing note field, and a submit that folds the form into a slot under a LOGGED stamp.",
    files: [
      {
        path: "registry/blocks/field-report/field-report.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "pressure-button",
    ],
    categories: ["feedback"],
    meta: { serial: "KB-112" },
    tagline: "Feedback that files itself.",
    keywords: ["feedback", "rating", "survey", "widget", "form"],
    props: [
      {
        name: "onSubmit",
        type: "({ rating, note }) => void",
        description: "Fires on valid submit; rating is 1–5.",
      },
      {
        name: "prompt / endLabels",
        type: "string / [string, string]",
        defaultValue: '"How did it feel?" / ["Rough","Dialed"]',
        description: "The question and the rail's end labels.",
      },
      {
        name: "resetAfterMs",
        type: "number",
        description: "Fades a fresh form back in after filing.",
      },
    ],
    usageNotes: [
      "The rating is a real radiogroup — arrows move the indicator, and empty submits nudge with a role=alert line.",
      "Under reduced motion the filing collapse becomes a fade and the stamp lands statically.",
    ],
  },
  {
    name: "not-found",
    type: "registry:block",
    title: "Not Found",
    description:
      "Sweep complete, sector empty — a radar arc scans a quiet grid while the 404 numeral deciphers itself, with home and command-deck exits.",
    files: [
      {
        path: "registry/blocks/not-found/not-found.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "cipher-text",
      "pressure-button",
    ],
    categories: ["pages"],
    meta: { serial: "KB-113" },
    tagline: "Sweep complete. Sector empty.",
    keywords: ["404", "not found", "error page", "radar", "empty state"],
    props: [
      {
        name: "homeHref",
        type: "string",
        defaultValue: '"/"',
        description: "Return-to-base link target.",
      },
      {
        name: "onCommandDeck",
        type: "() => void",
        description: "Renders the ghost command-deck action when provided.",
      },
      {
        name: "code / message",
        type: "string",
        defaultValue: '"404" / sector message',
        description: "The cipher numeral and the rising subline.",
      },
    ],
    usageNotes: [
      "The heading carries real text for screen readers; the cipher layer and radar are decorative.",
      "Under reduced motion the sweep freezes mid-arc and the numeral renders plainly.",
    ],
  },
  {
    name: "forecast-card",
    type: "registry:block",
    title: "Forecast Card",
    description:
      "Every vote moves every bar — one commit renormalizes the whole field while percentages carry-roll and the leader tick migrates to the new front-runner.",
    files: [
      {
        path: "registry/blocks/forecast-card/forecast-card.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "readout"],
    categories: ["data"],
    meta: { serial: "KB-114" },
    tagline: "Every vote moves every bar.",
    keywords: ["poll", "forecast", "probability", "voting", "survey"],
    props: [
      {
        name: "question / options",
        type: "string / ForecastOption[]",
        description:
          "2–4 outcomes as { id, label, votes }; options are always the source of counts.",
      },
      {
        name: "votedId / defaultVotedId / onVote",
        type: "string | null / string / (id) => void",
        description: "Controlled or uncontrolled viewer vote.",
      },
      {
        name: "allowRevote",
        type: "boolean",
        defaultValue: "false",
        description: "Let the viewer move their vote between outcomes.",
      },
      {
        name: "closesAt",
        type: "string | Date",
        description: "Compact mono CLOSES footer line.",
      },
    ],
    usageNotes: [
      "Rows are aria-pressed buttons; each vote announces the new percentage and leadership once.",
      "Under reduced motion widths jump and the leader tick teleports; the readouts pulse instead of rolling.",
    ],
  },
  {
    name: "balance-card",
    type: "registry:block",
    title: "Balance Card",
    description:
      "A balance with a private side — the numeral carry-rolls behind a privacy blur, a sparkline draws itself, and the card flips to its activity face.",
    files: [
      {
        path: "registry/blocks/balance-card/balance-card.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "readout"],
    categories: ["finance"],
    meta: { serial: "KB-115" },
    tagline: "A balance with a private side.",
    keywords: ["balance", "wallet", "account", "card", "sparkline", "flip"],
    props: [
      {
        name: "balance / format / delta / series",
        type: "number / (v)=>string / {value,direction} / number[]",
        description:
          "The carry-rolling amount, its delta chip, and the sparkline data.",
      },
      {
        name: "activity",
        type: "BalanceActivity[]",
        description: "Back-face rows: { id, label, amount, time }.",
      },
      {
        name: "onAction",
        type: '(action: "send" | "receive" | "convert") => void',
        description: "Fires from the action row.",
      },
      {
        name: "defaultHidden",
        type: "boolean",
        defaultValue: "false",
        description: "Start with the balance blurred.",
      },
    ],
    usageNotes: [
      "The hidden face is inert and aria-hidden — the flip never traps focus or leaks taps.",
      "Under reduced motion the flip is instant, the sparkline arrives drawn, and the blur toggles without a tween.",
    ],
  },
  {
    name: "exchange-panel",
    type: "registry:block",
    title: "Exchange Panel",
    description:
      "Two units, one clean swap — the edited side is live, the computed side carry-rolls after a debounce, and swapping keeps focus while contents trade places.",
    files: [
      {
        path: "registry/blocks/exchange-panel/exchange-panel.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "readout",
      "select",
    ],
    categories: ["finance"],
    meta: { serial: "KB-116" },
    tagline: "Two units, one clean swap.",
    keywords: ["converter", "exchange", "swap", "units", "currency"],
    props: [
      {
        name: "units",
        type: "ExchangeUnit[] | ExchangeGroup[]",
        description:
          "Linear factors to a shared base unit; groups render a grouped select.",
      },
      {
        name: "feeRate",
        type: "number",
        defaultValue: "0",
        description:
          "Fraction applied to the converted side, shown as a fee row.",
      },
      {
        name: "onChange / onDirectionChange",
        type: "(state) => void / (from, to) => void",
        description: "Conversion updates and swap events.",
      },
      {
        name: "debounceMs",
        type: "number",
        defaultValue: "200",
        description: "Delay before the computed side rolls.",
      },
    ],
    usageNotes: [
      "One side holds authority; the other is always derived — swapping transfers authority with the gesture and refocuses the input.",
      "Under reduced motion contents swap instantly and the readout uses its highlight fallback.",
    ],
  },
  {
    name: "launch-checklist",
    type: "registry:block",
    title: "Launch Checklist",
    description:
      "Onboarding checklist where ticks draw themselves, finished steps strike through and settle to the bottom, and completing the set lands a CALIBRATED stamp.",
    files: [
      {
        path: "registry/blocks/launch-checklist/launch-checklist.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["onboarding"],
    meta: { serial: "KB-108" },
    tagline: "Setup steps that stamp themselves done.",
    keywords: ["onboarding", "checklist", "progress", "steps", "stamp"],
    props: [
      {
        name: "steps",
        type: "ChecklistStep[]",
        description: "Step definitions: id, title, optional description.",
      },
      {
        name: "completed / defaultCompleted",
        type: "string[]",
        description: "Controlled or uncontrolled set of completed step ids.",
      },
      {
        name: "onCompletedChange",
        type: "(completed: string[]) => void",
        description: "Fires on every toggle with the new completed set.",
      },
      {
        name: "onComplete",
        type: "() => void",
        description: "Fires once when the final step completes.",
      },
    ],
    usageNotes: [
      "Rows are native checkboxes under the hood — the whole block is keyboard and screen-reader operable.",
      "Under reduced motion rows reorder instantly and the stamp fades in; the progress track still reports value via ARIA.",
    ],
  },
  {
    name: "hero-split-ledger",
    type: "registry:block",
    title: "Split Ledger Hero",
    description:
      "An editorial split hero: the argument on the left, the product already at work on the right. The copy column arrives on the cascade; the vignette is a live day-ledger whose total carry-rolls and whose rows carry real status seals. A gradient drift held low behind everything keeps the reading line in charge.",
    files: [
      {
        path: "registry/blocks/hero-split-ledger/hero-split-ledger.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "gradient-drift",
      "pressure-button",
      "readout",
      "reveal-stagger",
      "status-seal",
    ],
    categories: ["hero"],
    meta: { serial: "KB-201" },
    tagline: "The argument left, the product at work right.",
    keywords: ["hero", "landing", "section", "split", "header", "marketing"],
    props: [
      {
        name: "headline / copy / eyebrow",
        type: "string",
        description: "The copy column. Headline is two lines, one per element.",
      },
      {
        name: "rows / panelTitle / panelMetric",
        type: "LedgerRow[] · string · {label, value}",
        description: "The vignette's schedule and its rolling total.",
      },
      {
        name: "primaryCta / secondaryCta / onPrimary / onSecondary",
        type: "string · () => void",
        description: "Both actions; primary carries the arrow.",
      },
    ],
    usageNotes: [
      "The vignette is composed from readout and status-seal, so the proof panel moves like the product, not like a screenshot.",
      "Sections render full-bleed: give the block the page width and it manages its own column.",
      "Under reduced motion the copy resolves in place and the drift holds still.",
    ],
  },
  {
    name: "hero-launch-beacon",
    type: "registry:block",
    title: "Launch Beacon Hero",
    description:
      "A centered launch hero: one announcement, one claim, one action. The stack lands on the cascade over a contour wavefield held at low opacity, and the proof row carry-rolls its numbers in — a number that arrives reads as measured where a printed one reads as claimed.",
    files: [
      {
        path: "registry/blocks/hero-launch-beacon/hero-launch-beacon.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "wavefield",
      "pressure-button",
      "readout",
      "reveal-stagger",
      "status-seal",
    ],
    categories: ["hero"],
    meta: { serial: "KB-202" },
    tagline: "One announcement, one claim, one action.",
    keywords: ["hero", "landing", "section", "centered", "launch", "marketing"],
    props: [
      {
        name: "notice / headline / copy",
        type: "string",
        description:
          "Announcement chip, two-line headline, and the standfirst.",
      },
      {
        name: "metrics",
        type: "BeaconMetric[]",
        description: "The proof row — value, suffix, label; numbers roll in.",
      },
      {
        name: "primaryCta / secondaryCta / onPrimary / onSecondary",
        type: "string · () => void",
        description: "Both actions; secondary renders as a ghost.",
      },
    ],
    usageNotes: [
      "The wavefield is atmosphere, not spectacle — held at 0.35 opacity under a grounding gradient so copy stays the brightest thing on stage.",
      "Sections render full-bleed: give the block the page width and it manages its own column.",
      "Under reduced motion the stack resolves in place, the field stills, and the metrics print at value.",
    ],
  },
  {
    name: "hero-console-drift",
    type: "registry:block",
    title: "Console Drift Hero",
    description:
      "A console hero for tools that live in the terminal. Copy holds the left edge; the vignette is a framed console whose listing turns out line by line — the product demonstrating itself in its own medium — while aurora ribbons rise from the page floor, faded low so the listing stays the brightest thing on the stage.",
    files: [
      {
        path: "registry/blocks/hero-console-drift/hero-console-drift.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "aurora-ribbon",
      "code-lathe",
      "pressure-button",
      "reveal-stagger",
      "status-seal",
    ],
    categories: ["hero"],
    meta: { serial: "KB-203" },
    tagline: "The product demonstrating itself in its own medium.",
    keywords: [
      "hero",
      "landing",
      "section",
      "terminal",
      "developer",
      "marketing",
    ],
    props: [
      {
        name: "headline / copy / eyebrow",
        type: "string",
        description: "The copy column. Headline is two lines, one per element.",
      },
      {
        name: "code / filename / checks",
        type: "string · string · string[]",
        description:
          "The console vignette — listing, title rail, and its seals.",
      },
      {
        name: "primaryCta / secondaryCta / onPrimary / onSecondary",
        type: "string · () => void",
        description: "Both actions; primary carries the arrow.",
      },
    ],
    usageNotes: [
      "The listing is code-lathe with streaming on — every line is in the DOM from the first frame, so copy and screen readers always see whole source.",
      "Sections render full-bleed: give the block the page width and it manages its own column.",
      "Under reduced motion the listing is simply there, complete and still, and the ribbons hold.",
    ],
  },
  {
    name: "nav-glass-rail",
    type: "registry:block",
    title: "Glass Rail Navbar",
    description:
      "A glass rail that condenses as the page gets underway: tall and transparent at rest, tighter with a blur and a hairline once content scrolls under it. Desktop links share one slipstream pill that chases hover and focus; the mobile fold glides open below the rail.",
    files: [
      {
        path: "registry/blocks/nav-glass-rail/nav-glass-rail.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "slipstream",
      "pressure-button",
    ],
    categories: ["navbar"],
    meta: { serial: "KB-204" },
    tagline: "Earns its keep once content moves under it.",
    keywords: [
      "navbar",
      "header",
      "navigation",
      "sticky",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "brand / links / activeHref",
        type: "ReactNode · RailLink[] · string",
        description: "Identity, the link set, and the current page.",
      },
      {
        name: "cta / onCta",
        type: "string · () => void",
        description: "The rail's one action; repeated inside the mobile fold.",
      },
    ],
    usageNotes: [
      "The hover pill is slipstream — one shared pill chasing hover and focus, never one per link.",
      "The fold and the condensing are height and blur only; no layout jumps for content below.",
      "Under reduced motion the pill parks, and the fold and condensing switch states in place.",
    ],
  },
  {
    name: "nav-dock-pill",
    type: "registry:block",
    title: "Dock Pill Navbar",
    description:
      "A floating pill dock moored top-center rather than spanning the page. The active page carries a seated dot; choosing another link sends the dot sliding along the pill on the snap spring via a shared layout id. On small screens the fold opens as a full sheet whose links land on the cascade.",
    files: [
      {
        path: "registry/blocks/nav-dock-pill/nav-dock-pill.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "reveal-stagger",
    ],
    categories: ["navbar"],
    meta: { serial: "KB-205" },
    tagline: "One dot, one home, always somewhere.",
    keywords: ["navbar", "pill", "dock", "navigation", "section", "marketing"],
    props: [
      {
        name: "brand / links / activeHref",
        type: "ReactNode · PillLink[] · string",
        description: "Identity, the link set, and the seated page.",
      },
      {
        name: "cta / onCta",
        type: "string · () => void",
        description: "The dock's one action; repeated inside the sheet.",
      },
    ],
    usageNotes: [
      "The dot is a layoutId — it travels between links rather than blinking out and back.",
      "The mobile sheet is a dialog: focus stays inside it and Escape-free close is the visible button.",
      "Under reduced motion the dot seats instantly and the sheet fades in place.",
    ],
  },
  {
    name: "footer-terrace",
    type: "registry:block",
    title: "Terrace Footer",
    description:
      "A terraced mega footer: brand and the ask on the top terrace, the link garden below, and the ground line — a live status pip and the fine print — at the base. The newsletter slot composes the library's own field and button, so subscribing has the same traced focus and pressed confirm as the product above it.",
    files: [
      {
        path: "registry/blocks/footer-terrace/footer-terrace.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "trace-input",
      "pressure-button",
      "status-pip",
    ],
    categories: ["footer"],
    meta: { serial: "KB-206" },
    tagline: "Brand, link garden, ground line.",
    keywords: [
      "footer",
      "links",
      "newsletter",
      "status",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "columns",
        type: "TerraceColumn[]",
        description: "The link garden — heading plus links per column.",
      },
      {
        name: "newsletterTitle / onSubscribe",
        type: "string · (email) => void",
        description: "The ask; omit onSubscribe to run the form inert.",
      },
      {
        name: "statusLabel / fineprint",
        type: "string",
        description: "The ground line's two ends.",
      },
    ],
    usageNotes: [
      "The status line breathes through status-pip rather than claiming uptime in static text.",
      "Subscribe validates the address shape and reports through a polite status line.",
      "Columns collapse two-up on small screens; the ground line wraps before it truncates.",
    ],
  },
  {
    name: "footer-drift-mark",
    type: "registry:block",
    title: "Drift Mark Footer",
    description:
      "A closing footer built around the wordmark itself: the name rides a slow ticker at display size behind a hairline, dragging under hover the way the tape always has — the brand at rest, still moving. One closing ask above; a thin link line and the fine print below.",
    files: [
      {
        path: "registry/blocks/footer-drift-mark/footer-drift-mark.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "ticker-tape",
      "pressure-button",
    ],
    categories: ["footer"],
    meta: { serial: "KB-207" },
    tagline: "The brand at rest, still moving.",
    keywords: ["footer", "wordmark", "marquee", "cta", "section", "marketing"],
    props: [
      {
        name: "mark / headline",
        type: "string",
        description: "The riding wordmark and the closing ask above it.",
      },
      {
        name: "cta / onCta / links / fineprint",
        type: "string · () => void · DriftLink[] · string",
        description: "The action, the thin link line, and the last word.",
      },
    ],
    usageNotes: [
      "The moving mark is ticker-tape — friction, hover drag, and the reduced-motion park all come from it.",
      "The tape row is aria-hidden; the brand is carried by the visible links and fine print.",
      "Keep the mark short — it repeats four times per loop copy at display size.",
    ],
  },
  {
    name: "features-bento-field",
    type: "registry:block",
    title: "Bento Field Features",
    description:
      "A bento field: one working cell anchors the grid and the rest state their case at a glance. The anchor is a live throughput chart drawn by the library's own spark instrument; the smaller cells carry a rolling metric, sealed guarantees, and plain statements. Cells arrive on the cascade, largest first.",
    files: [
      {
        path: "registry/blocks/features-bento-field/features-bento-field.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "spark-chart",
      "readout",
      "status-seal",
    ],
    categories: ["features"],
    meta: { serial: "KB-208" },
    tagline: "One working cell anchors the grid.",
    keywords: ["features", "bento", "grid", "section", "metrics", "marketing"],
    props: [
      {
        name: "eyebrow / headline / copy",
        type: "string",
        description: "The section's standfirst above the grid.",
      },
    ],
    usageNotes: [
      "The anchor chart is spark-chart on a fixed series — it draws the same line every render, SSR included.",
      "Cells are the real instrument set, so the grid inherits every reduced-motion fallback it needs.",
      "The grid drops to one column under sm and the anchor keeps its lead position.",
    ],
  },
  {
    name: "features-ledger-rows",
    type: "registry:block",
    title: "Ledger Rows Features",
    description:
      "Feature rows that alternate like a well-set ledger: copy on one side, a framed visual on the other, sides swapping each row so the page reads in a weave. Each row arrives on the cascade as it enters the viewport; the visuals are typographic panels in the library's own chrome, so they read as product rather than illustration.",
    files: [
      {
        path: "registry/blocks/features-ledger-rows/features-ledger-rows.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["features"],
    meta: { serial: "KB-209" },
    tagline: "Copy and proof, woven row by row.",
    keywords: [
      "features",
      "rows",
      "alternating",
      "section",
      "narrative",
      "marketing",
    ],
    props: [
      {
        name: "features",
        type: "LedgerFeature[]",
        description:
          "Kicker, title, copy, points, and an optional visual per row.",
      },
      {
        name: "eyebrow / headline",
        type: "string",
        description: "The standfirst above the rows.",
      },
    ],
    usageNotes: [
      "Pass your own `visual` per row to replace the framed panels — the weave and cascade stay.",
      "Rows swap sides with the order utilities only, so source order and reading order agree.",
      "Under reduced motion rows resolve in place as they enter.",
    ],
  },
  {
    name: "features-relay-tabs",
    type: "registry:block",
    title: "Relay Tabs Features",
    description:
      "A staged feature tour on the library's own tab gantry: three scenes, one stage. The indicator's travel comes from gantry-tabs, and each scene's panel plays a short terminal sequence of beats faded in down the list — switching tabs reads as changing what the product is doing, not swapping a screenshot.",
    files: [
      {
        path: "registry/blocks/features-relay-tabs/features-relay-tabs.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "gantry-tabs",
      "status-seal",
    ],
    categories: ["features"],
    meta: { serial: "KB-210" },
    tagline: "Three scenes, one stage.",
    keywords: ["features", "tabs", "tour", "section", "staged", "marketing"],
    props: [
      {
        name: "scenes",
        type: "RelayScene[]",
        description:
          "Tab value, label, icon, title, copy, and the beats the panel plays.",
      },
      {
        name: "eyebrow / headline / copy",
        type: "string",
        description: "The centered standfirst.",
      },
    ],
    usageNotes: [
      "The tab bar is gantry-tabs — indicator physics, keyboard travel, and ARIA come from it.",
      "Beats are plain data; each panel replays its sequence on entry.",
      "Under reduced motion beats print in place and the indicator parks.",
    ],
  },
  {
    name: "pricing-meridian-tiers",
    type: "registry:block",
    title: "Meridian Tiers Pricing",
    description:
      "Three tiers under one billing switch. The switch is the library's own segmented control, and the prices are readouts — flip the billing and every numeral carry-rolls to its new value instead of blinking, so the difference between the modes is something you watch happen. The chosen tier stands taller and carries a seal; the maths never moves a card.",
    files: [
      {
        path: "registry/blocks/pricing-meridian-tiers/pricing-meridian-tiers.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "segmented-control",
      "readout",
      "status-seal",
      "pressure-button",
    ],
    categories: ["pricing"],
    meta: { serial: "KB-211" },
    tagline: "Flip the billing; watch every price roll.",
    keywords: ["pricing", "tiers", "plans", "billing", "section", "marketing"],
    props: [
      {
        name: "tiers",
        type: "MeridianTier[]",
        description:
          "Name, blurb, monthly and annual prices, features, and an optional seal.",
      },
      {
        name: "onSelect",
        type: "(tierId, billing) => void",
        description: "Fired with the tier and the active billing mode.",
      },
    ],
    usageNotes: [
      "Prices are readouts, so a billing flip carry-rolls every numeral at once.",
      "The sealed tier lifts with negative margin on md+ only — cards stay level when stacked.",
      "The switch is a real radio group; arrow keys move billing focus.",
    ],
  },
  {
    name: "pricing-usage-dial",
    type: "registry:block",
    title: "Usage Dial Pricing",
    description:
      "Usage pricing you can measure: one caliper, one bill. Drag the jaws to the volume you expect and the monthly total carry-rolls to meet it, priced through progressive bands whose rates are printed right there — a price you can check beats a price you must trust. The caliper is the library's own instrument; the total is a readout.",
    files: [
      {
        path: "registry/blocks/pricing-usage-dial/pricing-usage-dial.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "caliper-slider",
      "readout",
      "status-seal",
      "pressure-button",
    ],
    categories: ["pricing"],
    meta: { serial: "KB-212" },
    tagline: "Measure the bill before it exists.",
    keywords: ["pricing", "usage", "metered", "slider", "section", "marketing"],
    props: [
      {
        name: "bands",
        type: "UsageBand[]",
        description:
          "Progressive bands, ascending; each prices only its own span.",
      },
      {
        name: "min / max / step / defaultUsage / unit",
        type: "number · string",
        description: "The caliper's range and the metered unit.",
      },
      {
        name: "onCta",
        type: "(usage) => void",
        description: "Fired with the measured volume.",
      },
    ],
    usageNotes: [
      "The total is computed progressively — each band prices its own span, never the whole volume.",
      "Band boundaries pin caliper marks, so the detents are the price breaks.",
      "Active bands read full strength; bands beyond the measured span sit at half opacity.",
    ],
  },
  {
    name: "pricing-open-ledger",
    type: "registry:block",
    title: "Open Ledger Pricing",
    description:
      "A price you can audit: the bill as an open ledger, one line per thing, each optional line with a real drawn-tick control. Toggle a line and the total carry-rolls to its new sum — arithmetic performed in front of you, which is the entire argument. No bundle names, no contact-us veil.",
    files: [
      {
        path: "registry/blocks/pricing-open-ledger/pricing-open-ledger.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "checkbox",
      "readout",
      "pressure-button",
    ],
    categories: ["pricing"],
    meta: { serial: "KB-213" },
    tagline: "Arithmetic performed in front of you.",
    keywords: [
      "pricing",
      "ledger",
      "itemized",
      "addons",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "lines",
        type: "LedgerLine[]",
        description:
          "Label, detail, price; base lines are always on, others carry a checkbox.",
      },
      {
        name: "onCta",
        type: "(activeLineIds, total) => void",
        description: "Fired with the composed bill.",
      },
    ],
    usageNotes: [
      "Optional lines are the library's checkbox — the tick draws, and toggling rolls the total.",
      "Base lines render without a control and are marked ALWAYS ON.",
      "The total is derived, never stored — the lines are the single source of truth.",
    ],
  },
  {
    name: "stats-signal-band",
    type: "registry:block",
    title: "Signal Band Stats",
    description:
      "A stats band set like a headline, not a dashboard: oversized numerals on a single rule, edge to edge, no cards and no charts. Every numeral is the library's rolling readout at display size, resolving on the cascade as the band enters.",
    files: [
      {
        path: "registry/blocks/stats-signal-band/stats-signal-band.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "readout"],
    categories: ["stats"],
    meta: { serial: "KB-214" },
    tagline: "The claim is the number.",
    keywords: ["stats", "metrics", "band", "numbers", "section", "marketing"],
    props: [
      {
        name: "stats",
        type: "BandStat[]",
        description: "Value, suffix, and the label under the rule.",
      },
      {
        name: "kicker / footnote",
        type: "string",
        description: "The rule's overline and the provenance line beneath.",
      },
    ],
    usageNotes: [
      "Deliberately no cards and no charts — the typographic band is what the instrument grid block does not do.",
      "Numbers resolve on the cascade as the band enters; under reduced motion they print at value.",
      "Two columns under lg, four across on desktop.",
    ],
  },
  {
    name: "stats-impact-report",
    type: "registry:block",
    title: "Impact Report Stats",
    description:
      "Stats set as an impact report rather than a dashboard: a narrative column that says what changed and why it matters, beside a ledger of metric rows — each a rolling numeral, its delta seal, and a year of context drawn as a spark line right where the claim is made. The attestation line says where the numbers come from, because a stat without provenance is just typography.",
    files: [
      {
        path: "registry/blocks/stats-impact-report/stats-impact-report.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "readout",
      "spark-chart",
      "status-seal",
    ],
    categories: ["stats"],
    meta: { serial: "KB-215" },
    tagline: "Numbers with their provenance attached.",
    keywords: [
      "stats",
      "report",
      "metrics",
      "sparkline",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "rows",
        type: "ImpactRow[]",
        description:
          "Metric, value, delta, and the twelve-point context series.",
      },
      {
        name: "attestation",
        type: "string",
        description: "The sign-off naming the numbers' source and window.",
      },
    ],
    usageNotes: [
      "Each row's spark line is the library's spark-chart on a fixed series — deterministic, SSR-safe.",
      "Deltas are seals: direction picks the tone, success for up, info for an intended fall.",
      "Rows stack their chart under the numeral on small screens.",
    ],
  },
  {
    name: "logo-marquee-hall",
    type: "registry:block",
    title: "Marquee Hall Logos",
    description:
      "A hall of marks on two counter-running tapes — the library's own ticker, with its friction and hover drag, carrying typographic wordmarks instead of image files, so the row reads sharply in both themes at any density. The rows run against each other slowly enough to scan; under reduced motion both park as a plain double rail.",
    files: [
      {
        path: "registry/blocks/logo-marquee-hall/logo-marquee-hall.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "ticker-tape"],
    categories: ["logo-cloud"],
    meta: { serial: "KB-216" },
    tagline: "Two tapes, running against each other.",
    keywords: [
      "logos",
      "marquee",
      "social proof",
      "wordmarks",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "marks",
        type: "HallMark[]",
        description:
          "Typographic wordmarks, split across the two rows; `mono` switches the stack.",
      },
      {
        name: "claim",
        type: "string",
        description: "The line above the hall.",
      },
    ],
    usageNotes: [
      "Motion belongs to ticker-tape — friction, hover drag, and the reduced-motion park come from it.",
      "The tapes are aria-hidden; a sr-only line reads every mark in order.",
      "Wordmarks are text, so they follow the theme with no asset swaps.",
    ],
  },
  {
    name: "testimonial-dispatch-wall",
    type: "registry:block",
    title: "Dispatch Wall Testimonials",
    description:
      "A dispatch wall: one quotation set large on the balance instrument — its words rising and resolving in reading order — over a wall of shorter dispatches arriving on the cascade. The lead quote carries the argument; the wall carries the pattern. All type, no headshots: what was said, who said it, nothing performing sincerity.",
    files: [
      {
        path: "registry/blocks/testimonial-dispatch-wall/testimonial-dispatch-wall.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "balance-quote",
    ],
    categories: ["testimonials"],
    meta: { serial: "KB-217" },
    tagline: "One lead voice, a wall of pattern.",
    keywords: [
      "testimonials",
      "quotes",
      "wall",
      "social proof",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "lead",
        type: "{ quote, cite }",
        description: "The large quotation on the balance instrument.",
      },
      {
        name: "dispatches",
        type: "Dispatch[]",
        description: "The wall — quote, name, role per card.",
      },
    ],
    usageNotes: [
      "The lead quote's word-by-word rise belongs to balance-quote; the wall only cascades.",
      "Cards are figures with real blockquote and figcaption semantics.",
      "Four across on desktop, two on tablet, one on small screens.",
    ],
  },
  {
    name: "testimonial-standing-desk",
    type: "registry:block",
    title: "Standing Desk Testimonials",
    description:
      "One testimony at a time, at a standing desk: the roster on the left, the floor given wholly to whoever holds it. Choosing a name slides their testimony in from the side it queues on, and every claim carries a proof seal — the measured thing the quote rests on — because a testimonial with a number survives skepticism better than adjectives do.",
    files: [
      {
        path: "registry/blocks/testimonial-standing-desk/testimonial-standing-desk.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "status-seal"],
    categories: ["testimonials"],
    meta: { serial: "KB-218" },
    tagline: "Every claim carries its number.",
    keywords: [
      "testimonials",
      "spotlight",
      "proof",
      "tabs",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "entries",
        type: "DeskEntry[]",
        description: "Quote, name, role, and the proof line sealed beside it.",
      },
      {
        name: "eyebrow / headline",
        type: "string",
        description: "The standfirst above the desk.",
      },
    ],
    usageNotes: [
      "The roster is a real tablist; the floor is the single live panel.",
      "Testimonies enter from the side they queue on — direction follows roster order.",
      "Under reduced motion testimonies crossfade in place.",
    ],
  },
  {
    name: "cta-launch-window",
    type: "registry:block",
    title: "Launch Window CTA",
    description:
      "The closing ask as a lit window: one headline, one field, one button, framed in a drifting gradient held bright at the section's heart and dark at its edges. The field and the button are the library's own — the same traced focus and pressed confirm as everywhere else — because the last thing a page asks should feel like the product it sold.",
    files: [
      {
        path: "registry/blocks/cta-launch-window/cta-launch-window.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "gradient-drift",
      "trace-input",
      "pressure-button",
    ],
    categories: ["cta"],
    meta: { serial: "KB-219" },
    tagline: "The last ask feels like the product.",
    keywords: ["cta", "signup", "email", "closing", "section", "marketing"],
    props: [
      {
        name: "headline / copy / cta",
        type: "string",
        description: "The ask; headline is two lines.",
      },
      {
        name: "onSubmit",
        type: "(email) => void",
        description: "Fired with a shape-valid address.",
      },
      {
        name: "notes",
        type: "string[]",
        description: "The quiet reassurances under the form.",
      },
    ],
    usageNotes: [
      "The drift is held behind a vertical gradient so the window reads lit at its heart.",
      "Submit validates the address shape and reports through a polite status line.",
      "Reassurances stay mono and quiet — they are footnotes, not features.",
    ],
  },
  {
    name: "cta-terminal-close",
    type: "registry:block",
    title: "Terminal Close CTA",
    description:
      "A closing move for tools that live in the terminal: the ask is the install command itself, turned out in the console frame with copy one click away — because for this audience, get started means give me the line. A conventional button stands beside it for everyone else.",
    files: [
      {
        path: "registry/blocks/cta-terminal-close/cta-terminal-close.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "code-lathe",
      "pressure-button",
      "status-seal",
    ],
    categories: ["cta"],
    meta: { serial: "KB-220" },
    tagline: "The ask is the install line.",
    keywords: [
      "cta",
      "terminal",
      "install",
      "developer",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "command",
        type: "string",
        description: "The one line that starts everything, with copy attached.",
      },
      {
        name: "assurances",
        type: "string[]",
        description: "Seals beside the frame — platforms, permissions, exit.",
      },
      {
        name: "cta / onCta",
        type: "string · () => void",
        description: "The conventional path beside the command.",
      },
    ],
    usageNotes: [
      "The command frame is code-lathe — its copy control and reduced-motion behaviour come with it.",
      "Assurances are seals, not prose: short, checkable claims.",
      "The card centers itself; the section stays quiet around it.",
    ],
  },
  {
    name: "faq-split-registry",
    type: "registry:block",
    title: "Split Registry FAQ",
    description:
      "A FAQ set like a registry: the index down a sticky left rail — one jump link per group — and the questions on the right, each group a drawer accordion whose panels glide open on the library's own spring. The split earns the section its place: the accordion answers one question, the rail answers where is my question.",
    files: [
      {
        path: "registry/blocks/faq-split-registry/faq-split-registry.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "drawer-accordion",
    ],
    categories: ["faq"],
    meta: { serial: "KB-221" },
    tagline: "The rail answers where; the drawers answer what.",
    keywords: [
      "faq",
      "questions",
      "accordion",
      "index",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "groups",
        type: "RegistryGroup[]",
        description: "Heading plus question/answer entries per group.",
      },
      {
        name: "eyebrow / headline / copy",
        type: "string",
        description: "The rail's standfirst.",
      },
    ],
    usageNotes: [
      "All disclosure motion belongs to drawer-accordion — the section only arranges it.",
      "Rail links are plain anchors with scroll margins, so deep links land cleanly.",
      "The rail sticks on lg and stacks above the drawers on small screens.",
    ],
  },
  {
    name: "faq-counter-desk",
    type: "registry:block",
    title: "Counter Desk FAQ",
    description:
      "A FAQ with a counter desk: ask first, browse second. The filter is the library's own traced field, narrowing the drawers live as you type — matching question, answer, and hidden keywords — and when nothing matches, the desk says so plainly and offers a person, carrying your words along.",
    files: [
      {
        path: "registry/blocks/faq-counter-desk/faq-counter-desk.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "drawer-accordion",
      "trace-input",
      "pressure-button",
    ],
    categories: ["faq"],
    meta: { serial: "KB-222" },
    tagline: "Ask first, browse second.",
    keywords: ["faq", "search", "filter", "help", "section", "marketing"],
    props: [
      {
        name: "questions",
        type: "DeskQuestion[]",
        description:
          "Question, answer, and hidden keywords the filter also matches.",
      },
      {
        name: "onContact",
        type: "(query) => void",
        description: "The unanswered path, fired with what was typed.",
      },
    ],
    usageNotes: [
      "The match count reports through a polite status line as the filter narrows.",
      "The empty desk is a real state with a real action, not a dead end.",
      "Filtering matches hidden keywords, so drawers surface for words their text never uses.",
    ],
  },
  {
    name: "announce-launch-rail",
    type: "registry:block",
    title: "Launch Rail Announcements",
    description:
      "A launch rail for the top of a page: the library's own alert bar carrying a rolling slot of updates — one line at a time, each holding just long enough to read. The bar owns the entrance, the severity stripe, and the dismissal that closes the space behind it; the slot only rolls. Dismiss it and every update goes at once, the way a rail should.",
    files: [
      {
        path: "registry/blocks/announce-launch-rail/announce-launch-rail.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "alert-bar",
      "marquee-swap",
    ],
    categories: ["announcement"],
    meta: { serial: "KB-223" },
    tagline: "One rail, every update, one dismissal.",
    keywords: [
      "announcement",
      "banner",
      "updates",
      "rail",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "updates",
        type: "string[]",
        description: "The lines the slot rolls through, in order.",
      },
      {
        name: "open / onOpenChange",
        type: "boolean · (open) => void",
        description: "Controlled visibility passthrough to the bar.",
      },
      {
        name: "actionLabel / onAction",
        type: "string · () => void",
        description: "The see-everything path at the rail's end.",
      },
    ],
    usageNotes: [
      "Entrance, stripe, and dismissal belong to alert-bar; the rolling slot belongs to marquee-swap.",
      "The rail spans full-bleed — its borders are suppressed so the page edge is the frame.",
      "Under reduced motion the slot steps between lines without travel.",
    ],
  },
  {
    name: "empty-first-light",
    type: "registry:block",
    title: "First Light Empty State",
    description:
      "The first minute of a product, treated as a moment rather than an apology: a dashed intake frame where the work will soon live, three concrete first moves arriving on the cascade, and one primary action. No sad illustration, no nothing-here-yet — the empty state is a runway, and it says which way to take off.",
    files: [
      {
        path: "registry/blocks/empty-first-light/empty-first-light.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "pressure-button",
    ],
    categories: ["empty-states"],
    meta: { serial: "KB-224" },
    tagline: "A runway, not an apology.",
    keywords: [
      "empty state",
      "onboarding",
      "first run",
      "getting started",
      "section",
    ],
    props: [
      {
        name: "actions",
        type: "FirstAction[]",
        description: "Three concrete first moves, each a real button.",
      },
      {
        name: "headline / copy / primaryCta",
        type: "string",
        description: "What this place becomes, and the main way in.",
      },
    ],
    usageNotes: [
      "Deliberately in-panel: the full-page empty state belongs to the not-found block.",
      "First moves are buttons, not cards — every surface here does something.",
      "Under reduced motion the moves print in place.",
    ],
  },
  {
    name: "stepform-gatehouse",
    type: "registry:block",
    title: "Gatehouse Step Form",
    description:
      "A gatehouse for longer asks: the journey drawn by the library's own stepper — connectors filling, cleared steps stamping their check — while each stage slides in from the direction of travel. The shell's contribution is the data layer: per-step validation that blocks forward but never back, a review stage before anything sends, and a finished state that says what happens next.",
    files: [
      {
        path: "registry/blocks/stepform-gatehouse/stepform-gatehouse.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "stepper-flow",
      "trace-input",
      "select",
      "pressure-button",
      "status-seal",
    ],
    categories: ["step-form"],
    meta: { serial: "KB-225" },
    tagline: "Forward must earn it; back is always open.",
    keywords: [
      "form",
      "multi-step",
      "wizard",
      "validation",
      "section",
      "signup",
    ],
    props: [
      {
        name: "onSubmit",
        type: "(submission) => void",
        description: "Fired once, from the review stage.",
      },
      {
        name: "eyebrow / headline",
        type: "string",
        description: "The standfirst above the gatehouse.",
      },
    ],
    usageNotes: [
      "The journey indicator is stepper-flow — completed steps stay clickable, so back never needs a button it does not have.",
      "Validation gates Continue only; errors appear on the fields that earned them.",
      "Stages slide from the direction of travel; reduced motion crossfades in place.",
    ],
  },
  {
    name: "newsletter-pressroom",
    type: "registry:block",
    title: "Pressroom Newsletter",
    description:
      "A newsletter signup that shows the goods: the latest issue set as a pressroom proof — number, title, standfirst, read time — beside the ask. Subscribing is the library's own field and pressed confirm, and the cadence line is a commitment, not a vibe. If the preview does not earn the address, the section has honestly answered the question.",
    files: [
      {
        path: "registry/blocks/newsletter-pressroom/newsletter-pressroom.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "trace-input",
      "pressure-button",
    ],
    categories: ["newsletter"],
    meta: { serial: "KB-226" },
    tagline: "Show the issue, then ask.",
    keywords: [
      "newsletter",
      "signup",
      "email",
      "issue",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "latest",
        type: "PressIssue",
        description: "The proof: number, title, standfirst, read minutes.",
      },
      {
        name: "cadence",
        type: "string",
        description: "The commitment line — when it comes, how leaving works.",
      },
      {
        name: "onSubscribe",
        type: "(email) => void",
        description: "Fired with a shape-valid address.",
      },
    ],
    usageNotes: [
      "The preview is typeset, not screenshotted — it reads in both themes and scales like text.",
      "Submit validates the address shape and reports through a polite status line.",
      "Keep the cadence line honest; it is the section's entire trust argument.",
    ],
  },
  {
    name: "contact-routing-desk",
    type: "registry:block",
    title: "Routing Desk Contact",
    description:
      "Contact as a routing desk: say why you are writing first, and the desk answers with who will read it and how fast — the expectation stated before the message is asked for, not promised after. The route picker is the library's own segmented control; each route swaps in only the fields it actually needs.",
    files: [
      {
        path: "registry/blocks/contact-routing-desk/contact-routing-desk.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "segmented-control",
      "trace-input",
      "pressure-button",
      "status-seal",
    ],
    categories: ["contact"],
    meta: { serial: "KB-227" },
    tagline: "Who answers, and when, before you write.",
    keywords: ["contact", "form", "routing", "support", "section", "marketing"],
    props: [
      {
        name: "routes",
        type: "DeskRoute[]",
        description:
          "Label, desk, response expectation, and an optional extra field per route.",
      },
      {
        name: "onSubmit",
        type: "(routeId, fields) => void",
        description: "Fired with the route and its fields.",
      },
    ],
    usageNotes: [
      "The expectation seal is part of the form, not the confirmation — the deal is visible before writing.",
      "Routes swap only the fields they need; email and message stay put.",
      "The sent state restates the expectation and starts the clock.",
    ],
  },
  {
    name: "team-bench-roster",
    type: "registry:block",
    title: "Bench Roster Team",
    description:
      "The team as a bench roster: initials plates instead of headshots, a role, and — the line that matters — what each person actually tends. Cards arrive on the cascade and lift under the pointer. A roster that says what everyone owns tells a truer story than a wall of faces.",
    files: [
      {
        path: "registry/blocks/team-bench-roster/team-bench-roster.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["team"],
    meta: { serial: "KB-228" },
    tagline: "What everyone tends, on the record.",
    keywords: ["team", "people", "roster", "about", "section", "marketing"],
    props: [
      {
        name: "members",
        type: "BenchMember[]",
        description:
          "Name, role, the tended line, and an optional link per member.",
      },
      {
        name: "eyebrow / headline / copy",
        type: "string",
        description: "The standfirst above the roster.",
      },
    ],
    usageNotes: [
      "Initials plates are derived from the name — deterministic, themed, and never a broken image.",
      "The tended line is the card's point; keep it concrete enough to point at.",
      "Cards lift 3px under the pointer; reduced motion holds them still.",
    ],
  },
  {
    name: "usecase-shift-cards",
    type: "registry:block",
    title: "Shift Cards Use Cases",
    description:
      "Use cases told as moments in a shift, not personas on a slide: each card names a role, the minute of the day the product shows up, and three beats — before, during, after — ending in the outcome that earns its keep. Cards arrive on the cascade; the beats read as consecutive frames.",
    files: [
      {
        path: "registry/blocks/usecase-shift-cards/usecase-shift-cards.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["use-cases"],
    meta: { serial: "KB-229" },
    tagline: "Find your minute of the day.",
    keywords: [
      "use cases",
      "roles",
      "personas",
      "moments",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "cases",
        type: "ShiftCase[]",
        description: "Role, the minute, three beats, and the outcome per card.",
      },
      {
        name: "eyebrow / headline / copy",
        type: "string",
        description: "The standfirst above the cards.",
      },
    ],
    usageNotes: [
      "Beats are an ordered list — numbered, before → during → after.",
      "The outcome line is the card's close; keep it something a reader could repeat.",
      "Three across on desktop, stacked below lg.",
    ],
  },
  {
    name: "how-station-line",
    type: "registry:block",
    title: "Station Line How-It-Works",
    description:
      "How-it-works as a station line: the journey is the library's own stepper — pick a station and its scene slides in from the direction of travel, showing the artifacts the product actually holds at that point. The stepper carries the geometry and the keyboard; the section only stages what each stop means.",
    files: [
      {
        path: "registry/blocks/how-station-line/how-station-line.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "stepper-flow",
      "status-seal",
    ],
    categories: ["how-it-works"],
    meta: { serial: "KB-230" },
    tagline: "Walk the line, stop by stop.",
    keywords: [
      "how it works",
      "process",
      "steps",
      "stations",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "stations",
        type: "Station[]",
        description: "Label, title, copy, and the artifacts each stop holds.",
      },
      {
        name: "eyebrow / headline / copy",
        type: "string",
        description: "The centered standfirst.",
      },
    ],
    usageNotes: [
      "The line is stepper-flow — filling connectors, stamped checks, and keyboard travel come from it.",
      "Scenes slide from the direction of travel; reduced motion crossfades in place.",
      "Artifacts are the proof layer: name what the product holds, not what it intends.",
    ],
  },
  {
    name: "content-field-passage",
    type: "registry:block",
    title: "Field Passage Content",
    description:
      "An editorial passage with one figure doing the arguing: prose set at reading measure, and beside it a single pull stat on the rolling readout — large, sourced, and unhurried. Content sections earn their place by being readable; the only motion here is the number arriving.",
    files: [
      {
        path: "registry/blocks/content-field-passage/content-field-passage.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "readout"],
    categories: ["content-sections"],
    meta: { serial: "KB-231" },
    tagline: "Prose at measure, one number arguing.",
    keywords: [
      "content",
      "editorial",
      "narrative",
      "stat",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "paragraphs",
        type: "string[]",
        description: "The passage, one paragraph per entry.",
      },
      {
        name: "figure",
        type: "PassageFigure",
        description: "The pull stat beside the prose.",
      },
      {
        name: "kicker / headline / byline",
        type: "string",
        description: "The passage's frame.",
      },
    ],
    usageNotes: [
      "The figure panel sticks beside the prose on large screens and follows it below on small.",
      "Keep paragraphs at reading measure — the grid caps the prose column deliberately.",
      "The byline is the provenance; passages without one read as copy, not content.",
    ],
  },
  {
    name: "proof-evidence-band",
    type: "registry:block",
    title: "Evidence Band Proof",
    description:
      "Social proof as one mixed band — a metric, a voice, and the marks — because separately each is owned ground, and together they make the one argument none makes alone: many teams, measured results, in their own words. The metric rolls in on the readout, the marks ride the tape, and the quote just sits there being true.",
    files: [
      {
        path: "registry/blocks/proof-evidence-band/proof-evidence-band.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "readout",
      "ticker-tape",
    ],
    categories: ["social-proof"],
    meta: { serial: "KB-232" },
    tagline: "Metric, voice, and marks — one band.",
    keywords: [
      "social proof",
      "evidence",
      "logos",
      "quote",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "metric",
        type: "{ value, suffix, label }",
        description: "The band's one number, on the readout.",
      },
      {
        name: "quote",
        type: "{ text, cite }",
        description: "The band's one voice.",
      },
      {
        name: "marks",
        type: "string[]",
        description:
          "Typographic wordmarks on the tape; all-caps marks take the mono stack.",
      },
    ],
    usageNotes: [
      "Deliberately one of each — a second metric or quote turns the band back into owned ground.",
      "The tape is aria-hidden with a sr-only roll call, same as the marquee hall.",
      "The band frames itself with borders; place it between unbordered sections.",
    ],
  },
  {
    name: "integrations-patch-bay",
    type: "registry:block",
    title: "Patch Bay Integrations",
    description:
      "Integrations as a patch bay: every tool is a jack, filtered by kind with plain chips, and the wall reflows on the masonry instrument — surviving tiles glide to their new sockets rather than reprinting. Connected jacks carry a live seal; available ones state plainly what plugging them in would mean.",
    files: [
      {
        path: "registry/blocks/integrations-patch-bay/integrations-patch-bay.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "masonry-flow",
      "status-seal",
    ],
    categories: ["integrations"],
    meta: { serial: "KB-233" },
    tagline: "Filter the bay; the wall re-racks.",
    keywords: [
      "integrations",
      "directory",
      "filter",
      "tools",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "tools",
        type: "PatchTool[]",
        description:
          "Name, kind, blurb, and connected/available state per jack.",
      },
      {
        name: "eyebrow / headline / copy",
        type: "string",
        description: "The standfirst above the bay.",
      },
    ],
    usageNotes: [
      "The reflow is masonry-flow — FLIP travel and exit fades come from it, keyed by stable ids.",
      "Filter chips are real toggles with aria-pressed; the count reports politely.",
      "Every jack's blurb says what connecting does, not what the logo is.",
    ],
  },
  {
    name: "datatable-ops-desk",
    type: "registry:block",
    title: "Ops Desk Data Table",
    description:
      "A working grid in a marketing section, honestly: the library's own virtualized ledger — real sorting, whole-dataset selection — dressed with an ops toolbar whose counts carry-roll as the selection changes. The point of the section is that the table is not a mockup; it is the instrument the page is selling, doing its job on the page.",
    files: [
      {
        path: "registry/blocks/datatable-ops-desk/datatable-ops-desk.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "ledger",
      "readout",
      "status-seal",
      "pressure-button",
    ],
    categories: ["data-tables"],
    meta: { serial: "KB-234" },
    tagline: "Not a mockup — the instrument itself.",
    keywords: ["table", "data", "grid", "sorting", "section", "marketing"],
    props: [
      {
        name: "runs",
        type: "OpsRun[]",
        description: "The rows; the default roster is deterministic.",
      },
      {
        name: "onArchive",
        type: "(ids) => void",
        description: "Fired with the selection; the toolbar clears after.",
      },
    ],
    usageNotes: [
      "Virtualization, sorting, and select-all belong to ledger; the section adds the desk around it.",
      "The selected count is a readout, so bulk-selects roll rather than blink.",
      "Row state renders as seals through the ledger's cell renderer.",
    ],
  },
  {
    name: "comparison-capability-board",
    type: "registry:block",
    title: "Capability Board Comparison",
    description:
      "A comparison set as a capability board: capabilities down the side, the honest alternatives across the top — including the notebook, which wins a row, because a board that never concedes anything reads as advertising. Ticks are drawn, dashes are quiet, prose cells say the true middle thing, and the recommended column is sealed and tinted, never reordered.",
    files: [
      {
        path: "registry/blocks/comparison-capability-board/comparison-capability-board.tsx",
        type: "registry:block",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils", "status-seal"],
    categories: ["comparison"],
    meta: { serial: "KB-235" },
    tagline: "A board that concedes a row is a board you can trust.",
    keywords: [
      "comparison",
      "table",
      "matrix",
      "capabilities",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "columns",
        type: "BoardColumn[]",
        description: "The alternatives; one may be recommended.",
      },
      {
        name: "rows",
        type: "BoardRow[]",
        description:
          "Capability, optional detail, and a cell per column — boolean or prose.",
      },
    ],
    usageNotes: [
      "A real table with scoped headers — screen readers get the grid, not a div soup.",
      "Wide boards scroll inside their own frame; the page never scrolls sideways.",
      "String cells are the design's escape hatch: the true middle answer beats a grudging tick.",
    ],
  },
  {
    name: "trust-vault-brief",
    type: "registry:block",
    title: "Vault Brief Trust",
    description:
      "Trust stated calmly, in full: the compliance marks as seals with their cadence attached, three safeguards in plain language, and ninety days of uptime drawn by the spark instrument rather than claimed in a sentence. Nothing pulses, nothing looms — a security page that fidgets reads as nervous.",
    files: [
      {
        path: "registry/blocks/trust-vault-brief/trust-vault-brief.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "spark-chart",
      "status-seal",
    ],
    categories: ["trust"],
    meta: { serial: "KB-236" },
    tagline: "Boring, on purpose, in writing.",
    keywords: [
      "security",
      "trust",
      "compliance",
      "uptime",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "marks",
        type: "VaultMark[]",
        description: "Compliance label plus the cadence that keeps it honest.",
      },
      {
        name: "safeguards",
        type: "VaultSafeguard[]",
        description: "Icon, title, and the plain-language claim.",
      },
      {
        name: "uptime",
        type: "number[]",
        description: "Ninety points, most recent last; drawn by spark-chart.",
      },
    ],
    usageNotes: [
      "Every mark carries its verification cadence — a badge without one is decoration.",
      "The uptime series is deterministic by default; feed real data in production.",
      "Deliberately still: seals do not pulse here, and nothing auto-animates.",
    ],
  },
  {
    name: "gallery-plate-rail",
    type: "registry:block",
    title: "Plate Rail Gallery",
    description:
      "A gallery on the fling instrument — momentum, friction, and snap all come from kinetic-gallery — carrying typographic plates instead of photographs: scenes from the field, set in type, that read in both themes and never arrive as a broken image. Throw the rail; it lands on a plate.",
    files: [
      {
        path: "registry/blocks/gallery-plate-rail/gallery-plate-rail.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "kinetic-gallery",
    ],
    categories: ["galleries"],
    meta: { serial: "KB-237" },
    tagline: "Throw the rail; it lands on a plate.",
    keywords: [
      "gallery",
      "carousel",
      "plates",
      "editorial",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "plates",
        type: "RailPlate[]",
        description: "Kicker, title, body, and the footer figure per plate.",
      },
      {
        name: "eyebrow / headline",
        type: "string",
        description: "The standfirst above the rail.",
      },
    ],
    usageNotes: [
      "All gallery physics belong to kinetic-gallery — fling, friction, snap, and keyboard travel.",
      "Plates are typographic on purpose: both themes, any density, no image pipeline.",
      "Swap plates for image children if you must — the rail does not care what it carries.",
    ],
  },
  {
    name: "hero-signal-ridge",
    type: "registry:block",
    title: "Signal Ridge Hero",
    description:
      "A hero for products that live and die by a line going the right way: copy holds the left, and the vignette is the product's own chart — the spark instrument drawing a fixed series with its crosshair ready, headline numbers rolling in beside it. A flow field combs quietly underneath, the signal made ambient.",
    files: [
      {
        path: "registry/blocks/hero-signal-ridge/hero-signal-ridge.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "flow-field",
      "spark-chart",
      "readout",
      "status-seal",
      "reveal-stagger",
      "pressure-button",
    ],
    categories: ["hero"],
    meta: { serial: "KB-238" },
    tagline: "The vignette is the chart, already running.",
    keywords: [
      "hero",
      "analytics",
      "telemetry",
      "chart",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "series / seriesLabel / metrics",
        type: "number[] · string · RidgeMetric[]",
        description: "The vignette — a fixed series and the numbers beside it.",
      },
      {
        name: "headline / copy / eyebrow",
        type: "string",
        description: "The copy column; headline is two lines.",
      },
      {
        name: "primaryCta / secondaryCta / onPrimary / onSecondary",
        type: "string · () => void",
        description: "Both actions.",
      },
    ],
    usageNotes: [
      "The chart is spark-chart on a fixed series — crosshair, tooltip, and reduced-motion behaviour come with it.",
      "The flow field is held at 0.25 opacity under a grounding gradient; the chart stays the brightest thing.",
      "Feed real telemetry by replacing `series`; everything else holds.",
    ],
  },
  {
    name: "hero-first-light",
    type: "registry:block",
    title: "First Light Hero",
    description:
      "An early-access hero: the whole page asks for one thing, and the form is the headline's own punctuation — a traced field and a pressed confirm on the centre line, nothing else competing. A drift wavefield breathes at the floor of the stage, and the assurances sit under the fold in mono, quiet as fine print but readable as promises.",
    files: [
      {
        path: "registry/blocks/hero-first-light/hero-first-light.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "wavefield",
      "trace-input",
      "pressure-button",
      "status-seal",
      "reveal-stagger",
    ],
    categories: ["hero"],
    meta: { serial: "KB-239" },
    tagline: "One ask, on the centre line.",
    keywords: [
      "hero",
      "early access",
      "waitlist",
      "signup",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "notice / headline / copy",
        type: "string",
        description: "The seal, the two-line headline, and the standfirst.",
      },
      {
        name: "onSubmit",
        type: "(email) => void",
        description:
          "Fired with a shape-valid address; the status line confirms.",
      },
      {
        name: "footnote / assurances",
        type: "string · string[]",
        description: "The quiet line under the form and the mono promises.",
      },
    ],
    usageNotes: [
      "The form is trace-input + pressure-button — the same instruments the product ships.",
      "The footnote swaps for the confirmation in place, so nothing jumps.",
      "Under reduced motion the field stills and the stack resolves in place.",
    ],
  },
  {
    name: "features-proof-strip",
    type: "registry:block",
    title: "Proof Strip Features",
    description:
      "Three claims, each proven by a working control instead of an icon: flip the breaker and the guard state actually flips, watch the count roll as the queue drains, see the presence pip breathe because it is genuinely live. A feature strip where every cell answers the reader's click is worth a page of adjectives.",
    files: [
      {
        path: "registry/blocks/features-proof-strip/features-proof-strip.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "breaker-switch",
      "readout",
      "status-pip",
    ],
    categories: ["features"],
    meta: { serial: "KB-240" },
    tagline: "If it moves when you touch it, it is true.",
    keywords: [
      "features",
      "interactive",
      "proof",
      "demo",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "eyebrow / headline / copy",
        type: "string",
        description: "The standfirst; the cells are the fixed proof set.",
      },
    ],
    usageNotes: [
      "Every proof is a real instrument — breaker-switch, readout, status-pip — wired live in the section.",
      "The strip is deliberately three cells; more proofs dilute the point.",
      "Cells arrive on the cascade and inherit each instrument's reduced-motion fallback.",
    ],
  },
  {
    name: "features-flow-atlas",
    type: "registry:block",
    title: "Flow Atlas Features",
    description:
      "The system as an atlas: the library's own flow instrument draws where the volume actually goes — links weighted, columns honest — and three callouts below explain the junctions worth understanding. One diagram that moves like the product beats four paragraphs that describe it.",
    files: [
      {
        path: "registry/blocks/features-flow-atlas/features-flow-atlas.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "flow-diagram",
    ],
    categories: ["features"],
    meta: { serial: "KB-241" },
    tagline: "One weighted diagram beats four paragraphs.",
    keywords: [
      "features",
      "architecture",
      "diagram",
      "flow",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "nodes / links",
        type: "FlowNode[] · FlowLink[]",
        description:
          "The atlas — columns and weighted links, straight into flow-diagram.",
      },
      {
        name: "callouts",
        type: "AtlasCallout[]",
        description: "The numbered junction notes under the diagram.",
      },
    ],
    usageNotes: [
      "All drawing belongs to flow-diagram — weights, self-draw, and its accessibility summary.",
      "Callout numbers are typographic; they annotate reading order, not diagram positions.",
      "Keep links honest: weights should sum sensibly through every column.",
    ],
  },
  {
    name: "pricing-single-line",
    type: "registry:block",
    title: "Single Line Pricing",
    description:
      "One plan, stated whole: a single price on the rolling readout, everything included in one honest list, and the caveat printed with the price instead of buried in fine print. The anti-matrix — for products confident enough to have one answer to how much.",
    files: [
      {
        path: "registry/blocks/pricing-single-line/pricing-single-line.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "readout",
      "pressure-button",
    ],
    categories: ["pricing"],
    meta: { serial: "KB-242" },
    tagline: "One answer to how much.",
    keywords: ["pricing", "single", "flat", "simple", "section", "marketing"],
    props: [
      {
        name: "price / per / caveat",
        type: "number · string · string",
        description:
          "The price, its unit, and the one honest caveat sealed beside it.",
      },
      {
        name: "included",
        type: "string[]",
        description: "Everything, in one list — two columns on wide screens.",
      },
      {
        name: "cta / onCta",
        type: "string · () => void",
        description: "The one action.",
      },
    ],
    usageNotes: [
      "The caveat lives with the price on purpose — hiding it below the fold is the pattern this block exists to refuse.",
      "The price is a readout, so a prop change rolls rather than blinks.",
      "Keep the included list honest and flat; subgroups turn it back into tiers.",
    ],
  },
  {
    name: "pricing-upgrade-gate",
    type: "registry:block",
    title: "Upgrade Gate Pricing",
    description:
      "The upgrade stated as a diff, not a matrix: what you keep on one side — everything, in plain words — and what the next tier adds as plus-rows on the other, the way an honest changelog reads. Nothing about the current plan is dimmed or shamed; the gate sells the difference, not the doubt.",
    files: [
      {
        path: "registry/blocks/pricing-upgrade-gate/pricing-upgrade-gate.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "status-seal",
      "pressure-button",
    ],
    categories: ["pricing"],
    meta: { serial: "KB-243" },
    tagline: "The upgrade as an honest changelog.",
    keywords: ["pricing", "upgrade", "diff", "plan", "section", "in-product"],
    props: [
      {
        name: "currentName / currentKeeps",
        type: "string · string[]",
        description: "The kept side — stated plainly, never dimmed.",
      },
      {
        name: "nextName / nextPrice / gains",
        type: "string · string · string[]",
        description: "The gained side as plus-rows, price sealed at the top.",
      },
      {
        name: "cta / onCta / fineprint",
        type: "string · () => void · string",
        description: "The action and the proration truth beneath.",
      },
    ],
    usageNotes: [
      "Gains are plus-rows in the accent colour; keeps are ticks — the visual grammar of a diff.",
      "The current plan keeps full-strength type; shame-dimming is the dark pattern this block refuses.",
      "Works as an in-product panel as well as a page section.",
    ],
  },
  {
    name: "cta-ledger-close",
    type: "registry:block",
    title: "Ledger Close CTA",
    description:
      "A closing move that argues from the ledger: the day's counts roll in on the left — the same numbers the stats band carries, now doing sales duty — and the ask stands on the right with both doors open. Reads as a receipt with a signature line: here is what happened today; join it.",
    files: [
      {
        path: "registry/blocks/cta-ledger-close/cta-ledger-close.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "readout",
      "pressure-button",
    ],
    categories: ["cta"],
    meta: { serial: "KB-244" },
    tagline: "A receipt with a signature line.",
    keywords: ["cta", "closing", "stats", "proof", "section", "marketing"],
    props: [
      {
        name: "counts",
        type: "CloseCount[]",
        description: "The day's numbers, rolling in on readouts.",
      },
      {
        name: "headline / copy",
        type: "[string, string] · string",
        description: "The close, over two lines.",
      },
      {
        name: "primaryCta / secondaryCta / onPrimary / onSecondary",
        type: "string · () => void",
        description: "Both doors, stacked on the right.",
      },
    ],
    usageNotes: [
      "Counts should be the same numbers your stats band carries — the section is honest reuse, not new claims.",
      "Both buttons take equal width on large screens; hierarchy comes from variant alone.",
      "The frame is one hairline box; place it near the page's end.",
    ],
  },
  {
    name: "cta-split-doors",
    type: "registry:block",
    title: "Split Doors CTA",
    description:
      "The close as two honest doors: self-serve and guided, given equal floor and equal typography — the primary door earns its weight through the button alone. Each door states its own micro-terms underneath, because the reader choosing a path deserves to know its cost before knocking.",
    files: [
      {
        path: "registry/blocks/cta-split-doors/cta-split-doors.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "pressure-button",
    ],
    categories: ["cta"],
    meta: { serial: "KB-245" },
    tagline: "Two doors, terms on both.",
    keywords: ["cta", "split", "sales", "self-serve", "section", "marketing"],
    props: [
      {
        name: "doors",
        type: "[Door, Door]",
        description:
          "Kicker, title, copy, action, and the mono micro-terms per door.",
      },
      {
        name: "headline",
        type: "string",
        description: "The line above both doors.",
      },
    ],
    usageNotes: [
      "Doors get identical layout; only the button variant separates them.",
      "Micro-terms are commitments — no card, no sequence — not feature bullets.",
      "Two doors only; a third door is a pricing page.",
    ],
  },
  {
    name: "stats-share-dial",
    type: "registry:block",
    title: "Share Dial Stats",
    description:
      "A share-of-everything stats section: the dial is the library's own donut — slices that pop out under the pointer, a centre readout that follows the active slice — beside two notes that say what the shares mean. Proportions carry this story better than counts, and the dial is built for exactly that reading.",
    files: [
      {
        path: "registry/blocks/stats-share-dial/stats-share-dial.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "donut-breakdown",
    ],
    categories: ["stats"],
    meta: { serial: "KB-246" },
    tagline: "Point at a slice; the centre follows.",
    keywords: ["stats", "share", "donut", "breakdown", "section", "marketing"],
    props: [
      {
        name: "segments / totalLabel / format",
        type: "DonutSegment[] · string · (v) => string",
        description: "The dial, straight into donut-breakdown.",
      },
      {
        name: "notes",
        type: "ShareNote[]",
        description: "What the shares mean, in two short arguments.",
      },
    ],
    usageNotes: [
      "All dial behaviour belongs to donut-breakdown — pop-out, centre follow, and its announcements.",
      "Two notes on purpose: the biggest share and the one you are shrinking.",
      "Feed raw counts, never pre-computed percentages — the dial derives shares, and doubling them up prints twice.",
    ],
  },
  {
    name: "stats-heat-year",
    type: "registry:block",
    title: "Heat Year Stats",
    description:
      "Half a year of work as weather: the library's heat calendar draws the rhythm — weekday rows, a visible mid-season push, honest quiet weekends — with the summary numbers rolling in beside it. The grid answers the question a total can't: not how much, but when, and how steadily.",
    files: [
      {
        path: "registry/blocks/stats-heat-year/stats-heat-year.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "heat-calendar",
      "readout",
    ],
    categories: ["stats"],
    meta: { serial: "KB-247" },
    tagline: "Not how much — when, and how steadily.",
    keywords: [
      "stats",
      "heatmap",
      "calendar",
      "activity",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "days / unit",
        type: "HeatDay[] · string",
        description:
          "The grid, straight into heat-calendar; the default half-year is deterministic.",
      },
      {
        name: "figures / attestation",
        type: "YearFigure[] · string",
        description: "The rolling summary numbers and the provenance line.",
      },
    ],
    usageNotes: [
      "Grid interaction — roving focus, per-cell readout — belongs to heat-calendar.",
      "The default data keeps weekends honest; a grid with no quiet reads as invented.",
      "Say where the numbers come from; the attestation line is part of the design.",
    ],
  },
  {
    name: "testimonial-focus-turn",
    type: "registry:block",
    title: "Focus Turn Testimonials",
    description:
      "One sentence at a time, resolving from blur: each quote takes the whole stage and pulls into focus word by word on the library's focus instrument, holds long enough to land, then yields. Dots below give the reader the wheel — selecting one stops the clock, because a carousel that fights the reader loses the testimonial's whole point.",
    files: [
      {
        path: "registry/blocks/testimonial-focus-turn/testimonial-focus-turn.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "focus-text"],
    categories: ["testimonials"],
    meta: { serial: "KB-248" },
    tagline: "Touch the dots and the clock stops.",
    keywords: [
      "testimonials",
      "rotation",
      "quotes",
      "focus",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "quotes",
        type: "TurnQuote[]",
        description:
          "Quote, name, role — one sentence each; the resolve carries longer ones badly.",
      },
      {
        name: "interval",
        type: "number",
        description: "Seconds each quote holds before the next resolves.",
      },
    ],
    usageNotes: [
      "The resolve belongs to focus-text; the section only rotates and keys it.",
      "Any dot press stops the auto-advance for good — reader control is one-way by design.",
      "Keep quotes to one sentence; the whole point is a line that lands whole.",
    ],
  },
  {
    name: "announce-first-light-strip",
    type: "registry:block",
    title: "First Light Strip",
    description:
      "A launch moment, not a notice: a full-bleed strip between sections where the announcement gets cinematic room — a drifting gradient behind one sealed line, one sentence, one arrow. Deliberately not dismissible and deliberately not sticky; the inline bar with a close belongs to the alert instrument. This is the page pausing to say something once.",
    files: [
      {
        path: "registry/blocks/announce-first-light-strip/announce-first-light-strip.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "gradient-drift",
      "status-seal",
    ],
    categories: ["announcement"],
    meta: { serial: "KB-249" },
    tagline: "The page pausing to say something once.",
    keywords: [
      "announcement",
      "launch",
      "strip",
      "moment",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "seal / headline / copy",
        type: "string",
        description: "The moment — one seal, one line, one sentence.",
      },
      {
        name: "actionLabel / onAction",
        type: "string · () => void",
        description: "The single arrowed path onward.",
      },
    ],
    usageNotes: [
      "No dismissal by design — dismissible notices belong to alert-bar and the launch rail.",
      "Place it between sections as a full-bleed pause, not at the page top.",
      "The drift stays behind a horizontal gradient so the line reads at both edges.",
    ],
  },
  {
    name: "footer-quiet-close",
    type: "registry:block",
    title: "Quiet Close Footer",
    description:
      "The quiet close: one row — wordmark, links, fine print — and one human sign-off line above it. For pages whose footer's whole job is to end gracefully: no columns, no form, no wordmark theatrics, just the page signing its name and stepping back. The stillness is the design.",
    files: [
      {
        path: "registry/blocks/footer-quiet-close/footer-quiet-close.tsx",
        type: "registry:block",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils"],
    categories: ["footer"],
    meta: { serial: "KB-250" },
    tagline: "The page signing its name and stepping back.",
    keywords: ["footer", "minimal", "simple", "close", "section", "marketing"],
    props: [
      {
        name: "brand / links / fineprint",
        type: "ReactNode · QuietLink[] · string",
        description: "The single row's three parts.",
      },
      {
        name: "signoff",
        type: "string",
        description: "The one human line above the legal one.",
      },
    ],
    usageNotes: [
      "Deliberately still — no motion imports at all; the stillness is the point.",
      "The sign-off is the block's voice; write it like a person, not a brand.",
      "The row wraps in thirds on narrow screens without reordering.",
    ],
  },
  {
    name: "newsletter-ledger-note",
    type: "registry:block",
    title: "Ledger Note Newsletter",
    description:
      "A newsletter note for between sections: one line of pitch, the field, and the circulation count rolling beside it — because join four thousand readers is only worth saying when the number is real enough to print. Compact by design; the full pressroom treatment belongs to its own section.",
    files: [
      {
        path: "registry/blocks/newsletter-ledger-note/newsletter-ledger-note.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "readout",
      "trace-input",
      "pressure-button",
    ],
    categories: ["newsletter"],
    meta: { serial: "KB-251" },
    tagline: "A circulation count worth printing.",
    keywords: [
      "newsletter",
      "signup",
      "inline",
      "band",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "readers / readersLabel",
        type: "number · string",
        description: "The honest circulation count, on the readout.",
      },
      {
        name: "headline / copy / cta",
        type: "string",
        description: "The one-line pitch and the ask.",
      },
      {
        name: "onSubscribe",
        type: "(email) => void",
        description: "Fired with a shape-valid address.",
      },
    ],
    usageNotes: [
      "A band, not a destination — borders top and bottom seat it between sections.",
      "Print the readers count only if it is real; the block's honesty is its pitch.",
      "The form collapses under the pitch on small screens.",
    ],
  },
  {
    name: "contact-direct-lines",
    type: "registry:block",
    title: "Direct Lines Contact",
    description:
      "Contact without a form: three direct lines, each an address you can copy verbatim — the copy control confirms in place — with who reads it, how fast, and a live pip where someone is actually on rotation now. For teams whose honest answer to contact us is an inbox with a person behind it, not a ticket funnel.",
    files: [
      {
        path: "registry/blocks/contact-direct-lines/contact-direct-lines.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "status-pip"],
    categories: ["contact"],
    meta: { serial: "KB-252" },
    tagline: "Real inboxes, stated plainly.",
    keywords: ["contact", "email", "direct", "no form", "section", "marketing"],
    props: [
      {
        name: "lines",
        type: "DirectLine[]",
        description:
          "Kicker, title, address, expectation, and whether someone is on rotation.",
      },
      {
        name: "eyebrow / headline / copy",
        type: "string",
        description: "The standfirst above the lines.",
      },
    ],
    usageNotes: [
      "Addresses are mailto links and copyable verbatim; the copy control confirms in place.",
      "The pip only appears where presence is measured — an always-on pip is a lie.",
      "A denied clipboard fails silently; the mailto link is the fallback path.",
    ],
  },
  {
    name: "gallery-cover-shelf",
    type: "registry:block",
    title: "Cover Shelf Gallery",
    description:
      "A shelf of covers in perspective: the library's coverflow banks each plate in 3D as the shelf turns — drag, wheel, and keys all come with it — and the plates are typeset covers, not images, so the shelf reads in both themes at any density. The active cover sits square; its neighbours wait at an angle, the way a shelf actually looks.",
    files: [
      {
        path: "registry/blocks/gallery-cover-shelf/gallery-cover-shelf.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "coverflow"],
    categories: ["galleries"],
    meta: { serial: "KB-253" },
    tagline: "The active cover sits square.",
    keywords: ["gallery", "coverflow", "shelf", "3d", "section", "marketing"],
    props: [
      {
        name: "covers",
        type: "ShelfCover[]",
        description: "Kicker, title, note per typeset cover.",
      },
      {
        name: "eyebrow / headline",
        type: "string",
        description: "The centered standfirst.",
      },
    ],
    usageNotes: [
      "All shelf physics belong to coverflow — banking, drag, wheel, and keyboard travel.",
      "The status line names the active cover politely as the shelf turns.",
      "Swap the typeset plates for images if you must; the shelf carries either.",
    ],
  },
  {
    name: "nav-split-desk",
    type: "registry:block",
    title: "Split Desk Navbar",
    description:
      "A split desk header: the utility row above — small links, a live status pip, quiet on purpose — and the working row below with the brand, the primary links, and the one action. The two-level shape carries products with an operations story: the top row says the thing is running; the bottom row says what it is.",
    files: [
      {
        path: "registry/blocks/nav-split-desk/nav-split-desk.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "status-pip",
      "pressure-button",
    ],
    categories: ["navbar"],
    meta: { serial: "KB-254" },
    tagline: "The top row says it is running.",
    keywords: [
      "navbar",
      "header",
      "two-level",
      "status",
      "section",
      "enterprise",
    ],
    props: [
      {
        name: "utilityLinks / statusLabel",
        type: "DeskLink[] · string",
        description: "The quiet row — small links and the live pip.",
      },
      {
        name: "links / activeHref / cta / onCta",
        type: "DeskLink[] · string · () => void",
        description: "The working row.",
      },
    ],
    usageNotes: [
      "The status pip only belongs there if presence is measured; static text is honest, a fake pip is not.",
      "The mobile fold merges both rows into one list, utility last.",
      "Under reduced motion the fold switches states in place.",
    ],
  },
  {
    name: "nav-atlas-panel",
    type: "registry:block",
    title: "Atlas Panel Navbar",
    description:
      "A navbar with an atlas: one trigger opens a full-width panel below the bar — grouped destinations with a detail line each, and a closing note for the thing worth announcing. The panel glides open on the same height motion as a fold, closes on escape or any exit, and holds the trigger's expanded state honestly. Small screens get the whole atlas as a plain stacked fold.",
    files: [
      {
        path: "registry/blocks/nav-atlas-panel/nav-atlas-panel.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "pressure-button",
    ],
    categories: ["navbar"],
    meta: { serial: "KB-255" },
    tagline: "One trigger, the whole atlas.",
    keywords: [
      "navbar",
      "mega menu",
      "panel",
      "navigation",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "panelLabel / panelGroups / panelNote",
        type: "string · groups · note",
        description:
          "The atlas — grouped entries with detail lines and a closing note.",
      },
      {
        name: "links / cta / onCta",
        type: "links · string · () => void",
        description: "Plain links beside the trigger, and the action.",
      },
    ],
    usageNotes: [
      "Escape and any outside press close the atlas; the chevron reports the true state.",
      "Every entry carries a detail line — an atlas of bare labels is just a long menu.",
      "The same atlas serves both the panel and the mobile fold, so content never forks.",
    ],
  },
  {
    name: "faq-ribbon-tabs",
    type: "registry:block",
    title: "Ribbon Tabs FAQ",
    description:
      "A FAQ on a ribbon: topic tabs ride the gantry — its indicator gliding between groups — and each panel is a drawer accordion. Two instruments, one seam: the tabs answer which conversation you are in; the drawers answer the question. For question sets too wide for one column and too shallow for a sidebar registry.",
    files: [
      {
        path: "registry/blocks/faq-ribbon-tabs/faq-ribbon-tabs.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "gantry-tabs",
      "drawer-accordion",
    ],
    categories: ["faq"],
    meta: { serial: "KB-256" },
    tagline: "Tabs pick the conversation; drawers answer.",
    keywords: ["faq", "tabs", "accordion", "topics", "section", "marketing"],
    props: [
      {
        name: "groups",
        type: "RibbonGroup[]",
        description:
          "Tab value, label, and the question/answer entries per group.",
      },
      {
        name: "eyebrow / headline",
        type: "string",
        description: "The centered standfirst.",
      },
    ],
    usageNotes: [
      "Indicator travel belongs to gantry-tabs, disclosure to drawer-accordion — the section is only the seam.",
      "Keep two to four groups; more belongs to the sidebar registry variant.",
      "Open drawers keep their state per tab visit within the mount.",
    ],
  },
  {
    name: "logo-proof-grid",
    type: "registry:block",
    title: "Proof Grid Logos",
    description:
      "The still logo wall: typographic marks in a hairline grid, resolving one after another on the cascade and then holding — for pages where the moving tape would compete with the content around it. Stillness here is a choice, not a fallback; the grid reads like a plaque, and the attestation line says what earned a place on it.",
    files: [
      {
        path: "registry/blocks/logo-proof-grid/logo-proof-grid.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["logo-cloud"],
    meta: { serial: "KB-257" },
    tagline: "A plaque, not a parade.",
    keywords: [
      "logos",
      "grid",
      "static",
      "social proof",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "marks",
        type: "ProofMark[]",
        description: "Typographic wordmarks; mono switches the stack.",
      },
      {
        name: "claim / attestation",
        type: "string",
        description: "The line above and the earned-a-place line below.",
      },
    ],
    usageNotes: [
      "Deliberately still after the cascade — the moving rail is the marquee hall's job.",
      "The attestation defines membership; a wall without criteria is decoration.",
      "Cells share hairlines through a single bordered grid, two across on small screens.",
    ],
  },
  {
    name: "hero-quiet-word",
    type: "registry:block",
    title: "Quiet Word Hero",
    description:
      "A manifesto hero: no vignette, no backdrop, no product window — one oversized sentence carrying the whole argument, with the phrase that matters swept by the highlighter as it enters. For products whose best pitch is a sentence the reader would underline themselves.",
    files: [
      {
        path: "registry/blocks/hero-quiet-word/hero-quiet-word.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "highlight-sweep",
      "pressure-button",
      "reveal-stagger",
    ],
    categories: ["hero"],
    meta: { serial: "KB-258" },
    tagline: "A sentence the reader would underline.",
    keywords: [
      "hero",
      "manifesto",
      "typographic",
      "editorial",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "lead / swept / tail",
        type: "string",
        description:
          "The sentence in three pieces; the middle one takes the sweep.",
      },
      {
        name: "copy / cta / onCta / footnote",
        type: "string · () => void",
        description:
          "The standfirst, the one action, and the quiet line under it.",
      },
    ],
    usageNotes: [
      "The sweep belongs to highlight-sweep — it draws once, on entry, and holds.",
      "Resist adding a vignette; the emptiness is what makes the sentence loud.",
      "Keep the swept phrase short — the marker reads as emphasis, not decoration.",
    ],
  },
  {
    name: "hero-agent-bench",
    type: "registry:block",
    title: "Agent Bench Hero",
    description:
      "A hero for agent products where the vignette is the composer itself: the real prompt well, wired live — type @ and the sources actually open, / and the commands do — framed as a bench window with a working seal. The reader's first act on the page is the product's core act, which is the entire argument an agent product needs to make.",
    files: [
      {
        path: "registry/blocks/hero-agent-bench/hero-agent-bench.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "prompt-well",
      "status-seal",
      "pressure-button",
      "reveal-stagger",
    ],
    categories: ["hero"],
    meta: { serial: "KB-259" },
    tagline: "The vignette is the composer, wired live.",
    keywords: ["hero", "agent", "ai", "composer", "section", "marketing"],
    props: [
      {
        name: "sources / commands / onAsk",
        type: "WellOption[] · (prompt) => void",
        description: "The live composer's offer sets and its submit.",
      },
      {
        name: "headline / copy / eyebrow / vignetteTitle",
        type: "string",
        description: "The copy column and the bench window's title rail.",
      },
      {
        name: "primaryCta / secondaryCta / onPrimary / onSecondary",
        type: "string · () => void",
        description: "Both actions.",
      },
    ],
    usageNotes: [
      "The composer is prompt-well, genuinely interactive — the copy should invite trying it.",
      "Keep the source list short and named like the reader's own files.",
      "The seal on the window rail states what the bench is reading; keep it truthful to the source list.",
    ],
  },
  {
    name: "features-spec-sheet",
    type: "registry:block",
    title: "Spec Sheet Features",
    description:
      "The product as a spec sheet: capabilities set like a chassis plate — grouped terms, mono values, one plain note each — rows resolving on the cascade as the plate enters. For readers who trust a specification more than an adjective, which is most of the readers worth having.",
    files: [
      {
        path: "registry/blocks/features-spec-sheet/features-spec-sheet.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["features"],
    meta: { serial: "KB-260" },
    tagline: "Read the spec, not the pitch.",
    keywords: [
      "features",
      "spec",
      "table",
      "technical",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "groups",
        type: "SpecGroup[]",
        description: "Heading plus term/value/note rows per group.",
      },
      {
        name: "plateLine",
        type: "string",
        description: "The stamped footer line on the plate.",
      },
    ],
    usageNotes: [
      "Values are mono and short; the note underneath carries the prose.",
      "Every line should be checkable — the copy promises lines come off the plate when untrue.",
      "The double border is the plate's chassis; keep it.",
    ],
  },
  {
    name: "features-gauge-row",
    type: "registry:block",
    title: "Gauge Row Features",
    description:
      "Capability as headroom: three needle gauges from the library's own cluster, swept to bench-condition values with their red zones showing — because a needle sitting at two-thirds with a visible redline says more about capacity than any adjective. Two notes below say what the reader is looking at and why the honesty is the feature.",
    files: [
      {
        path: "registry/blocks/features-gauge-row/features-gauge-row.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "gauge-cluster",
    ],
    categories: ["features"],
    meta: { serial: "KB-261" },
    tagline: "A needle at two-thirds beats an adjective.",
    keywords: [
      "features",
      "gauges",
      "capacity",
      "headroom",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "gauges",
        type: "Gauge[]",
        description: "The cluster's needles — value, max, unit, redline.",
      },
      {
        name: "notes / attestation",
        type: "GaugeNote[] · string",
        description: "What the reader is looking at, and the bench conditions.",
      },
    ],
    usageNotes: [
      "Needle sweep, red zones, and meter semantics belong to gauge-cluster.",
      "Set values at honest load — needles pinned at 10% read as staged.",
      "The attestation names the conditions; gauges without conditions are theatre.",
    ],
  },
  {
    name: "cta-signature-line",
    type: "registry:block",
    title: "Signature Line CTA",
    description:
      "The close as a signature line: a ledger of names instead of an email funnel — the count rolls, the latest signatures sit there as provenance, and signing asks only for a name. For communities and open registries where joining is a public act, and the page's proof is who already did.",
    files: [
      {
        path: "registry/blocks/cta-signature-line/cta-signature-line.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "readout",
      "trace-input",
      "pressure-button",
    ],
    categories: ["cta"],
    meta: { serial: "KB-262" },
    tagline: "Joining as a public act.",
    keywords: [
      "cta",
      "community",
      "registry",
      "signature",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "count / countLabel / recent",
        type: "number · string · Signature[]",
        description: "The rolling count and the provenance names.",
      },
      {
        name: "onSign",
        type: "(name) => void",
        description: "Fired once; signing increments the shown count locally.",
      },
    ],
    usageNotes: [
      "Signing asks for a name only — adding an email field turns it back into a funnel.",
      "The local increment is honest UI, not the record; wire onSign to the real ledger.",
      "Recent names render in mono italic, like a signature, not a testimonial.",
    ],
  },
  {
    name: "cta-postscript",
    type: "registry:block",
    title: "Postscript CTA",
    description:
      "The close as a postscript: after the whole page has argued, one short paragraph in the founder's voice — set like the end of a letter, signed, with a single action and one quiet alternative. It works because it drops the register: the page stops presenting and starts talking.",
    files: [
      {
        path: "registry/blocks/cta-postscript/cta-postscript.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "pressure-button",
    ],
    categories: ["cta"],
    meta: { serial: "KB-263" },
    tagline: "The page stops presenting and starts talking.",
    keywords: [
      "cta",
      "postscript",
      "founder",
      "letter",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "postscript / signature / signatureRole",
        type: "string",
        description: "The paragraph and who signs it.",
      },
      {
        name: "cta / onCta / altLabel / altHref",
        type: "string · () => void",
        description: "The one action and the quiet alternative.",
      },
    ],
    usageNotes: [
      "Keep it under four sentences or it becomes another section.",
      "The alternative is an inline text link on purpose — two buttons would raise the register again.",
      "Write the P.S. in a person's voice; the drop in register is the device.",
    ],
  },
  {
    name: "pricing-seat-counter",
    type: "registry:block",
    title: "Seat Counter Pricing",
    description:
      "Seat pricing with the arithmetic on the counter: step the seats and both numbers roll — the applicable rate, which drops at printed breaks, and the total it produces. Discrete where the usage dial is continuous: for teams who buy in people, not units, and want to see exactly where the next seat gets cheaper.",
    files: [
      {
        path: "registry/blocks/pricing-seat-counter/pricing-seat-counter.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "stepper-number",
      "readout",
      "pressure-button",
    ],
    categories: ["pricing"],
    meta: { serial: "KB-264" },
    tagline: "See where the next seat gets cheaper.",
    keywords: ["pricing", "seats", "stepper", "breaks", "section", "marketing"],
    props: [
      {
        name: "breaks",
        type: "SeatBreak[]",
        description:
          "Ascending rate breaks; the active one reads full strength.",
      },
      {
        name: "min / max / defaultSeats",
        type: "number",
        description: "The counter's range.",
      },
      {
        name: "onCta",
        type: "(seats, total) => void",
        description: "Fired with the counted crew and its total.",
      },
    ],
    usageNotes: [
      "Stepping belongs to stepper-number — keyboard, hold-to-repeat, and clamping come with it.",
      "The applicable rate is the whole-count rate, not banded — print the breaks so that is obvious.",
      "Both numerals are readouts; a break crossing rolls rate and total together.",
    ],
  },
  {
    name: "faq-last-word",
    type: "registry:block",
    title: "Last Word FAQ",
    description:
      "The questions answered in full sentences, no drawers to open: an editorial FAQ set as a two-column read, ending on the question most FAQs avoid — what is this bad at. Everything visible at once, because a page late enough to hold a FAQ owes the reader answers, not another interaction.",
    files: [
      {
        path: "registry/blocks/faq-last-word/faq-last-word.tsx",
        type: "registry:block",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils"],
    categories: ["faq"],
    meta: { serial: "KB-265" },
    tagline: "Answers owed, not interactions.",
    keywords: ["faq", "editorial", "static", "plain", "section", "marketing"],
    props: [
      {
        name: "entries",
        type: "LastWordEntry[]",
        description: "Numbered question/answer pairs, all visible.",
      },
      {
        name: "eyebrow / headline / copy",
        type: "string",
        description: "The standfirst.",
      },
    ],
    usageNotes: [
      "Deliberately still and drawer-free — the disclosure variants already exist three ways.",
      "End on the concession question; it buys the other answers their credibility.",
      "Four to six entries; more belongs in a drawer variant.",
    ],
  },
  {
    name: "usecase-two-mornings",
    type: "registry:block",
    title: "Two Mornings Use Case",
    description:
      "The same morning, twice: the old one and the new one as parallel timelines, hour marks aligned so the eye can travel across and compare beat for beat. No slider, no wipe — the two columns just sit there, because the argument is strongest when both are visible whole.",
    files: [
      {
        path: "registry/blocks/usecase-two-mornings/usecase-two-mornings.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["use-cases"],
    meta: { serial: "KB-266" },
    tagline: "Both mornings, visible whole.",
    keywords: [
      "use case",
      "before after",
      "comparison",
      "timeline",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "before / after / beforeTitle / afterTitle",
        type: "MorningBeat[] · string",
        description: "The two timelines; keep the hour marks aligned.",
      },
      {
        name: "verdict",
        type: "string",
        description: "The one-line close under the columns.",
      },
    ],
    usageNotes: [
      "Deliberately no wipe — the draggable comparison belongs to slice-compare.",
      "Use identical times in both columns; the alignment is the argument.",
      "Beats cascade in per column and then hold.",
    ],
  },
  {
    name: "usecase-scale-ladder",
    type: "registry:block",
    title: "Scale Ladder Use Case",
    description:
      "The product at three scales, set as a ladder: each rung names the size, the shape the product takes there, and — the line most pages hide — what it costs at that rung. Rungs climb in on the cascade with a rail connecting them, because the pitch is not any single rung; it is that the ladder holds all the way up.",
    files: [
      {
        path: "registry/blocks/usecase-scale-ladder/usecase-scale-ladder.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["use-cases"],
    meta: { serial: "KB-267" },
    tagline: "The ladder holds all the way up.",
    keywords: ["use case", "scale", "growth", "tiers", "section", "marketing"],
    props: [
      {
        name: "rungs",
        type: "LadderRung[]",
        description: "Scale, title, copy, and the plain cost line per rung.",
      },
      {
        name: "eyebrow / headline / copy",
        type: "string",
        description: "The standfirst.",
      },
    ],
    usageNotes: [
      "The cost line is the rung's honesty; a ladder without prices is a brochure.",
      "Three rungs read as a ladder; five read as a pricing page.",
      "Climbing never means migrating — say so in the copy if it is true.",
    ],
  },
  {
    name: "how-day-clock",
    type: "registry:block",
    title: "Day Clock How-It-Works",
    description:
      "How it works, told as a working day: four clock marks down a rail, each with what the product did at that hour and the artifact it left behind — sealed, because a claim with an artifact is a fact. The rail is plain and the entrance is a cascade; the day itself is the mechanism on display.",
    files: [
      {
        path: "registry/blocks/how-day-clock/how-day-clock.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "status-seal"],
    categories: ["how-it-works"],
    meta: { serial: "KB-268" },
    tagline: "A claim with an artifact is a fact.",
    keywords: [
      "how it works",
      "timeline",
      "day",
      "hours",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "marks",
        type: "ClockMark[]",
        description: "Time, title, copy, and the sealed artifact per mark.",
      },
      {
        name: "eyebrow / headline / copy",
        type: "string",
        description: "The standfirst.",
      },
    ],
    usageNotes: [
      "Deliberately not scroll-scrubbed — the playhead timeline belongs to timeline-spine.",
      "Every mark should leave an artifact; a mark without one is a promise, not a mechanism.",
      "Times set in mono against the rail; keep them plausible and ordered.",
    ],
  },
  {
    name: "how-exchange-script",
    type: "registry:block",
    title: "Exchange Script How-It-Works",
    description:
      "How it works, as the conversation it actually is: a scripted exchange on the library's own thread — the reader advances it turn by turn and watches the product answer, act, and file the result. The mechanism explains itself in its own medium, and the notes under each reply say what was read and what was written, which is the part worth trusting.",
    files: [
      {
        path: "registry/blocks/how-exchange-script/how-exchange-script.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "volley-thread",
      "pressure-button",
    ],
    categories: ["how-it-works"],
    meta: { serial: "KB-269" },
    tagline: "The mechanism, in its own medium.",
    keywords: [
      "how it works",
      "conversation",
      "script",
      "agent",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "script / openingTurns",
        type: "VolleyMessage[] · number",
        description: "The exchange and how much of it starts visible.",
      },
      {
        name: "advanceLabel / resetLabel",
        type: "string",
        description: "The reader's two controls.",
      },
    ],
    usageNotes: [
      "The thread is volley-thread — arrival weight, run labels, and live semantics come with it.",
      "Notes under replies carry the trust: what was read, what was written.",
      "The reader advances; nothing auto-plays.",
    ],
  },
  {
    name: "empty-cleared-desk",
    type: "registry:block",
    title: "Cleared Desk Empty State",
    description:
      "The empty state you earn rather than the one you arrive in: nothing is left, and the section says so calmly — a tally of what it took, the time it cleared, and one quiet way onward. Deliberately no celebration; the reward is the emptiness itself, and a desk that cheers every time it clears stops meaning anything by Thursday.",
    files: [
      {
        path: "registry/blocks/empty-cleared-desk/empty-cleared-desk.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "readout",
      "status-seal",
      "pressure-button",
    ],
    categories: ["empty-states"],
    meta: { serial: "KB-270" },
    tagline: "The emptiness is the reward.",
    keywords: [
      "empty state",
      "cleared",
      "inbox zero",
      "done",
      "section",
      "app",
    ],
    props: [
      {
        name: "tally",
        type: "DeskTally[]",
        description:
          "What the emptiness cost to earn; numerals roll on readout.",
      },
      {
        name: "clearedAt",
        type: "string",
        description: "The stamp on the seal.",
      },
      {
        name: "cta / altLabel",
        type: "string",
        description: "One action and one quieter one.",
      },
    ],
    usageNotes: [
      "No confetti on purpose — pair it with confetti-pop only for a genuinely once-a-quarter clear.",
      "Keep a zero in the tally when there is one; a cleared desk with nothing waiting is the whole claim.",
      "Counts roll rather than count up from zero; feed real numbers, not animations.",
    ],
  },
  {
    name: "stepform-one-question",
    type: "registry:block",
    title: "One Question Step Form",
    description:
      "The long ask, asked one question at a time: each prompt gets the whole frame, Enter carries you forward, and the rail keeps the length honest so nobody feels ambushed. A single question in flight, the answer held, the way back always open, and a summary of everything before it is sent.",
    files: [
      {
        path: "registry/blocks/stepform-one-question/stepform-one-question.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "stage-progress",
      "trace-input",
      "radio-group",
      "status-seal",
      "pressure-button",
    ],
    categories: ["step-form"],
    meta: { serial: "KB-271" },
    tagline: "One question, the whole frame.",
    keywords: [
      "step form",
      "onboarding",
      "survey",
      "one at a time",
      "section",
      "app",
    ],
    props: [
      {
        name: "questions",
        type: "OneQuestion[]",
        description: "Text or choice prompts; each carries a short rail label.",
      },
      {
        name: "onSubmit",
        type: "(answers) => void",
        description: "Fired once, on the review stage.",
      },
      {
        name: "summaryTitle / submitLabel / doneTitle / doneCopy",
        type: "string",
        description: "The last two frames.",
      },
    ],
    usageNotes: [
      "Selection never auto-advances — a form that moves by itself is a form you cannot review.",
      "Length is delegated to stage-progress; the rail is the promise that this ends.",
      "Focus follows the frame after the first move, never on first paint — landing on the page must not yank the viewport.",
      "Questions slide from the direction of travel, so Back reads as going back.",
    ],
  },
  {
    name: "team-open-bench",
    type: "registry:block",
    title: "Open Bench Team",
    description:
      "The bench as it actually stands: the people on it, and — in the same grid, in the same weight — the seats that are still empty. Most pages split these into a team section and a careers page, which quietly implies the team is finished. Showing both says the truer thing, and gives a small company one section where it needed two.",
    files: [
      {
        path: "registry/blocks/team-open-bench/team-open-bench.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "status-seal"],
    categories: ["team"],
    meta: { serial: "KB-272" },
    tagline: "The seats you have not filled are also the team.",
    keywords: ["team", "hiring", "careers", "roles", "section", "marketing"],
    props: [
      {
        name: "people / seats",
        type: "BenchPerson[] · OpenSeat[]",
        description: "The bench and the openings, rendered at the same weight.",
      },
      {
        name: "seatsTitle",
        type: "string",
        description: "Heading over the openings; the count seals itself.",
      },
    ],
    usageNotes: [
      "Seats carry a dashed border and a real href — an opening nobody can click is decoration.",
      "Write forWhom as a person, not a requirements list; the seat is the pitch.",
      "Initials derive from the name unless you pass them.",
    ],
  },
  {
    name: "testimonial-case-column",
    type: "registry:block",
    title: "Case Column Testimonial",
    description:
      "One customer, told at length: a single narrow column of narrative with the measured results pinned in the margin and one line lifted out onto the balance instrument. The wall variants prove breadth by counting voices; this one proves depth by staying with a single yard long enough to say what actually changed, and in what order.",
    files: [
      {
        path: "registry/blocks/testimonial-case-column/testimonial-case-column.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "balance-quote",
      "readout",
    ],
    categories: ["testimonials"],
    meta: { serial: "KB-273" },
    tagline: "Depth, where the wall proves breadth.",
    keywords: [
      "testimonial",
      "case study",
      "customer story",
      "long form",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "paragraphs / pullQuote / pullAfter",
        type: "string[] · string · number",
        description: "The story and where the quote is lifted out of it.",
      },
      {
        name: "results",
        type: "CaseResult[]",
        description: "The margin numerals, with optional prefix and suffix.",
      },
    ],
    usageNotes: [
      "The pull quote belongs to balance-quote — never re-set it as styled text.",
      "Order the paragraphs by what changed first; a case study that lists benefits is an ad.",
      "The margin stacks above the story below lg; keep results to three or four.",
    ],
  },
  {
    name: "content-margin-notes",
    type: "registry:block",
    title: "Margin Notes Content",
    description:
      "An editorial passage with its annotations in the margin, aligned to the paragraph each one belongs to — the shape of a marked-up document rather than a marketing page. Nothing pops or reveals: the notes are simply there, beside the sentence they qualify, which is what makes a claim readable as argument instead of assertion.",
    files: [
      {
        path: "registry/blocks/content-margin-notes/content-margin-notes.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["content-sections"],
    meta: { serial: "KB-274" },
    tagline: "Argument, not assertion.",
    keywords: [
      "content",
      "editorial",
      "annotations",
      "margin",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "passages",
        type: "MarginPassage[]",
        description: "Paragraphs, each with an optional margin note.",
      },
      {
        name: "standfirst / signature",
        type: "string",
        description: "The opening and the document's foot.",
      },
    ],
    usageNotes: [
      "Below the margin breakpoint notes fold in under their paragraph on a rule, still attached.",
      "Notes warm on hover through the group only — no state, no reveal; the alignment is the device.",
      "Leave paragraphs unannotated where there is nothing to qualify; a note on every line is a footnote habit, not an argument.",
    ],
  },
  {
    name: "proof-live-floor",
    type: "registry:block",
    title: "Live Floor Social Proof",
    description:
      "Proof as the floor itself, running: a live feed of what is happening across every yard right now, arriving on the conveyor with the standing counts above it. Where the evidence band assembles a case from logos, metrics, and a quote, this one makes the simpler and harder argument — that the thing is in use at this moment, and here is it happening.",
    files: [
      {
        path: "registry/blocks/proof-live-floor/proof-live-floor.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "conveyor-list",
      "readout",
      "status-pip",
    ],
    categories: ["social-proof"],
    meta: { serial: "KB-275" },
    tagline: "Somewhere it is 06:40.",
    keywords: [
      "social proof",
      "live feed",
      "activity",
      "conveyor",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "events",
        type: "FloorEvent[]",
        description: "The pool the feed cycles through; keep places coarse.",
      },
      {
        name: "interval / visible",
        type: "number",
        description:
          "Seconds between arrivals, and rows held before the overflow count.",
      },
      {
        name: "counts",
        type: "FloorCount[]",
        description: "The standing numbers above the feed.",
      },
    ],
    usageNotes: [
      "Rotation is deterministic — the server renders tick 0 and the client walks the same pool, so there is no hydration drift and no clock.",
      "Each arrival gets a fresh row key; reusing an event id would read to the conveyor as a reorder, not an arrival.",
      "Never name customers in the feed. Coarse places are proof; a customer list is a leak.",
      "Ages come from row position, not timestamps — nothing here needs to be true to the second to be honest.",
    ],
  },
  {
    name: "integrations-two-way",
    type: "registry:block",
    title: "Two-Way Integrations",
    description:
      "Integrations answered honestly: not which logos we have, but which direction the data actually moves, what is read, what is written, and how often. For the buyer who has been burned by an integration that turned out to be a nightly CSV, and who will ask the question in the second call if the page does not answer it in the first.",
    files: [
      {
        path: "registry/blocks/integrations-two-way/integrations-two-way.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "status-seal"],
    categories: ["integrations"],
    meta: { serial: "KB-276" },
    tagline: "Which way the data actually goes.",
    keywords: [
      "integrations",
      "sync",
      "direction",
      "data flow",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "flows",
        type: "IntegrationFlow[]",
        description: "Each connection with its direction and both payloads.",
      },
      {
        name: "caveat",
        type: "string",
        description: "The footnote most integration pages omit.",
      },
    ],
    usageNotes: [
      "Deliberately unfiltered — browsing a catalogue belongs to the patch bay; this page answers one question.",
      "Only claim two-way when both halves are live; the section's whole value is that the claim is checkable.",
      "State sync intervals as floors, and mean it.",
    ],
  },
  {
    name: "datatable-run-history",
    type: "registry:block",
    title: "Run History Table",
    description:
      "A report grid where each row carries its own history: the latest number, the outcome, and the last eight runs plotted small beside them, so a row that is fine today but drifting is visible without opening anything. The ops desk is for working a dataset; this one is for reading a trend across rows at a glance.",
    files: [
      {
        path: "registry/blocks/datatable-run-history/datatable-run-history.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "spark-chart",
      "readout",
      "status-seal",
    ],
    categories: ["data-tables"],
    meta: { serial: "KB-277" },
    tagline: "Where a row tells you it is in trouble.",
    keywords: [
      "data table",
      "runs",
      "history",
      "sparkline",
      "trend",
      "section",
      "app",
    ],
    props: [
      {
        name: "rows",
        type: "RunRow[]",
        description:
          "Name, outcome, latest duration, and the run history behind it.",
      },
      {
        name: "durationLabel / historyLabel",
        type: "string",
        description: "Column captions, reused as the mobile labels.",
      },
    ],
    usageNotes: [
      "Nothing sorts on purpose — the argument is the shape of each line, and sorting belongs to the ops desk.",
      "Every sparkline is a real spark-chart, so each row carries its own sr-only summary sentence.",
      "The drifting row is the point: seed a series that is fine today and clearly heading somewhere.",
    ],
  },
  {
    name: "hero-compare-wipe",
    type: "registry:block",
    title: "Compare Wipe Hero",
    description:
      "A hero for products that replace something: the argument on the left, and on the right the same morning twice with a blade between them the reader drags themselves. Handing over the blade is the point — a claim the visitor proves with their own hand in the first ten seconds is worth more than any headline.",
    files: [
      {
        path: "registry/blocks/hero-compare-wipe/hero-compare-wipe.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "slice-compare",
      "pressure-button",
    ],
    categories: ["hero"],
    meta: { serial: "KB-278" },
    tagline: "The visitor proves it themselves.",
    keywords: [
      "hero",
      "before after",
      "compare",
      "wipe",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "before / after",
        type: "WipeLine[]",
        description: "The same timeline twice; keep the times identical.",
      },
      {
        name: "beforeLabel / afterLabel",
        type: "string",
        description: "The blade's two side labels.",
      },
    ],
    usageNotes: [
      "The wipe belongs to slice-compare — never re-implement the blade or its drag.",
      "Both panels must show the same hours, or the comparison is rhetoric rather than evidence.",
      "Keep the after panel boring; 'no change' twice is the strongest line in it.",
    ],
  },
  {
    name: "hero-gallery-wall",
    type: "registry:block",
    title: "Gallery Wall Hero",
    description:
      "A visual-first hero for work that has to be seen: the claim sits small above a wall of plates that runs the full bleed, scrollable by hand or by keyboard on the library's own gallery. The copy deliberately yields — on a page selling images, a headline competing with the images is a headline in the way.",
    files: [
      {
        path: "registry/blocks/hero-gallery-wall/hero-gallery-wall.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "kinetic-gallery",
      "pressure-button",
    ],
    categories: ["hero"],
    meta: { serial: "KB-279" },
    tagline: "The copy yields to the work.",
    keywords: [
      "hero",
      "gallery",
      "visual",
      "portfolio",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "plates",
        type: "WallPlate[]",
        description: "Each plate's face label, caption, and wash.",
      },
      {
        name: "wash",
        type: "string",
        description:
          "Any CSS background; swap for real artwork and nothing else changes.",
      },
    ],
    usageNotes: [
      "Scrolling, snapping, and keyboard travel come from kinetic-gallery.",
      "Keep the headline short — it is a caption for the wall, not a pitch.",
      "The wash is a stand-in; real images want the same aspect box and nothing more.",
    ],
  },
  {
    name: "hero-price-forward",
    type: "registry:block",
    title: "Price Forward Hero",
    description:
      "A hero that leads with the price. Most pages spend the fold establishing that they are worth asking about; this one answers the question the visitor came with and lets the rest of the page earn the number afterwards. It only works with simple pricing and nothing hidden below.",
    files: [
      {
        path: "registry/blocks/hero-price-forward/hero-price-forward.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "readout",
      "pressure-button",
    ],
    categories: ["hero"],
    meta: { serial: "KB-280" },
    tagline: "Answer the question they arrived with.",
    keywords: [
      "hero",
      "pricing",
      "transparent",
      "single plan",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "price / currency / period",
        type: "number · string",
        description: "The number, on its own plate.",
      },
      {
        name: "includes / footnote",
        type: "string[] · string",
        description: "What it covers, and the line that makes it believable.",
      },
    ],
    usageNotes: [
      "A headline price with an asterisk is worse than no price at all — only use this when nothing is hidden below.",
      "The footnote is load-bearing: say how billing ends before anyone asks.",
      "The numeral is a readout, so a price experiment rolls rather than cuts.",
    ],
  },
  {
    name: "features-pinned-scroll",
    type: "registry:block",
    title: "Pinned Scroll Features",
    description:
      "The feature tour that uses the scroll it already has: the stage pins and scenes cross-fade under it as the reader moves, so the sequence is paced by the page rather than by a control. The pinning and the hand-off between scenes belong entirely to the sticky instrument.",
    files: [
      {
        path: "registry/blocks/features-pinned-scroll/features-pinned-scroll.tsx",
        type: "registry:block",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils", "sticky-reveal"],
    categories: ["features"],
    meta: { serial: "KB-281" },
    tagline: "Paced by the page, not a control.",
    keywords: [
      "features",
      "scroll",
      "pinned",
      "sequence",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "scenes",
        type: "PinnedScene[]",
        description: "Each beat's step, title, copy, and mono face lines.",
      },
      {
        name: "height",
        type: "number",
        description: "Pinned stage height in px.",
      },
    ],
    usageNotes: [
      "Pinning is sticky-reveal's — never re-implement scroll pinning in the section.",
      "Four beats is the ceiling; a pinned stage that outstays its scroll reads as a hang.",
      "Pair with relay-tabs only if the page is long; both on one page competes for the same attention.",
    ],
  },
  {
    name: "features-quiet-grid",
    type: "registry:block",
    title: "Quiet Grid Features",
    description:
      "The restrained one: a plain grid of claims, numbered, with nothing moving but their arrival. Every library needs the section you reach for when the page already has three interactive ones and this part simply has to be read — a page where everything earns attention has none left to give.",
    files: [
      {
        path: "registry/blocks/features-quiet-grid/features-quiet-grid.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["features"],
    meta: { serial: "KB-282" },
    tagline: "The one that just has to be read.",
    keywords: [
      "features",
      "grid",
      "plain",
      "restrained",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "features",
        type: "QuietFeature[]",
        description: "Title and copy per claim; numbering is automatic.",
      },
      {
        name: "columns",
        type: "2 | 3",
        description: "Columns at the widest breakpoint.",
      },
    ],
    usageNotes: [
      "Deliberately still — reach for the bento, the tour, or the gauge row when a claim needs proving.",
      "Six or four claims; an odd number leaves a hole in the last row at three columns.",
      "No icons on purpose. An icon per claim is decoration pretending to be information.",
    ],
  },
  {
    name: "features-persona-switch",
    type: "registry:block",
    title: "Persona Switch Features",
    description:
      "The same product, argued three ways: a control picks the reader, and the claims swap for the ones that person actually cares about. It solves the real problem of a mixed audience without the usual answer — three near-identical feature sections stacked down the page.",
    files: [
      {
        path: "registry/blocks/features-persona-switch/features-persona-switch.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "segmented-control",
    ],
    categories: ["features"],
    meta: { serial: "KB-283" },
    tagline: "What it is for depends where you stand.",
    keywords: [
      "features",
      "personas",
      "audience",
      "switch",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "personas",
        type: "Persona[]",
        description: "Each reader's lede and three claims.",
      },
      {
        name: "eyebrow / headline / copy",
        type: "string",
        description: "The standfirst above the control.",
      },
    ],
    usageNotes: [
      "The thumb's travel belongs to segmented-control; the section only swaps content under it.",
      "Write genuinely different claims per persona — if two personas share a point, the section is decoration.",
      "The control keeps its own scroll rail so long labels never widen the page at 360.",
    ],
  },
  {
    name: "pricing-credit-packs",
    type: "registry:block",
    title: "Credit Packs Pricing",
    description:
      "Prepaid credits, with the per-credit rate computed rather than claimed: every pack prints what it actually works out to, so the discount is checkable instead of asserted. The seat counter prices people and the usage dial prices continuous volume — this is for products metered in discrete work.",
    files: [
      {
        path: "registry/blocks/pricing-credit-packs/pricing-credit-packs.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "readout",
      "status-seal",
      "pressure-button",
    ],
    categories: ["pricing"],
    meta: { serial: "KB-284" },
    tagline: "The discount is checkable, not asserted.",
    keywords: [
      "pricing",
      "credits",
      "prepaid",
      "packs",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "packs",
        type: "CreditPack[]",
        description:
          "Credits and price per pack; the rate is derived, never authored.",
      },
      {
        name: "unitLine / terms",
        type: "string · string[]",
        description: "What a credit buys, and what makes prepaid fair.",
      },
    ],
    usageNotes: [
      "Never author the per-credit rate — it is computed, so a pack cannot quietly disagree with its own arithmetic.",
      "Say what one credit buys in the same breath, or the numbers mean nothing.",
      "Expiry is the whole trust question for prepaid: answer it in the terms row.",
    ],
  },
  {
    name: "pricing-where-it-goes",
    type: "registry:block",
    title: "Where It Goes Pricing",
    description:
      "Not a plan chooser — a justification: where the price actually goes, one bar per line, adding to the whole. A page that only states a number invites the reader to guess what it pays for, and buyers who feel overcharged usually just mean uninformed.",
    files: [
      {
        path: "registry/blocks/pricing-where-it-goes/pricing-where-it-goes.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "readout"],
    categories: ["pricing"],
    meta: { serial: "KB-285" },
    tagline: "Show the split, don't defend the number.",
    keywords: [
      "pricing",
      "transparency",
      "breakdown",
      "trust",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "slices",
        type: "CostSlice[]",
        description: "Each line's declared share and what it covers.",
      },
      {
        name: "price / period",
        type: "number · string",
        description: "The number being accounted for.",
      },
    ],
    usageNotes: [
      "Shares are declared once; bar width and printed percentage both derive from them, so the section cannot disagree with itself.",
      "Pair it with a pricing section that actually sells — this one explains, it does not close.",
      "Own the rounding in the footnote rather than fudging the shares to hit a hundred.",
    ],
  },
  {
    name: "cta-book-slot",
    type: "registry:block",
    title: "Book a Slot CTA",
    description:
      'The close as a specific time: real slots on real days, taken ones visibly spent, and the promise of what the half hour actually contains printed beside them. A "book a demo" button asks the visitor to start a negotiation; a grid of times asks them to pick one, which is a far smaller thing to agree to.',
    files: [
      {
        path: "registry/blocks/cta-book-slot/cta-book-slot.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "status-seal",
      "pressure-button",
    ],
    categories: ["cta"],
    meta: { serial: "KB-286" },
    tagline: "Picking a time is smaller than starting a negotiation.",
    keywords: ["cta", "booking", "demo", "calendar", "section", "marketing"],
    props: [
      {
        name: "days",
        type: "BookDay[]",
        description:
          "Pre-formatted day labels and their slots; taken ones strike through.",
      },
      {
        name: "promise",
        type: "string[]",
        description: "What the half hour contains — the reason to pick at all.",
      },
    ],
    usageNotes: [
      "Labels are pre-formatted strings on purpose: the section never touches a clock, so it can never disagree with the server about today.",
      "Leave some slots taken. A grid where everything is free reads as a grid nobody booked.",
      "The promise list does the persuading; the times only lower the cost of saying yes.",
    ],
  },
  {
    name: "cta-last-objection",
    type: "registry:block",
    title: "Last Objection CTA",
    description:
      "The close that names the reason the reader has not acted, and answers it in their own words. By this point the argument is made and the only thing left is doubt — so the section says the doubts out loud, including the one about leaving. Answering the exit question honestly is what makes the other answers believable.",
    files: [
      {
        path: "registry/blocks/cta-last-objection/cta-last-objection.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "pressure-button",
    ],
    categories: ["cta"],
    meta: { serial: "KB-287" },
    tagline: "Say the doubt out loud, then answer it.",
    keywords: ["cta", "objections", "doubts", "close", "section", "marketing"],
    props: [
      {
        name: "objections",
        type: "Objection[]",
        description: "The doubt in the reader's voice, and the answer.",
      },
      {
        name: "cta / altLabel",
        type: "string",
        description: "The action and the softer path.",
      },
    ],
    usageNotes: [
      "Write doubts in the reader's voice, not a strawman you enjoy knocking down.",
      "Always include the exit question; it is what makes the other three credible.",
      "Four is the ceiling — past that it reads as a page arguing with itself.",
    ],
  },
  {
    name: "stats-rank-race",
    type: "registry:block",
    title: "Rank Race Stats",
    description:
      'Standings that re-rank in front of you: pick a year and the bars re-order themselves, so the story is the movement rather than the values. The band and the dial both answer "how much"; this one answers "who overtook whom", which is the only question a ranked list is actually good at.',
    files: [
      {
        path: "registry/blocks/stats-rank-race/stats-rank-race.tsx",
        type: "registry:block",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils", "bar-race", "segmented-control"],
    categories: ["stats"],
    meta: { serial: "KB-288" },
    tagline: "Who overtook whom.",
    keywords: ["stats", "ranking", "race", "over time", "section", "marketing"],
    props: [
      {
        name: "periods",
        type: "RankPeriod[]",
        description:
          "Each period's standings and the line saying what changed.",
      },
      {
        name: "unit",
        type: "string",
        description: "Trailing unit on each bar's readout.",
      },
    ],
    usageNotes: [
      "Re-ranking, bar travel, and the trailing readouts all belong to bar-race — the section only swaps the standings.",
      "Keep item ids stable across periods or nothing can be seen to overtake anything.",
      "Every period needs its note; a re-rank the reader has to interpret alone is a chart, not a claim.",
    ],
  },
  {
    name: "stats-ring-set",
    type: "registry:block",
    title: "Ring Set Stats",
    description:
      "Four proportions on one scale, read as wedges rather than numerals: the radial set makes shares comparable at a glance in a way four separate percentages never are, and every wedge carries a plain sentence saying what it counts. It wants values with real spread — four numbers inside a twenty point band are indistinguishable as wedges.",
    files: [
      {
        path: "registry/blocks/stats-ring-set/stats-ring-set.tsx",
        type: "registry:block",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils", "radial-bars", "status-seal"],
    categories: ["stats"],
    meta: { serial: "KB-289" },
    tagline: "Comparable at a glance, defined in plain words.",
    keywords: [
      "stats",
      "radial",
      "shares",
      "percentages",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "data / max",
        type: "RadialBar[] · number",
        description: "The wedges and the value that reaches the outer radius.",
      },
      {
        name: "notes",
        type: "RingNote[]",
        description: "One plain sentence per wedge saying what it counts.",
      },
    ],
    usageNotes: [
      "All four values must be shares of the same population, or the shared scale lies.",
      "A percentage without a definition is decoration — the notes column is not optional.",
      "Give it spread. Values inside a twenty point band render as four wedges of the same length, and the section stops making its own argument.",
      "Let the weakest number in; four numbers above ninety persuade nobody.",
    ],
  },
  {
    name: "trust-incident-log",
    type: "registry:block",
    title: "Incident Log Trust",
    description:
      "Trust argued from the incidents rather than the certificates: every failure of the last year, what actually happened in plain words, and what changed because of it. The vault brief states the controls; this states the times the controls were not enough — the harder claim, and the one an experienced buyer is testing for.",
    files: [
      {
        path: "registry/blocks/trust-incident-log/trust-incident-log.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "readout",
      "status-seal",
    ],
    categories: ["trust"],
    meta: { serial: "KB-290" },
    tagline: "A page with no incidents is a page not counting.",
    keywords: [
      "trust",
      "incidents",
      "postmortem",
      "reliability",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "incidents",
        type: "Incident[]",
        description:
          "Each failure with its minutes, what happened, and what changed.",
      },
      {
        name: "windowLabel / totalMinutesLabel",
        type: "string",
        description: "Captions for the two derived counters.",
      },
    ],
    usageNotes: [
      "Counters derive from the incidents — the totals cannot drift from the list.",
      "Write 'what happened' without euphemism; 'a brief service interruption' undoes the entire section.",
      "Dates are pre-formatted strings, so the section never touches a clock.",
      "Publish the embarrassing one. A log of three tidy incidents reads as a curated log.",
    ],
  },
  {
    name: "trust-data-residency",
    type: "registry:block",
    title: "Data Residency Trust",
    description:
      "The question a serious buyer asks third: where does our data actually sit, how long do you keep it, and who outside your company can see it. Answered as a table with a row per kind of data — including the two rows most pages omit, billing and error traces — and the full subprocessor list underneath.",
    files: [
      {
        path: "registry/blocks/trust-data-residency/trust-data-residency.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["trust"],
    meta: { serial: "KB-291" },
    tagline: "Where it sits, how long, and who sees it.",
    keywords: [
      "trust",
      "data",
      "residency",
      "retention",
      "subprocessors",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "rows",
        type: "ResidencyRow[]",
        description: "Kind, location, retention, and who can see it.",
      },
      {
        name: "subprocessors / noticeLine",
        type: "Subprocessor[] · string",
        description: "Everyone data is handed to, and the notice commitment.",
      },
    ],
    usageNotes: [
      "Include billing and error traces. Omitting the awkward rows is what makes the table worth reading.",
      '"Nobody" reads in the success colour, so it must be literally true — including your own staff.',
      "The notice line is prose, not a seal: seals do not wrap, and this is a sentence.",
    ],
  },
  {
    name: "usecase-not-for-you",
    type: "registry:block",
    title: "Not For You Use Case",
    description:
      "The use-case section that also says who it is not for — and sends those readers somewhere else by name. Pages that only list good fits leave the reader to work out the bad ones alone, usually after a trial and a disappointment. Naming the misfits costs a few unqualified signups and buys every remaining claim its credibility.",
    files: [
      {
        path: "registry/blocks/usecase-not-for-you/usecase-not-for-you.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["use-cases"],
    meta: { serial: "KB-292" },
    tagline: "Name the misfits and send them elsewhere.",
    keywords: [
      "use cases",
      "fit",
      "qualification",
      "honesty",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "goodFits / badFits",
        type: "FitCase[]",
        description: "Both lists, at equal weight.",
      },
      {
        name: "instead",
        type: "string",
        description:
          "Where a misfit should go instead — the line that makes it generous rather than coy.",
      },
    ],
    usageNotes: [
      "Every bad fit needs an `instead`, or the column reads as false modesty.",
      "Make the misfits real. A 'not for you' list of strawmen is worse than no list.",
      "Keep both columns the same length; an unbalanced pair looks like hedging.",
    ],
  },
  {
    name: "usecase-job-stories",
    type: "registry:block",
    title: "Job Stories Use Case",
    description:
      "Use cases written as job stories rather than personas: the situation, the motivation, the outcome — and then, unusually, the single thing in the product that serves it. A job story without that last line is a nice sentence about a customer; with it, the section becomes a map from circumstance to feature the reader can check.",
    files: [
      {
        path: "registry/blocks/usecase-job-stories/usecase-job-stories.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["use-cases"],
    meta: { serial: "KB-293" },
    tagline: "Situations, not job titles.",
    keywords: [
      "use cases",
      "job stories",
      "jobs to be done",
      "situations",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "stories",
        type: "JobStory[]",
        description: "When / want / so-that, plus the thing that serves it.",
      },
      {
        name: "servedLabel",
        type: "string",
        description: "Caption over the serving line.",
      },
    ],
    usageNotes: [
      "The `served` line is what separates this from a wall of nice sentences — never leave it out.",
      "Write situations, not roles: the same person wants different things at different hours.",
      "The connectives are set in the muted ink so the story reads as one sentence, not three fields.",
    ],
  },
  {
    name: "how-who-does-what",
    type: "registry:block",
    title: "Who Does What How-It-Works",
    description:
      "How it works, answered as who does the work: three lanes — your side, the product, and ours — with each step in the lane that owns it. Most how-it-works sections quietly imply the reader does everything or nothing; this one commits to a division of labour, which is what a buyer is really asking when they ask how long it takes.",
    files: [
      {
        path: "registry/blocks/how-who-does-what/how-who-does-what.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["how-it-works"],
    meta: { serial: "KB-294" },
    tagline: "A division of labour, committed to.",
    keywords: [
      "how it works",
      "lanes",
      "responsibility",
      "onboarding",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "steps",
        type: "HandoffStep[]",
        description: "Each step's owning lane, copy, and effort line.",
      },
      {
        name: "lanes",
        type: "Record<LaneOwner, string>",
        description: "Lane names: your side, the product, ours.",
      },
    ],
    usageNotes: [
      "The effort line is the honest part — a lane diagram without durations answers nothing.",
      "Lanes collapse below md and each step names its own owner inline, so nothing depends on column position at 360.",
      "Give your own team real steps. Three lanes where one is empty is a two-lane diagram with a decoration.",
    ],
  },
  {
    name: "how-plain-steps",
    type: "registry:block",
    title: "Plain Steps How-It-Works",
    description:
      "Three steps, numbered, and nothing else. The clock, the script, the station line and the lanes all do something with the sequence; sometimes a page has already spent its interaction budget and how-it-works simply has to be read in eight seconds. This is that section, and its restraint is the feature.",
    files: [
      {
        path: "registry/blocks/how-plain-steps/how-plain-steps.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["how-it-works"],
    meta: { serial: "KB-295" },
    tagline: "Readable in eight seconds.",
    keywords: [
      "how it works",
      "steps",
      "plain",
      "restrained",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "steps",
        type: "PlainStep[]",
        description: "Three steps; numbering is automatic.",
      },
      {
        name: "footnote",
        type: "string",
        description: "The honest line under the steps.",
      },
    ],
    usageNotes: [
      "Reach for it when the page is already busy above — pairing it with the station line wastes both.",
      "Three steps. If the process genuinely needs five, it needs a different section.",
      "The standfirst copy is optional here; the headline and the steps are usually enough.",
    ],
  },
  {
    name: "logo-segment-shelf",
    type: "registry:block",
    title: "Segment Shelf Logo Cloud",
    description:
      'The logo wall organised by trade, with the count each mark stands in for. A grid of names answers "who", but a buyer is really asking "anyone like me" — so this one groups by segment and prints how many are behind each shelf, turning a dozen wordmarks into two hundred customers without claiming a single one it cannot name.',
    files: [
      {
        path: "registry/blocks/logo-segment-shelf/logo-segment-shelf.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "readout"],
    categories: ["logo-cloud"],
    meta: { serial: "KB-296" },
    tagline: "Anyone like me?",
    keywords: [
      "logo cloud",
      "segments",
      "industries",
      "customers",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "segments",
        type: "LogoSegment[]",
        description:
          "Each trade with its total count and the marks that agreed to be named.",
      },
      {
        name: "eyebrow / headline / copy",
        type: "string",
        description: "The standfirst.",
      },
    ],
    usageNotes: [
      "The count is everyone; the marks are the ones who consented. Say so, or the gap looks like padding.",
      "Wordmarks are set in mono with wide tracking, so no image files and no logo licensing.",
      "Group by the buyer's own words for their trade, not by your internal segmentation.",
    ],
  },
  {
    name: "logo-receipt-wall",
    type: "registry:block",
    title: "Receipt Wall Logo Cloud",
    description:
      "A logo wall where every mark carries the number it earned. Bare wordmarks ask the reader to assume the relationship went well; a mark with a measured result attached makes the far stronger claim, and the customer had to agree to the number as well as the name.",
    files: [
      {
        path: "registry/blocks/logo-receipt-wall/logo-receipt-wall.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "readout"],
    categories: ["logo-cloud"],
    meta: { serial: "KB-297" },
    tagline: "Six with receipts beat thirty without.",
    keywords: [
      "logo cloud",
      "proof",
      "results",
      "customers",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "receipts",
        type: "LogoReceipt[]",
        description:
          "A mark, the measurement it published, and what that measurement is.",
      },
      {
        name: "footnote",
        type: "string",
        description: "Who measured, and over what window.",
      },
    ],
    usageNotes: [
      "Use fewer, better marks — a wall of thirty logos cannot carry thirty numbers anyone will read.",
      "Let the customer pick their own metric; the flat ones are what make the strong ones believable.",
      "Every numeral is a readout, so a wall of results rolls in rather than printing cold.",
    ],
  },
  {
    name: "announce-ship-note",
    type: "registry:block",
    title: "Ship Note Announcement",
    description:
      "The week's shipping note as a strip between sections: a version, a date, and three lines that say what actually changed — tagged new, changed, or fixed, with the fix shown rather than hidden. A product that publishes its fixes in the same voice as its features makes a cheap and unusually convincing claim about how it is run.",
    files: [
      {
        path: "registry/blocks/announce-ship-note/announce-ship-note.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "status-seal"],
    categories: ["announcement"],
    meta: { serial: "KB-298" },
    tagline: "Publish the fixes in the same voice as the features.",
    keywords: [
      "announcement",
      "changelog",
      "release",
      "shipped",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "lines",
        type: "ShipLine[]",
        description: "Three at most, each tagged added, changed, or fixed.",
      },
      {
        name: "version / date",
        type: "string",
        description:
          "Release name and a pre-formatted date — no clock is touched.",
      },
    ],
    usageNotes: [
      "Always include a fix. A ship note of pure features reads as marketing wearing a changelog's clothes.",
      "Three lines. The full list belongs behind the link.",
      "It is a strip, not a section — it sits between two sections and carries its own top and bottom rules.",
    ],
  },
  {
    name: "announce-scheduled-window",
    type: "registry:block",
    title: "Scheduled Window Announcement",
    description:
      "The announcement nobody wants to make, made well: a scheduled window with what will actually stop, what will keep working, and why — in that order, because the second list is the one that decides whether anyone has to change their morning.",
    files: [
      {
        path: "registry/blocks/announce-scheduled-window/announce-scheduled-window.tsx",
        type: "registry:block",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils", "status-pip"],
    categories: ["announcement"],
    meta: { serial: "KB-299" },
    tagline: "The unwelcome notice, done calmly.",
    keywords: [
      "announcement",
      "maintenance",
      "status",
      "downtime",
      "section",
      "app",
    ],
    props: [
      {
        name: "affected / unaffected",
        type: "string[]",
        description: "What stops, and what keeps working.",
      },
      {
        name: "window / reason",
        type: "string",
        description: "The pre-formatted window and why it is happening.",
      },
    ],
    usageNotes: [
      "Deliberately no countdown — a ticking clock turns planned maintenance into an emergency.",
      'The "keeps working" column is the one people read; make it specific and make it true.',
      "Give the reason. A window without one reads as an outage you scheduled.",
    ],
  },
  {
    name: "empty-no-matches",
    type: "registry:block",
    title: "No Matches Empty State",
    description:
      "Nothing matched — said as a diagnosis rather than a shrug. Every active filter is listed with the number of rows that would come back if it alone were dropped, so the reader can see which one is doing the damage and remove exactly that one. The usual empty result leaves you to guess; this hands over the arithmetic.",
    files: [
      {
        path: "registry/blocks/empty-no-matches/empty-no-matches.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "readout",
      "pressure-button",
    ],
    categories: ["empty-states"],
    meta: { serial: "KB-300" },
    tagline: "Hand over the arithmetic.",
    keywords: [
      "empty state",
      "no results",
      "filters",
      "search",
      "section",
      "app",
    ],
    props: [
      {
        name: "filters",
        type: "ActiveFilter[]",
        description: "Each active filter with what would return without it.",
      },
      {
        name: "onDrop / onClearAll",
        type: "(id) => void · () => void",
        description: "Removing one filter, or all of them.",
      },
    ],
    usageNotes: [
      "The culprit is derived, never authored: whichever filter alone returns nothing is the one marked.",
      "wouldReturn must come from a real count. A guessed number here is worse than no number.",
      "Filters exit leftward and the list reflows on layout, so removing one reads as a narrowing being undone.",
    ],
  },
  {
    name: "empty-needs-access",
    type: "registry:block",
    title: "Needs Access Empty State",
    description:
      "Locked out, without the dead end: it names the exact resource, the exact permission missing, and — the part almost every access screen omits — the people who can actually grant it, so the reader can act without opening a support ticket.",
    files: [
      {
        path: "registry/blocks/empty-needs-access/empty-needs-access.tsx",
        type: "registry:block",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils", "status-seal", "pressure-button"],
    categories: ["empty-states"],
    meta: { serial: "KB-301" },
    tagline: "Name the people who can say yes.",
    keywords: [
      "empty state",
      "permissions",
      "access",
      "locked",
      "section",
      "app",
    ],
    props: [
      {
        name: "resource / permission",
        type: "string",
        description: "Named exactly, in the system's own words.",
      },
      {
        name: "approvers / afterLine",
        type: "Approver[] · string",
        description: "Who can grant it, and what happens after asking.",
      },
    ],
    usageNotes: [
      "Naming approvers is the whole point — an access wall without them is a support ticket with extra steps.",
      "Say the account is fine. Most people read a permission screen as an accusation.",
      "The after-line is announced politely rather than assertively, so nobody is left refreshing.",
    ],
  },
  {
    name: "stepform-branching-intake",
    type: "registry:block",
    title: "Branching Intake Step Form",
    description:
      "A branching intake: the first answer decides the route, and the rail visibly re-forms to the length that route actually takes — two stages, or three, or one. Long forms lose people because the end is invisible; a form that shortens itself in front of you when you say who you are makes the opposite promise.",
    files: [
      {
        path: "registry/blocks/stepform-branching-intake/stepform-branching-intake.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "stage-progress",
      "trace-input",
      "radio-group",
      "status-seal",
      "pressure-button",
    ],
    categories: ["step-form"],
    meta: { serial: "KB-302" },
    tagline: "Say who you are and the form gets shorter.",
    keywords: ["step form", "branching", "intake", "routing", "section", "app"],
    props: [
      {
        name: "routes",
        type: "IntakeRoute[]",
        description: "Each route carries its own steps and its own outcome.",
      },
      {
        name: "onSubmit",
        type: "(routeId, answers) => void",
        description: "Fired with the route taken and everything gathered.",
      },
    ],
    usageNotes: [
      "The rail is derived from the chosen route, so picking a different one re-forms it — that visible shortening is the whole device.",
      "Give at least one route a single step. A branching form where every branch is the same length is a straight form with extra clicks.",
      "Each route states its own outcome; a shared closing line wastes the routing.",
    ],
  },
  {
    name: "stepform-resume-later",
    type: "registry:block",
    title: "Resume Later Step Form",
    description:
      "The long form that admits it is long: every section listed with what it asks for and how many minutes it takes, what is already done, and — the part that makes it usable — which sections somebody else has to fill in. A setup needing finance to supply payroll codes cannot be finished in one sitting, and a wizard that pretends otherwise strands people on step four.",
    files: [
      {
        path: "registry/blocks/stepform-resume-later/stepform-resume-later.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "readout",
      "status-seal",
      "pressure-button",
    ],
    categories: ["step-form"],
    meta: { serial: "KB-303" },
    tagline: "Some of this is not your job.",
    keywords: [
      "step form",
      "onboarding",
      "resume",
      "progress",
      "section",
      "app",
    ],
    props: [
      {
        name: "sections",
        type: "ResumeSection[]",
        description:
          "Each section's ask, minutes, done state, and owner when it is not the reader.",
      },
      {
        name: "savedLine / onContinue",
        type: "string · (id) => void",
        description:
          "The promise that makes leaving safe, and the way back in.",
      },
    ],
    usageNotes: [
      "Counts and minutes-remaining are derived from the sections — they cannot drift from the list.",
      "The owner line is the reason to choose this over a wizard: name who else is needed.",
      "Minutes must be honest. A section marked 3 min that takes twenty is worse than no estimate.",
    ],
  },
  {
    name: "team-founders-note",
    type: "registry:block",
    title: "Founders Note Team",
    description:
      "The founders' note, signed, with each name attached to the thing it is answerable for rather than to a title. A team section built from job titles tells the reader nothing they can act on; a short list of who answers for what tells them exactly who to write to when something breaks.",
    files: [
      {
        path: "registry/blocks/team-founders-note/team-founders-note.tsx",
        type: "registry:block",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils"],
    categories: ["team"],
    meta: { serial: "KB-304" },
    tagline: "Answerable for, not titled as.",
    keywords: [
      "team",
      "founders",
      "about",
      "accountability",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "founders",
        type: "Founder[]",
        description: "Name, role, and the thing each is answerable for.",
      },
      {
        name: "note / contactLine",
        type: "string[] · string",
        description: "The letter and how to reach them without a form.",
      },
    ],
    usageNotes: [
      'Write accountability, not scope: "every plan it refuses to explain" beats "product and engineering".',
      "Deliberately still — a founders' note that animates is a founders' note nobody believes.",
      "Two or three founders. Past that it is a leadership grid, which is a different section.",
    ],
  },
  {
    name: "team-where-we-are",
    type: "registry:block",
    title: "Where We Are Team",
    description:
      "Where the team actually is, and — the useful part — which hours of the day that adds up to. A page of city names is trivia; a page that says the team covers 06:00 to midnight UTC and names the six hours nobody is awake for tells a buyer in another timezone whether they will be answered.",
    files: [
      {
        path: "registry/blocks/team-where-we-are/team-where-we-are.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "readout"],
    categories: ["team"],
    meta: { serial: "KB-305" },
    tagline: "Cities are trivia; coverage is information.",
    keywords: [
      "team",
      "distributed",
      "remote",
      "timezones",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "places",
        type: "TeamPlace[]",
        description:
          "City, country, headcount, and pre-formatted working hours.",
      },
      {
        name: "coverageLine / gapLine",
        type: "string",
        description: "What the hours add up to, and the hours nobody covers.",
      },
    ],
    usageNotes: [
      "The gap line is what makes the coverage claim credible — never omit it.",
      "Hours are pre-formatted strings in one stated zone, so the section never reads a clock.",
      "The total is derived from the places; it cannot disagree with the rows.",
    ],
  },
  {
    name: "content-principles-list",
    type: "registry:block",
    title: "Principles List Content",
    description:
      "Operating principles with the price of each one attached. Any company can publish four admirable sentences; a principle only becomes information when it says what it costs the people who wrote it — the office view that stays plain, the mornings that arrive flagged, the customers who leave easily.",
    files: [
      {
        path: "registry/blocks/content-principles-list/content-principles-list.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["content-sections"],
    meta: { serial: "KB-306" },
    tagline: "A principle without a cost is a value.",
    keywords: [
      "content",
      "principles",
      "values",
      "about",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "principles",
        type: "Principle[]",
        description: "Each rule with the thing it costs to keep.",
      },
      {
        name: "costLabel",
        type: "string",
        description: "Caption over the cost line.",
      },
    ],
    usageNotes: [
      "Without `costsUs` this is a values page, and nobody has ever believed one.",
      "Name a real cost — a competitor's advantage, a lost account, a capped growth rate.",
      "Four rules. Ten is a manifesto, and a manifesto settles no arguments.",
    ],
  },
  {
    name: "content-glossary",
    type: "registry:block",
    title: "Glossary Content",
    description:
      "The words this product uses and what they actually mean — with the term people use elsewhere printed beside each one, so a reader can map their own vocabulary onto yours rather than guessing. Any product with an opinionated vocabulary quietly loses readers who assume a familiar word means the familiar thing.",
    files: [
      {
        path: "registry/blocks/content-glossary/content-glossary.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["content-sections"],
    meta: { serial: "KB-307" },
    tagline: "Map their vocabulary onto yours.",
    keywords: [
      "content",
      "glossary",
      "definitions",
      "vocabulary",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "terms",
        type: "GlossaryTerm[]",
        description: "Term, definition, and what it is called elsewhere.",
      },
      {
        name: "elsewhereLabel",
        type: "string",
        description: "Caption over the mapping line.",
      },
    ],
    usageNotes: [
      "The `elsewhere` line is the useful half — a glossary that only defines your own words assumes the reader already agreed to them.",
      "Define words whose familiar meaning would mislead. Defining obvious ones reads as padding.",
      "Say why a word was chosen when the choice carries meaning; that is the definition doing real work.",
    ],
  },
  {
    name: "integrations-connect-time",
    type: "registry:block",
    title: "Connect Time Integrations",
    description:
      "Integrations priced in the only currency that matters at setup: minutes, and whose minutes. Every row says how long it really takes, what you need in hand before starting, and which ones you cannot do yourself — the question that decides whether a rollout slips.",
    files: [
      {
        path: "registry/blocks/integrations-connect-time/integrations-connect-time.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "readout",
      "status-seal",
    ],
    categories: ["integrations"],
    meta: { serial: "KB-308" },
    tagline: "Who has to be in the room.",
    keywords: [
      "integrations",
      "setup",
      "onboarding",
      "effort",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "connections",
        type: "ConnectStep[]",
        description:
          "Minutes, prerequisites, owner, and whether it is reversible.",
      },
      {
        name: "needsLabel",
        type: "string",
        description: "Caption over the prerequisites.",
      },
    ],
    usageNotes: [
      "The total is summed from the rows, so it cannot drift from them.",
      "Name the owner whenever it is not the reader — discovering that on the day is what slips a rollout.",
      "Mark the one-way connections. A reversible-looking integration that is not is a support ticket waiting to happen.",
    ],
  },
  {
    name: "integrations-build-your-own",
    type: "registry:block",
    title: "Build Your Own Integrations",
    description:
      'The honest answer to "do you integrate with X" when the answer is no: four surfaces, the exact shape of each, one command you can paste, and a versioning promise. Most integration pages end at the logo grid and leave anyone with an unlisted system guessing whether they are stuck.',
    files: [
      {
        path: "registry/blocks/integrations-build-your-own/integrations-build-your-own.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["lucide-react"],
    registryDependencies: ["utils", "status-seal"],
    categories: ["integrations"],
    meta: { serial: "KB-309" },
    tagline: "Not yet — and here is the door.",
    keywords: [
      "integrations",
      "api",
      "webhooks",
      "developers",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "surfaces",
        type: "Surface[]",
        description: "Each endpoint or event with its purpose and exact shape.",
      },
      {
        name: "snippet / stabilityLine",
        type: "string",
        description: "The pasteable command and the versioning promise.",
      },
    ],
    usageNotes: [
      'The copy confirmation clears itself — a button stuck on "Copied" lies about the next press.',
      "Clipboard access can be denied; the snippet stays selectable, so the failure is silent rather than broken.",
      'State the deprecation window in months. "Stable" without a number is not a promise.',
    ],
  },
  {
    name: "datatable-grouped-rollup",
    type: "registry:block",
    title: "Grouped Rollup Table",
    description:
      "A grid that adds up: rows grouped by site, every group carrying its own subtotal, and a grand total that is the sum of what is shown rather than a number typed in beside it. Folding a group keeps its subtotal visible, because the reason to fold is to compare groups.",
    files: [
      {
        path: "registry/blocks/datatable-grouped-rollup/datatable-grouped-rollup.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "readout"],
    categories: ["data-tables"],
    meta: { serial: "KB-310" },
    tagline: "Subtotals survive the fold.",
    keywords: [
      "data table",
      "grouping",
      "subtotals",
      "rollup",
      "section",
      "app",
    ],
    props: [
      {
        name: "groups",
        type: "RollupGroup[]",
        description: "Each group and its rows; every total is derived.",
      },
      {
        name: "defaultOpen",
        type: "string[]",
        description: "Groups open on load; omit to open all.",
      },
    ],
    usageNotes: [
      "Never author a total. Subtotals and the grand total are both summed from the rows.",
      "Keep subtotals visible while folded — hiding the number you folded down to defeats the fold.",
      "Rows collapse on height, so a long group opens without the page jumping under the reader.",
    ],
  },
  {
    name: "datatable-inline-edit",
    type: "registry:block",
    title: "Inline Edit Table",
    description:
      "A grid you can correct in place: click a value, change it, Enter commits and Escape abandons — and the row stamps a seal so the save is visible without a toast crossing the screen. The third thing people do with a table is notice a wrong number and fix it without leaving.",
    files: [
      {
        path: "registry/blocks/datatable-inline-edit/datatable-inline-edit.tsx",
        type: "registry:block",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils", "status-seal"],
    categories: ["data-tables"],
    meta: { serial: "KB-311" },
    tagline: "Notice a wrong number, fix it where it is.",
    keywords: [
      "data table",
      "inline edit",
      "editable",
      "constraints",
      "section",
      "app",
    ],
    props: [
      {
        name: "rows",
        type: "EditableRow[]",
        description: "Each row's editable value and the unit printed after it.",
      },
      {
        name: "onCommit / consequenceLine",
        type: "(id, value) => void · string",
        description: "The commit hook and what a change actually does.",
      },
    ],
    usageNotes: [
      "Escape abandons and Enter commits; blur commits too, because a click elsewhere is not an undo.",
      "The saved seal clears itself, so a stale confirmation never sits beside a later edit.",
      "Say what a change affects. An editable constraint with no stated consequence is a trap.",
      "Units live outside the value, so an edit never has to re-type them.",
    ],
  },
  {
    name: "testimonial-two-dates",
    type: "registry:block",
    title: "Two Dates Testimonial",
    description:
      'The same customer quoted twice, a year apart, with the sceptical early quote left in. A wall of enthusiasm reads as selection; a pair that starts with "I nearly stopped there" and ends somewhere else reads as a record. It is the only testimonial shape that can show a mind changing.',
    files: [
      {
        path: "registry/blocks/testimonial-two-dates/testimonial-two-dates.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["testimonials"],
    meta: { serial: "KB-312" },
    tagline: "A mind changing, not a mind made up.",
    keywords: [
      "testimonial",
      "before after",
      "longitudinal",
      "sceptical",
      "section",
      "marketing",
    ],
    props: [
      {
        name: "quotes",
        type: "TwoDateQuote[]",
        description: "One customer, two dated quotes.",
      },
      {
        name: "earlyLabel / laterLabel",
        type: "string",
        description: "Captions over the two columns.",
      },
    ],
    usageNotes: [
      "Leave the early quote unflattering. Softening it removes the only reason this shape works.",
      "The early quote is set in the muted ink and the later one larger, so the eye travels the right way.",
      "Two pairs is plenty — this shape asks for real reading.",
    ],
  },
];
