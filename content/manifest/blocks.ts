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
];
