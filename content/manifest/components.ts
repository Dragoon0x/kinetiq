import type { KinetiqItem } from "./types";

/** KQ-001…KQ-021 — the instrument catalog. */
export const components: KinetiqItem[] = [
  {
    name: "pressure-button",
    type: "registry:ui",
    title: "Pressure Button",
    description:
      "A button that pushes back — press squash on flick, spring rebound on snap, and a hold-to-confirm gauge ring for destructive actions.",
    files: [{ path: "registry/ui/pressure-button.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["buttons"],
    meta: { serial: "KQ-001" },
    tagline: "A button that pushes back.",
    keywords: ["button", "press", "hold to confirm", "destructive", "cta"],
    props: [
      {
        name: "variant",
        type: '"solid" | "outline" | "ghost" | "danger"',
        defaultValue: '"solid"',
        description: "Visual style. Danger pairs naturally with holdToConfirm.",
      },
      {
        name: "size",
        type: '"sm" | "md" | "lg"',
        defaultValue: '"md"',
        description: "Control height and typography scale.",
      },
      {
        name: "holdToConfirm",
        type: "number",
        description:
          "Milliseconds the button must be held before confirming. Adds a gauge ring; Escape or early release cancels.",
      },
      {
        name: "onConfirm",
        type: "() => void",
        description: "Fires when a hold completes. Hold buttons never fire onClick.",
      },
    ],
    usageNotes: [
      "Space and Enter drive the same physics as the pointer — hold either to confirm.",
      "Under reduced motion the squash is replaced by a shade change; the gauge ring still fills because progress is feedback, not flourish.",
    ],
  },
  {
    name: "trace-input",
    type: "registry:ui",
    title: "Trace Input",
    description:
      "Focus draws its own boundary — a stroke traces the field's perimeter, the label glides to an overline, and errors annotate themselves with a dimension line.",
    files: [{ path: "registry/ui/trace-input.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["forms"],
    meta: { serial: "KQ-002" },
    tagline: "Focus draws its own boundary.",
    keywords: ["input", "text field", "form", "validation", "label"],
    props: [
      {
        name: "label",
        type: "string",
        description:
          "Field label — rests as placeholder, floats to overline when focused or filled.",
      },
      {
        name: "description / error",
        type: "string",
        description:
          "Helper and error lines below the field, chained into aria-describedby. Errors nudge the field and set aria-invalid.",
      },
      {
        name: "prefix / suffix",
        type: "ReactNode",
        description: "Leading and trailing slots inside the field.",
      },
      {
        name: "…input props",
        type: 'Omit<InputProps, "prefix">',
        description: "Standard input passthrough; controlled and uncontrolled both work.",
      },
    ],
    usageNotes: [
      "The perimeter trace doubles as the focus indicator — it is never removed, only accelerated.",
      "Under reduced motion the stroke appears instantly and the error nudge is skipped; the message still announces via aria-invalid.",
    ],
  },
  {
    name: "checkbox",
    type: "registry:ui",
    title: "Checkbox",
    description:
      "The tick is drawn, not shown — a pathLength stroke on flick, an indeterminate dash that slides in, and group select-alls that cascade down the list.",
    files: [{ path: "registry/ui/checkbox.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["forms"],
    meta: { serial: "KQ-004" },
    tagline: "The tick is drawn, not shown.",
    keywords: ["checkbox", "form", "selection", "indeterminate", "select all"],
    props: [
      {
        name: "checked / defaultChecked",
        type: "boolean",
        description: "Controlled or uncontrolled checked state.",
      },
      {
        name: "indeterminate",
        type: "boolean",
        defaultValue: "false",
        description: "Mixed state — dash visual plus native el.indeterminate.",
      },
      {
        name: "onCheckedChange",
        type: "(checked: boolean) => void",
        description: "Fires with the next checked state.",
      },
      {
        name: "label / description",
        type: "ReactNode",
        description: "Visible label (required) and muted secondary line.",
      },
      {
        name: "CheckboxGroup",
        type: "items, value, onValueChange, selectAll, legend…",
        description:
          "Fieldset-based group with select-all parent (checked / unchecked / indeterminate) and cascading tick draws.",
      },
    ],
    usageNotes: [
      "Native hidden inputs do the accessibility work; the drawn box is decorative.",
      "Under reduced motion ticks appear instantly and select-all cascades lose their stagger.",
    ],
  },
  {
    name: "breaker-switch",
    type: "registry:ui",
    title: "Breaker Switch",
    description:
      "A toggle with mechanical conviction — the thumb stretches in anticipation while held, throws on snap, and squashes against the track end as the rail recoils.",
    files: [{ path: "registry/ui/breaker-switch.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["forms"],
    meta: { serial: "KQ-003" },
    tagline: "A toggle with mechanical conviction.",
    keywords: ["switch", "toggle", "form", "power"],
    props: [
      {
        name: "checked / defaultChecked / onCheckedChange",
        type: "boolean / boolean / (checked) => void",
        description: "Controlled or uncontrolled state.",
      },
      {
        name: "size",
        type: '"sm" | "md" | "lg"',
        defaultValue: '"md"',
        description: "Fixed geometry — travel is derived, nothing is measured.",
      },
      {
        name: "onLabel / offLabel",
        type: "string",
        description: "Tiny uppercase text inside the track ends.",
      },
      {
        name: "label",
        type: "ReactNode",
        description: "Adjacent clickable label, associated automatically.",
      },
      {
        name: "name / value",
        type: "string",
        description: "Renders a hidden input that submits while checked.",
      },
    ],
    usageNotes: [
      "A native button with role=\"switch\" — Space and Enter throw it, and Space arms the anticipation stretch.",
      "Under reduced motion the thumb repositions instantly; only the color crossfade remains.",
    ],
  },
  {
    name: "caliper-slider",
    type: "registry:ui",
    title: "Caliper Slider",
    description:
      "Reads like a vernier, moves like grease — 1:1 drag with a snap settle, ticks that lean toward the jaw, and a live measured-span dimension line in range mode.",
    files: [{ path: "registry/ui/caliper-slider.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["forms"],
    meta: { serial: "KQ-005" },
    tagline: "Reads like a vernier, moves like grease.",
    keywords: ["slider", "range", "input", "measurement", "ticks"],
    props: [
      {
        name: "min / max / step",
        type: "number",
        defaultValue: "0 / 100 / 1",
        description: "Bounds and snap grid (float-precision cleaned).",
      },
      {
        name: "value / defaultValue / onValueChange",
        type: "number | [number, number]",
        description: "Single or range; live stepped values during drag, deduped.",
      },
      {
        name: "range",
        type: "boolean",
        defaultValue: "false",
        description: "Two facing caliper jaws with a live span dimension line.",
      },
      {
        name: "marks",
        type: "number[] | boolean",
        defaultValue: "true",
        description: "Every step when ≤ 40 steps, else quarters; or pinned positions.",
      },
      {
        name: "format / readout",
        type: '(v) => string / "float" | "end" | "none"',
        description: "Value formatting and where the mono readout renders.",
      },
    ],
    usageNotes: [
      "Full APG slider keyboard set per thumb; range thumbs cross-clamp their ARIA bounds.",
      "Under reduced motion tracking stays 1:1 — only the tick lean and the settle spring are removed.",
    ],
  },
  {
    name: "drawer-accordion",
    type: "registry:ui",
    title: "Drawer Accordion",
    description:
      "Opens like a specimen cabinet — height glides while the inner content lags a beat behind, like paper settling in a pulled drawer.",
    files: [{ path: "registry/ui/drawer-accordion.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["disclosure"],
    meta: { serial: "KQ-007" },
    tagline: "Opens like a specimen cabinet.",
    keywords: ["accordion", "disclosure", "collapse", "faq"],
    props: [
      {
        name: "type",
        type: '"single" | "multiple"',
        defaultValue: '"single"',
        description: "Open one drawer at a time, or many.",
      },
      {
        name: "value / defaultValue",
        type: "string | string[]",
        description: "Controlled or uncontrolled open value(s).",
      },
      {
        name: "onValueChange",
        type: "(value) => void",
        description: "Fires with the next open value(s).",
      },
      {
        name: "collapsible",
        type: "boolean",
        defaultValue: "true",
        description: "Single mode: allow closing the open item.",
      },
      {
        name: "Item.value / Item.disabled",
        type: "string / boolean",
        description: "Unique drawer id; disabled items are skipped in arrow navigation.",
      },
      {
        name: "Trigger.icon",
        type: "ReactNode",
        description: "Leading icon slot before the header label.",
      },
    ],
    usageNotes: [
      "Full APG accordion keyboard support: Arrow keys move between headers, Home and End jump.",
      "Under reduced motion drawers open instantly and content crossfades — no lag, no sibling nudge.",
    ],
  },
  {
    name: "gantry-tabs",
    type: "registry:ui",
    title: "Gantry Tabs",
    description:
      "The indicator rides a rail — its leading edge glides ahead while the trailing edge lags a beat, stretching toward the destination before contracting to fit.",
    files: [{ path: "registry/ui/gantry-tabs.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["navigation"],
    meta: { serial: "KQ-006" },
    tagline: "The indicator rides a rail.",
    keywords: ["tabs", "navigation", "segmented", "underline", "indicator"],
    props: [
      {
        name: "value / defaultValue / onValueChange",
        type: "string / string / (value) => void",
        description: "Controlled or uncontrolled active tab.",
      },
      {
        name: "variant",
        type: '"underline" | "segmented" | "enclosed"',
        defaultValue: '"underline"',
        description: "Indicator style.",
      },
      {
        name: "orientation",
        type: '"horizontal" | "vertical"',
        defaultValue: '"horizontal"',
        description: "Layout and arrow-key axis.",
      },
      {
        name: "activationMode",
        type: '"automatic" | "manual"',
        defaultValue: '"automatic"',
        description: "Activate on focus, or on Enter/Space.",
      },
      {
        name: "keepMounted",
        type: "boolean",
        defaultValue: "false",
        description: "Keep inactive panels mounted but hidden.",
      },
    ],
    usageNotes: [
      "Full APG tabs keyboard support with wrapping arrows; disabled triggers are skipped.",
      "Under reduced motion the indicator teleports and panels crossfade without the lift.",
    ],
  },
  {
    name: "select",
    type: "registry:ui",
    title: "Select",
    description:
      "A menu that unfolds from where you asked — the panel scales from the trigger's edge, options cascade in, and a highlight bar glides between them.",
    files: [{ path: "registry/ui/select.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["forms"],
    meta: { serial: "KQ-010" },
    tagline: "A menu that unfolds from where you asked.",
    keywords: ["select", "combobox", "dropdown", "listbox", "form"],
    props: [
      {
        name: "items",
        type: "(SelectOption | SelectGroup)[]",
        description: "Flat options, labeled groups, or a mix; options take value, label, description, disabled.",
      },
      {
        name: "value / defaultValue / onValueChange",
        type: "string / string / (value) => void",
        description: "Controlled or uncontrolled selection.",
      },
      {
        name: "searchable",
        type: "boolean",
        defaultValue: "false",
        description: "Pins a filter input at the top of the panel.",
      },
      {
        name: "placeholder / label / name",
        type: "string",
        description: "Empty-state text, wired visible label, and hidden form input.",
      },
    ],
    usageNotes: [
      "Combobox APG throughout: aria-activedescendant highlight, wrapping arrows, typeahead, Escape restores focus.",
      "Under reduced motion everything fades — no scale, no cascade, instant highlight bar.",
    ],
  },
  {
    name: "morph-dialog",
    type: "registry:ui",
    title: "Morph Dialog",
    description:
      "The trigger becomes the dialog — a shared-element morph glides the card you clicked into the panel it opens, and reverses on close.",
    files: [{ path: "registry/ui/morph-dialog.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["overlay"],
    meta: { serial: "KQ-009" },
    tagline: "The trigger becomes the dialog.",
    keywords: ["dialog", "modal", "morph", "sheet", "shared element"],
    props: [
      {
        name: "open / defaultOpen / onOpenChange",
        type: "boolean / boolean / (open) => void",
        description: "Controlled or uncontrolled open state.",
      },
      {
        name: "size",
        type: '"sm" | "md" | "lg"',
        defaultValue: '"md"',
        description: "Panel width preset; ignored by the sheet variant.",
      },
      {
        name: "sheet",
        type: "boolean",
        defaultValue: "false",
        description: "Bottom-sheet variant — full-width, pinned to the bottom edge.",
      },
      {
        name: "dismissible",
        type: "boolean",
        defaultValue: "true",
        description: "Escape, backdrop click, and the built-in close button.",
      },
      {
        name: "portal",
        type: "boolean",
        defaultValue: "true",
        description: "Portal to body, or contain the overlay in a relative parent.",
      },
      {
        name: "Content.title / Content.description",
        type: "string",
        description: "Wired to aria-labelledby and aria-describedby; title renders as h2.",
      },
    ],
    usageNotes: [
      "Focus is trapped while open and restored to the trigger on close; body scroll locks in portal mode.",
      "Under reduced motion the morph becomes a plain centered fade.",
    ],
  },
  {
    name: "telemetry-toast",
    type: "registry:ui",
    title: "Telemetry Toast",
    description:
      "Messages that queue like readings — recoil arrivals, a depth-receding stack, swipe dismissal with velocity projection, and timers that pause under your pointer.",
    files: [{ path: "registry/ui/telemetry-toast.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["feedback"],
    meta: { serial: "KQ-011" },
    tagline: "Messages that queue like readings.",
    keywords: ["toast", "notification", "snackbar", "alert", "queue"],
    props: [
      {
        name: "ToastProvider.position",
        type: '"bottom-right" | "bottom-left" | "top-right" | "top-left"',
        defaultValue: '"bottom-right"',
        description: "Viewport corner for the stack.",
      },
      {
        name: "ToastProvider.max",
        type: "number",
        defaultValue: "3",
        description: "Visible stack size; extras queue FIFO.",
      },
      {
        name: "useToast()",
        type: "{ toast(input) => id, dismiss(id) }",
        description: "Imperative API from anywhere under the provider.",
      },
      {
        name: "ToastInput",
        type: "title, description?, variant?, duration?, action?",
        description:
          "Variants info | success | warn | danger; duration ≤ 0 persists; action renders a button.",
      },
    ],
    usageNotes: [
      "Danger toasts announce as alerts; the region is focusable via an Alt+T hotkey chord and timers pause on hover or focus.",
      "Under reduced motion the stack flattens to a list with fade-only transitions — the progress hairline still drains.",
    ],
  },
  {
    name: "readout",
    type: "registry:ui",
    title: "Readout",
    description:
      "Numbers with momentum — per-digit vertical rolls with real carry propagation, so 199 → 200 visibly carries right to left.",
    files: [{ path: "registry/ui/readout.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["data"],
    meta: { serial: "KQ-012" },
    tagline: "Numbers with momentum.",
    keywords: ["number", "counter", "ticker", "odometer", "metric", "stat"],
    props: [
      {
        name: "value",
        type: "number",
        description: "The numeric value to display.",
      },
      {
        name: "format",
        type: "(value: number) => string",
        defaultValue: "toLocaleString",
        description: "Formats the value; non-digit characters render as static cells.",
      },
      {
        name: "size",
        type: '"sm" | "md" | "lg" | "xl"',
        defaultValue: '"md"',
        description: "Type scale.",
      },
      {
        name: "rollOn",
        type: '"any" | "increase"',
        defaultValue: '"any"',
        description: "With \"increase\", decreases swap instantly — right for latency-style metrics.",
      },
      {
        name: "delta",
        type: '{ value: string; direction: "up" | "down" }',
        description: "Change badge that flips up when the value moves.",
      },
    ],
    usageNotes: [
      "Rolling digits are aria-hidden; a polite live region announces the settled value once per burst.",
      "Under reduced motion the value swaps instantly with a brief highlight pulse.",
    ],
  },
  {
    name: "focus-text",
    type: "registry:ui",
    title: "Focus Text",
    description:
      "Copy that resolves under the lens — words sharpen from an 8px blur like a microscope focus-pull, cascaded under the 600ms budget.",
    files: [{ path: "registry/ui/focus-text.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["text"],
    meta: { serial: "KQ-013" },
    tagline: "Copy that resolves under the lens.",
    keywords: ["text", "reveal", "blur", "headline", "scroll"],
    props: [
      {
        name: "children",
        type: "string",
        description: "The copy to resolve.",
      },
      {
        name: "as",
        type: '"span" | "div" | "p" | "h1"–"h4"',
        defaultValue: '"span"',
        description: "Rendered element.",
      },
      {
        name: "by",
        type: '"word" | "char"',
        defaultValue: '"word"',
        description: "Split granularity; char mode never breaks mid-word.",
      },
      {
        name: "trigger / once",
        type: '"inView" | "mount" / boolean',
        defaultValue: '"inView" / true',
        description: "When the pull runs, and whether it re-blurs out of view.",
      },
      {
        name: "stagger / startDelay",
        type: "number",
        description: "Seconds between units (defaults to the cascade budget) and lead-in delay.",
      },
    ],
    usageNotes: [
      "Screen readers get a clean sr-only copy; the animated units are aria-hidden.",
      "Under reduced motion the block does a single fast fade — text is always readable.",
    ],
  },
  {
    name: "scope-scrubber",
    type: "registry:ui",
    title: "Scope Scrubber",
    description:
      "Drag a value; watch its physics — a scrub input with a live oscilloscope trace behind the numeral, where the settle spring's overshoot draws itself.",
    files: [{ path: "registry/ui/scope-scrubber.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["forms", "data"],
    meta: { serial: "KQ-015" },
    tagline: "Drag a value; watch its physics.",
    keywords: ["scrubber", "input", "number", "oscilloscope", "drag"],
    props: [
      {
        name: "min / max / step",
        type: "number",
        description: "Bounds (required) and release snap grid.",
      },
      {
        name: "value / defaultValue / onValueChange",
        type: "number / number / (value) => void",
        description: "Controlled or uncontrolled; fires live while scrubbing.",
      },
      {
        name: "settle",
        type: "SpringName",
        defaultValue: '"snap"',
        description: "Which calibrated spring the value settles on — its personality shows on the trace.",
      },
      {
        name: "sensitivity",
        type: "number",
        defaultValue: "(max−min)/200",
        description: "Value change per pixel of drag.",
      },
      {
        name: "label / unit / format / trace",
        type: "string / string / (v)=>string / boolean",
        description: "Labeling, suffix, numeral formatting, and the history trace toggle.",
      },
    ],
    usageNotes: [
      "Enter or double-click converts the plate into a plain number input; Escape cancels.",
      "Under reduced motion scrubbing stays 1:1, release snaps instantly, and the trace hides.",
    ],
  },
  {
    name: "gyro-card",
    type: "registry:ui",
    title: "Gyro Card",
    description:
      "A card with a sense of balance — pointer tilt with real inertia that overshoots past level and rebalances when you leave, with layered parallax and tracking glare.",
    files: [{ path: "registry/ui/gyro-card.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["display"],
    meta: { serial: "KQ-017" },
    tagline: "A card with a sense of balance.",
    keywords: ["card", "tilt", "3d", "parallax", "hover"],
    props: [
      {
        name: "maxTilt",
        type: "number",
        defaultValue: "8",
        description: "Peak rotation toward the pointer, in degrees.",
      },
      {
        name: "glare",
        type: "boolean",
        defaultValue: "true",
        description: "Radial sheen that tracks the light angle.",
      },
      {
        name: "GyroLayer.depth",
        type: "0 | 1 | 2",
        description: "Parallax depth for child slots — pinned, ±4px, or ±8px counter-translation.",
      },
    ],
    usageNotes: [
      "The motion is decorative: DOM order is untouched, and keyboard focus inside flattens the card to an energized ring state.",
      "Under reduced motion there is no tilt, parallax, or glare — hover becomes a border emphasis.",
    ],
  },
  {
    name: "flapboard",
    type: "registry:ui",
    title: "Flapboard",
    description:
      "Split-flap departures for your data — each cell flips through intermediate characters with a column cascade, like an airport board settling.",
    files: [{ path: "registry/ui/flapboard.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["data", "text"],
    meta: { serial: "KQ-014" },
    tagline: "Split-flap departures for your data.",
    keywords: ["split flap", "board", "status", "departure", "retro"],
    props: [
      {
        name: "value",
        type: "string",
        description: "Text to display, normalized against the charset.",
      },
      {
        name: "chars",
        type: "string",
        defaultValue: '" A–Z 0–9 ·-"',
        description: "Charset scanned in flip order.",
      },
      {
        name: "flipSpeed",
        type: "number",
        defaultValue: "40",
        description: "Milliseconds per flip step.",
      },
      {
        name: "padTo / align",
        type: 'number / "left" | "right"',
        description: "Minimum cell count and which side the value sits on.",
      },
      {
        name: "size",
        type: '"sm" | "md" | "lg"',
        defaultValue: '"md"',
        description: "Fixed tile dimensions.",
      },
    ],
    usageNotes: [
      "Cells are aria-hidden; a polite status region announces the settled value once.",
      "Under reduced motion the board crossfades to the new value — no flipping.",
    ],
  },
  {
    name: "metronome-loader",
    type: "registry:ui",
    title: "Metronome Loader",
    description:
      "Waiting, kept honest — a pendulum, a bearing cradle, or a radar sweep; give it a value and it morphs into a determinate arc gauge.",
    files: [{ path: "registry/ui/metronome-loader.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["feedback"],
    meta: { serial: "KQ-016" },
    tagline: "Waiting, kept honest.",
    keywords: ["loader", "spinner", "progress", "pendulum", "gauge"],
    props: [
      {
        name: "variant",
        type: '"pendulum" | "bearing" | "sweep"',
        defaultValue: '"pendulum"',
        description: "Indeterminate style; ignored once value is set.",
      },
      {
        name: "size",
        type: '"sm" | "md" | "lg"',
        defaultValue: '"md"',
        description: "24 / 40 / 64 px.",
      },
      {
        name: "value",
        type: "number",
        description: "0–100; presence morphs the loader into a determinate arc gauge.",
      },
      {
        name: "label / showLabel",
        type: "string / boolean",
        description: "Accessible name; optionally rendered visibly.",
      },
    ],
    usageNotes: [
      "role=\"progressbar\" throughout — indeterminate announces Loading, determinate reports its value.",
      "Under reduced motion the loops freeze to a static glyph with a slow opacity pulse.",
    ],
  },
  {
    name: "ticker-tape",
    type: "registry:ui",
    title: "Ticker Tape",
    description:
      "A marquee with friction — hover applies drag, grabbing tracks 1:1, and a fling carries real momentum that decays back to duty speed.",
    files: [{ path: "registry/ui/ticker-tape.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["motion"],
    meta: { serial: "KQ-020" },
    tagline: "A marquee with friction.",
    keywords: ["marquee", "scroller", "logos", "loop", "fling"],
    props: [
      {
        name: "speed",
        type: "number",
        defaultValue: "60",
        description: "Duty cruising speed in px/s.",
      },
      {
        name: "direction",
        type: '"left" | "right"',
        defaultValue: '"left"',
        description: "Travel direction.",
      },
      {
        name: "gap",
        type: "number",
        defaultValue: "24",
        description: "Gap between items and loop copies.",
      },
      {
        name: "pauseOnHover",
        type: "boolean",
        defaultValue: "true",
        description: "Ease to 30% duty speed while hovered.",
      },
    ],
    usageNotes: [
      "A visible pause control surfaces on keyboard focus; duplicated sequences are aria-hidden.",
      "Under reduced motion the tape renders as a static wrapped grid showing each item once.",
    ],
  },
  {
    name: "scan-reveal",
    type: "registry:ui",
    title: "Scan Reveal",
    description:
      "Sections develop as the scanner passes — a scroll-linked scan line sweeps once, and content resolves beneath it with a coordinate readout riding the beam.",
    files: [{ path: "registry/ui/scan-reveal.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["motion", "scroll"],
    meta: { serial: "KQ-021" },
    tagline: "Sections develop as the scanner passes.",
    keywords: ["scroll", "reveal", "landing", "section", "scan"],
    props: [
      {
        name: "once",
        type: "boolean",
        defaultValue: "true",
        description: "Tear down the dual layers after the sweep completes.",
      },
      {
        name: "direction",
        type: '"down" | "up"',
        defaultValue: '"down"',
        description: "Sweep direction.",
      },
      {
        name: "containerRef",
        type: "RefObject<HTMLElement>",
        description: "Scrollable ancestor for scroll-linking inside overflow containers.",
      },
    ],
    usageNotes: [
      "Interactive content lives only in the developed layer; the undeveloped copy is aria-hidden and inert.",
      "Under reduced motion content renders fully developed with a single fast fade.",
    ],
  },
  {
    name: "radio-group",
    type: "registry:ui",
    title: "Radio Group",
    description:
      "Selection that travels, never teleports — one shared dot glides between rings while the receiving ring arms with a squash and rebounds as it lands.",
    files: [{ path: "registry/ui/radio-group.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["forms"],
    meta: { serial: "KQ-022" },
    tagline: "Selection that travels, never teleports.",
    keywords: ["radio", "form", "selection", "single select", "options"],
    props: [
      {
        name: "value / defaultValue / onValueChange",
        type: "string / string / (value) => void",
        description: "Controlled or uncontrolled selection.",
      },
      {
        name: "orientation",
        type: '"vertical" | "horizontal"',
        defaultValue: '"vertical"',
        description: "Layout and aria-orientation.",
      },
      {
        name: "name / label",
        type: "string / ReactNode",
        description:
          "Hidden native radios for form posts; visible group label (or pass aria-label).",
      },
      {
        name: "Item.value / Item.description",
        type: "string / ReactNode",
        description: "Item identity and a muted secondary line.",
      },
    ],
    usageNotes: [
      "Full APG radio keyboard: arrows wrap and select, Space selects, Home and End jump.",
      "Under reduced motion the dot swaps instantly with only a border-color tween.",
    ],
  },
  {
    name: "code-cells",
    type: "registry:ui",
    title: "Code Cells",
    description:
      "Six digits, dropped into place — one hidden one-time-code input drives visual cells with digit drops, underline ticks, and a rejection nudge.",
    files: [{ path: "registry/ui/code-cells.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["forms", "authentication"],
    meta: { serial: "KQ-023" },
    tagline: "Six digits, dropped into place.",
    keywords: ["otp", "code", "verification", "2fa", "input"],
    props: [
      {
        name: "length",
        type: "number",
        defaultValue: "6",
        description: "Cell count; also the hidden input's maxLength.",
      },
      {
        name: "value / defaultValue / onValueChange",
        type: "string / string / (code) => void",
        description: "Controlled or uncontrolled code, digits only.",
      },
      {
        name: "onComplete",
        type: "(code: string) => void",
        description: "Fires once per fill; re-arms when the code shrinks.",
      },
      {
        name: "error / errorMessage",
        type: "boolean / string",
        description: "Destructive borders plus a row nudge and a role=alert line.",
      },
      {
        name: "groups",
        type: "number[]",
        description: "e.g. [3,3] renders a separator between digit groups.",
      },
      {
        name: "ref",
        type: "Ref<HTMLInputElement>",
        description: "Reaches the hidden input — focus() after clearing.",
      },
    ],
    usageNotes: [
      "The single hidden input with autocomplete=\"one-time-code\" is the accessibility-correct OTP pattern — cells are decorative.",
      "Under reduced motion digits appear instantly and the nudge is skipped; the alert still announces.",
    ],
  },
  {
    name: "action-relay",
    type: "registry:ui",
    title: "Action Relay",
    description:
      "A button that narrates the job — state labels roll through a one-line mask with a blur crossfade while the width follows the new content.",
    files: [{ path: "registry/ui/action-relay.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["buttons"],
    meta: { serial: "KQ-024" },
    tagline: "A button that narrates the job.",
    keywords: ["button", "state", "loading", "swap", "cta"],
    props: [
      {
        name: "state / states",
        type: "string / Record<string, ReactNode>",
        description:
          "Controlled state key and the content per state — nodes may embed icons or a small loader.",
      },
      {
        name: "busyStates",
        type: "string[]",
        description:
          "States that report aria-busy and suppress interaction without stealing focus.",
      },
      {
        name: "onSettled",
        type: "(state) => void",
        description: "Fires when the incoming roll lands — chain done → idle off it.",
      },
      {
        name: "announcements",
        type: "Record<string, string>",
        description: "Screen-reader text per state; plain-text nodes announce themselves.",
      },
      {
        name: "variant / size",
        type: "pressure-button scales",
        defaultValue: '"solid" / "md"',
        description: "Visual style, mirroring the button family.",
      },
    ],
    usageNotes: [
      "Busy states keep focus (aria-disabled, not disabled) so the announcement chain is never interrupted.",
      "Under reduced motion labels crossfade and the width jumps; onSettled still fires.",
    ],
  },
  {
    name: "status-seal",
    type: "registry:ui",
    title: "Status Seal",
    description:
      "Status, re-stamped on every change — variant swaps stamp in on recoil, a live pulse ring breathes at drift tempo, and counts carry-roll.",
    files: [{ path: "registry/ui/status-seal.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "readout"],
    categories: ["display", "feedback"],
    meta: { serial: "KQ-025" },
    tagline: "Status, re-stamped on every change.",
    keywords: ["badge", "status", "pill", "live", "count"],
    props: [
      {
        name: "variant",
        type: '"info" | "success" | "warn" | "danger"',
        defaultValue: '"info"',
        description: "Semantic tinting with token fallbacks for consumer apps.",
      },
      {
        name: "children / icon",
        type: "ReactNode",
        description: "Label and optional leading node (defaults to a status dot).",
      },
      {
        name: "count",
        type: "number",
        description: "Embeds a small Readout so numbers carry-roll without re-stamping.",
      },
      {
        name: "live",
        type: "boolean",
        defaultValue: "false",
        description: "Pulse ring behind the dot at drift tempo.",
      },
    ],
    usageNotes: [
      "role=\"status\" announces label and count once per change, debounced.",
      "Under reduced motion swaps are instant and the pulse ring holds static at mid-opacity.",
    ],
  },
  {
    name: "slipstream",
    type: "registry:ui",
    title: "Slipstream",
    description:
      "A highlight that rides in your wake — one pill glides behind hovered or focused items with a trailing-edge stretch, in any direction.",
    files: [{ path: "registry/ui/slipstream.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["navigation"],
    meta: { serial: "KQ-026" },
    tagline: "A highlight that rides in your wake.",
    keywords: ["hover", "nav", "highlight", "shared layout", "pill"],
    props: [
      {
        name: "radius / inset",
        type: "number / number",
        defaultValue: "8 / 0",
        description:
          "Pill corner radius, and how far it tucks inside each item rect (negative bleeds out).",
      },
      {
        name: "disabled",
        type: "boolean",
        defaultValue: "false",
        description: "Parks the pill and ignores hover/focus.",
      },
      {
        name: "SlipstreamItem",
        type: "div props",
        description:
          "Wrap each link or button; the wrapper registers its rect for the pill to target.",
      },
    ],
    usageNotes: [
      "Keyboard focus drives the pill exactly like hover — focusin on the group targets the focused item.",
      "Under reduced motion the pill teleports with a fast fade; no trailing stretch.",
    ],
  },
  {
    name: "cipher-text",
    type: "registry:ui",
    title: "Cipher Text",
    description:
      "Characters lock in from the noise — glyphs cycle deterministically, then resolve left-to-right under the 600ms cascade budget with a signal pulse per lock.",
    files: [{ path: "registry/ui/cipher-text.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["text"],
    meta: { serial: "KQ-029" },
    tagline: "Characters lock in from the noise.",
    keywords: ["text", "scramble", "decrypt", "reveal", "mono"],
    props: [
      {
        name: "children",
        type: "string",
        description: "Copy to resolve; split into per-character mono cells.",
      },
      {
        name: "trigger",
        type: '"inView" | "mount" | "hover"',
        defaultValue: '"inView"',
        description: "Hover re-scrambles then resolves on every entry.",
      },
      {
        name: "order",
        type: '"ltr" | "random"',
        defaultValue: '"ltr"',
        description: "Lock-in sequence; random is hash-shuffled, never Math.random.",
      },
      {
        name: "charset / speed / as",
        type: "string / number / element",
        defaultValue: 'A–Z 0–9 ·- / 30 / "span"',
        description: "Glyph pool, ms per scramble tick, rendered element.",
      },
    ],
    usageNotes: [
      "Screen readers and no-JS visitors get the clean string; the scramble layer is aria-hidden.",
      "Under reduced motion the text renders plainly with a single fast fade.",
    ],
  },
  {
    name: "magnet-dock",
    type: "registry:ui",
    title: "Magnet Dock",
    description:
      "Icons that feel the cursor coming — a cosine distance field magnifies the dock, and drag-reorder parts neighbors magnetically before snapping into a slot.",
    files: [{ path: "registry/ui/magnet-dock.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["navigation"],
    meta: { serial: "KQ-018" },
    tagline: "Icons that feel the cursor coming.",
    keywords: ["dock", "toolbar", "magnify", "reorder", "launcher"],
    props: [
      {
        name: "items",
        type: "DockItem[]",
        description: "{ id, label, icon, active?, onSelect? } per icon.",
      },
      {
        name: "orientation",
        type: '"horizontal" | "vertical"',
        defaultValue: '"horizontal"',
        description: "Dock axis — pointer tracking, tooltips, and arrows follow.",
      },
      {
        name: "magnify",
        type: "number",
        defaultValue: "1.6",
        description: "Peak scale under the pointer or keyboard focus.",
      },
      {
        name: "reorderable / onReorder",
        type: "boolean / (order: string[]) => void",
        description: "Pointer drag plus Space-lift keyboard reordering, announced live.",
      },
    ],
    usageNotes: [
      "role=\"toolbar\" with roving tabindex; a focused icon magnifies without the pointer.",
      "Under reduced motion magnification is replaced by a 2px raise; reordering still works, 1:1.",
    ],
  },
  {
    name: "conveyor-list",
    type: "registry:ui",
    title: "Conveyor List",
    description:
      "A queue that moves like a belt — items drift in from the feed side, brake into their slot with a squash, and lift off the belt when removed.",
    files: [{ path: "registry/ui/conveyor-list.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["data"],
    meta: { serial: "KQ-019" },
    tagline: "A queue that moves like a belt.",
    keywords: ["list", "queue", "feed", "log", "jobs"],
    props: [
      {
        name: "items / keyFor / renderItem",
        type: "T[] / (item) => string / (item) => ReactNode",
        description: "Generic queue contents with stable keys driving enter, exit, and reorder identity.",
      },
      {
        name: "side",
        type: '"top" | "bottom"',
        defaultValue: '"top"',
        description: "The feed edge new items enter from.",
      },
      {
        name: "maxVisible",
        type: "number",
        defaultValue: "6",
        description: "Rows shown before the oldest overflow into a +N more count.",
      },
      {
        name: "announceItem",
        type: "(item: T) => string",
        description: "Screen-reader text per row for the live log region.",
      },
    ],
    usageNotes: [
      "The list is a role=\"log\" live region — arrivals are announced politely.",
      "Under reduced motion rows crossfade in place and layout shifts are instant.",
    ],
  },
  {
    name: "callout",
    type: "registry:ui",
    title: "Callout",
    description:
      "A tooltip with a leader line — the label pops from the anchor while a schematic elbow line draws itself to the card.",
    files: [{ path: "registry/ui/callout.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["overlay"],
    meta: { serial: "KQ-008" },
    tagline: "A label with a leader line.",
    keywords: ["tooltip", "annotation", "hover", "hint"],
    props: [
      {
        name: "content",
        type: "ReactNode",
        description: "Label content. Never put interactive elements here.",
      },
      {
        name: "side / align",
        type: '"top" | "right" | "bottom" | "left" / "start" | "center" | "end"',
        defaultValue: '"top" / "center"',
        description: "Anchor side and cross-axis alignment.",
      },
      {
        name: "delay",
        type: "number",
        defaultValue: "150",
        description: "Hover open delay in ms. Keyboard focus opens instantly.",
      },
      {
        name: "followCursor",
        type: "boolean",
        defaultValue: "false",
        description: "Label trails the pointer with drift-damped lag; leader line omitted.",
      },
      {
        name: "disabled",
        type: "boolean",
        defaultValue: "false",
        description: "Never opens.",
      },
    ],
    usageNotes: [
      "Opens on hover and on keyboard focus; Escape dismisses.",
      "Under reduced motion the card fades in place — no pop, no leader draw, and followCursor pins to the anchor.",
    ],
  },
];
