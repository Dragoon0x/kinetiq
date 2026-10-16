"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  motionValue,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
  type Transition,
} from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  GripVertical,
  Heading,
  Image as ImageIcon,
  Mail,
  Minus,
  Monitor,
  MousePointerClick,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Smartphone,
  TextAlignCenter,
  TextAlignStart,
  Trash2,
  TriangleAlert,
  Type,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ------------------------------------------------------------------------- */
/*                                   Types                                    */
/* ------------------------------------------------------------------------- */

export type BulletinBlockKind =
  "header" | "text" | "image" | "button" | "divider";
export type BulletinArt = "fernhouse" | "guide" | "spores";
export type BulletinPreview = "desktop" | "phone";
export type BulletinBlockStyle = "seamless" | "framed" | "stacked";
export type BulletinStatus = "ready" | "loading" | "error";

export type BulletinHeaderBlock = {
  id: string;
  kind: "header";
  /** The small line over the title. */
  kicker: string;
  title: string;
  /** @default "start" */
  align?: "start" | "center";
};
export type BulletinTextBlock = { id: string; kind: "text"; body: string };
export type BulletinImageBlock = {
  id: string;
  kind: "image";
  /** One of the pictures drawn in code. */
  art: BulletinArt;
  /** What the picture shows, for readers who can't see it. Empty is flagged. */
  alt: string;
  caption?: string;
};
export type BulletinButtonBlock = {
  id: string;
  kind: "button";
  label: string;
  href: string;
  /** Stretch the button across a phone screen. @default true */
  fullWidthOnPhone?: boolean;
};
export type BulletinDividerBlock = {
  id: string;
  kind: "divider";
  /** A hairline, or just a pause. @default "line" */
  style?: "line" | "space";
};

export type BulletinBlock =
  | BulletinHeaderBlock
  | BulletinTextBlock
  | BulletinImageBlock
  | BulletinButtonBlock
  | BulletinDividerBlock;

export type BulletinComposerProps = {
  /** Width the phone preview narrows the letter to, px; the desktop frame marks it with two guides. @default 380 */
  previewWidth?: number;
  /** How blocks sit on the canvas: edge to edge like the sent letter, each in a labelled frame, or as separate cards. @default "seamless" */
  blockStyle?: BulletinBlockStyle;
  /** The letter's brand colour — header wash, button, links — and the editor's selection and drop line. @default "var(--accent-bright)" */
  accent?: string;
  /** Controlled blocks, top to bottom. */
  blocks?: BulletinBlock[];
  /** Initial blocks when uncontrolled. @default defaultBulletinBlocks */
  defaultBlocks?: BulletinBlock[];
  /** Fires with every block after an edit, insert, move or removal. */
  onChange?: (blocks: BulletinBlock[]) => void;
  /** Controlled preview. */
  preview?: BulletinPreview;
  /** Initial preview when uncontrolled. @default "desktop" */
  defaultPreview?: BulletinPreview;
  /** Fires from the toggle or key that changed the preview. */
  onPreviewChange?: (preview: BulletinPreview) => void;
  /** Controlled selected block id, or null. */
  selected?: string | null;
  /** Initial selection when uncontrolled. @default null */
  defaultSelected?: string | null;
  /** Fires when a click, key or insert selects a block (or clears it). */
  onSelectedChange?: (id: string | null) => void;
  /** The editor's heading. @default "October letter" */
  title?: string;
  /** The subject line shown in the inbox bar. @default "The fern house reopens" */
  subject?: string;
  /** The line an inbox shows after the subject. @default "Misting at nine, new panes, Thursday spore prints." */
  preheader?: string;
  /** Who the letter is from. @default "Fernworks" */
  sender?: string;
  /** Send test was pressed. Return a promise to show it sending; a rejection says it failed. */
  onSendTest?: (
    address: string,
    blocks: BulletinBlock[],
  ) => void | Promise<unknown>;
  /** The address the test form starts with. @default "ines@fernworks.example" */
  testAddress?: string;
  /** A send slot was confirmed, in ms since the epoch. Return a promise to show it saving. */
  onSchedule?: (at: number, blocks: BulletinBlock[]) => void | Promise<unknown>;
  /** Today, for the schedule slots and the phone clock (Date or ms). @default defaultBulletinNow */
  now?: number | Date;
  /** Whether the letter has arrived. @default "ready" */
  status?: BulletinStatus;
  /** "Try again" was pressed after the letter failed to load. */
  onRetry?: () => void;
  /** The editor's height, px; the canvas scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be edited, moved, sent or scheduled. @default false */
  disabled?: boolean;
  /** Classes for the editor's outer box. */
  className?: string;
};

/* ------------------------------------------------------------------------- */
/*                               Seeded defaults                              */
/* ------------------------------------------------------------------------- */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Friday 16 October 2026, 15:20 — a fixed afternoon, so every render agrees. */
export const defaultBulletinNow = Date.UTC(2026, 9, 16, 15, 20);

/** The Fernworks letter for October: seven blocks, one picture without alt text. */
export const defaultBulletinBlocks: BulletinBlock[] = [
  {
    id: "masthead",
    kind: "header",
    kicker: "Fernworks · October",
    title: "The fern house reopens",
    align: "start",
  },
  {
    id: "hero",
    kind: "image",
    art: "fernhouse",
    alt: "The restored fern house, tree ferns either side of a gravel path",
  },
  {
    id: "lede",
    kind: "text",
    body: "After eight months under scaffolding the fern house is open again. The new panes let in far more light, and the tree ferns have already noticed.",
  },
  {
    id: "visit",
    kind: "button",
    label: "Plan a visit",
    href: "/visit",
    fullWidthOnPhone: true,
  },
  { id: "rule", kind: "divider", style: "line" },
  {
    id: "prints",
    kind: "image",
    art: "spores",
    alt: "",
    caption: "Last month's prints, left to dry overnight.",
  },
  {
    id: "workshop",
    kind: "text",
    body: "Spore prints move to Thursday evenings. Bring a mature frond; we supply the paper, the glass and the patience.",
  },
];

/* ------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* ------------------------------------------------------------------------- */

const KINDS: {
  kind: BulletinBlockKind;
  name: string;
  hint: string;
  Icon: typeof Heading;
}[] = [
  { kind: "header", name: "Header", hint: "Kicker and title", Icon: Heading },
  { kind: "text", name: "Text", hint: "A paragraph", Icon: Type },
  { kind: "image", name: "Image", hint: "Picture, alt text", Icon: ImageIcon },
  {
    kind: "button",
    name: "Button",
    hint: "One call to act",
    Icon: MousePointerClick,
  },
  { kind: "divider", name: "Divider", hint: "A line or a pause", Icon: Minus },
];

const ARTS: { art: BulletinArt; name: string }[] = [
  { art: "fernhouse", name: "Fern house" },
  { art: "guide", name: "Field guide" },
  { art: "spores", name: "Spore print" },
];

/** The desktop letter's width: the width most mail clients render a letter at. */
const DESKTOP_W = 600;
/** How far the blocks under the drop line part, px. */
const GAP = 14;
/** Below this the rail folds into a bottom sheet (the container's 40rem). */
const NARROW = 640;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const toMs = (t: number | Date) => (typeof t === "number" ? t : t.getTime());
const pad2 = (n: number) => String(n).padStart(2, "0");

/** A filled shape in the accent: its hue at a fixed lightness, so it reads the same in both themes. */
const pigment = (accent: string, l = 0.58) => `oklch(from ${accent} ${l} c h)`;
const wash = (accent: string, pct: number) =>
  `color-mix(in oklab, ${accent} ${pct}%, transparent)`;

/** UTC clock text: a locale lookup in render would not survive hydration. */
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};
const slotLabel = (ms: number) => {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getUTCDay()] ?? ""} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
};

