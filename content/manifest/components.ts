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
    name: "drawer",
    type: "registry:ui",
    title: "Drawer",
    description:
      "A side panel on rails — slides in on glide, drags toward its edge 1:1, and a projected release past 40% lets it leave with the momentum it already has.",
    files: [{ path: "registry/ui/drawer.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["overlay"],
    meta: { serial: "KQ-027" },
    tagline: "A side panel on rails.",
    keywords: ["drawer", "panel", "side", "overlay", "filters"],
    props: [
      {
        name: "open / defaultOpen / onOpenChange",
        type: "boolean / boolean / (open) => void",
        description: "Controlled or uncontrolled visibility.",
      },
      {
        name: "side / size",
        type: '"left" | "right" / "sm" | "md" | "lg"',
        defaultValue: '"right" / "md"',
        description: "Edge and width preset (288 / 360 / 440).",
      },
      {
        name: "dismissible / portal",
        type: "boolean",
        defaultValue: "true / true",
        description:
          "Escape, backdrop, and edge-drag dismissal; portal locks body scroll.",
      },
      {
        name: "Trigger / Content / Title / Description / Close",
        type: "compound parts",
        description: "Composable parts sharing one context.",
      },
    ],
    usageNotes: [
      "The backdrop's opacity is bound to the drag — dismissal fades exactly as far as you've pulled.",
      "Under reduced motion the panel fades; dragging stays 1:1 with instant resolution.",
    ],
  },
  {
    name: "bottom-sheet",
    type: "registry:ui",
    title: "Bottom Sheet",
    description:
      "It snaps where your gesture was going — velocity-projected releases settle on the nearest snap point in the gesture's direction, with rubber-band overdrag.",
    files: [{ path: "registry/ui/bottom-sheet.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["overlay"],
    meta: { serial: "KQ-028" },
    tagline: "It snaps where your gesture was going.",
    keywords: ["sheet", "bottom sheet", "snap points", "drag", "mobile"],
    props: [
      {
        name: "snapPoints / initialSnap / onSnapChange",
        type: "number[] / number / (index) => void",
        defaultValue: "[0.4, 0.9] / 0",
        description:
          "Resting heights as viewport fractions; every settle reports its index.",
      },
      {
        name: "open / defaultOpen / onOpenChange",
        type: "boolean / boolean / (open) => void",
        description: "Controlled or uncontrolled visibility.",
      },
      {
        name: "dismissible / portal",
        type: "boolean",
        defaultValue: "true / true",
        description:
          "Projecting past the lowest snap dismisses; portal measures the visual viewport.",
      },
      {
        name: "Handle",
        type: "compound part",
        description:
          "The grab pill is a real button — arrows step snaps, Home/End jump, each step announces.",
      },
    ],
    usageNotes: [
      "The backdrop opacity is bound to the sheet's travel, live during the drag.",
      "Under reduced motion it fades to its snap and releases resolve instantly; dragging stays 1:1.",
    ],
  },
  {
    name: "ledger",
    type: "registry:ui",
    title: "Ledger",
    description:
      "Ten thousand rows, sixty frames — a hand-rolled virtualized table where sorting FLIPs only the rows you can see and selection cascades down the window.",
    files: [{ path: "registry/ui/ledger.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "checkbox"],
    categories: ["data"],
    meta: { serial: "KQ-030" },
    tagline: "Ten thousand rows, sixty frames.",
    keywords: ["table", "data grid", "virtualized", "sort", "selection"],
    props: [
      {
        name: "columns / rows / rowId",
        type: "LedgerColumn<T>[] / readonly T[] / (row) => string",
        description:
          "Column defs (width px | \"1fr\", align, sortable, cell, sortFn), the full data set, and stable row identity.",
      },
      {
        name: "rowHeight / height / overscan",
        type: "number",
        defaultValue: "40 / 320 / 6",
        description: "Fixed row height, viewport height, and window padding.",
      },
      {
        name: "sort / defaultSort / onSortChange",
        type: "LedgerSort | null",
        description: "Controlled or uncontrolled; headers cycle asc → desc → none.",
      },
      {
        name: "selectable / selected / onSelectedChange",
        type: "boolean / ReadonlySet<string> / (next) => void",
        description: "Checkbox column; select-all targets every row, not just visible.",
      },
      {
        name: "onVisibleRangeChange",
        type: "({ from, to }) => void",
        description: "1-based visible range, emitted from the rAF scroll flush.",
      },
    ],
    usageNotes: [
      "Roughly twenty nodes render regardless of row count; sort animates at most thirty visible rows.",
      "Under reduced motion the chevron swaps instantly and rows jump — no FLIP, no tick cascade.",
    ],
  },
  {
    name: "zoetrope",
    type: "registry:ui",
    title: "Zoetrope",
    description:
      "Spin the drum; every frame finds its detent — panels ride the inside of a cylinder with drag inertia, wheel steps, and angular-distance dimming.",
    files: [{ path: "registry/ui/zoetrope.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["display"],
    meta: { serial: "KQ-031" },
    tagline: "Spin the drum; every frame finds its detent.",
    keywords: ["carousel", "3d", "drum", "cylinder", "gallery"],
    props: [
      {
        name: "children",
        type: "ReactNode",
        description: "Each direct child becomes a drum face (capped at twelve).",
      },
      {
        name: "index / defaultIndex / onIndexChange",
        type: "number / number / (index) => void",
        description: "Controlled or uncontrolled front panel; fires on every settled detent.",
      },
      {
        name: "itemWidth / itemHeight / perspective",
        type: "number",
        defaultValue: "160 / 200 / 1000",
        description: "Panel geometry; the ring radius derives from width and count.",
      },
      {
        name: "sensitivity",
        type: "number",
        defaultValue: "0.35",
        description: "Drag ratio in degrees per pixel.",
      },
      {
        name: "getLabel",
        type: "(index) => string",
        description: "Names panels for the live announcer.",
      },
    ],
    usageNotes: [
      "Only the fronted panel is interactive; the rest are inert and aria-hidden.",
      "Under reduced motion the drum becomes a flat scroll-snap row with identical semantics.",
    ],
  },
  {
    name: "flux-canvas",
    type: "registry:ui",
    title: "Flux Canvas",
    description:
      "A gradient with a pulse — a tiny WebGL2 shader drives a drifting color mesh or a domain-warped noise field, tinted from your theme tokens.",
    files: [{ path: "registry/ui/flux-canvas.tsx", type: "registry:ui" }],
    dependencies: [],
    registryDependencies: ["utils", "use-motion-safe"],
    categories: ["backgrounds"],
    meta: { serial: "KQ-034" },
    tagline: "A gradient with a pulse.",
    keywords: ["background", "webgl", "shader", "gradient", "hero"],
    // Installable via the registry; hidden from nav/docs until broad device
    // QA (battery, driver variance) clears.
    draft: true,
    props: [
      {
        name: "variant",
        type: '"mesh" | "warp"',
        defaultValue: '"mesh"',
        description: "Drifting color blobs, or a domain-warped noise field.",
      },
      {
        name: "speed / interactive / colorVars",
        type: "number / boolean / [string, string, string]",
        description: "Clock rate, pointer displacement, and the three theme tokens sampled.",
      },
      {
        name: "forceFallback",
        type: "boolean",
        defaultValue: "false",
        description: "Force the static CSS-gradient fallback.",
      },
    ],
    usageNotes: [
      "No WebGL2 or a lost context falls back to a static gradient from the same tokens; the loop pauses offscreen.",
      "Under reduced motion the shader draws exactly one frame — the time uniform never advances.",
    ],
  },
  {
    name: "wavefield",
    type: "registry:ui",
    title: "Wavefield",
    description:
      "Ambient physics, drawn on canvas — interference lattices, drifting contours, breathing grids, and particle fields that pause when unseen.",
    files: [{ path: "registry/ui/wavefield.tsx", type: "registry:ui" }],
    dependencies: [],
    registryDependencies: ["utils", "use-motion-safe"],
    categories: ["backgrounds"],
    meta: { serial: "KQ-032" },
    tagline: "Ambient physics, drawn on canvas.",
    keywords: ["background", "canvas", "generative", "hero", "ambient"],
    props: [
      {
        name: "variant",
        type: '"interference" | "contour" | "lattice" | "drift"',
        defaultValue: '"interference"',
        description: "Which field is drawn.",
      },
      {
        name: "speed / density / opacity",
        type: "number",
        defaultValue: "0.5 / 0.5 / 1",
        description: "Clock rate, geometry density (capped), and canvas-layer opacity.",
      },
      {
        name: "children",
        type: "ReactNode",
        description: "Overlay slot above the canvas — it carries all the semantics.",
      },
    ],
    usageNotes: [
      "Colors resolve from your theme tokens and re-resolve on theme flips; the loop pauses when hidden or offscreen.",
      "Under reduced motion exactly one designed frame is drawn — the loop never starts.",
    ],
  },
  {
    name: "phase-switch",
    type: "registry:ui",
    title: "Phase Switch",
    description:
      "Day to night in one clean sweep — a framework-agnostic theme toggle that reveals the new theme as a circle growing from the button, via the View Transitions API.",
    files: [{ path: "registry/ui/phase-switch.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["controls"],
    meta: { serial: "KQ-033" },
    tagline: "Day to night in one clean sweep.",
    keywords: ["theme", "dark mode", "toggle", "view transitions"],
    props: [
      {
        name: "checked / onCheckedChange",
        type: "boolean / (next) => void",
        description:
          "Controlled only — flip your own theme class inside the callback; the component owns zero theme logic.",
      },
      {
        name: "size / label",
        type: '"sm" | "md" | "lg" / string',
        defaultValue: '"md" / "Toggle theme"',
        description: "Control size and accessible name.",
      },
    ],
    usageNotes: [
      "Add `::view-transition-old(root), ::view-transition-new(root) { animation: none }` to your CSS so the clip reveal isn't fought by the default crossfade.",
      "Unsupported browsers and reduced motion get an instant flip with an icon crossfade.",
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
  {
    name: "kinetic-gallery",
    type: "registry:ui",
    title: "Kinetic Gallery",
    description:
      "Grab the strip and throw it — release carries momentum that decays and snaps the nearest frame to the rail, with prev/next and dot controls.",
    files: [{ path: "registry/ui/kinetic-gallery.tsx", type: "registry:ui" }],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["navigation"],
    meta: { serial: "KQ-035" },
    tagline: "Throw the strip; the nearest frame finds the rail.",
    keywords: ["carousel", "gallery", "slider", "fling", "momentum", "snap"],
    props: [
      {
        name: "children",
        type: "ReactNode",
        description:
          "Each direct child is a slide; widths are measured for snapping.",
      },
      {
        name: "gap",
        type: "number",
        defaultValue: "16",
        description: "Pixel gap between slides.",
      },
      {
        name: "align",
        type: '"start" | "center"',
        defaultValue: '"start"',
        description: "Where the active slide settles against the rail.",
      },
      {
        name: "aria-label",
        type: "string",
        description: "Names the gallery region for assistive tech.",
      },
    ],
    usageNotes: [
      "Arrow keys step slides, Home and End jump to the ends; a live region announces the current frame.",
      "Under reduced motion it becomes a native scroll-snap strip — direct swipe, no thrown momentum.",
    ],
  },
  {
    name: "tile-grid",
    type: "registry:ui",
    title: "Tile Grid",
    description:
      "Drag a tile and the grid reflows around it — the others FLIP-glide into their new slots, with a full keyboard lift-move-drop for reordering without a mouse.",
    files: [{ path: "registry/ui/tile-grid.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["layout"],
    meta: { serial: "KQ-036" },
    tagline: "Drag a tile; the grid reflows around it.",
    keywords: ["reorder", "drag and drop", "grid", "sortable", "flip", "layout"],
    props: [
      {
        name: "tiles",
        type: "{ id: string; content: ReactNode }[]",
        description: "The tiles in their initial order; identity drives the FLIP.",
      },
      {
        name: "columns",
        type: "number",
        defaultValue: "3",
        description: "Grid column count.",
      },
      {
        name: "onOrderChange",
        type: "(ids: string[]) => void",
        description: "Fires with the new id order after a drop or keyboard move.",
      },
      {
        name: "aria-label",
        type: "string",
        description: "Names the reorderable list.",
      },
    ],
    usageNotes: [
      "Keyboard: Space lifts a tile, arrows move it (left/right by one, up/down by a row), Space drops, Escape cancels.",
      "Under reduced motion tiles snap to their new positions — dragging still tracks 1:1, without the glide.",
    ],
  },
  {
    name: "segmented-control",
    type: "registry:ui",
    title: "Segmented Control",
    description:
      "A compact value picker whose raised thumb glides between segments on snap — radio-group semantics, so it selects a value rather than switching panels.",
    files: [
      { path: "registry/ui/segmented-control.tsx", type: "registry:ui" },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["selection"],
    meta: { serial: "KQ-037" },
    tagline: "A thumb that glides to the chosen segment.",
    keywords: [
      "segmented",
      "toggle group",
      "radio",
      "selection",
      "control",
      "tabs",
    ],
    props: [
      {
        name: "value / defaultValue / onValueChange",
        type: "string / string / (value) => void",
        description: "Controlled or uncontrolled selection.",
      },
      {
        name: "name / label",
        type: "string / ReactNode",
        description:
          "Hidden native radios for form posts; a visible group label (or pass aria-label).",
      },
      {
        name: "size",
        type: '"sm" | "md"',
        defaultValue: '"md"',
        description: "Control height and type scale.",
      },
      {
        name: "Item.value / Item.disabled",
        type: "string / boolean",
        description: "Segment identity and per-segment disabling.",
      },
    ],
    usageNotes: [
      "Full APG radio keyboard: arrows move and select (wrapping), Home and End jump, Space selects.",
      "Under reduced motion the thumb appears under the active segment instantly — no travel, color only.",
    ],
  },
  {
    name: "triage-deck",
    type: "registry:ui",
    title: "Triage Deck",
    description:
      "A decision stack you flick through — throw a card right to accept or left to reject, a velocity-projected release commits, and the next card rises from behind.",
    files: [{ path: "registry/ui/triage-deck.tsx", type: "registry:ui" }],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["physics"],
    meta: { serial: "KQ-038" },
    tagline: "Flick to accept, flick to reject.",
    keywords: ["swipe", "cards", "deck", "triage", "review", "gesture"],
    props: [
      {
        name: "cards",
        type: "{ id: string; content: ReactNode }[]",
        description:
          "The queue; the top card is interactive, the rest peek behind.",
      },
      {
        name: "onDecide",
        type: '(id, decision: "accept" | "reject") => void',
        description: "Fires when a card commits in either direction.",
      },
      {
        name: "onEmpty",
        type: "() => void",
        description: "Fires when the last card is decided.",
      },
      {
        name: "acceptLabel / rejectLabel",
        type: "string / string",
        description: "Button and affordance labels.",
      },
    ],
    usageNotes: [
      "Arrow keys decide (left rejects, right accepts) and buttons drive it pointer-free; a live region announces each decision.",
      "Under reduced motion cards cross-fade instead of flying off — dragging still tracks, without the throw.",
    ],
  },
  {
    name: "spark-chart",
    type: "registry:ui",
    title: "Spark Chart",
    description:
      "A compact line or area chart that draws itself on arrival, then lets you scrub a crosshair that snaps to the nearest point and reads its value.",
    files: [{ path: "registry/ui/spark-chart.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["data"],
    meta: { serial: "KQ-039" },
    tagline: "A trace that draws itself, then reads out.",
    keywords: ["chart", "sparkline", "graph", "line", "area", "scrubber"],
    props: [
      {
        name: "data",
        type: "number[] | { x: number | string; y: number }[]",
        description:
          "Bare numbers get index labels; objects carry their own x.",
      },
      {
        name: "variant",
        type: '"line" | "area"',
        defaultValue: '"line"',
        description: "Stroke only, or a filled area under the curve.",
      },
      {
        name: "height / format",
        type: "number / (y) => string",
        description: "Chart height in px and value formatting for the readout.",
      },
      {
        name: "label",
        type: "string",
        description: "Accessible name and summary for the trace.",
      },
    ],
    usageNotes: [
      "Focus and arrow-key to move the crosshair; Home and End jump; the active point is announced.",
      "Under reduced motion the trace renders fully drawn — scrubbing still works, without the draw-on.",
    ],
  },
  {
    name: "radial-bars",
    type: "registry:ui",
    title: "Radial Bars",
    description:
      "A polar bar chart — wedges radiate from a hub, each growing to its value on the glide spring; hover or focus a wedge to brighten it and read its value in the hub.",
    files: [{ path: "registry/ui/radial-bars.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["data"],
    meta: { serial: "KQ-040" },
    tagline: "Bars that radiate from a hub.",
    keywords: ["chart", "radial", "polar", "bar chart", "data", "coxcomb"],
    props: [
      {
        name: "data",
        type: "{ label: string; value: number; color?: string }[]",
        description: "One wedge per entry; value drives its radial length.",
      },
      {
        name: "max",
        type: "number",
        description:
          "Value that reaches the outer radius; defaults to the data max.",
      },
      {
        name: "size / format",
        type: "number / (value) => string",
        description: "Diameter in px and value formatting for the readout.",
      },
      {
        name: "aria-label",
        type: "string",
        description: "Names the chart region.",
      },
    ],
    usageNotes: [
      "Every wedge is a focusable data point announcing its label and value, so the chart is operable by keyboard.",
      "Under reduced motion the wedges render at full length instantly — the hover/focus highlight is color only.",
    ],
  },
  {
    name: "coverflow",
    type: "registry:ui",
    title: "Coverflow",
    description:
      "A cover gallery in perspective — the active card faces you while its neighbors bank away and recede, and any card you steer to glides to the front.",
    files: [{ path: "registry/ui/coverflow.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["spatial"],
    meta: { serial: "KQ-041" },
    tagline: "Covers that bank away in perspective.",
    keywords: ["coverflow", "carousel", "3d", "gallery", "perspective", "cards"],
    props: [
      {
        name: "children",
        type: "ReactNode",
        description: "Each direct child is a cover.",
      },
      {
        name: "index / defaultIndex / onIndexChange",
        type: "number / number / (index) => void",
        description: "Controlled or uncontrolled active cover.",
      },
      {
        name: "aria-label",
        type: "string",
        description: "Names the gallery region.",
      },
    ],
    usageNotes: [
      "Drag, wheel, click a side cover, or arrow-key to steer; a live region announces the active item.",
      "Under reduced motion it flattens to a native scroll-snap row — no perspective, same controls.",
    ],
  },
  {
    name: "parallax-scene",
    type: "registry:ui",
    title: "Parallax Scene",
    description:
      "A depth-layered diorama that parades its layers past the pointer — each sits at its own depth, the whole scene tilts toward your cursor and drifts back on leave.",
    files: [{ path: "registry/ui/parallax-scene.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["spatial"],
    meta: { serial: "KQ-042" },
    tagline: "Layers that part around the pointer.",
    keywords: ["parallax", "depth", "3d", "diorama", "tilt", "layers"],
    props: [
      {
        name: "children",
        type: "ReactNode",
        description: "ParallaxLayer elements, back to front (max ~4).",
      },
      {
        name: "maxTilt",
        type: "number",
        defaultValue: "8",
        description: "Degrees the scene rotates toward the pointer.",
      },
      {
        name: "Layer.depth",
        type: "number",
        description: "0 is far and moves least; 1 is near and moves most.",
      },
    ],
    usageNotes: [
      "The parallax is decorative — layer content stays in normal flow and fully focusable.",
      "Under reduced motion the layers render flat and stationary at their neutral position.",
    ],
  },
  {
    name: "tether-rope",
    type: "registry:ui",
    title: "Tether Rope",
    description:
      "A hanging rope you grab and swing — a Verlet chain with gravity and length constraints, so it whips, goes taut, and settles like real cord.",
    files: [{ path: "registry/ui/tether-rope.tsx", type: "registry:ui" }],
    registryDependencies: ["utils", "use-motion-safe"],
    categories: ["physics"],
    meta: { serial: "KQ-043" },
    tagline: "Grab the cord; Verlet does the rest.",
    keywords: ["rope", "verlet", "physics", "chain", "cloth", "simulation"],
    props: [
      {
        name: "nodes",
        type: "number",
        defaultValue: "12",
        description: "Segment nodes, clamped to 4–16.",
      },
      {
        name: "anchor",
        type: '"top" | "ends"',
        defaultValue: '"top"',
        description: "Pin the first node, or both ends like a slung cable.",
      },
      {
        name: "height",
        type: "number",
        defaultValue: "280",
        description: "Stage height in px.",
      },
    ],
    usageNotes: [
      "Drag any point to swing the rope; a Reset button re-drops it. The loop pauses offscreen and when the tab is hidden.",
      "Under reduced motion it renders a static hanging catenary — no simulation.",
    ],
  },
  {
    name: "pendulum-wave",
    type: "registry:ui",
    title: "Pendulum Wave",
    description:
      "A rank of pendulums whose periods step apart — released together they drift through traveling waves and snap back into alignment on a fixed cycle.",
    files: [{ path: "registry/ui/pendulum-wave.tsx", type: "registry:ui" }],
    registryDependencies: ["utils", "use-motion-safe"],
    categories: ["physics"],
    meta: { serial: "KQ-044" },
    tagline: "Periods that part, then realign.",
    keywords: [
      "pendulum",
      "wave",
      "harmonic",
      "physics",
      "oscillation",
      "kinetic",
    ],
    props: [
      {
        name: "count",
        type: "number",
        defaultValue: "12",
        description: "Pendulums, clamped to 4–20.",
      },
      {
        name: "amplitude / cycleSeconds / baseOscillations",
        type: "number",
        description:
          "Swing angle, realign-cycle length, and the longest pendulum's swing count.",
      },
      {
        name: "height",
        type: "number",
        defaultValue: "260",
        description: "Stage height in px.",
      },
    ],
    usageNotes: [
      "Motion is analytic — each bob follows a closed-form cosine, so the realign cycle is exact. Restart re-aligns them.",
      "Under reduced motion it renders one static fanned frame — no loop.",
    ],
  },
  {
    name: "rubber-sheet",
    type: "registry:ui",
    title: "Rubber Sheet",
    description:
      "A taut mesh you pull toward the pointer with a smooth falloff; release and the vertices fire home, ringing through equilibrium twice before they settle.",
    files: [{ path: "registry/ui/rubber-sheet.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["physics"],
    meta: { serial: "KQ-045" },
    tagline: "Pull the membrane; it rings back.",
    keywords: ["membrane", "mesh", "elastic", "physics", "grid", "deform"],
    props: [
      {
        name: "columns / rows",
        type: "number",
        description: "Mesh density; columns default 9, rows default 7.",
      },
      {
        name: "height",
        type: "number",
        defaultValue: "260",
        description: "Stage height in px.",
      },
      {
        name: "aria-label",
        type: "string",
        description: "Names the surface.",
      },
    ],
    usageNotes: [
      "The release rides the recoil spring, so the sheet overshoots and settles in two visible bounces.",
      "Under reduced motion the mesh deforms 1:1 while dragging but snaps flat on release — no ripple.",
    ],
  },
  {
    name: "iron-filings",
    type: "registry:ui",
    title: "Iron Filings",
    description:
      "A canvas lattice of dash filings that align to the cursor like iron around a magnetic pole — near the pointer they snap radial and brighten, far off they relax and dim.",
    files: [{ path: "registry/ui/iron-filings.tsx", type: "registry:ui" }],
    registryDependencies: ["utils", "use-motion-safe"],
    categories: ["backgrounds"],
    meta: { serial: "KQ-046" },
    tagline: "A field that aligns to your cursor.",
    keywords: [
      "canvas",
      "background",
      "magnetic",
      "field",
      "particles",
      "cursor",
    ],
    props: [
      {
        name: "spacing",
        type: "number",
        defaultValue: "26",
        description: "Pixels between filings in the grid (clamped 16–48).",
      },
      {
        name: "height",
        type: "number",
        defaultValue: "320",
        description: "Stage height in px when used standalone.",
      },
      {
        name: "children",
        type: "ReactNode",
        description: "Overlay content rendered above the field.",
      },
    ],
    usageNotes: [
      "The canvas loop pauses offscreen and when the tab is hidden; colors re-resolve on a theme flip.",
      "Under reduced motion it renders one static lattice frame — no loop, no cursor response.",
    ],
  },
  {
    name: "swarm-field",
    type: "registry:ui",
    title: "Swarm Field",
    description:
      "A canvas flock of boids that murmur with emergent flocking and scatter from the cursor, then regroup — separation, alignment, cohesion, and flee, on a spatial hash.",
    files: [{ path: "registry/ui/swarm-field.tsx", type: "registry:ui" }],
    registryDependencies: ["utils", "use-motion-safe"],
    categories: ["backgrounds"],
    meta: { serial: "KQ-047" },
    tagline: "A flock that scatters from your cursor.",
    keywords: [
      "canvas",
      "boids",
      "flocking",
      "swarm",
      "background",
      "particles",
    ],
    props: [
      {
        name: "count",
        type: "number",
        defaultValue: "80",
        description: "Boid count, clamped to 10–100.",
      },
      {
        name: "height",
        type: "number",
        defaultValue: "320",
        description: "Stage height in px when used standalone.",
      },
      {
        name: "children",
        type: "ReactNode",
        description: "Overlay content rendered above the field.",
      },
    ],
    usageNotes: [
      "Neighbor queries run on a spatial hash, so the flock stays near O(n); the loop pauses offscreen and when hidden.",
      "Under reduced motion it renders one settled frame — no loop, no scatter.",
    ],
  },
  {
    name: "magnetic-cursor",
    type: "registry:ui",
    title: "Magnetic Cursor",
    description:
      "A pointer layer for fine cursors — a drift-lagged spotlight trails the cursor and any MagneticTarget leans toward it, then springs back; inert on touch and reduced motion.",
    files: [{ path: "registry/ui/magnetic-cursor.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["cursor"],
    meta: { serial: "KQ-048" },
    tagline: "Targets that reach for the cursor.",
    keywords: [
      "cursor",
      "magnetic",
      "pointer",
      "hover",
      "spotlight",
      "interaction",
    ],
    props: [
      {
        name: "MagneticCursor.size",
        type: "number",
        defaultValue: "28",
        description: "Spotlight follower diameter in px.",
      },
      {
        name: "MagneticTarget.strength",
        type: "number",
        defaultValue: "0.35",
        description: "Fraction of the pointer offset a target follows.",
      },
      {
        name: "MagneticTarget.radius",
        type: "number",
        defaultValue: "90",
        description: "Activation radius in px around the target.",
      },
    ],
    usageNotes: [
      "Wrap real controls in MagneticTarget — the transform layer never touches focus or clicks.",
      "Active only on (pointer:fine) with motion allowed; otherwise children render untouched.",
    ],
  },
  {
    name: "aurora-ribbon",
    type: "registry:ui",
    title: "Aurora Ribbon",
    description:
      "Slow sinusoidal ribbons of light that undulate across the field like an aurora and bend toward the pointer — a calm, luminous canvas backdrop.",
    files: [{ path: "registry/ui/aurora-ribbon.tsx", type: "registry:ui" }],
    registryDependencies: ["utils", "use-motion-safe"],
    categories: ["backgrounds"],
    meta: { serial: "KQ-049" },
    tagline: "Light ribbons that lean toward the cursor.",
    keywords: ["canvas", "aurora", "background", "gradient", "ambient", "glow"],
    props: [
      {
        name: "bands",
        type: "number",
        defaultValue: "3",
        description: "Number of ribbons, clamped to 1–6.",
      },
      {
        name: "height",
        type: "number",
        defaultValue: "320",
        description: "Stage height in px when used standalone.",
      },
      {
        name: "children",
        type: "ReactNode",
        description: "Overlay content rendered above the field.",
      },
    ],
    usageNotes: [
      "Ribbons bloom where they overlap (additive compositing); the loop pauses offscreen and when the tab is hidden.",
      "Under reduced motion it renders one static frame — no undulation, no pointer response.",
    ],
  },
  {
    name: "point-globe",
    type: "registry:ui",
    title: "Point Globe",
    description:
      "A globe of points on a Fibonacci sphere that drifts on its own and spins under your drag, carrying angular momentum — near points brighten, the far side dims.",
    files: [{ path: "registry/ui/point-globe.tsx", type: "registry:ui" }],
    registryDependencies: ["utils", "use-motion-safe"],
    categories: ["spatial"],
    meta: { serial: "KQ-050" },
    tagline: "A dotted planet you spin.",
    keywords: ["canvas", "globe", "sphere", "3d", "points", "rotation"],
    props: [
      {
        name: "points",
        type: "number",
        defaultValue: "520",
        description: "Dots on the sphere, clamped to 120–700.",
      },
      {
        name: "autoRotate",
        type: "boolean",
        defaultValue: "true",
        description: "Idle drift when not being dragged.",
      },
      {
        name: "height",
        type: "number",
        defaultValue: "340",
        description: "Stage height in px.",
      },
    ],
    usageNotes: [
      "Drag to spin; release carries momentum that decays back to the idle drift. The loop pauses offscreen and when hidden.",
      "Under reduced motion it renders a static globe — no drift, no momentum.",
    ],
  },
  {
    name: "voronoi-shatter",
    type: "registry:ui",
    title: "Voronoi Shatter",
    description:
      "A Voronoi tessellation that fractures outward from your tap — shards fly, rotate, and fade, then ring back into place and reseal on the recoil spring.",
    files: [{ path: "registry/ui/voronoi-shatter.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["backgrounds"],
    meta: { serial: "KQ-051" },
    tagline: "Tap and the tessellation shatters, then reseals.",
    keywords: ["voronoi", "shatter", "fracture", "svg", "cells", "background"],
    props: [
      {
        name: "cells",
        type: "number",
        defaultValue: "28",
        description: "Voronoi seed sites, clamped to 8–60.",
      },
      {
        name: "height",
        type: "number",
        defaultValue: "280",
        description: "Stage height in px.",
      },
      {
        name: "aria-label",
        type: "string",
        description: "Names the surface.",
      },
    ],
    usageNotes: [
      "Cells are a real Voronoi built from half-plane clipping, computed once; the shard transforms repaint imperatively from one progress spring.",
      "Under reduced motion a tap leaves the tessellation whole — no shatter.",
    ],
  },
  {
    name: "comet-cursor",
    type: "registry:ui",
    title: "Comet Cursor",
    description:
      "A contained field where the pointer drags a luminous comet — a bright head with a tapering tail that thickens with speed and collapses when you rest.",
    files: [{ path: "registry/ui/comet-cursor.tsx", type: "registry:ui" }],
    registryDependencies: ["utils", "use-motion-safe"],
    categories: ["cursor"],
    meta: { serial: "KQ-052" },
    tagline: "A comet that chases the pointer.",
    keywords: ["canvas", "cursor", "trail", "comet", "particles", "pointer"],
    props: [
      {
        name: "trail",
        type: "number",
        defaultValue: "28",
        description: "Trail sample count, clamped to 8–64.",
      },
      {
        name: "height",
        type: "number",
        defaultValue: "320",
        description: "Stage height in px.",
      },
      {
        name: "children",
        type: "ReactNode",
        description: "Overlay content rendered above the field.",
      },
    ],
    usageNotes: [
      "The tail widens with pointer speed and collapses into the head at rest; the loop pauses offscreen and when hidden.",
      "Under reduced motion it renders one static frame — no trail, no pointer response.",
    ],
  },
  {
    name: "ripple-surface",
    type: "registry:ui",
    title: "Ripple Surface",
    description:
      "Tap the surface and a wavefront propagates out; tap again and the rings overlap into visible interference — a calm canvas pond that answers every touch.",
    files: [{ path: "registry/ui/ripple-surface.tsx", type: "registry:ui" }],
    registryDependencies: ["utils", "use-motion-safe"],
    categories: ["backgrounds"],
    meta: { serial: "KQ-053" },
    tagline: "Tap and wavefronts interfere.",
    keywords: [
      "canvas",
      "ripple",
      "wave",
      "background",
      "interference",
      "water",
    ],
    props: [
      {
        name: "height",
        type: "number",
        defaultValue: "320",
        description: "Stage height in px.",
      },
      {
        name: "children",
        type: "ReactNode",
        description: "Overlay content rendered above the field.",
      },
    ],
    usageNotes: [
      "Concurrent ripples are pooled and capped; crests reinforce where wavefronts cross. The loop pauses offscreen and when hidden.",
      "Under reduced motion it renders one calm static frame — a tap does not propagate.",
    ],
  },
  {
    name: "flow-diagram",
    type: "registry:ui",
    title: "Flow Diagram",
    description:
      "A Sankey flow — nodes in columns, links sized to their value with a marching-dash current, and a hover that traces a node's whole upstream and downstream path.",
    files: [{ path: "registry/ui/flow-diagram.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["data"],
    meta: { serial: "KQ-054" },
    tagline: "Quantity, flowing between nodes.",
    keywords: ["sankey", "flow", "diagram", "graph", "data", "network"],
    props: [
      {
        name: "nodes",
        type: "{ id: string; label: string; column: number }[]",
        description: "Graph nodes with their column placement.",
      },
      {
        name: "links",
        type: "{ source: string; target: string; value: number }[]",
        description: "Flows; value drives link thickness.",
      },
      {
        name: "height",
        type: "number",
        defaultValue: "300",
        description: "Stage height in px.",
      },
    ],
    usageNotes: [
      "Hover or focus a node to trace its connected path; an sr-only summary lists every flow.",
      "Under reduced motion the dashes stop marching — the highlight is color only.",
    ],
  },
  {
    name: "timeline-spine",
    type: "registry:ui",
    title: "Timeline Spine",
    description:
      "A scroll-linked timeline — a playhead rides the spine as you scroll, the spine fills behind it, and each event pops in as the head reaches it.",
    files: [{ path: "registry/ui/timeline-spine.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["motion"],
    meta: { serial: "KQ-055" },
    tagline: "A playhead that rides your scroll.",
    keywords: ["timeline", "scroll", "spine", "changelog", "reveal", "progress"],
    props: [
      {
        name: "events",
        type: "{ title: string; detail?: ReactNode; marker?: ReactNode }[]",
        description: "Ordered events rendered along the spine.",
      },
      {
        name: "aria-label",
        type: "string",
        description: "Names the timeline region.",
      },
    ],
    usageNotes: [
      "Events are a semantic ordered list, readable regardless of motion; the spine and playhead are decorative.",
      "Under reduced motion everything renders in its final state — no scroll-driven animation.",
    ],
  },
  {
    name: "pull-to-refresh",
    type: "registry:ui",
    title: "Pull to Refresh",
    description:
      "Over-pull the list past a calibrated detent and release — it holds to refresh, then settles back as the fresh rows cascade in.",
    files: [{ path: "registry/ui/pull-to-refresh.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["physics"],
    meta: { serial: "KQ-056" },
    tagline: "Pull past the detent; rows cascade in.",
    keywords: [
      "pull to refresh",
      "gesture",
      "list",
      "rubber band",
      "refresh",
      "physics",
    ],
    props: [
      {
        name: "onRefresh",
        type: "() => Promise<void> | void",
        description: "Called when a past-detent pull is released.",
      },
      {
        name: "children",
        type: "ReactNode",
        description: "The scrollable content.",
      },
      {
        name: "threshold",
        type: "number",
        defaultValue: "72",
        description: "Pixels past which release triggers a refresh.",
      },
    ],
    usageNotes: [
      "Only engages when the list is scrolled to the top; a focusable Refresh button keeps it operable without a pointer.",
      "Under reduced motion the pull eases home without overshoot and the new rows fade in once — no cascade.",
    ],
  },
  {
    name: "orbit-menu",
    type: "registry:ui",
    title: "Orbit Menu",
    description:
      "Items ring a hub and rotate on a weighted dial — flick the ring and it flings, then snaps the nearest item into the active detent at the top.",
    files: [{ path: "registry/ui/orbit-menu.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["navigation"],
    meta: { serial: "KQ-057" },
    tagline: "A dial of options that snaps to a detent.",
    keywords: ["radial", "menu", "orbit", "dial", "navigation", "selector"],
    props: [
      {
        name: "items",
        type: "{ id: string; label: string; icon?: ReactNode }[]",
        description: "Options placed evenly around the ring.",
      },
      {
        name: "value / defaultValue / onValueChange",
        type: "string / string / (id) => void",
        description: "Controlled or uncontrolled active item.",
      },
      {
        name: "size",
        type: "number",
        defaultValue: "260",
        description: "Ring diameter in px.",
      },
    ],
    usageNotes: [
      "Drag to spin, click an item, or arrow-key to rotate; a live region announces the active item.",
      "Under reduced motion selection snaps to the detent instantly — no fling momentum.",
    ],
  },
  {
    name: "spark-burst",
    type: "registry:ui",
    title: "Spark Burst",
    description:
      "A calibrated celebration, not confetti — call fire() and a tight radial burst of hairline rays and a fast ring shoots out and fades, monochrome with a signal glint.",
    files: [{ path: "registry/ui/spark-burst.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["delight"],
    meta: { serial: "KQ-058" },
    tagline: "Restraint as celebration.",
    keywords: [
      "burst",
      "celebration",
      "confetti",
      "sparks",
      "delight",
      "imperative",
    ],
    props: [
      {
        name: "ref.fire(opts?)",
        type: "(opts?: { rays?: number }) => void",
        description: "Imperative handle — call it to emit one burst.",
      },
      {
        name: "rays / spread",
        type: "number / number",
        description:
          "Ray count (default 12) and travel distance in px (default 40).",
      },
      {
        name: "color",
        type: "string",
        defaultValue: '"var(--signal)"',
        description: "Ray color.",
      },
    ],
    usageNotes: [
      "Get a ref of type SparkBurstHandle and call fire(); rapid fires stack and clean themselves up.",
      "Under reduced motion fire() gives a single centered pulse — no radiating rays.",
    ],
  },
  {
    name: "heart-tap",
    type: "registry:ui",
    title: "Heart Tap",
    description:
      "A like that celebrates — the heart squashes then pops, a tight ring of sparks bursts once, and the count rolls up; un-liking deflates and rolls back down.",
    files: [{ path: "registry/ui/heart-tap.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["delight"],
    meta: { serial: "KQ-059" },
    tagline: "Pop, sparks, and a rolling count.",
    keywords: ["like", "heart", "reaction", "counter", "delight", "toggle"],
    props: [
      {
        name: "liked / defaultLiked / onChange",
        type: "boolean / boolean / (state) => void",
        description:
          "Controlled or uncontrolled liked state; onChange gets { liked, count }.",
      },
      {
        name: "count / defaultCount",
        type: "number / number",
        description: "Controlled or uncontrolled count, clamped at zero.",
      },
      {
        name: "size",
        type: "number",
        defaultValue: "28",
        description: "Heart glyph size in px.",
      },
    ],
    usageNotes: [
      "A real toggle button — Space/Enter like, aria-pressed and the count are announced.",
      "Under reduced motion the fill switches and the count swaps instantly — no pop, sparks, or roll.",
    ],
  },
  {
    name: "reaction-fly",
    type: "registry:ui",
    title: "Reaction Fly",
    description:
      "Press to bloom a reaction picker; choosing one sends a copy flying up — rising, drifting, and fading on its own jittered path — while its tally ticks up.",
    files: [{ path: "registry/ui/reaction-fly.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["delight"],
    meta: { serial: "KQ-060" },
    tagline: "Reactions that bloom, then fly.",
    keywords: ["reaction", "emoji", "like", "fly", "delight", "livestream"],
    props: [
      {
        name: "reactions",
        type: "{ id: string; label: string; node?: ReactNode }[]",
        description: "The pickable reactions; defaults to a curated set.",
      },
      {
        name: "onReact",
        type: "(id: string) => void",
        description: "Fires with the reaction id on each selection.",
      },
      {
        name: "aria-label",
        type: "string",
        description: "Names the trigger.",
      },
    ],
    usageNotes: [
      "Full menu semantics — the trigger has aria-haspopup, items are menuitems, Escape closes, and each reaction is announced.",
      "Under reduced motion the picker opens without stagger and selecting bumps the tally with no fly-up.",
    ],
  },
  {
    name: "facet-cube",
    type: "registry:ui",
    title: "Facet Cube",
    description:
      "A six-face content cube with real CSS geometry — drag to rotate with per-pixel resistance, release and it snaps both axes to the nearest 90° detent, or walk faces with the arrow keys; the facing face is announced on settle.",
    files: [{ path: "registry/ui/facet-cube.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "spatial"],
    categories: ["spatial"],
    meta: { serial: "KQ-071" },
    tagline: "Six faces, one cube, snap detents.",
    keywords: ["cube", "3d", "rotate", "faces", "spatial", "drag", "detent"],
    props: [
      {
        name: "faces",
        type: "ReactNode[]",
        description: "Up to six face plates; missing faces render empty.",
      },
      {
        name: "labels",
        type: "string[]",
        description: "Per-face names for the screen-reader announcement.",
      },
      {
        name: "size",
        type: "number",
        defaultValue: "220",
        description: "Cube edge in px; the wrapper pads for mid-turn corners.",
      },
      {
        name: "defaultFace / onFaceChange",
        type: "number / (index) => void",
        description: "Starting face and the settle callback.",
      },
    ],
    usageNotes: [
      "A focusable group with aria-roledescription — arrows rotate one detent, Home returns to face one, and the facing face is announced politely.",
      "Under reduced motion the cube renders flat: one face at a time, instant swaps, same keys and announcements.",
    ],
  },
  {
    name: "prism-flip",
    type: "registry:ui",
    title: "Prism Flip",
    description:
      "A triangular prism that rolls toward the viewer between three panels — tap to advance, drag vertically against the detents, or step with the arrow keys; true equilateral geometry with edge shading.",
    files: [{ path: "registry/ui/prism-flip.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "spatial"],
    categories: ["spatial"],
    meta: { serial: "KQ-072" },
    tagline: "Three panels on one rolling prism.",
    keywords: ["prism", "3d", "rotator", "panels", "spatial", "toggle", "roll"],
    props: [
      {
        name: "panels",
        type: "ReactNode[]",
        description: "The three faces; extra entries are ignored.",
      },
      {
        name: "index / defaultIndex / onIndexChange",
        type: "number / number / (index) => void",
        description: "Controlled or uncontrolled facing panel.",
      },
      {
        name: "labels",
        type: "string[]",
        description: "Per-panel names for the announcement.",
      },
      {
        name: "height",
        type: "number",
        defaultValue: "128",
        description: "Panel height in px; clearance is derived from it.",
      },
    ],
    usageNotes: [
      "A focusable rotator — arrows step panels, Home returns to the first, and the facing panel is announced politely.",
      "Under reduced motion the prism renders one flat panel with instant crossfade swaps.",
    ],
  },
  {
    name: "coin-toggle",
    type: "registry:ui",
    title: "Coin Toggle",
    description:
      "A switch struck as a coin — it flips 180° in true perspective on every toggle, always forward, and lands with an edge-wobble on the recoil spring; faces are yours to mint.",
    files: [{ path: "registry/ui/coin-toggle.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "spatial"],
    categories: ["spatial"],
    meta: { serial: "KQ-073" },
    tagline: "Heads on, tails off.",
    keywords: ["switch", "toggle", "coin", "flip", "3d", "spatial", "control"],
    props: [
      {
        name: "checked / defaultChecked / onCheckedChange",
        type: "boolean / boolean / (checked) => void",
        description: "Controlled or uncontrolled switch state.",
      },
      {
        name: "size",
        type: "number",
        defaultValue: "56",
        description: "Coin diameter in px.",
      },
      {
        name: "faces",
        type: "{ on: ReactNode; off: ReactNode }",
        description: "Custom face artwork; defaults to minted glyphs.",
      },
      {
        name: "aria-label",
        type: "string",
        description: "Required accessible name for the bare switch.",
      },
    ],
    usageNotes: [
      "A real role=switch button — Space and Enter flip it, aria-checked tracks state, and focus-visible rings are never removed.",
      "Under reduced motion the faces crossfade with no flip or wobble — the accent change carries the state.",
    ],
  },
  {
    name: "dice-roll",
    type: "registry:ui",
    title: "Dice Roll",
    description:
      "Hold to charge — the die swells and shivers while an arc fills — then release to tumble two full turns and land on a face you chose: outcomes come from a prop or a fixed sequence, never chance.",
    files: [{ path: "registry/ui/dice-roll.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "spatial"],
    categories: ["spatial"],
    meta: { serial: "KQ-074" },
    tagline: "A die that always answers.",
    keywords: ["dice", "die", "3d", "tumble", "roll", "spatial", "random"],
    props: [
      {
        name: "value / onRoll",
        type: "number / (value) => void",
        description: "Controlled outcome for the next roll, and the landing callback.",
      },
      {
        name: "sequence",
        type: "number[]",
        description: "Uncontrolled outcomes, cycled in order — deterministic by design.",
      },
      {
        name: "size",
        type: "number",
        defaultValue: "88",
        description: "Die edge in px.",
      },
    ],
    usageNotes: [
      "A real button — hold Space or Enter to charge, release to roll; Escape aborts a charge; the result is announced politely.",
      "Under reduced motion there is no shiver or tumble — release swaps straight to the outcome face and announces it.",
    ],
  },
  {
    name: "gimbal-dial",
    type: "registry:ui",
    title: "Gimbal Dial",
    description:
      "A two-axis picker built as nested rings in perspective — spin the outer band for one value and the inner for the other; flicks carry momentum, releases settle on detents, and a hub reads both channels live.",
    files: [{ path: "registry/ui/gimbal-dial.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "spatial"],
    categories: ["spatial"],
    meta: { serial: "KQ-075" },
    tagline: "Two rings, two channels, one hub.",
    keywords: ["dial", "gimbal", "rings", "2-axis", "spatial", "picker", "knob"],
    props: [
      {
        name: "value / defaultValue / onValueChange",
        type: "{ yaw, pitch } / same / (value) => void",
        description: "Controlled or uncontrolled 0–100 per axis; fires once per settled detent.",
      },
      {
        name: "step",
        type: "number",
        defaultValue: "5",
        description: "Detent size in value units.",
      },
      {
        name: "size",
        type: "number",
        defaultValue: "200",
        description: "Outer ring diameter in px.",
      },
      {
        name: "axisLabels",
        type: "{ yaw: string; pitch: string }",
        description: "Accessible names for the two slider bands.",
      },
    ],
    usageNotes: [
      "Each ring is an independent role=slider — arrows step it, Home and End jump, and aria-valuenow tracks the detents.",
      "Under reduced motion the rings render flat and drags update values directly with no momentum.",
    ],
  },
  {
    name: "rolodex-list",
    type: "registry:ui",
    title: "Rolodex List",
    description:
      "Records on a vertical wheel — drag, scroll a notch at a time, or arrow through; cards flip over the crest, the front record carries the accent, and Enter pulls it. A selection control, not a display drum.",
    files: [{ path: "registry/ui/rolodex-list.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "spatial"],
    categories: ["spatial"],
    meta: { serial: "KQ-076" },
    tagline: "A wheel of records with a crest.",
    keywords: ["rolodex", "list", "wheel", "3d", "spatial", "listbox", "records"],
    props: [
      {
        name: "items",
        type: "{ id, content, label? }[]",
        description: "The records on the wheel.",
      },
      {
        name: "index / defaultIndex / onIndexChange",
        type: "number / number / (index) => void",
        description: "Controlled or uncontrolled front record; change fires on settle.",
      },
      {
        name: "onSelect",
        type: "(id, index) => void",
        description: "Explicit activation — Enter, Space, or a tap on the front card.",
      },
      {
        name: "height / loop",
        type: "number / boolean",
        defaultValue: "260 / true",
        description: "Viewport height in px, and whether the wheel wraps.",
      },
    ],
    usageNotes: [
      "A real listbox — aria-activedescendant tracks the front record, arrows rotate one step, and the wheel only captures scroll while the pointer is over it.",
      "Under reduced motion it renders a flat three-row list with instant swaps and the same semantics.",
    ],
  },
];
