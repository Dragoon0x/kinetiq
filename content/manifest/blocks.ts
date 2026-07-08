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
      "One hidden input with autocomplete=\"one-time-code\" drives the six visual cells — the accessibility-correct OTP pattern.",
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
      { path: "registry/blocks/iris-menu/iris-menu.tsx", type: "registry:block" },
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
        description: "Auto measures the viewport and blooms into the roomiest quadrant.",
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
      { path: "registry/blocks/not-found/not-found.tsx", type: "registry:block" },
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
        description: "The carry-rolling amount, its delta chip, and the sparkline data.",
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
        description: "Fraction applied to the converted side, shown as a fee row.",
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
];