/** The next three weekdays: two morning sends and an afternoon one. */
function slotsFrom(now: number): number[] {
  const out: number[] = [];
  let day = Math.floor(now / DAY) * DAY;
  while (out.length < 3) {
    day += DAY;
    const weekday = new Date(day).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    out.push(day + (out.length === 2 ? 14 : 9) * HOUR);
  }
  return out;
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const kindName = (kind: BulletinBlockKind) =>
  KINDS.find((k) => k.kind === kind)?.name ?? kind;

const missingAlt = (b: BulletinBlock) =>
  b.kind === "image" && b.alt.trim().length === 0;

const clip = (text: string, n = 48) =>
  text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text;

/** The sentence a block is called by, for its option and announcements. */
function blockName(b: BulletinBlock): string {
  switch (b.kind) {
    case "header":
      return `Header, ${b.title || "untitled"}`;
    case "text":
      return `Text, ${clip(b.body || "empty")}`;
    case "image":
      return missingAlt(b)
        ? "Image, alt text missing"
        : `Image, ${clip(b.alt)}`;
    case "button":
      return `Button, ${b.label || "no label"}`;
    default:
      return b.style === "space" ? "Divider, space" : "Divider, line";
  }
}

function makeBlock(kind: BulletinBlockKind, id: string): BulletinBlock {
  switch (kind) {
    case "header":
      return {
        id,
        kind,
        kicker: "Fernworks",
        title: "A new heading",
        align: "start",
      };
    case "text":
      return { id, kind, body: "Write something worth opening." };
    case "image":
      return { id, kind, art: "guide", alt: "" };
    case "button":
      return {
        id,
        kind,
        label: "Read more",
        href: "/",
        fullWidthOnPhone: true,
      };
    default:
      return { id, kind: "divider", style: "line" };
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ------------------------------------------------------------------------- */
/*                              Drawn pictures                                */
/* ------------------------------------------------------------------------- */

/** Gill lines of the spore print, rounded so Node and the browser agree. */
const SPORE_GILLS = (() => {
  const f = (v: number) => Number(v.toFixed(2));
  let d = "";
  for (let i = 0; i < 48; i += 1) {
    const a = (i / 48) * Math.PI * 2;
    const inner = 14 + (i % 3) * 2;
    const outer = 62 - (i % 4) * 4;
    d += `M${f(160 + inner * Math.cos(a))} ${f(90 + inner * Math.sin(a))}L${f(160 + outer * Math.cos(a))} ${f(90 + outer * Math.sin(a))}`;
  }
  return d;
})();

/** Specks that fell past the cap: seeded, so every render scatters them alike. */
const SPORE_SPECKS = (() => {
  let s = 1753;
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 70; i += 1) {
    const a = rand() * Math.PI * 2;
    const d = 66 + rand() * 22;
    out.push({
      x: Number((160 + d * Math.cos(a)).toFixed(2)),
      y: Number((90 + d * Math.sin(a) * 0.92).toFixed(2)),
      r: Number((0.6 + rand() * 0.9).toFixed(2)),
    });
  }
  return out;
})();

function Art({
  art,
  accent,
  clipId,
}: {
  art: BulletinArt;
  accent: string;
  clipId: string;
}) {
  const leaf = pigment(accent, 0.62);
  const deep = pigment(accent, 0.48);
  if (art === "guide") {
    return (
      <svg
        aria-hidden
        viewBox="0 0 320 180"
        preserveAspectRatio="xMidYMid slice"
        className="block size-full"
      >
        <rect width="320" height="180" className="fill-surface-2" />
        <rect width="320" height="180" style={{ fill: wash(accent, 8) }} />
        <rect
          x="70"
          y="150"
          width="180"
          height="6"
          rx="3"
          className="fill-hairline-strong"
        />
        <g transform="rotate(-6 160 92)">
          <rect
            x="102"
            y="30"
            width="118"
            height="122"
            rx="5"
            style={{ fill: deep }}
          />
          <rect
            x="102"
            y="30"
            width="12"
            height="122"
            rx="3"
            className="fill-black/15"
          />
          <rect
            x="128"
            y="46"
            width="72"
            height="5"
            rx="2.5"
            className="fill-white/80"
          />
          <rect
            x="128"
            y="57"
            width="48"
            height="4"
            rx="2"
            className="fill-white/50"
          />
          <path
            d="M162 136 Q160 108 172 84 M164 124 l-10 -6 M165 114 l-11 -6 M167 104 l-10 -7 M169 95 l-8 -7 M164 124 l9 -8 M165 114 l10 -7 M167 104 l9 -6 M169 95 l7 -5"
            fill="none"
            stroke="white"
            strokeOpacity={0.85}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        </g>
        <g transform="rotate(18 248 120)">
          <rect
            x="196"
            y="116"
            width="96"
            height="7"
            rx="2"
            className="fill-ink-3"
          />
          <path d="M292 116 l10 3.5 l-10 3.5 Z" className="fill-ink-2" />
        </g>
      </svg>
    );
  }
  if (art === "spores") {
    return (
      <svg
        aria-hidden
        viewBox="0 0 320 180"
        preserveAspectRatio="xMidYMid slice"
        className="block size-full"
      >
        <rect width="320" height="180" className="fill-surface-2" />
        <ellipse cx="160" cy="90" rx="96" ry="78" className="fill-card" />
        <path
          d={SPORE_GILLS}
          fill="none"
          strokeWidth={1.1}
          strokeLinecap="round"
          style={{ stroke: deep }}
          strokeOpacity={0.7}
        />
        <circle cx="160" cy="90" r="12" className="fill-card" />
        <circle cx="160" cy="90" r="5" style={{ fill: deep }} opacity={0.5} />
        {SPORE_SPECKS.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={p.r}
            style={{ fill: deep }}
            opacity={0.35}
          />
        ))}
      </svg>
    );
  }
  return (
    <svg
      aria-hidden
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
    >
      <defs>
        <clipPath id={clipId}>
          <path d="M64 140 V98 C64 62 110 40 160 40 C210 40 256 62 256 98 V140 Z" />
        </clipPath>
      </defs>
      <rect width="320" height="180" className="fill-surface-2" />
      <rect width="320" height="140" style={{ fill: wash(accent, 10) }} />
      <rect y="140" width="320" height="40" className="fill-surface-0" />
      <path
        d="M64 140 V98 C64 62 110 40 160 40 C210 40 256 62 256 98 V140 Z"
        className="fill-card/70 stroke-hairline-strong"
        strokeWidth={1.5}
      />
      <g
        clipPath={`url(#${clipId})`}
        className="stroke-hairline-strong"
        strokeWidth={1.2}
      >
        <path d="M92 30 V140 M120 30 V140 M148 30 V140 M172 30 V140 M200 30 V140 M228 30 V140 M40 76 H280 M40 104 H280" />
      </g>
      <path
        d="M160 140 V104"
        className="stroke-ink-3"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <path
        d="M160 104 Q138 90 116 100 M160 104 Q182 90 204 100 M160 104 Q144 82 130 78 M160 104 Q176 82 190 78 M160 104 Q158 84 162 70"
        fill="none"
        strokeWidth={2.4}
        strokeLinecap="round"
        style={{ stroke: leaf }}
      />
      <path
        d="M146 140 V124 Q160 112 174 124 V140 Z"
        className="fill-surface-2"
      />
      <path d="M140 180 L150 140 H170 L180 180 Z" className="fill-surface-2" />
      {[
        "M30 160 Q34 120 54 92 M33 150 l-9 -4 M34 140 l-10 -5 M36 130 l-10 -6 M39 120 l-9 -7 M43 110 l-8 -7 M48 101 l-6 -6 M33 150 l8 -7 M35 140 l9 -6 M37 130 l9 -5 M40 120 l8 -4 M44 110 l7 -3",
        "M292 160 Q288 124 270 98 M289 150 l9 -4 M288 140 l10 -5 M286 130 l10 -6 M283 120 l9 -7 M279 111 l8 -7 M289 150 l-8 -7 M287 140 l-9 -6 M285 130 l-9 -5 M282 120 l-8 -4 M278 111 l-7 -3",
      ].map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          strokeWidth={1.7}
          strokeLinecap="round"
          style={{ stroke: leaf }}
        />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------------- */
/*                                Small parts                                 */
/* ------------------------------------------------------------------------- */

/** A count whose digits roll toward the direction it moved, on snap. */
function Rolling({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const [shown, setShown] = React.useState({ value, dir: 1 });
  if (shown.value !== value) {
    setShown({ value, dir: value > shown.value ? 1 : -1 });
  }
  const text = String(value);
  return (
    <span
      className="relative inline-flex h-4 justify-center overflow-clip tabular-nums"
      style={{ width: `${text.length}ch` }}
    >
      <AnimatePresence mode="popLayout" initial={false} custom={shown.dir}>
        <motion.span
          key={text}
          custom={shown.dir}
          className="inline-block"
          style={{ lineHeight: "16px" }}
          variants={{
            enter: (d: number) => ({ opacity: 0, y: motionSafe ? d * 8 : 0 }),
            shown: { opacity: 1, y: 0 },
            leave: (d: number) => ({
              opacity: 0,
              y: motionSafe ? -d * 8 : 0,
              transition: exitFor(durations.fast),
            }),
          }}
          initial="enter"
          animate="shown"
          exit="leave"
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Field({
  label,
  hint,
  error,
  children,
  id,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[11px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p
          id={`${id}-note`}
          className="flex items-center gap-1.5 text-[11px] leading-4 text-warn"
        >
          <TriangleAlert aria-hidden className="size-3 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-note`} className="text-[11px] leading-4 text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const inputClass = cn(
  "w-full rounded-2 border border-input bg-card px-2.5 text-[13px] text-foreground placeholder:text-ink-3 disabled:opacity-60",
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:outline-solid",
);

/* ------------------------------------------------------------------------- */
/*                                  Palette                                   */
/* ------------------------------------------------------------------------- */

type DragHooks = {
  start: (kind: "block" | "palette", id: string, x: number, y: number) => void;
  move: (x: number, y: number) => void;
  end: (velocityY: number) => void;
  cancel: () => void;
};

function PaletteTile({
  kind,
  name,
  hint,
  Icon,
  accent,
  disabled,
  compact,
  focusKey,
  onInsert,
  hooks,
}: {
  kind: BulletinBlockKind;
  name: string;
  hint: string;
  Icon: typeof Heading;
  accent: string;
  disabled: boolean;
  compact: boolean;
  focusKey: string;
  onInsert: (kind: BulletinBlockKind) => void;
  hooks: DragHooks;
}) {
  const dragged = React.useRef(false);
  const drag = useDrag({
    threshold: 5,
    disabled,
    onStart: ({ point }) => {
      dragged.current = true;
      hooks.start("palette", kind, point.x, point.y);
    },
    onMove: ({ point }) => hooks.move(point.x, point.y),
    onEnd: ({ velocity }) => hooks.end(velocity.y),
    onCancel: () => hooks.cancel(),
  });
  return (
    <button
      type="button"
      data-bc-focus={focusKey}
      aria-disabled={disabled || undefined}
      aria-label={`Add ${name.toLowerCase()} block`}
      onClick={() => {
        if (dragged.current) {
          dragged.current = false;
          return;
        }
        if (!disabled) onInsert(kind);
      }}
      {...drag}
      className={cn(
        "group/bc-tile flex touch-none items-center gap-2.5 rounded-3 border border-hairline bg-card text-left transition-colors select-none",
        compact ? "h-12 px-2.5" : "h-14 px-3",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-grab hover:border-hairline-strong hover:bg-surface-1 active:cursor-grabbing",
        FOCUS_RING,
      )}
    >
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-2 transition-colors"
        style={{ backgroundColor: wash(accent, 12), color: accent }}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] leading-4 font-medium text-foreground">
          {name}
        </span>
        {compact ? null : (
          <span className="block truncate text-[11px] leading-4 text-ink-3">
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------------- */
/*                                 Edit panel                                 */
/* ------------------------------------------------------------------------- */

function EditPanel({
  block,
  index,
  count,
  idBase,
  accent,
  disabled,
  onPatch,
  onMove,
  onRemove,
}: {
  block: BulletinBlock | null;
  index: number;
  count: number;
  idBase: string;
  accent: string;
  disabled: boolean;
  onPatch: (patch: Partial<BulletinBlock>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  if (!block) {
    return (
      <div className="flex flex-col items-start gap-2 px-1 py-2">
        <Pencil aria-hidden className="size-4 text-ink-3" />
        <p className="text-[13px] text-ink-2">
          Pick a block in the letter to edit it.
        </p>
        <p className="text-[11px] leading-4 text-ink-3">
          Arrow keys move between blocks; Enter opens the one you are on.
        </p>
      </div>
    );
  }
  const fid = (name: string) => `${idBase}-${block.id}-${name}`;
  const segment = (on: boolean) =>
    cn(
      "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[5px] text-[12px] transition-colors",
      on
        ? "bg-card text-foreground shadow-sm"
        : "text-ink-2 hover:text-foreground",
      FOCUS_IN,
    );

  const fields = (() => {
    switch (block.kind) {
      case "header":
        return (
          <>
            <Field id={fid("kicker")} label="Kicker">
              <input
                id={fid("kicker")}
                data-bc-focus="first"
                value={block.kicker}
                disabled={disabled}
                onChange={(e) => {
                  const kicker = e.currentTarget.value;
                  onPatch({ kicker });
                }}
                className={cn(inputClass, "h-8")}
              />
            </Field>
            <Field id={fid("title")} label="Title">
              <input
                id={fid("title")}
                value={block.title}
                disabled={disabled}
                onChange={(e) => {
                  const title = e.currentTarget.value;
                  onPatch({ title });
                }}
                className={cn(inputClass, "h-8")}
              />
            </Field>
            <div className="flex flex-col gap-1.5">
              <span
                id={fid("align")}
                className="text-[11px] font-medium text-ink-2"
              >
                Align
              </span>
              <div
                role="radiogroup"
                aria-labelledby={fid("align")}
                className="flex gap-0.5 rounded-2 bg-surface-2 p-0.5"
              >
                {(["start", "center"] as const).map((a) => {
                  const on = (block.align ?? "start") === a;
                  return (
                    <button
                      key={a}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      tabIndex={on ? 0 : -1}
                      disabled={disabled}
                      onClick={() => onPatch({ align: a })}
                      onKeyDown={(e) => {
                        if (
                          e.key === "ArrowLeft" ||
                          e.key === "ArrowRight" ||
                          e.key === "ArrowUp" ||
                          e.key === "ArrowDown"
                        ) {
                          e.preventDefault();
                          const next = a === "start" ? "center" : "start";
                          onPatch({ align: next });
                          const sib =
                            e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(
                              `[data-bc-align="${next}"]`,
                            );
                          sib?.focus();
                        }
                      }}
                      data-bc-align={a}
                      className={segment(on)}
                    >
                      {a === "start" ? (
                        <TextAlignStart aria-hidden className="size-3.5" />
                      ) : (
                        <TextAlignCenter aria-hidden className="size-3.5" />
                      )}
                      {a === "start" ? "Left" : "Centre"}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        );
      case "text":
        return (
          <Field id={fid("body")} label="Text">
            <textarea
              id={fid("body")}
              data-bc-focus="first"
              rows={6}
              value={block.body}
              disabled={disabled}
              onChange={(e) => {
                const body = e.currentTarget.value;
                onPatch({ body });
              }}
              className={cn(inputClass, "resize-none py-2 leading-5")}
            />
          </Field>
        );
      case "image": {
        const missing = missingAlt(block);
        return (
          <>
            <div className="flex flex-col gap-1.5">
              <span
                id={fid("art")}
                className="text-[11px] font-medium text-ink-2"
              >
                Picture
              </span>
              <div
                role="radiogroup"
                aria-labelledby={fid("art")}
                className="grid grid-cols-3 gap-1.5"
              >
                {ARTS.map((a, i) => {
                  const on = block.art === a.art;
                  return (
                    <button
                      key={a.art}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={a.name}
                      tabIndex={on ? 0 : -1}
                      disabled={disabled}
                      data-bc-art={a.art}
                      data-bc-focus={on ? "first" : undefined}
                      onClick={() => onPatch({ art: a.art })}
                      onKeyDown={(e) => {
                        const d =
                          e.key === "ArrowRight" || e.key === "ArrowDown"
                            ? 1
                            : e.key === "ArrowLeft" || e.key === "ArrowUp"
                              ? -1
                              : 0;
                        if (!d) return;
                        e.preventDefault();
                        const next = ARTS[(i + d + ARTS.length) % ARTS.length];
                        if (!next) return;
                        onPatch({ art: next.art });
                        e.currentTarget.parentElement
                          ?.querySelector<HTMLButtonElement>(
                            `[data-bc-art="${next.art}"]`,
                          )
                          ?.focus();
                      }}
                      className={cn(
                        "relative aspect-[16/10] overflow-hidden rounded-2 border transition-colors",
                        on ? "border-transparent" : "border-hairline",
                        FOCUS_RING,
                      )}
                      style={
                        on ? { boxShadow: `0 0 0 2px ${accent}` } : undefined
                      }
                    >
                      <Art
                        art={a.art}
                        accent={accent}
                        clipId={`${idBase}-thumb-${a.art}`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
            <Field
              id={fid("alt")}
              label="Alt text"
              hint="Say what the picture shows, in a sentence."
              error={
                missing
                  ? "Missing — screen readers will skip this picture."
                  : null
              }
            >
              <textarea
                id={fid("alt")}
                data-bc-focus="alt"
                rows={2}
                value={block.alt}
                disabled={disabled}
                aria-invalid={missing || undefined}
                aria-describedby={`${fid("alt")}-note`}
                placeholder="Describe the picture"
                onChange={(e) => {
                  const alt = e.currentTarget.value;
                  onPatch({ alt });
                }}
                className={cn(
                  inputClass,
                  "resize-none py-2 leading-5",
                  missing && "border-warn/60",
                )}
              />
            </Field>
            <Field id={fid("caption")} label="Caption">
              <input
                id={fid("caption")}
                value={block.caption ?? ""}
                disabled={disabled}
                placeholder="Optional"
                onChange={(e) => {
                  const caption = e.currentTarget.value;
                  onPatch({ caption });
                }}
                className={cn(inputClass, "h-8")}
              />
            </Field>
          </>
        );
      }
      case "button":
        return (
          <>
            <Field id={fid("label")} label="Label">
              <input
                id={fid("label")}
                data-bc-focus="first"
                value={block.label}
                disabled={disabled}
                onChange={(e) => {
                  const label = e.currentTarget.value;
                  onPatch({ label });
                }}
                className={cn(inputClass, "h-8")}
              />
            </Field>
            <Field id={fid("href")} label="Link">
              <input
                id={fid("href")}
                value={block.href}
                disabled={disabled}
                spellCheck={false}
                onChange={(e) => {
                  const href = e.currentTarget.value;
                  onPatch({ href });
                }}
                className={cn(inputClass, "h-8 font-mono text-[12px]")}
              />
            </Field>
            <label className="flex cursor-pointer items-center justify-between gap-3 text-[12px] text-ink-2">
              Full width on small screens
              <button
                type="button"
                role="switch"
                aria-checked={block.fullWidthOnPhone !== false}
                disabled={disabled}
                onClick={() =>
                  onPatch({
                    fullWidthOnPhone: block.fullWidthOnPhone === false,
                  })
                }
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                  block.fullWidthOnPhone !== false
                    ? "bg-primary"
                    : "bg-surface-2 ring-1 ring-hairline-strong ring-inset",
                  FOCUS_RING,
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-0.5 left-0.5 size-4 rounded-full bg-card shadow-sm transition-transform duration-150",
                    block.fullWidthOnPhone !== false && "translate-x-4",
                  )}
                />
              </button>
            </label>
          </>
        );
      default:
        return (
          <div className="flex flex-col gap-1.5">
            <span
              id={fid("style")}
              className="text-[11px] font-medium text-ink-2"
            >
              Style
            </span>
            <div
              role="radiogroup"
              aria-labelledby={fid("style")}
              className="flex gap-0.5 rounded-2 bg-surface-2 p-0.5"
            >
              {(["line", "space"] as const).map((s) => {
                const on = (block.style ?? "line") === s;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabIndex={on ? 0 : -1}
                    data-bc-focus={on ? "first" : undefined}
                    disabled={disabled}
                    data-bc-style={s}
                    onClick={() => onPatch({ style: s })}
                    onKeyDown={(e) => {
                      if (!e.key.startsWith("Arrow")) return;
                      e.preventDefault();
                      const next = s === "line" ? "space" : "line";
                      onPatch({ style: next });
                      e.currentTarget.parentElement
                        ?.querySelector<HTMLButtonElement>(
                          `[data-bc-style="${next}"]`,
                        )
                        ?.focus();
                    }}
                    className={segment(on)}
                  >
                    {s === "line" ? "Line" : "Space"}
                  </button>
                );
              })}
            </div>
          </div>
        );
    }
  })();

  const small = cn(
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:opacity-40 aria-disabled:opacity-40",
    FOCUS_RING,
  );
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[12px] font-semibold text-foreground">
          {kindName(block.kind)}
          <span className="ml-1.5 font-normal text-ink-3 tabular-nums">
            {index + 1} of {count}
          </span>
        </p>
      </div>
      {fields}
      <div className="flex items-center gap-1.5 border-t border-hairline pt-3">
        <button
          type="button"
          aria-label="Move block up"
          aria-disabled={disabled || index === 0 || undefined}
          onClick={() => {
            // Kept focusable at the top, so focus never drops to the page.
            if (!disabled && index > 0) onMove(-1);
          }}
          className={small}
        >
          <ArrowUp aria-hidden className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Move block down"
          aria-disabled={disabled || index >= count - 1 || undefined}
          onClick={() => {
            if (!disabled && index < count - 1) onMove(1);
          }}
          className={small}
        >
          <ArrowDown aria-hidden className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className={cn(small, "ml-auto text-danger enabled:hover:text-danger")}
        >
          <Trash2 aria-hidden className="size-3.5" />
          Remove
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/*                                 One block                                  */
/* ------------------------------------------------------------------------- */

type Lay = {
  layoutDependency: BulletinPreview;
  transition: Transition;
};

function BlockBody({
  block,
  compact,
  accent,
  clipId,
  lay,
}: {
  block: BulletinBlock;
  /** The letter is narrower than 27rem: tighter type, full-bleed pictures, a full-width button. */
  compact: boolean;
  accent: string;
  clipId: string;
  lay: Lay;
}) {
  const pad = compact ? "px-5" : "px-8";
  switch (block.kind) {
    case "header": {
      const centre = block.align === "center";
      return (
        <div
          className={cn(
            pad,
            compact ? "pt-6 pb-5" : "pt-8 pb-7",
            centre && "text-center",
          )}
          style={{ backgroundColor: wash(accent, 11) }}
        >
          <motion.p
            layout="position"
            {...lay}
            className="text-[11px] font-semibold tracking-[0.12em] uppercase"
            style={{ color: accent }}
          >
            {block.kicker}
          </motion.p>
          <motion.p
            layout="position"
            {...lay}
            className={cn(
              "mt-2 font-semibold tracking-[-0.015em] text-balance text-foreground",
              compact
                ? "text-[22px] leading-[28px]"
                : "text-[28px] leading-[34px]",
            )}
          >
            {block.title || " "}
          </motion.p>
        </div>
      );
    }
    case "text":
      return (
        <div className={cn(pad, "py-3")}>
          <motion.p
            layout="position"
            {...lay}
            className={cn(
              "text-pretty whitespace-pre-line text-ink-2",
              compact
                ? "text-[14px] leading-[22px]"
                : "text-[15px] leading-[24px]",
            )}
          >
            {block.body || " "}
          </motion.p>
        </div>
      );
    case "image": {
      const missing = missingAlt(block);
      return (
        <div className={cn(compact ? "px-0" : pad, "py-3")}>
          <motion.div
            layout
            {...lay}
            className="relative overflow-hidden"
            style={{ aspectRatio: "16 / 9", borderRadius: compact ? 0 : 8 }}
          >
            <Art art={block.art} accent={accent} clipId={clipId} />
            {missing ? (
              <motion.span
                layout="position"
                {...lay}
                className="absolute top-2 left-2 inline-flex h-6 items-center gap-1.5 rounded-full border border-warn/40 bg-card px-2 text-[11px] font-medium text-warn shadow-sm"
              >
                <TriangleAlert className="size-3 shrink-0" />
                No alt text
              </motion.span>
            ) : null}
          </motion.div>
          {block.caption ? (
            <motion.p
              layout="position"
              {...lay}
              className={cn(
                "mt-2 text-[12px] leading-4 text-ink-3",
                compact && "px-5",
              )}
            >
              {block.caption}
            </motion.p>
          ) : null}
        </div>
      );
    }
    case "button": {
      const full = compact && block.fullWidthOnPhone !== false;
      return (
        <div className={cn(pad, "py-3")}>
          <motion.span
            layout
            {...lay}
            className={cn(
              "h-11 items-center justify-center px-6 text-[14px] font-semibold text-white",
              full ? "flex w-full" : "inline-flex",
            )}
            style={{ backgroundColor: pigment(accent, 0.55), borderRadius: 8 }}
          >
            <motion.span layout="position" {...lay} className="truncate">
              {block.label || " "}
            </motion.span>
          </motion.span>
        </div>
      );
    }
    default:
      return block.style === "space" ? (
        <div className={compact ? "h-6" : "h-8"} />
      ) : (
        <div className={cn(pad, "py-4")}>
          <motion.div layout {...lay} className="h-px bg-hairline-strong" />
        </div>
      );
  }
}

function BlockRow({
  block,
  index,
  count,
  compact,
  accent,
  blockStyle,
  isSelected,
  isRove,
  isDragging,
  disabled,
  motionSafe,
  clipId,
  lay,
  hintId,
  register,
  registerY,
  hooks,
  onPick,
  onKey,
}: {
  block: BulletinBlock;
  index: number;
  count: number;
  compact: boolean;
  accent: string;
  blockStyle: BulletinBlockStyle;
  isSelected: boolean;
  isRove: boolean;
  isDragging: boolean;
  disabled: boolean;
  motionSafe: boolean;
  clipId: string;
  lay: Lay;
  hintId: string;
  register: (id: string, node: HTMLDivElement | null) => void;
  registerY: (id: string, y: MotionValue<number> | null) => void;
  hooks: DragHooks;
  onPick: (id: string) => void;
  onKey: (event: React.KeyboardEvent<HTMLDivElement>, id: string) => void;
}) {
  const id = block.id;
  // The row owns its offset; the editor borrows it for drags and landings.
  const y = useMotionValue(0);
  React.useLayoutEffect(() => {
    registerY(id, y);
    return () => registerY(id, null);
  }, [id, y, registerY]);
  const setNode = React.useCallback(
    (node: HTMLDivElement | null) => register(id, node),
    [id, register],
  );
  const dragged = React.useRef(false);
  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled,
    onStart: ({ point, offset }) => {
      dragged.current = true;
      // Measured from the press, so the block stays exactly under the hand.
      hooks.start("block", id, point.x - offset.x, point.y - offset.y);
    },
    onMove: ({ point }) => hooks.move(point.x, point.y),
    onEnd: ({ velocity }) => hooks.end(velocity.y),
    onCancel: () => hooks.cancel(),
  });
  const missing = missingAlt(block);
  const framed = blockStyle === "framed";
  const stacked = blockStyle === "stacked";

  return (
    <motion.div
      ref={setNode}
      role="option"
      aria-selected={isSelected}
      aria-setsize={count}
      aria-posinset={index + 1}
      aria-label={blockName(block)}
      aria-describedby={hintId}
      tabIndex={isRove ? 0 : -1}
      data-bc-block={id}
      data-bc-focus={`block:${id}`}
      layout
      layoutDependency={lay.layoutDependency}
      // Lifted, the block thins a little so the drop line under the hand
      // still reads through it.
      animate={{
        scale: isDragging && motionSafe ? 1.015 : 1,
        opacity: isDragging ? 0.9 : 1,
      }}
      transition={{
        ...lay.transition,
        scale: motionSafe ? springs.flick : { duration: 0 },
        opacity: { duration: durations.fast },
      }}
      style={{
        y,
        zIndex: isDragging ? 6 : isSelected ? 2 : 1,
        borderRadius: stacked ? 10 : framed ? 6 : 0,
      }}
      onFocus={(event) => {
        if (event.target === event.currentTarget) onPick(id);
      }}
      onClick={() => {
        if (dragged.current) {
          dragged.current = false;
          return;
        }
        onPick(id);
      }}
      onKeyDown={(event) => onKey(event, id)}
      onPointerDown={(event) => {
        // A finger on a block scrolls the letter; it drags by its grip.
        if (event.pointerType !== "touch") drag.onPointerDown(event);
      }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      className={cn(
        "group/bc-block relative cursor-default bg-card select-none",
        framed && "border border-hairline-strong pt-5",
        stacked && "overflow-hidden border border-hairline shadow-sm",
        isDragging &&
          "cursor-grabbing shadow-[0_14px_32px_color-mix(in_oklab,black_22%,transparent)]",
        "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
      )}
    >
      {framed ? (
        <motion.span
          layout="position"
          {...lay}
          aria-hidden
          className={cn(
            "absolute top-1 left-2 font-mono text-[9px] leading-4 tracking-[0.08em] uppercase",
            missing ? "text-warn" : "text-ink-3",
          )}
        >
          {kindName(block.kind)}
        </motion.span>
      ) : null}
      <div aria-hidden>
        <BlockBody
          block={block}
          compact={compact}
          accent={accent}
          clipId={clipId}
          lay={lay}
        />
      </div>
      <motion.span
        aria-hidden
        layout
        {...lay}
        className="pointer-events-none absolute inset-0 z-[1] border-2"
        initial={false}
        animate={{ opacity: isSelected || isDragging ? 1 : 0 }}
        transition={{
          ...lay.transition,
          opacity: motionSafe ? springs.flick : { duration: durations.blink },
        }}
        style={{
          borderColor: accent,
          borderRadius: stacked ? 10 : framed ? 6 : 2,
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit] border border-dashed opacity-0 transition-opacity duration-150 group-hover/bc-block:opacity-100"
        style={{ borderColor: wash(accent, 55) }}
      />
      {!disabled ? (
        <span
          aria-hidden
          onPointerDown={drag.onPointerDown}
          className={cn(
            "absolute top-1.5 right-1.5 z-[2] flex size-7 cursor-grab touch-none items-center justify-center rounded-2 border border-hairline bg-card text-ink-3 shadow-sm transition-opacity duration-150 active:cursor-grabbing",
            stacked || isSelected || isDragging
              ? "opacity-100"
              : "opacity-0 group-hover/bc-block:opacity-100 group-focus-visible/bc-block:opacity-100",
          )}
        >
          <GripVertical className="size-3.5" />
        </span>
      ) : null}
    </motion.div>
  );
}

/* ------------------------------------------------------------------------- */
/*                                The composer                                */
/* ------------------------------------------------------------------------- */

type DragSession = {
  kind: "block" | "palette";
  id: string;
  order: string[];
  tops: Map<string, number>;
  heights: Map<string, number>;
  /** Pointer height inside the list when the drag began (block drags). */
  startY: number;
  lastX: number;
  lastY: number;
  /** Insertion index among the other blocks; null off the letter; undefined before the first reading. */
  target: number | null | undefined;
  /** The palette tile's centre, where a drop outside the letter goes home to. */
  homeX: number;
  homeY: number;
};

type DragView = {
  kind: "block" | "palette";
  id: string;
  target: number | null;
  lineY: number;
  ghost: { top: number; height: number } | null;
};

type Phase = "idle" | "sending" | "sent" | "failed";

/**
 * An email layout editor for a monthly letter. A palette of five blocks —
 * header, text, image, button, divider — feeds a single-column letter drawn
 * in a device frame, and each block opens an edit panel for its content.
 *
 * The preview toggle is the signature: Desktop and Phone change the frame's
 * width in one render and every block FLIPs to its new box on the glide
 * spring — corners round, pictures go full bleed, the call to action
 * stretches, and text slides to its new wrap without ever being squashed.
 * On the desktop frame two guides mark where the phone width will cut.
 *
 * Blocks drag 1:1 by their body or grip (a finger uses the grip): an accent
 * drop line sits between blocks at the insertion point and the blocks below
 * it part to open a gap, and on release every block glides from where it is
 * drawn to its new slot, the dropped one carrying the throw. Palette tiles
 * drag in the same way. Alt with Up or Down makes the same move.
 *
 * Missing alt text is flagged on the picture, in its panel and in a count
 * that jumps to it. Send test and Schedule open small dialogs whose results
 * come from the host. The letter is a listbox with one roving stop; below a
 * 40rem container the rail becomes a bottom sheet. Under reduced motion the
 * preview and every move land at once, and every flag and count still shows.
 */
export function BulletinComposer({
  previewWidth = 380,
  blockStyle = "seamless",
  accent = "var(--accent-bright)",
  blocks,
  defaultBlocks,
  onChange,
  preview,
  defaultPreview = "desktop",
  onPreviewChange,
  selected,
  defaultSelected = null,
  onSelectedChange,
  title = "October letter",
  subject = "The fern house reopens",
  preheader = "Misting at nine, new panes, Thursday spore prints.",
  sender = "Fernworks",
  onSendTest,
  testAddress = "ines@fernworks.example",
  onSchedule,
  now = defaultBulletinNow,
  status = "ready",
  onRetry,
  height = 540,
  disabled = false,
  className,
}: BulletinComposerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const railLabelId = `${uid}-rail`;
  const sheetTitleId = `${uid}-sheet`;
  const nowMs = toMs(now);
  const ready = status === "ready";
  const locked = disabled || !ready;
  const phoneW = Math.round(clamp(previewWidth, 280, 640));
  const deskW = DESKTOP_W;

  /* --------------------------------- state -------------------------------- */

  const [ownBlocks, setOwnBlocks] = React.useState<BulletinBlock[]>(
    () => defaultBlocks ?? defaultBulletinBlocks,
  );
  const list = blocks ?? ownBlocks;
  const [ownPreview, setOwnPreview] =
    React.useState<BulletinPreview>(defaultPreview);
  const view = preview ?? ownPreview;
  const phone = view === "phone";
  const [ownSelected, setOwnSelected] = React.useState<string | null>(
    defaultSelected,
  );
  const selRaw = selected !== undefined ? selected : ownSelected;
  const sel = selRaw && list.some((b) => b.id === selRaw) ? selRaw : null;

  const [rove, setRove] = React.useState<string | null>(null);
  const [railTab, setRailTab] = React.useState<"add" | "edit">("add");
  const [narrow, setNarrow] = React.useState(false);
  /** The canvas's content width: a desktop letter wider than the room shrinks to it. */
  const [room, setRoom] = React.useState(Number.POSITIVE_INFINITY);
  const [roomNode, setRoomNode] = React.useState<HTMLDivElement | null>(null);
  const [sheet, setSheet] = React.useState<"add" | "edit" | null>(null);
  /** A tile dragged out of the sheet: the sheet steps aside but stays mounted, so the drag keeps its pointer. */
  const [lifting, setLifting] = React.useState(false);
  const [pop, setPop] = React.useState<"test" | "schedule" | null>(null);
  const [address, setAddress] = React.useState(testAddress);
  const [addressError, setAddressError] = React.useState<string | null>(null);
  const [test, setTest] = React.useState<{ phase: Phase; to: string }>({
    phase: "idle",
    to: "",
  });
  const slots = React.useMemo(() => slotsFrom(nowMs), [nowMs]);
  const [slot, setSlot] = React.useState(0);
  const [scheduled, setScheduled] = React.useState<{
    phase: Phase;
    at: number | null;
  }>({ phase: "idle", at: null });
  const [dragView, setDragView] = React.useState<DragView | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const [focusAsk, setFocusAsk] = React.useState<{
    key: string;
    n: number;
  } | null>(null);
  const ask = (key: string) =>
    setFocusAsk((f) => ({ key, n: (f?.n ?? 0) + 1 }));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const rows = React.useRef(new Map<string, HTMLDivElement>());
  const ys = React.useRef(new Map<string, MotionValue<number>>());
  const flights = React.useRef(new Map<string, AnimationPlaybackControls>());
  const goals = React.useRef(new Map<string, number>());
  const session = React.useRef<DragSession | null>(null);
  const scrollLoop = React.useRef(0);
  const flip = React.useRef<{
    key: string;
    tops: Map<string, number>;
    velocity: { id: string; v: number } | null;
    fresh: string | null;
  } | null>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const counter = React.useRef(0);
  const timers = React.useRef(new Set<number>());
  const sheetY = useMotionValue(0);
  const ghostX = useMotionValue(0);
  const ghostY = useMotionValue(0);
  const ghostRun = React.useRef<AnimationPlaybackControls[]>([]);
  const [ghost, setGhost] = React.useState<{
    kind: BulletinBlockKind;
    leaving: boolean;
  } | null>(null);

  const issues = list.filter(missingAlt);
  const selIndex = sel ? list.findIndex((b) => b.id === sel) : -1;
  const selBlock = selIndex >= 0 ? (list[selIndex] ?? null) : null;
  const roving =
    sel ??
    (rove && list.some((b) => b.id === rove) ? rove : null) ??
    list[0]?.id ??
    null;

  const yOf = React.useCallback((id: string) => {
    let v = ys.current.get(id);
    if (!v) {
      v = motionValue(0);
      ys.current.set(id, v);
    }
    return v;
  }, []);

  const registerY = React.useCallback(
    (id: string, y: MotionValue<number> | null) => {
      if (y) ys.current.set(id, y);
      else if (ys.current.get(id)) ys.current.delete(id);
    },
    [],
  );

  const register = React.useCallback(
    (id: string, node: HTMLDivElement | null) => {
      if (node) rows.current.set(id, node);
      else rows.current.delete(id);
    },
    [],
  );

  // Decided in the same render as the toggle, so the type change rides the
  // same FLIP as the width (a measured value would land a frame late).
  const compact = Math.min(phone ? phoneW : deskW, room) < 432;

  const lay = React.useMemo<Lay>(
    () => ({
      layoutDependency: view,
      transition: { layout: motionSafe ? springs.glide : { duration: 0 } },
    }),
    [view, motionSafe],
  );

  /* -------------------------------- writes -------------------------------- */

  const write = (next: BulletinBlock[]) => {
    if (blocks === undefined) setOwnBlocks(next);
    onChange?.(next);
  };

  const pick = (id: string | null) => {
    if (id === sel) return;
    if (selected === undefined) setOwnSelected(id);
    onSelectedChange?.(id);
    if (id) setRove(id);
  };

  const setView = (next: BulletinPreview) => {
    if (next === view) return;
    // A move still settling lands first, so the FLIP starts from rest.
    for (const [id, c] of flights.current) {
      c.stop();
      ys.current.get(id)?.jump(0);
    }
    flights.current.clear();
    if (preview === undefined) setOwnPreview(next);
    onPreviewChange?.(next);
    say(
      next === "phone"
        ? `Phone preview, ${phoneW} pixels wide.`
        : "Desktop preview.",
    );
  };

  const newId = () => {
    const taken = new Set(list.map((b) => b.id));
    let id = "";
    do {
      counter.current += 1;
      id = `${idBase}-b${counter.current}`;
    } while (taken.has(id));
    return id;
  };

  /** Where every block is drawn right now, transforms included. */
  const visualTops = () => {
    const out = new Map<string, number>();
    const listNode = listRef.current;
    if (!listNode) return out;
    const base = listNode.getBoundingClientRect().top;
    for (const [id, node] of rows.current) {
      out.set(id, node.getBoundingClientRect().top - base);
    }
    return out;
  };

  const scrollRun = React.useRef<AnimationPlaybackControls | null>(null);
  /** Glides the canvas (never the page) until the block is in view. */
  const scrollToBlock = (id: string) => {
    const scroller = scrollerRef.current;
    const node = rows.current.get(id);
    if (!scroller || !node) return;
    const sr = scroller.getBoundingClientRect();
    const nr = node.getBoundingClientRect();
    const top = nr.top - sr.top + scroller.scrollTop - 16;
    const bottom = nr.bottom - sr.top + scroller.scrollTop + 16;
    const view = scroller.scrollTop;
    const target =
      top < view
        ? top
        : bottom > view + scroller.clientHeight
          ? Math.min(top, bottom - scroller.clientHeight)
          : null;
    if (target === null) return;
    const to = Math.max(0, Math.round(target));
    scrollRun.current?.stop();
    if (!motionSafe) {
      scroller.scrollTop = to;
      return;
    }
    scrollRun.current = animate(scroller.scrollTop, to, {
      ...springs.glide,
      onUpdate: (v) => {
        scroller.scrollTop = Math.round(v);
      },
    });
  };

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  const run = (id: string, controls: AnimationPlaybackControls) => {
    flights.current.get(id)?.stop();
    flights.current.set(id, controls);
  };

  const yTo = (id: string, to: number, velocity = 0) => {
    const v = yOf(id);
    if (goals.current.get(id) === to && flights.current.has(id)) return;
    goals.current.set(id, to);
    if (!motionSafe) {
      flights.current.get(id)?.stop();
      v.jump(to);
      return;
    }
    run(id, animate(v, to, { ...springs.glide, velocity }));
  };

  const reorder = (
    next: BulletinBlock[],
    velocity: { id: string; v: number } | null = null,
    fresh: string | null = null,
  ) => {
    flip.current = {
      key: next.map((b) => b.id).join("|"),
      tops: visualTops(),
      velocity,
      fresh,
    };
    write(next);
  };

  const moveBy = (id: string, delta: -1 | 1, refocus = true) => {
    if (locked) return;
    const at = list.findIndex((b) => b.id === id);
    const to = at + delta;
    if (at < 0 || to < 0 || to >= list.length) return;
    const next = [...list];
    const [item] = next.splice(at, 1);
    if (!item) return;
    next.splice(to, 0, item);
    reorder(next);
    say(`${kindName(item.kind)} moved to ${to + 1} of ${list.length}.`);
    if (refocus) ask(`block:${id}`);
  };

  const insert = (kind: BulletinBlockKind, at?: number) => {
    if (locked) return;
    const block = makeBlock(kind, newId());
    const index = at ?? (selIndex >= 0 ? selIndex + 1 : list.length);
    const next = [...list];
    next.splice(index, 0, block);
    reorder(next, null, block.id);
    pick(block.id);
    setRailTab("edit");
    say(
      `${kindName(kind)} added at ${index + 1} of ${next.length}.${missingAlt(block) ? " It needs alt text." : ""}`,
    );
    ask(`block:${block.id}`);
  };

  const remove = (id: string) => {
    if (locked) return;
    const at = list.findIndex((b) => b.id === id);
    const gone = list[at];
    if (!gone) return;
    const next = list.filter((b) => b.id !== id);
    reorder(next);
    const neighbour = next[Math.min(at, next.length - 1)] ?? null;
    pick(neighbour?.id ?? null);
    say(
      `${kindName(gone.kind)} removed. ${plural(next.length, "block", "blocks")}.`,
    );
    if (neighbour) ask(`block:${neighbour.id}`);
    else ask("palette:text");
  };

  const patch = (id: string, change: Partial<BulletinBlock>) => {
    if (locked) return;
    write(
      list.map((b) =>
        b.id === id ? ({ ...b, ...change } as BulletinBlock) : b,
      ),
    );
  };

  /* ------------------------------ FLIP landing ----------------------------- */

  const orderKey = list.map((b) => b.id).join("|");
  React.useLayoutEffect(() => {
    // Forget the motion values of blocks that are gone.
    const live = new Set(orderKey.split("|"));
    for (const id of [...ys.current.keys()]) {
      if (!live.has(id)) {
        flights.current.get(id)?.stop();
        flights.current.delete(id);
        ys.current.delete(id);
        goals.current.delete(id);
      }
    }
    const req = flip.current;
    if (!req) return;
    flip.current = null;
    // A host that refused the move (or made another) is not animated from
    // a stale picture.
    if (req.key !== orderKey) return;
    const fades: AnimationPlaybackControls[] = [];
    for (const [id, node] of rows.current) {
      const v = yOf(id);
      flights.current.get(id)?.stop();
      flights.current.delete(id);
      goals.current.set(id, 0);
      const before = req.tops.get(id);
      if (before === undefined || id === req.fresh) {
        if (!motionSafe) {
          v.jump(0);
          continue;
        }
        v.jump(distances.step);
        run(id, animate(v, 0, springs.glide));
        fades.push(
          animate(
            node,
            { opacity: [0, 1] },
            { duration: durations.base, ease: easings.enter },
          ),
        );
        continue;
      }
      const delta = r2(before - node.offsetTop);
      if (!motionSafe || Math.abs(delta) < 0.5) {
        v.jump(0);
        continue;
      }
      v.jump(delta);
      run(
        id,
        animate(v, 0, {
          ...springs.glide,
          velocity: req.velocity?.id === id ? req.velocity.v : 0,
        }),
      );
    }
    return () => {
      for (const f of fades) f.complete();
    };
    // One landing per change of order; the rest is read as it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  /* -------------------------------- effects ------------------------------- */

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => setNarrow(root.clientWidth < NARROW));
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const pending = timers.current;
    const running = flights.current;
    const values = ys.current;
    const ghosts = ghostRun.current;
    const scrolling = scrollRun;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
      for (const [id, c] of running) {
        c.stop();
        values.get(id)?.jump(0);
      }
      running.clear();
      for (const c of ghosts) c.stop();
      scrolling.current?.stop();
      cancelAnimationFrame(scrollLoop.current);
      scrollLoop.current = 0;
    };
  }, []);

  React.useEffect(() => {
    if (!roomNode) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setRoom(Math.round(entry.contentRect.width));
    });
    ro.observe(roomNode);
    return () => ro.disconnect();
  }, [roomNode]);

  // A wide editor has no sheet: one left open when the box grew is closed.
  if (!narrow && sheet) setSheet(null);

  React.useEffect(() => {
    if (!focusAsk) return;
    // The rail and the sheet can both hold the same field; only one shows.
    const node = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>(
        `[data-bc-focus="${CSS.escape(focusAsk.key)}"]`,
      ) ?? [],
    ).find((n) => n.getClientRects().length > 0);
    if (!node) return;
    node.focus({ preventScroll: false });
    if (
      node instanceof HTMLTextAreaElement ||
      node instanceof HTMLInputElement
    ) {
      try {
        const end = node.value.length;
        node.setSelectionRange(end, end);
      } catch {
        // An email field has no caret to place; focus is enough.
      }
    }
  }, [focusAsk]);

  // A popover closes when the pointer goes down anywhere else.
  React.useEffect(() => {
    if (!pop) return;
    const onDown = (event: PointerEvent) => {
      const t = event.target;
      if (!(t instanceof Element)) return;
      if (t.closest("[data-bc-pop]") || t.closest("[data-bc-pop-trigger]")) {
        return;
      }
      setPop(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [pop]);

  /* --------------------------------- drag --------------------------------- */

  const othersOf = (s: DragSession) =>
    s.kind === "block" ? s.order.filter((id) => id !== s.id) : s.order;

  const lineFor = (s: DragSession, t: number) => {
    const others = othersOf(s);
    const top = (id: string | undefined) => (id ? (s.tops.get(id) ?? 0) : 0);
    const bottom = (id: string | undefined) =>
      id ? top(id) + (s.heights.get(id) ?? 0) : 0;
    const prev =
      t > 0 ? bottom(others[t - 1]) : t < others.length ? top(others[t]) : 0;
    const next = t < others.length ? top(others[t]) + GAP : prev + GAP;
    return r2((prev + next) / 2 - 1);
  };

  const applyPointer = () => {
    const s = session.current;
    const listNode = listRef.current;
    const scroller = scrollerRef.current;
    const root = rootRef.current;
    if (!s || !listNode || !scroller || !root) return;
    const lr = listNode.getBoundingClientRect();
    const py = s.lastY - lr.top;
    let over = true;
    if (s.kind === "block") {
      yOf(s.id).set(r2(py - s.startY));
    } else {
      const rr = root.getBoundingClientRect();
      ghostX.set(r2(s.lastX - rr.left - 70));
      ghostY.set(r2(s.lastY - rr.top - 22));
      const sr = scroller.getBoundingClientRect();
      over =
        s.lastX >= sr.left &&
        s.lastX <= sr.right &&
        s.lastY >= sr.top &&
        s.lastY <= sr.bottom;
    }
    let t: number | null = null;
    if (over) {
      const others = othersOf(s);
      const probe =
        s.kind === "block"
          ? (s.tops.get(s.id) ?? 0) +
            (py - s.startY) +
            (s.heights.get(s.id) ?? 0) / 2
          : py;
      t = 0;
      for (const id of others) {
        const mid = (s.tops.get(id) ?? 0) + (s.heights.get(id) ?? 0) / 2;
        if (mid < probe) t += 1;
      }
    }
    if (t === s.target) return;
    s.target = t;
    const others = othersOf(s);
    const home = s.kind === "block" ? s.order.indexOf(s.id) : -1;
    const noOp = t === home;
    others.forEach((id, k) => {
      yTo(id, t !== null && !noOp && k >= t ? GAP : 0);
    });
    setDragView({
      kind: s.kind,
      id: s.id,
      target: noOp ? null : t,
      lineY: t === null || noOp ? 0 : lineFor(s, t),
      ghost:
        s.kind === "block"
          ? {
              top: s.tops.get(s.id) ?? 0,
              height: s.heights.get(s.id) ?? 0,
            }
          : null,
    });
  };

  const tickScroll = () => {
    const s = session.current;
    const scroller = scrollerRef.current;
    if (!s || !scroller || document.hidden) {
      scrollLoop.current = 0;
      return;
    }
    const r = scroller.getBoundingClientRect();
    const edge = 44;
    const inside = s.lastX >= r.left && s.lastX <= r.right;
    let v = 0;
    if (inside && s.lastY < r.top + edge) {
      v = -Math.ceil((r.top + edge - s.lastY) / 4);
    } else if (inside && s.lastY > r.bottom - edge) {
      v = Math.ceil((s.lastY - (r.bottom - edge)) / 4);
    }
    if (v === 0) {
      scrollLoop.current = 0;
      return;
    }
    const before = scroller.scrollTop;
    scroller.scrollTop = before + clamp(v, -14, 14);
    if (scroller.scrollTop !== before) applyPointer();
    scrollLoop.current = requestAnimationFrame(tickScroll);
  };

  const hooks: DragHooks = {
    start: (kind, id, x, y) => {
      if (locked) return;
      const listNode = listRef.current;
      if (!listNode) return;
      setPop(null);
      const tops = new Map<string, number>();
      const heights = new Map<string, number>();
      for (const [bid, node] of rows.current) {
        tops.set(bid, node.offsetTop);
        heights.set(bid, node.offsetHeight);
      }
      for (const [bid, c] of flights.current) {
        c.stop();
        ys.current.get(bid)?.jump(0);
      }
      flights.current.clear();
      goals.current.clear();
      const lr = listNode.getBoundingClientRect();
      session.current = {
        kind,
        id,
        order: list.map((b) => b.id),
        tops,
        heights,
        startY: y - lr.top,
        lastX: x,
        lastY: y,
        target: undefined,
        homeX: x,
        homeY: y,
      };
      if (kind === "block") {
        pick(id);
      } else {
        for (const c of ghostRun.current) c.stop();
        ghostRun.current = [];
        setGhost({ kind: id as BulletinBlockKind, leaving: false });
        if (sheet) setLifting(true);
      }
      applyPointer();
    },
    move: (x, y) => {
      const s = session.current;
      if (!s) return;
      s.lastX = x;
      s.lastY = y;
      applyPointer();
      if (!scrollLoop.current) {
        scrollLoop.current = requestAnimationFrame(tickScroll);
      }
    },
    end: (velocityY) => {
      const s = session.current;
      session.current = null;
      cancelAnimationFrame(scrollLoop.current);
      scrollLoop.current = 0;
      setDragView(null);
      if (lifting) {
        setLifting(false);
        setSheet(null);
      }
      if (!s) return;
      const others = othersOf(s);
      const t = s.target ?? null;
      if (s.kind === "block") {
        const home = s.order.indexOf(s.id);
        if (t === null || t === home) {
          yTo(s.id, 0, velocityY);
          for (const id of others) yTo(id, 0);
          return;
        }
        const ids = [...others.slice(0, t), s.id, ...others.slice(t)];
        const byId = new Map(list.map((b) => [b.id, b]));
        const next = ids
          .map((id) => byId.get(id))
          .filter((b): b is BulletinBlock => b !== undefined);
        reorder(next, { id: s.id, v: velocityY });
        const moved = byId.get(s.id);
        say(
          `${moved ? kindName(moved.kind) : "Block"} moved to ${t + 1} of ${next.length}.`,
        );
        return;
      }
      // A palette tile: dropped on the letter it becomes a block there;
      // anywhere else it goes home.
      const kind = s.id as BulletinBlockKind;
      if (t !== null) {
        setGhost(null);
        insert(kind, t);
        return;
      }
      for (const id of others) yTo(id, 0);
      const root = rootRef.current;
      if (!root) {
        setGhost(null);
        return;
      }
      const rr = root.getBoundingClientRect();
      setGhost({ kind, leaving: true });
      const tx = r2(s.homeX - rr.left - 70);
      const ty = r2(s.homeY - rr.top - 22);
      if (!motionSafe) {
        setGhost(null);
        return;
      }
      ghostRun.current = [
        animate(ghostX, tx, springs.glide),
        animate(ghostY, ty, {
          ...springs.glide,
          onComplete: () => setGhost(null),
        }),
      ];
    },
    cancel: () => {
      const s = session.current;
      session.current = null;
      cancelAnimationFrame(scrollLoop.current);
      scrollLoop.current = 0;
      setDragView(null);
      setGhost(null);
      if (lifting) {
        setLifting(false);
        setSheet(null);
      }
      if (!s) return;
      for (const id of s.order) yTo(id, 0);
    },
  };

  /* -------------------------------- keyboard ------------------------------- */

  const focusBlock = (id: string | undefined) => {
    if (!id) return;
    setRove(id);
    pick(id);
    ask(`block:${id}`);
  };

  const openEdit = (id: string, from?: HTMLElement | null) => {
    pick(id);
    if (narrow) {
      opener.current = from ?? null;
      sheetY.jump(0);
      setSheet("edit");
      ask("first");
    } else {
      setRailTab("edit");
      const block = list.find((b) => b.id === id);
      ask(block && missingAlt(block) ? "alt" : "first");
    }
  };

  const onBlockKey = (
    event: React.KeyboardEvent<HTMLDivElement>,
    id: string,
  ) => {
    if (event.target !== event.currentTarget) return;
    const at = list.findIndex((b) => b.id === id);
    switch (event.key) {
      case "ArrowUp":
      case "ArrowDown": {
        event.preventDefault();
        const d = event.key === "ArrowDown" ? 1 : -1;
        if (event.altKey) moveBy(id, d);
        else focusBlock(list[clamp(at + d, 0, list.length - 1)]?.id);
        return;
      }
      case "Home":
        event.preventDefault();
        focusBlock(list[0]?.id);
        return;
      case "End":
        event.preventDefault();
        focusBlock(list[list.length - 1]?.id);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        openEdit(id, event.currentTarget);
        return;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        remove(id);
        return;
      case "Escape":
        if (sel) {
          event.preventDefault();
          pick(null);
          setRailTab("add");
          say("Selection cleared.");
        }
        return;
      default:
        break;
    }
  };

  /* --------------------------- send and schedule --------------------------- */

  const openPop = (which: "test" | "schedule", from: HTMLElement) => {
    if (pop === which) {
      setPop(null);
      return;
    }
    opener.current = from;
    setPop(which);
    if (which === "test") {
      setAddressError(null);
      if (test.phase !== "sending") setTest({ phase: "idle", to: "" });
      ask("test-address");
    } else {
      ask("slot");
    }
  };

  const closePop = () => {
    setPop(null);
    const back = opener.current;
    opener.current = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
  };

  const sendTest = () => {
    if (locked || test.phase === "sending") return;
    const to = address.trim();
    if (!EMAIL.test(to)) {
      setAddressError("Use an address like name@fernworks.example");
      ask("test-address");
      return;
    }
    const result = onSendTest?.(to, list);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setTest({ phase: "sending", to });
      say(`Sending a test to ${to}.`);
      (result as Promise<unknown>).then(
        () => {
          setTest({ phase: "sent", to });
          say(`Test sent to ${to}.`);
          later(() => setPop((p) => (p === "test" ? null : p)), 1400);
        },
        () => {
          setTest({ phase: "failed", to });
          say("The test did not send. Try again.");
        },
      );
    } else {
      setTest({ phase: "sent", to });
      say(`Test sent to ${to}.`);
      later(() => setPop((p) => (p === "test" ? null : p)), 1400);
    }
  };

  const confirmSchedule = () => {
    if (locked || scheduled.phase === "sending") return;
    const at = slots[slot];
    if (at === undefined) return;
    const result = onSchedule?.(at, list);
    const label = `${slotLabel(at)}, ${clock(at)}`;
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setScheduled({ phase: "sending", at });
      say(`Scheduling for ${label}.`);
      (result as Promise<unknown>).then(
        () => {
          setScheduled({ phase: "sent", at });
          say(`Scheduled for ${label}.`);
          closePop();
        },
        () => {
          setScheduled({ phase: "failed", at: null });
          say("That slot did not save. Try again.");
        },
      );
    } else {
      setScheduled({ phase: "sent", at });
      say(`Scheduled for ${label}.`);
      closePop();
    }
  };

  const jumpToIssue = () => {
    const first = issues[0];
    if (!first) return;
    pick(first.id);
    scrollToBlock(first.id);
    if (narrow) {
      opener.current =
        rootRef.current?.querySelector<HTMLElement>("[data-bc-issues]") ?? null;
      sheetY.jump(0);
      setSheet("edit");
    } else setRailTab("edit");
    ask("alt");
    say(`${blockName(first)}. Add a sentence that says what it shows.`);
  };

  /* --------------------------------- sheet -------------------------------- */

  const openSheet = (which: "add" | "edit", from: HTMLElement) => {
    opener.current = from;
    sheetY.jump(0);
    setSheet(which);
    ask(which === "add" ? "palette:header" : "first");
  };

  const closeSheet = () => {
    setSheet(null);
    const back = opener.current;
    opener.current = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
  };

  const sheetDrag = useDrag({
    axis: "y",
    threshold: 4,
    onMove: ({ offset }) => {
      sheetY.set(r2(offset.y < 0 ? rubberband(offset.y, 120) : offset.y));
    },
    onEnd: ({ velocity }) => {
      const h =
        rootRef.current?.querySelector<HTMLElement>("[data-bc-sheet]")
          ?.offsetHeight ?? 320;
      if (project(sheetY.get(), velocity.y, 0.99) > h / 3) closeSheet();
      else if (motionSafe) {
        animate(sheetY, 0, { ...springs.glide, velocity: velocity.y });
      } else sheetY.jump(0);
    },
    onCancel: () => {
      if (motionSafe) animate(sheetY, 0, springs.glide);
      else sheetY.jump(0);
    },
  });

  const trapTab = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeSheet();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex='0']",
      ),
    );
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  /* --------------------------------- render -------------------------------- */

  const palette = (compact: boolean) => (
    <div className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-1")}>
      {KINDS.map((k) => (
        <PaletteTile
          key={k.kind}
          kind={k.kind}
          name={k.name}
          hint={k.hint}
          Icon={k.Icon}
          accent={accent}
          disabled={locked}
          compact={compact}
          focusKey={`palette:${k.kind}`}
          onInsert={(kind) => {
            insert(kind);
            if (sheet) setSheet(null);
          }}
          hooks={hooks}
        />
      ))}
    </div>
  );

  const editPanel = (
    <EditPanel
      block={selBlock}
      index={selIndex}
      count={list.length}
      idBase={idBase}
      accent={accent}
      disabled={locked}
      onPatch={(change) => {
        if (selBlock) patch(selBlock.id, change);
      }}
      onMove={(d) => {
        if (selBlock) moveBy(selBlock.id, d, false);
      }}
      onRemove={() => {
        if (!selBlock) return;
        remove(selBlock.id);
        if (sheet) closeSheet();
      }}
    />
  );

  const segBtn = (on: boolean) =>
    cn(
      "relative inline-flex h-7 items-center justify-center gap-1.5 rounded-[5px] px-2 text-[12px] transition-colors",
      on ? "text-foreground" : "text-ink-2 hover:text-foreground",
      FOCUS_IN,
    );
  const toolBtn = cn(
    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 border border-hairline px-2 text-[12px] text-ink-2 transition-colors @min-[30rem]/bulletin-composer:px-2.5",
    "enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:opacity-50 aria-expanded:bg-surface-2 aria-expanded:text-foreground",
    FOCUS_RING,
  );

  const previewSwitch = (
    <div
      role="radiogroup"
      aria-label="Preview"
      className="flex h-8 shrink-0 items-center gap-0.5 rounded-2 bg-surface-2 p-0.5"
    >
      {(["desktop", "phone"] as const).map((v) => {
        const on = view === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={v === "desktop" ? "Desktop" : `Phone, ${phoneW} pixels`}
            tabIndex={on ? 0 : -1}
            data-bc-view={v}
            onClick={() => setView(v)}
            onKeyDown={(e) => {
              if (!e.key.startsWith("Arrow")) return;
              e.preventDefault();
              const next = v === "desktop" ? "phone" : "desktop";
              setView(next);
              e.currentTarget.parentElement
                ?.querySelector<HTMLButtonElement>(`[data-bc-view="${next}"]`)
                ?.focus();
            }}
            className={segBtn(on)}
          >
            {on ? (
              <motion.span
                layoutId={`${uid}-view`}
                aria-hidden
                className="absolute inset-0 rounded-[5px] bg-card shadow-sm"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            {v === "desktop" ? (
              <Monitor aria-hidden className="relative size-3.5 shrink-0" />
            ) : (
              <Smartphone aria-hidden className="relative size-3.5 shrink-0" />
            )}
            <span className="relative hidden @min-[30rem]/bulletin-composer:inline">
              {v === "desktop" ? "Desktop" : "Phone"}
            </span>
            {v === "phone" ? (
              <span className="relative hidden font-mono text-[10px] text-ink-3 tabular-nums @min-[40rem]/bulletin-composer:inline">
                {phoneW}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  const popClass =
    "absolute top-full right-3 z-30 mt-1.5 w-[min(18rem,calc(100%-1.5rem))] rounded-3 border border-hairline-strong bg-popover p-3 shadow-[0_12px_32px_color-mix(in_oklab,black_20%,transparent)]";
  const primaryBtn = (busy = false) =>
    cn(
      "inline-flex h-8 items-center justify-center gap-1.5 rounded-2 px-3 text-[12px] font-medium text-white transition-opacity",
      busy ? "cursor-progress opacity-80" : "hover:opacity-90",
      "disabled:opacity-50",
      FOCUS_RING,
    );

  const popEnter = {
    initial: { opacity: 0, y: motionSafe ? -distances.nudge : 0 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, transition: exitFor(durations.fast) },
    transition: {
      opacity: { duration: durations.fast, ease: easings.enter },
      y: motionSafe ? springs.snap : { duration: 0 },
    },
  };

  const testPop = (
    <motion.div
      key="test"
      data-bc-pop=""
      role="dialog"
      aria-labelledby={`${uid}-test`}
      className={popClass}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          closePop();
        }
      }}
      {...popEnter}
    >
      <p id={`${uid}-test`} className="text-[13px] font-semibold">
        Send a test
      </p>
      <p className="mt-0.5 text-[11px] leading-4 text-ink-3">
        One copy of this letter, as it stands.
      </p>
      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          sendTest();
        }}
      >
        <label htmlFor={`${uid}-addr`} className="sr-only">
          Test address
        </label>
        <input
          id={`${uid}-addr`}
          data-bc-focus="test-address"
          type="email"
          value={address}
          disabled={locked}
          aria-invalid={addressError ? true : undefined}
          aria-describedby={`${uid}-addr-note`}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setAddress(value);
            setAddressError(null);
          }}
          className={cn(inputClass, "h-8 font-mono text-[12px]")}
        />
        <p
          id={`${uid}-addr-note`}
          className={cn(
            "flex items-center gap-1.5 text-[11px] leading-4",
            addressError || test.phase === "failed"
              ? "text-danger"
              : "text-ink-3",
          )}
        >
          {addressError ??
            (test.phase === "failed"
              ? "That didn't send. Try again."
              : test.phase === "sent"
                ? `Sent to ${test.to}.`
                : issues.length > 0
                  ? `${plural(issues.length, "picture has", "pictures have")} no alt text yet.`
                  : "It arrives in a minute or two.")}
        </p>
        <div className="flex justify-end">
          <button
            type="submit"
            aria-disabled={locked || test.phase === "sending" || undefined}
            aria-busy={test.phase === "sending" || undefined}
            className={primaryBtn(test.phase === "sending")}
            style={{ backgroundColor: pigment(accent, 0.52) }}
          >
            {test.phase === "sent" ? (
              <Check aria-hidden className="size-3.5" />
            ) : (
              <Send aria-hidden className="size-3.5" />
            )}
            {test.phase === "sending"
              ? "Sending"
              : test.phase === "sent"
                ? "Sent"
                : "Send test"}
          </button>
        </div>
      </form>
    </motion.div>
  );

  const schedulePop = (
    <motion.div
      key="schedule"
      data-bc-pop=""
      role="dialog"
      aria-labelledby={`${uid}-sched`}
      className={popClass}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          closePop();
        }
      }}
      {...popEnter}
    >
      <p id={`${uid}-sched`} className="text-[13px] font-semibold">
        Schedule the letter
      </p>
      <div
        role="radiogroup"
        aria-labelledby={`${uid}-sched`}
        className="mt-2.5 flex flex-col gap-1"
      >
        {slots.map((at, i) => {
          const on = i === slot;
          return (
            <button
              key={at}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              data-bc-focus={on ? "slot" : undefined}
              data-bc-slot={i}
              disabled={locked}
              onClick={() => setSlot(i)}
              onKeyDown={(e) => {
                const d =
                  e.key === "ArrowDown" || e.key === "ArrowRight"
                    ? 1
                    : e.key === "ArrowUp" || e.key === "ArrowLeft"
                      ? -1
                      : 0;
                if (!d) return;
                e.preventDefault();
                const next = (i + d + slots.length) % slots.length;
                setSlot(next);
                e.currentTarget.parentElement
                  ?.querySelector<HTMLButtonElement>(`[data-bc-slot="${next}"]`)
                  ?.focus();
              }}
              className={cn(
                "flex h-9 items-center justify-between gap-2 rounded-2 border px-2.5 text-left text-[12px] transition-colors",
                on
                  ? "border-transparent bg-card text-foreground"
                  : "border-hairline text-ink-2 hover:bg-surface-2",
                FOCUS_RING,
              )}
              style={
                on ? { boxShadow: `inset 0 0 0 1.5px ${accent}` } : undefined
              }
            >
              <span>{slotLabel(at)}</span>
              <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                {clock(at)}
              </span>
            </button>
          );
        })}
      </div>
      {issues.length > 0 ? (
        <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-4 text-warn">
          <TriangleAlert aria-hidden className="mt-px size-3 shrink-0" />
          <span>
            {plural(issues.length, "picture has", "pictures have")} no alt text.{" "}
            <button
              type="button"
              onClick={() => {
                setPop(null);
                jumpToIssue();
              }}
              className={cn("underline underline-offset-2", FOCUS_RING)}
            >
              Fix first
            </button>
          </span>
        </p>
      ) : null}
      {scheduled.phase === "failed" ? (
        <p className="mt-2 text-[11px] text-danger">
          That slot did not save. Try again.
        </p>
      ) : null}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={confirmSchedule}
          aria-disabled={locked || scheduled.phase === "sending" || undefined}
          aria-busy={scheduled.phase === "sending" || undefined}
          className={primaryBtn(scheduled.phase === "sending")}
          style={{ backgroundColor: pigment(accent, 0.52) }}
        >
          <CalendarClock aria-hidden className="size-3.5" />
          {scheduled.phase === "sending" ? "Saving" : "Schedule"}
        </button>
      </div>
    </motion.div>
  );

  const frameShadow = "0 10px 28px color-mix(in oklab, black 14%, transparent)";
  const lineTransition = motionSafe ? springs.snap : { duration: 0 };

  const ruler = (
    // The phone's width, marked over the letter: on the desktop letter it
    // shows where the reflow will cut; on the phone it labels the screen.
    <div
      aria-hidden
      className="relative mx-auto mb-3 hidden h-3 @min-[40rem]/bulletin-composer:block"
      style={{
        width: `min(${phoneW}px, 100%)`,
        transition: motionSafe
          ? "width 320ms cubic-bezier(0.22, 1, 0.36, 1)"
          : undefined,
      }}
    >
      <span
        className="absolute inset-x-0 top-1/2 h-px"
        style={{ backgroundColor: wash(accent, 40) }}
      />
      <span
        className="absolute inset-y-0 left-0 w-px"
        style={{ backgroundColor: wash(accent, 70) }}
      />
      <span
        className="absolute inset-y-0 right-0 w-px"
        style={{ backgroundColor: wash(accent, 70) }}
      />
      <span
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface-0 px-1.5 font-mono text-[9px] leading-3 tracking-[0.06em] whitespace-nowrap uppercase tabular-nums"
        style={{ color: accent }}
      >
        {phone ? `${phoneW} px` : `phone · ${phoneW}`}
      </span>
    </div>
  );

  const letter = (
    <motion.div
      layout
      {...lay}
      className="relative mx-auto"
      style={{ width: `min(${phone ? phoneW : deskW}px, 100%)` }}
    >
      <motion.div
        aria-hidden
        layout
        {...lay}
        className="absolute overflow-hidden"
        style={{
          inset: phone ? -7 : -1,
          borderRadius: phone ? 34 : 11,
          boxShadow: frameShadow,
        }}
      >
        {/* Two finishes cross-fade while the box morphs: a hairline round the
            desktop window, a bezel round the phone. */}
        <motion.span
          className="absolute inset-0 bg-hairline-strong"
          initial={false}
          animate={{ opacity: phone ? 0 : 1 }}
          transition={{ duration: durations.base, ease: easings.move }}
        />
        <motion.span
          className="absolute inset-0"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--foreground) 16%, var(--card))",
          }}
          initial={false}
          animate={{ opacity: phone ? 1 : 0 }}
          transition={{ duration: durations.base, ease: easings.move }}
        />
      </motion.div>
      <motion.div
        layout
        {...lay}
        className={cn(
          "relative overflow-hidden",
          blockStyle === "seamless" ? "bg-card" : "bg-surface-0",
        )}
        style={{ borderRadius: phone ? 27 : 10 }}
      >
        {phone ? (
          <motion.div
            layout="position"
            {...lay}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              ...lay.transition,
              opacity: {
                duration: durations.base,
                delay: motionSafe ? 0.08 : 0,
                ease: easings.enter,
              },
            }}
            className="flex h-7 items-center justify-between bg-card px-6 font-mono text-[10px] font-medium text-foreground tabular-nums"
          >
            <span>{clock(nowMs)}</span>
            <span className="h-1.5 w-12 rounded-full bg-hairline-strong" />
            <span className="flex items-center gap-1">
              <span className="h-2 w-4 rounded-[2px] border border-ink-3 p-px">
                <span className="block h-full w-2/3 rounded-[1px] bg-ink-2" />
              </span>
            </span>
          </motion.div>
        ) : null}
        <motion.div
          layout
          {...lay}
          aria-hidden
          className="flex items-center gap-2.5 border-b border-hairline bg-card px-4 py-2.5"
        >
          <motion.span
            layout="position"
            {...lay}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
            style={{ backgroundColor: pigment(accent, 0.55) }}
          >
            {sender.slice(0, 1).toUpperCase()}
          </motion.span>
          <motion.span layout="position" {...lay} className="min-w-0 flex-1">
            <span className="block truncate text-[12px] leading-4 font-semibold text-foreground">
              {sender}
              <span className="ml-1.5 font-normal text-ink-3">· {subject}</span>
            </span>
            <span className="block truncate text-[11px] leading-4 text-ink-3">
              {preheader}
            </span>
          </motion.span>
        </motion.div>

        {status === "loading" ? (
          <div aria-hidden className="flex flex-col gap-4 bg-card p-6">
            <span className="h-24 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
            <span className="h-3 w-4/5 rounded-full bg-surface-2 motion-safe:animate-pulse" />
            <span className="h-3 w-3/5 rounded-full bg-surface-2 motion-safe:animate-pulse" />
            <span className="h-32 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
            <span className="h-10 w-32 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
          </div>
        ) : list.length === 0 ? (
          <div
            ref={listRef}
            className="relative m-3 flex flex-col items-center gap-2 rounded-3 border border-dashed border-hairline-strong px-6 py-12 text-center"
          >
            <Mail aria-hidden className="size-5 text-ink-3" />
            <p className="text-[13px] text-ink-2">An empty letter.</p>
            <p className="text-[11px] leading-4 text-ink-3">
              <span className="hidden @min-[40rem]/bulletin-composer:inline">
                Drag a block here, or pick one from Add.
              </span>
              <span className="@min-[40rem]/bulletin-composer:hidden">
                Tap Add block to start.
              </span>
            </p>
            {dragView?.target !== null && dragView ? (
              <span
                aria-hidden
                className="absolute inset-x-3 top-2 h-0.5 rounded-full"
                style={{ backgroundColor: accent }}
              />
            ) : null}
          </div>
        ) : (
          <div
            ref={listRef}
            role="listbox"
            aria-labelledby={titleId}
            aria-describedby={hintId}
            aria-disabled={locked || undefined}
            className={cn(
              "relative flex flex-col",
              blockStyle === "framed" && "gap-1.5 p-2",
              blockStyle === "stacked" && "gap-2.5 p-2.5",
            )}
            style={{ paddingBottom: dragView ? GAP + 8 : undefined }}
          >
            {list.map((block, i) => (
              <BlockRow
                key={block.id}
                block={block}
                index={i}
                count={list.length}
                compact={compact}
                accent={accent}
                blockStyle={blockStyle}
                isSelected={block.id === sel}
                isRove={block.id === roving}
                isDragging={
                  dragView?.kind === "block" && dragView.id === block.id
                }
                disabled={locked}
                motionSafe={motionSafe}
                clipId={`${idBase}-${block.id}-dome`}
                lay={lay}
                hintId={hintId}
                register={register}
                registerY={registerY}
                hooks={hooks}
                onPick={(id) => {
                  pick(id);
                  setRove(id);
                  if (!narrow) setRailTab("edit");
                }}
                onKey={onBlockKey}
              />
            ))}
            {dragView?.ghost ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-2 rounded-2 border border-dashed"
                style={{
                  top: dragView.ghost.top,
                  height: dragView.ghost.height,
                  borderColor:
                    dragView.target === null
                      ? accent
                      : "var(--hairline-strong)",
                  backgroundColor: wash(
                    accent,
                    dragView.target === null ? 6 : 3,
                  ),
                }}
              />
            ) : null}
            <AnimatePresence>
              {dragView && dragView.target !== null ? (
                <motion.span
                  key="drop-line"
                  aria-hidden
                  className="pointer-events-none absolute inset-x-1.5 top-0 z-[8] h-0.5 rounded-full"
                  style={{ backgroundColor: accent }}
                  initial={{ opacity: 0, y: dragView.lineY, scaleX: 0.9 }}
                  animate={{ opacity: 1, y: dragView.lineY, scaleX: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{
                    y: lineTransition,
                    scaleX: lineTransition,
                    opacity: { duration: durations.fast },
                  }}
                >
                  <span
                    className="absolute -top-[3px] -left-1 size-2 rounded-full border-2 bg-card"
                    style={{ borderColor: accent }}
                  />
                  <span
                    className="absolute -top-[3px] -right-1 size-2 rounded-full border-2 bg-card"
                    style={{ borderColor: accent }}
                  />
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>
        )}

        <motion.p
          layout="position"
          {...lay}
          aria-hidden
          className="bg-card px-6 pt-4 pb-6 text-center text-[11px] leading-4 text-ink-3"
        >
          You get this because you joined the {sender} letter.{" "}
          <span className="underline underline-offset-2">Unsubscribe</span>
        </motion.p>
      </motion.div>
    </motion.div>
  );

  const issueChip =
    issues.length > 0 ? (
      <button
        type="button"
        data-bc-issues=""
        onClick={jumpToIssue}
        aria-label={`${plural(issues.length, "problem", "problems")} to fix: alt text missing. Go to it.`}
        className={cn(
          "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-warn/35 px-2.5 text-[11px] font-medium text-warn transition-colors hover:bg-[color-mix(in_oklab,var(--warn)_10%,transparent)]",
          FOCUS_RING,
        )}
      >
        <TriangleAlert aria-hidden className="size-3 shrink-0" />
        <Rolling value={issues.length} motionSafe={motionSafe} />
        <span>to fix</span>
      </button>
    ) : ready ? (
      <span className="inline-flex h-7 shrink-0 items-center gap-1.5 px-1 text-[11px] text-ink-3">
        <Check aria-hidden className="size-3 shrink-0" />
        Ready
      </span>
    ) : null;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container/bulletin-composer relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-80",
        className,
      )}
      style={{ height }}
    >
      <header className="relative flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-3 py-2.5">
        <div className="flex min-w-0 flex-1 basis-44 items-center gap-2.5">
          <span
            aria-hidden
            className="hidden size-8 shrink-0 items-center justify-center rounded-2 @min-[30rem]/bulletin-composer:flex"
            style={{ backgroundColor: wash(accent, 12), color: accent }}
          >
            <Mail className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p
              id={titleId}
              className="truncate text-[13px] leading-5 font-semibold"
            >
              {title}
            </p>
            <p className="truncate text-[11px] leading-4 text-ink-3">
              {scheduled.phase === "sent" && scheduled.at !== null
                ? `Scheduled · ${slotLabel(scheduled.at)}, ${clock(scheduled.at)}`
                : `${sender} · ${plural(list.length, "block", "blocks")}`}
            </p>
          </div>
          {issueChip}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {previewSwitch}
          <button
            type="button"
            data-bc-pop-trigger=""
            aria-haspopup="dialog"
            aria-expanded={pop === "test"}
            aria-label="Send test"
            disabled={locked}
            onClick={(e) => openPop("test", e.currentTarget)}
            className={toolBtn}
          >
            <Send aria-hidden className="size-3.5" />
            <span className="hidden @min-[40rem]/bulletin-composer:inline">
              Send test
            </span>
          </button>
          <button
            type="button"
            data-bc-pop-trigger=""
            aria-haspopup="dialog"
            aria-expanded={pop === "schedule"}
            aria-label={
              scheduled.phase === "sent" && scheduled.at !== null
                ? `Scheduled for ${slotLabel(scheduled.at)}, ${clock(scheduled.at)}. Change`
                : "Schedule"
            }
            disabled={locked}
            onClick={(e) => openPop("schedule", e.currentTarget)}
            className={toolBtn}
          >
            {scheduled.phase === "sent" ? (
              <Check
                aria-hidden
                className="size-3.5"
                style={{ color: accent }}
              />
            ) : (
              <CalendarClock aria-hidden className="size-3.5" />
            )}
            <span className="hidden @min-[40rem]/bulletin-composer:inline">
              {scheduled.phase === "sent" && scheduled.at !== null
                ? `${slotLabel(scheduled.at).split(" ")[0] ?? ""} ${clock(scheduled.at)}`
                : "Schedule"}
            </span>
          </button>
        </div>
        <AnimatePresence>
          {pop === "test" ? testPop : pop === "schedule" ? schedulePop : null}
        </AnimatePresence>
      </header>

      <p id={hintId} className="sr-only">
        Up and Down move between blocks, Alt with Up or Down moves the block,
        Enter edits it, Delete removes it, Escape clears the selection.
      </p>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The letter did not load.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <aside
            aria-labelledby={railLabelId}
            className="hidden w-[188px] shrink-0 flex-col border-r border-hairline bg-surface-1 @min-[40rem]/bulletin-composer:flex @min-[64rem]/bulletin-composer:w-[224px]"
          >
            <span id={railLabelId} className="sr-only">
              Blocks and settings
            </span>
            <div
              role="tablist"
              aria-label="Rail"
              className="m-2.5 flex h-8 shrink-0 gap-0.5 rounded-2 bg-surface-2 p-0.5"
            >
              {(["add", "edit"] as const).map((t) => {
                const on = railTab === t;
                return (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    id={`${uid}-tab-${t}`}
                    aria-selected={on}
                    aria-controls={`${uid}-panel-${t}`}
                    tabIndex={on ? 0 : -1}
                    data-bc-tab={t}
                    onClick={() => setRailTab(t)}
                    onKeyDown={(e) => {
                      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight")
                        return;
                      e.preventDefault();
                      const next = t === "add" ? "edit" : "add";
                      setRailTab(next);
                      e.currentTarget.parentElement
                        ?.querySelector<HTMLButtonElement>(
                          `[data-bc-tab="${next}"]`,
                        )
                        ?.focus();
                    }}
                    className={segBtn(on)}
                    style={{ flex: 1 }}
                  >
                    {on ? (
                      <motion.span
                        layoutId={`${uid}-tab`}
                        aria-hidden
                        className="absolute inset-0 rounded-[5px] bg-card shadow-sm"
                        transition={motionSafe ? springs.snap : { duration: 0 }}
                      />
                    ) : null}
                    {t === "add" ? (
                      <Plus aria-hidden className="relative size-3.5" />
                    ) : (
                      <Pencil aria-hidden className="relative size-3.5" />
                    )}
                    <span className="relative">
                      {t === "add" ? "Add" : "Edit"}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-2.5 pb-3">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={railTab}
                  role="tabpanel"
                  id={`${uid}-panel-${railTab}`}
                  aria-labelledby={`${uid}-tab-${railTab}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.base, ease: easings.enter }}
                >
                  {railTab === "add" ? (
                    <div className="flex flex-col gap-2.5">
                      {palette(false)}
                      <p className="px-0.5 text-[11px] leading-4 text-ink-3">
                        Drag a tile into the letter, or press it to add after
                        the selected block.
                      </p>
                    </div>
                  ) : (
                    editPanel
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </aside>

          <motion.div
            ref={scrollerRef}
            layoutScroll
            onPointerDown={(e) => {
              if (e.target === e.currentTarget && sel) {
                pick(null);
                setRailTab("add");
              }
            }}
            className="relative flex-1 [scrollbar-width:thin] overflow-auto overscroll-contain bg-surface-0"
          >
            <div
              ref={setRoomNode}
              className="px-3 py-5 @min-[40rem]/bulletin-composer:px-6 @min-[40rem]/bulletin-composer:py-6"
              onPointerDown={(e) => {
                if (e.target === e.currentTarget && sel) {
                  pick(null);
                  setRailTab("add");
                }
              }}
            >
              {status === "ready" ? ruler : null}
              {letter}
            </div>
          </motion.div>
        </div>
      )}

      {status !== "error" ? (
        <div className="flex h-11 shrink-0 items-center gap-2 border-t border-hairline px-2 @min-[40rem]/bulletin-composer:hidden">
          <button
            type="button"
            aria-haspopup="dialog"
            disabled={locked}
            onClick={(e) => openSheet("add", e.currentTarget)}
            className={toolBtn}
          >
            <Plus aria-hidden className="size-3.5" />
            Add block
          </button>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-disabled={!selBlock || locked || undefined}
            onClick={(e) => {
              if (selBlock && !locked) openSheet("edit", e.currentTarget);
            }}
            className={cn(toolBtn, (!selBlock || locked) && "opacity-50")}
          >
            <Pencil aria-hidden className="size-3.5" />
            Edit
          </button>
          <span className="ml-auto truncate pr-1 font-mono text-[10px] text-ink-3 tabular-nums">
            {phone ? `${phoneW} px` : "desktop"}
          </span>
        </div>
      ) : null}

      <AnimatePresence>
        {sheet ? (
          <motion.div
            key="scrim"
            aria-hidden
            className="absolute inset-0 z-40 bg-[color-mix(in_oklab,black_28%,transparent)]"
            style={{ pointerEvents: lifting ? "none" : undefined }}
            initial={{ opacity: 0 }}
            animate={{ opacity: lifting ? 0 : 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.base }}
            onClick={closeSheet}
          />
        ) : null}
        {sheet ? (
          <motion.div
            key="sheet"
            className="absolute inset-x-0 bottom-0 z-50 flex max-h-[70%] flex-col"
            style={{ pointerEvents: lifting ? "none" : undefined }}
            initial={motionSafe ? { y: "100%", opacity: 1 } : { opacity: 0 }}
            animate={
              motionSafe
                ? { y: 0, opacity: lifting ? 0 : 1 }
                : { opacity: lifting ? 0 : 1 }
            }
            exit={
              motionSafe
                ? { y: "100%", transition: exitFor(durations.base) }
                : { opacity: 0, transition: { duration: durations.fast } }
            }
            transition={
              motionSafe
                ? {
                    y: springs.glide,
                    opacity: { duration: durations.fast, ease: easings.enter },
                  }
                : { duration: durations.fast }
            }
          >
            <motion.div
              data-bc-sheet=""
              role="dialog"
              aria-modal="true"
              aria-labelledby={sheetTitleId}
              onKeyDown={trapTab}
              style={{ y: sheetY }}
              className="flex flex-col overflow-hidden rounded-t-4 border-t border-hairline-strong bg-popover shadow-[0_-12px_32px_color-mix(in_oklab,black_18%,transparent)]"
            >
              <div
                {...sheetDrag}
                className="flex shrink-0 cursor-grab touch-none flex-col items-center gap-2 px-3 pt-2 pb-1"
              >
                <span
                  aria-hidden
                  className="h-1 w-9 rounded-full bg-hairline-strong"
                />
                <div className="flex w-full items-center justify-between gap-2">
                  <p id={sheetTitleId} className="text-[13px] font-semibold">
                    {sheet === "add" ? "Add a block" : "Edit block"}
                  </p>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={closeSheet}
                    className={cn(
                      "inline-flex size-8 items-center justify-center rounded-2 text-ink-2 hover:bg-surface-2 hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto overscroll-contain px-3 pt-1 pb-4">
                {sheet === "add" ? palette(true) : editPanel}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {ghost ? (
          <motion.div
            key="ghost"
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 z-[60] flex h-11 w-[140px] items-center gap-2 rounded-3 border bg-popover px-2.5 text-[12px] font-medium shadow-[0_12px_28px_color-mix(in_oklab,black_22%,transparent)]"
            style={{ x: ghostX, y: ghostY, borderColor: accent }}
            initial={{ opacity: 0, scale: motionSafe ? 0.94 : 1 }}
            animate={{ opacity: ghost.leaving ? 0.5 : 1, scale: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast }}
          >
            {(() => {
              const k = KINDS.find((x) => x.kind === ghost.kind);
              if (!k) return null;
              return (
                <>
                  <span
                    className="flex size-7 items-center justify-center rounded-2"
                    style={{ backgroundColor: wash(accent, 14), color: accent }}
                  >
                    <k.Icon className="size-3.5" />
                  </span>
                  {k.name}
                </>
              );
            })()}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
