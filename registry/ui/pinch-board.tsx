"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  Maximize,
  Minus,
  Plus,
  RotateCcw,
  StickyNote,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PinchColor =
  "amber" | "rose" | "green" | "cobalt" | "signal" | "ink";

/** A frame on the board, in board units; cards are grouped by sitting inside it. */
export type PinchFrame = {
  id: string;
  /** The frame's name, e.g. "Now". */
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** One sticky note. Where it sits lives in the board's value, not here. */
export type PinchCard = {
  id: string;
  title: string;
  /** Shown only when zoomed in. */
  body?: string;
  /** Shown from mid zoom. */
  tags?: string[];
  color: PinchColor;
};

/** A card's top-left corner in board units and the frame it sits in, if any. */
export type PinchPlacement = { x: number; y: number; frameId: string | null };

/** Card id to placement. */
export type PinchBoardValue = Record<string, PinchPlacement>;

export type PinchMove = {
  cardId: string;
  from: PinchPlacement;
  to: PinchPlacement;
};

export type PinchPan = { x: number; y: number };
export type PinchCardStyle = "sticky" | "card" | "flat";
export type PinchDensity = "compact" | "cozy" | "roomy";
export type PinchStatus = "ready" | "loading" | "error";

export type PinchBoardProps = {
  /** The frames drawn on the board. @default defaultPinchFrames */
  frames?: PinchFrame[];
  /** The sticky notes. @default defaultPinchCards */
  cards?: PinchCard[];
  /** Controlled card placements. */
  value?: PinchBoardValue;
  /** Initial placements when uncontrolled. @default defaultPinchValue */
  defaultValue?: PinchBoardValue;
  /** Fires when a card is dropped or nudged, with every placement and the move. */
  onChange?: (value: PinchBoardValue, change: PinchMove) => void;
  /** Controlled zoom; 1 is board units at screen pixels. */
  zoom?: number;
  /** Initial zoom when uncontrolled. @default fits everything */
  defaultZoom?: number;
  /** Fires once a pinch, wheel, button or key has settled on a zoom. */
  onZoomChange?: (zoom: number) => void;
  /** Controlled pan: where the board's origin sits in the viewport, in px. */
  pan?: PinchPan;
  /** Initial pan when uncontrolled. @default centres the board */
  defaultPan?: PinchPan;
  /** Fires once a drag, wheel, key or fit has settled on a pan. */
  onPanChange?: (pan: PinchPan) => void;
  /** A card was opened by Enter or a double tap. */
  onOpenCard?: (card: PinchCard) => void;
  /** "Add a note" was pressed on an empty board. */
  onAddCard?: () => void;
  /** Show the minimap in the corner. @default true */
  minimap?: boolean;
  /** How a note is drawn: tinted paper, a white card with a colour bar, or a flat tile. @default "sticky" */
  cardStyle?: PinchCardStyle;
  /** Card size and type. @default "cozy" */
  density?: PinchDensity;
  /** Smallest zoom. @default 0.25 */
  minZoom?: number;
  /** Largest zoom. @default 2.5 */
  maxZoom?: number;
  /** Whether the board has arrived. @default "ready" */
  status?: PinchStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Roadmap" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px. @default 540 */
  height?: number;
  /** Read only: nothing can be moved, but the board still zooms and pans. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** Gaugeworks Roadmap: four horizons on one board. */
export const defaultPinchFrames: PinchFrame[] = [
  { id: "now", title: "Now", x: 40, y: 40, w: 640, h: 420 },
  { id: "next", title: "Next", x: 720, y: 40, w: 640, h: 420 },
  { id: "later", title: "Later", x: 40, y: 500, w: 640, h: 420 },
  { id: "parked", title: "Parked", x: 720, y: 500, w: 640, h: 420 },
];

export const defaultPinchCards: PinchCard[] = [
  {
    id: "billing",
    title: "Usage-based billing",
    body: "Meter API calls per workspace and bill on the first of the month.",
    tags: ["Billing", "Q4"],
    color: "amber",
  },
  {
    id: "audit",
    title: "Audit log export",
    body: "Nightly CSV to the customer's bucket, signed and retained 90 days.",
    tags: ["Compliance"],
    color: "cobalt",
  },
  {
    id: "sso",
    title: "SSO for Fieldline",
    body: "SAML with just-in-time provisioning; Fieldline is the pilot.",
    tags: ["Enterprise", "Coldbrook"],
    color: "green",
  },
  {
    id: "dash",
    title: "Dashboard refresh",
    body: "New gauge tiles and a denser grid for wall displays.",
    tags: ["Design"],
    color: "rose",
  },
  {
    id: "alerts",
    title: "Alert routing v2",
    body: "Route by site and shift instead of one list per team.",
    tags: ["Ops", "Basinworks"],
    color: "signal",
  },
  {
    id: "mobile",
    title: "Mobile approvals",
    body: "Approve a reading correction from the phone, with the photo.",
    tags: ["Mobile"],
    color: "amber",
  },
  {
    id: "shared",
    title: "Shared gauges",
    body: "Publish a gauge to another workspace, read only.",
    tags: ["Platform"],
    color: "cobalt",
  },
  {
    id: "status",
    title: "Public status page",
    body: "Per-region uptime with the incident bridge feeding it.",
    tags: ["Trust"],
    color: "green",
  },
  {
    id: "limits",
    title: "Rate limit tiers",
    body: "Three tiers keyed to the plan, with burst headroom.",
    tags: ["Platform", "Billing"],
    color: "ink",
  },
  {
    id: "plugins",
    title: "Plugin marketplace",
    body: "Third-party readers and exporters, reviewed before listing.",
    tags: ["Ecosystem"],
    color: "rose",
  },
  {
    id: "offline",
    title: "Offline readings",
    body: "Queue readings on the device and sync when the site has signal.",
    tags: ["Mobile", "Fieldline"],
    color: "signal",
  },
  {
    id: "residency",
    title: "Regional data residency",
    body: "Pin a workspace to a region at creation; no moves after.",
    tags: ["Compliance", "Enterprise"],
    color: "ink",
  },
  {
    id: "reports",
    title: "Dark mode for reports",
    body: "Print styles first, then the screen theme.",
    tags: ["Design"],
    color: "amber",
  },
  {
    id: "digest",
    title: "Chat digest",
    body: "One message per shift with the gauges that moved.",
    tags: ["Ops"],
    color: "green",
  },
];

const slot = (frame: PinchFrame, i: number): PinchPlacement => ({
  x: frame.x + 20 + (i % 3) * 200,
  y: frame.y + 56 + Math.floor(i / 3) * 150,
  frameId: frame.id,
});

export const defaultPinchValue: PinchBoardValue = ((): PinchBoardValue => {
  const [now, next, later, parked] = defaultPinchFrames;
  if (!now || !next || !later || !parked) return {};
  return {
    billing: slot(now, 0),
    audit: slot(now, 1),
    sso: slot(now, 2),
    dash: slot(now, 3),
    alerts: slot(now, 4),
    mobile: slot(next, 0),
    shared: slot(next, 1),
    status: slot(next, 2),
    limits: slot(next, 3),
    plugins: slot(later, 0),
    offline: slot(later, 1),
    residency: slot(later, 2),
    reports: slot(parked, 0),
    digest: slot(parked, 1),
  };
})();

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const COLORS: Record<PinchColor, string> = {
  amber: "var(--warn)",
  rose: "var(--danger)",
  green: "var(--success)",
  cobalt: "var(--accent)",
  signal: "var(--signal)",
  ink: "var(--ink-3)",
};

const SIZES: Record<
  PinchDensity,
  { w: number; h: number; pad: number; title: number; body: number }
> = {
  compact: { w: 150, h: 96, pad: 10, title: 12, body: 11 },
  cozy: { w: 180, h: 120, pad: 12, title: 13, body: 12 },
  roomy: { w: 200, h: 140, pad: 14, title: 14, body: 12 },
};

/** Below this zoom a card is its colour and title; above `NEAR` its body shows. */
const FAR = 0.5;
const NEAR = 0.9;
const ZOOM_STEP = 1.25;
const FIT_PAD = 32;
const KEY_PAN = 80;
const DRAG_START = 4;
const TAP_MS = 350;
/** How much of the board must stay in view when panning, in px. */
const KEEP = 80;

type Rect = { x: number; y: number; w: number; h: number };
type View = { s: number; tx: number; ty: number };
type Level = "far" | "mid" | "near";
type Size = { w: number; h: number };

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

const levelOf = (s: number): Level =>
  s < FAR ? "far" : s < NEAR ? "mid" : "near";

const union = (rects: Rect[]): Rect | null => {
  if (rects.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

const fitRect = (
  rect: Rect,
  size: Size,
  min: number,
  max: number,
  pad = FIT_PAD,
): View => {
  const s = clamp(
    Math.min(
      (size.w - pad * 2) / Math.max(1, rect.w),
      (size.h - pad * 2) / Math.max(1, rect.h),
    ),
    min,
    max,
  );
  return {
    s,
    tx: (size.w - rect.w * s) / 2 - rect.x * s,
    ty: (size.h - rect.h * s) / 2 - rect.y * s,
  };
};

const contains = (f: Rect, cx: number, cy: number) =>
  cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h;

const hash = (s: string) => {
  let h = 7;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

/** A stable tilt per note, so a sticky board never looks machine-laid. */
const tiltOf = (id: string) => ((hash(id) % 7) - 3) * 0.6;

/* ----------------------------------------------------------------------- */
/*                                  Minimap                                 */
/* ----------------------------------------------------------------------- */

function Minimap({
  bounds,
  frames,
  cards,
  placements,
  card,
  size,
  width,
  x,
  y,
  scale,
  onJump,
  onSettle,
}: {
  bounds: Rect;
  frames: PinchFrame[];
  cards: PinchCard[];
  placements: PinchBoardValue;
  card: { w: number; h: number };
  size: Size;
  width: number;
  x: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
  onJump: (wx: number, wy: number) => void;
  onSettle: () => void;
}) {
  const k = width / Math.max(1, bounds.w);
  const height = Math.min(120, Math.round(bounds.h * k));
  const kk = Math.min(k, height / Math.max(1, bounds.h));
  const ox = (width - bounds.w * kk) / 2;
  const oy = (height - bounds.h * kk) / 2;

  const left = useTransform(
    () => ox + (-x.get() / scale.get() - bounds.x) * kk,
  );
  const top = useTransform(() => oy + (-y.get() / scale.get() - bounds.y) * kk);
  const vw = useTransform(() => (size.w / scale.get()) * kk);
  const vh = useTransform(() => (size.h / scale.get()) * kk);

  const dragging = React.useRef(false);

  const jump = (event: React.PointerEvent<HTMLDivElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - r.left;
    const py = event.clientY - r.top;
    onJump(bounds.x + (px - ox) / kk, bounds.y + (py - oy) / kk);
  };

  return (
    <div
      aria-hidden
      className="relative shrink-0 cursor-crosshair touch-none overflow-hidden rounded-2 border border-hairline-strong bg-[color-mix(in_oklab,var(--bg-2)_92%,transparent)] shadow-[0_8px_24px_-12px_color-mix(in_oklab,black_40%,transparent)] backdrop-blur-sm"
      style={{ width, height }}
      onPointerDown={(event) => {
        if (event.button !== 0 && event.pointerType === "mouse") return;
        event.stopPropagation();
        dragging.current = true;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Capture is a convenience here; a jump works without it.
        }
        jump(event);
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return;
        event.stopPropagation();
        jump(event);
      }}
      onPointerUp={(event) => {
        if (!dragging.current) return;
        event.stopPropagation();
        dragging.current = false;
        onSettle();
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      {frames.map((f) => (
        <span
          key={f.id}
          className="absolute rounded-[2px] border border-[color-mix(in_oklab,var(--ink-3)_55%,transparent)]"
          style={{
            left: ox + (f.x - bounds.x) * kk,
            top: oy + (f.y - bounds.y) * kk,
            width: f.w * kk,
            height: f.h * kk,
          }}
        />
      ))}
      {cards.map((c) => {
        const p = placements[c.id];
        if (!p) return null;
        return (
          <span
            key={c.id}
            className="absolute rounded-[1px]"
            style={{
              left: ox + (p.x - bounds.x) * kk,
              top: oy + (p.y - bounds.y) * kk,
              width: Math.max(2, card.w * kk),
              height: Math.max(2, card.h * kk),
              background: COLORS[c.color],
              opacity: 0.8,
            }}
          />
        );
      })}
      <motion.span
        className="absolute rounded-[2px] border border-cobalt-bright bg-[color-mix(in_oklab,var(--accent)_12%,transparent)]"
        style={{ left, top, width: vw, height: vh }}
      />
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Card                                   */
/* ----------------------------------------------------------------------- */

type NoteProps = {
  card: PinchCard;
  placement: PinchPlacement;
  frameName: string | null;
  size: { w: number; h: number; pad: number; title: number; body: number };
  cardStyle: PinchCardStyle;
  level: Level;
  dragging: boolean;
  selected: boolean;
  landed: boolean;
  enterDelay: number;
  motionSafe: boolean;
  inert: boolean;
};

function Note({
  card,
  placement,
  frameName,
  size,
  cardStyle,
  level,
  dragging,
  selected,
  landed,
  enterDelay,
  motionSafe,
  inert,
}: NoteProps) {
  const color = COLORS[card.color];
  const tilt = cardStyle === "sticky" && motionSafe ? tiltOf(card.id) : 0;
  const tags = card.tags ?? [];
  const face =
    cardStyle === "sticky"
      ? "border-transparent bg-[color-mix(in_oklab,var(--pb-color)_22%,var(--bg-1))] shadow-[0_6px_16px_-8px_color-mix(in_oklab,black_55%,transparent)]"
      : cardStyle === "card"
        ? "border-hairline bg-card shadow-[0_4px_12px_-8px_color-mix(in_oklab,black_45%,transparent)]"
        : "border-hairline-strong bg-surface-1";

  return (
    <motion.div
      data-card={card.id}
      role="button"
      tabIndex={0}
      aria-label={`${card.title}, ${frameName ? `in ${frameName}` : "outside every frame"}${tags.length ? `, ${tags.join(", ")}` : ""}${selected ? ", selected" : ""}`}
      aria-disabled={inert || undefined}
      className={cn(
        "absolute top-0 left-0 flex flex-col overflow-hidden rounded-2 border text-foreground select-none",
        face,
        inert ? "cursor-default" : dragging ? "cursor-grabbing" : "cursor-grab",
        dragging && "z-20",
        selected &&
          "ring-2 ring-[color-mix(in_oklab,var(--accent-bright)_70%,transparent)]",
        FOCUS_RING,
      )}
      style={{
        width: size.w,
        height: size.h,
        padding: size.pad,
        ["--pb-color" as string]: color,
      }}
      initial={motionSafe ? { opacity: 0, scale: 0.92 } : { opacity: 0 }}
      animate={{
        opacity: 1,
        x: placement.x,
        y: placement.y,
        rotate: dragging ? 0 : tilt,
        scale: dragging ? 1.04 : 1,
      }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{
        x: dragging || !motionSafe ? { duration: 0 } : springs.glide,
        y: dragging || !motionSafe ? { duration: 0 } : springs.glide,
        rotate: motionSafe ? springs.snap : { duration: 0 },
        scale: !motionSafe
          ? { duration: 0 }
          : dragging
            ? springs.flick
            : landed
              ? springs.recoil
              : { ...springs.flick, delay: enterDelay },
        opacity: {
          duration: durations.base,
          ease: easings.enter,
          delay: enterDelay,
        },
      }}
    >
      {cardStyle === "card" ? (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1"
          style={{ background: color }}
        />
      ) : null}

      {/* Far: the colour and a large title, legible when the board is small. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-end"
        style={{ padding: size.pad }}
        initial={false}
        animate={{ opacity: level === "far" ? 1 : 0 }}
        transition={{ duration: durations.base, ease: easings.enter }}
      >
        <span
          className="line-clamp-3 leading-[1.1] font-semibold tracking-[-0.01em]"
          style={{ fontSize: Math.round(size.title * 1.9) }}
        >
          {card.title}
        </span>
      </motion.div>

      {/* Mid and near: the title at reading size, tags, and the body near. */}
      <motion.div
        className="flex min-h-0 flex-1 flex-col gap-1"
        initial={false}
        animate={{ opacity: level === "far" ? 0 : 1 }}
        transition={{ duration: durations.base, ease: easings.enter }}
      >
        <span className="flex items-start gap-1.5">
          {cardStyle === "flat" ? (
            <span
              aria-hidden
              className="mt-[0.35em] size-2 shrink-0 rounded-full"
              style={{ background: color }}
            />
          ) : null}
          <span
            className="line-clamp-2 leading-[1.2] font-semibold"
            style={{ fontSize: size.title }}
          >
            {card.title}
          </span>
        </span>
        <motion.p
          className="line-clamp-3 min-h-0 flex-1 leading-[1.3] text-ink-2"
          style={{ fontSize: size.body }}
          initial={false}
          animate={{ opacity: level === "near" ? 1 : 0 }}
          transition={{ duration: durations.base, ease: easings.enter }}
        >
          {card.body}
        </motion.p>
        {tags.length ? (
          <span className="mt-auto flex flex-wrap gap-1 pt-1">
            {tags.map((t) => (
              <span
                key={t}
                className="rounded-1 border border-[color-mix(in_oklab,var(--ink-3)_35%,transparent)] px-1 font-mono text-[9px] tracking-[0.06em] text-ink-3 uppercase"
              >
                {t}
              </span>
            ))}
          </span>
        ) : null}
      </motion.div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Gesture =
  | {
      kind: "pan";
      id: number;
      sx: number;
      sy: number;
      tx0: number;
      ty0: number;
      moved: boolean;
      frameTap: string | null;
    }
  | {
      kind: "pinch";
      a: number;
      b: number;
      d0: number;
      s0: number;
      wx: number;
      wy: number;
    }
  | {
      kind: "card";
      id: number;
      cardId: string;
      sx: number;
      sy: number;
      x0: number;
      y0: number;
      moved: boolean;
    };

/**
 * A zoomable planning board: sticky notes on a canvas, grouped by the frames
 * they sit in. A pinch, Ctrl and the wheel, or the + and - buttons zoom
 * around the pointer; the buttons, Fit all and a double tap on a frame travel
 * on `springs.glide`, both the scale and the pan on the one spring so the
 * point under the pointer never drifts. As the board shrinks a note folds to
 * its colour and a large title; as it grows its tags and then its body
 * cross-fade in. A minimap in the corner follows the viewport live and jumps
 * it on a press.
 *
 * Notes drag within and between frames — they lift on `springs.flick`, the
 * frame under them raises a "drop here" pill on `springs.snap`, and they land
 * on `springs.recoil`. The board is one application region: arrows pan, + and
 * - zoom, 0 fits all, Tab reaches every note, arrows on a note nudge it (Shift
 * for a stride), Enter opens it, and F on a frame or a note fits its frame.
 * Under reduced motion nothing travels: zooms and fits land instantly, notes
 * appear where they are dropped, and the detail levels still cross-fade.
 */
export function PinchBoard({
  frames = defaultPinchFrames,
  cards = defaultPinchCards,
  value,
  defaultValue = defaultPinchValue,
  onChange,
  zoom,
  defaultZoom,
  onZoomChange,
  pan,
  defaultPan,
  onPanChange,
  onOpenCard,
  onAddCard,
  minimap = true,
  cardStyle = "sticky",
  density = "cozy",
  minZoom = 0.25,
  maxZoom = 2.5,
  status = "ready",
  onRetry,
  title = "Roadmap",
  label,
  height = 540,
  disabled = false,
  className,
}: PinchBoardProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;

  const [own, setOwn] = React.useState<PinchBoardValue>(defaultValue);
  const current = value ?? own;
  const ready = status === "ready";
  const inert = disabled || !ready;
  const size = SIZES[density];

  const [viewport, setViewport] = React.useState<Size | null>(null);
  const [level, setLevel] = React.useState<Level>("mid");
  const [drag, setDrag] = React.useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [landed, setLanded] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [spaceHeld, setSpaceHeld] = React.useState(false);
  const [panning, setPanning] = React.useState(false);
  const [staggered, setStaggered] = React.useState(true);
  const [announcement, setAnnouncement] = React.useState("");

  const scaleMv = useMotionValue(1);
  const xMv = useMotionValue(0);
  const yMv = useMotionValue(0);
  const zoomText = useTransform(() => `${Math.round(scaleMv.get() * 100)}%`);
  const gridSize = useTransform(
    () => `${24 * scaleMv.get()}px ${24 * scaleMv.get()}px`,
  );
  const gridPos = useTransform(() => `${xMv.get()}px ${yMv.get()}px`);

  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const anims = React.useRef<{ stop: () => void }[]>([]);
  const gesture = React.useRef<Gesture | null>(null);
  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const lastTap = React.useRef<{ id: string; at: number } | null>(null);
  const wheelTimer = React.useRef<number | null>(null);
  const sayTimer = React.useRef<number | null>(null);
  const landTimer = React.useRef<number | null>(null);
  const viewportRef = React.useRef<Size | null>(null);
  const armed = React.useRef(false);

  /* -------------------------------- data ------------------------------- */

  const frameById = React.useMemo(
    () => new Map(frames.map((f) => [f.id, f])),
    [frames],
  );

  const placementOf = React.useCallback(
    (id: string): PinchPlacement =>
      current[id] ?? { x: 0, y: 0, frameId: null },
    [current],
  );

  const bounds = React.useMemo<Rect>(() => {
    const rects: Rect[] = frames.map((f) => ({
      x: f.x,
      y: f.y,
      w: f.w,
      h: f.h,
    }));
    for (const c of cards) {
      const p = current[c.id];
      if (p) rects.push({ x: p.x, y: p.y, w: size.w, h: size.h });
    }
    return union(rects) ?? { x: 0, y: 0, w: 800, h: 600 };
  }, [frames, cards, current, size.w, size.h]);
  const boundsRef = React.useRef(bounds);
  React.useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  const frameAt = React.useCallback(
    (x: number, y: number): PinchFrame | null => {
      const cx = x + size.w / 2;
      const cy = y + size.h / 2;
      // Later frames draw on top, so the last hit wins.
      let hit: PinchFrame | null = null;
      for (const f of frames) if (contains(f, cx, cy)) hit = f;
      return hit;
    },
    [frames, size.w, size.h],
  );

  const countIn = (frameId: string) =>
    cards.filter((c) => current[c.id]?.frameId === frameId).length;

  /* -------------------------------- view ------------------------------- */

  const stopAnims = () => {
    for (const a of anims.current) a.stop();
    anims.current = [];
  };

  const clampView = React.useCallback(
    (v: View): View => {
      const vp = viewportRef.current;
      const b = boundsRef.current;
      if (!vp) return v;
      const s = clamp(v.s, minZoom, maxZoom);
      const minTx = KEEP - (b.x + b.w) * s;
      const maxTx = vp.w - KEEP - b.x * s;
      const minTy = KEEP - (b.y + b.h) * s;
      const maxTy = vp.h - KEEP - b.y * s;
      return {
        s,
        tx: minTx <= maxTx ? clamp(v.tx, minTx, maxTx) : v.tx,
        ty: minTy <= maxTy ? clamp(v.ty, minTy, maxTy) : v.ty,
      };
    },
    [minZoom, maxZoom],
  );

  const setView = React.useCallback(
    (next: View) => {
      stopAnims();
      const v = clampView(next);
      scaleMv.set(v.s);
      xMv.set(v.tx);
      yMv.set(v.ty);
    },
    [clampView, scaleMv, xMv, yMv],
  );

  /** Travels to a view on glide, or lands there at once under reduced motion. */
  const goTo = React.useCallback(
    (next: View) => {
      stopAnims();
      const v = clampView(next);
      if (!motionSafe) {
        scaleMv.set(v.s);
        xMv.set(v.tx);
        yMv.set(v.ty);
        return;
      }
      anims.current = [
        animate(scaleMv, v.s, springs.glide),
        animate(xMv, v.tx, springs.glide),
        animate(yMv, v.ty, springs.glide),
      ];
    },
    [clampView, motionSafe, scaleMv, xMv, yMv],
  );

  const settle = React.useCallback(() => {
    onZoomChange?.(r2(scaleMv.get()));
    onPanChange?.({ x: Math.round(xMv.get()), y: Math.round(yMv.get()) });
  }, [onZoomChange, onPanChange, scaleMv, xMv, yMv]);

  const say = React.useCallback((text: string, delay = 0) => {
    if (sayTimer.current !== null) window.clearTimeout(sayTimer.current);
    if (delay === 0) {
      sayTimer.current = null;
      setAnnouncement(text);
      return;
    }
    sayTimer.current = window.setTimeout(() => {
      sayTimer.current = null;
      setAnnouncement(text);
    }, delay);
  }, []);

  /** The view a zoom lands on, keeping the board point under (px, py) still. */
  const zoomedAt = (s: number, px: number, py: number): View => {
    const s0 = scaleMv.get();
    const s1 = clamp(s, minZoom, maxZoom);
    const k = s1 / s0;
    return {
      s: s1,
      tx: px - (px - xMv.get()) * k,
      ty: py - (py - yMv.get()) * k,
    };
  };

  const zoomBy = (factor: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const v = zoomedAt(scaleMv.get() * factor, vp.w / 2, vp.h / 2);
    goTo(v);
    say(`Zoom ${Math.round(clamp(v.s, minZoom, maxZoom) * 100)} percent`);
    onZoomChange?.(r2(clamp(v.s, minZoom, maxZoom)));
    onPanChange?.({ x: Math.round(v.tx), y: Math.round(v.ty) });
  };

  const fitAll = React.useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const v = fitRect(boundsRef.current, vp, minZoom, maxZoom);
    goTo(v);
    say(`Showing everything at ${Math.round(v.s * 100)} percent`);
    onZoomChange?.(r2(v.s));
    onPanChange?.({ x: Math.round(v.tx), y: Math.round(v.ty) });
  }, [goTo, minZoom, maxZoom, onZoomChange, onPanChange, say]);

  const fitFrame = (frameId: string) => {
    const vp = viewportRef.current;
    const f = frameById.get(frameId);
    if (!vp || !f) return;
    const v = fitRect(f, vp, minZoom, maxZoom);
    goTo(v);
    say(`Fitted ${f.title}, ${countIn(f.id)} notes`);
    onZoomChange?.(r2(v.s));
    onPanChange?.({ x: Math.round(v.tx), y: Math.round(v.ty) });
  };

  const panBy = (dx: number, dy: number) => {
    goTo({ s: scaleMv.get(), tx: xMv.get() + dx, ty: yMv.get() + dy });
    onPanChange?.({
      x: Math.round(xMv.get() + dx),
      y: Math.round(yMv.get() + dy),
    });
  };

  /** Pans just enough to bring a note into view, so focus is never off screen. */
  const reveal = (p: PinchPlacement) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const s = scaleMv.get();
    const l = xMv.get() + p.x * s;
    const t = yMv.get() + p.y * s;
    const r = l + size.w * s;
    const b = t + size.h * s;
    let dx = 0;
    let dy = 0;
    if (l < 16) dx = 16 - l;
    else if (r > vp.w - 16) dx = vp.w - 16 - r;
    if (t < 16) dy = 16 - t;
    else if (b > vp.h - 16) dy = vp.h - 16 - b;
    if (dx || dy) {
      goTo({ s, tx: xMv.get() + dx, ty: yMv.get() + dy });
    }
  };

  /* ----------------------------- measuring ----------------------------- */

  const initial = React.useRef({
    zoom: zoom ?? defaultZoom,
    pan: pan ?? defaultPan,
  });

  React.useEffect(() => {
    const node = canvasRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const next = {
        w: Math.round(node.clientWidth),
        h: Math.round(node.clientHeight),
      };
      if (next.w === 0 || next.h === 0) return;
      viewportRef.current = next;
      setViewport((prev) =>
        prev && prev.w === next.w && prev.h === next.h ? prev : next,
      );
      if (!armed.current) {
        armed.current = true;
        const want = initial.current;
        const b = boundsRef.current;
        if (want.zoom !== undefined) {
          const s = clamp(want.zoom, minZoom, maxZoom);
          const tx = want.pan?.x ?? (next.w - b.w * s) / 2 - b.x * s;
          const ty = want.pan?.y ?? (next.h - b.h * s) / 2 - b.y * s;
          scaleMv.set(s);
          xMv.set(tx);
          yMv.set(ty);
        } else {
          const v = fitRect(b, next, minZoom, maxZoom);
          scaleMv.set(v.s);
          xMv.set(want.pan?.x ?? v.tx);
          yMv.set(want.pan?.y ?? v.ty);
        }
        setLevel(levelOf(scaleMv.get()));
      }
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [minZoom, maxZoom, scaleMv, xMv, yMv]);

  // Controlled zoom and pan: a change from the host travels there on glide.
  const hasViewport = viewport !== null;
  React.useEffect(() => {
    if (zoom === undefined || !hasViewport) return;
    const s1 = clamp(zoom, minZoom, maxZoom);
    const s0 = scaleMv.get();
    if (Math.abs(s1 - s0) < 0.005) return;
    const vp = viewportRef.current;
    if (!vp) return;
    // Around the viewport's centre, as the buttons do.
    const k = s1 / s0;
    const px = vp.w / 2;
    const py = vp.h / 2;
    goTo({
      s: s1,
      tx: px - (px - xMv.get()) * k,
      ty: py - (py - yMv.get()) * k,
    });
  }, [zoom, hasViewport, minZoom, maxZoom, goTo, scaleMv, xMv, yMv]);

  const panX = pan?.x;
  const panY = pan?.y;
  React.useEffect(() => {
    if (panX === undefined || panY === undefined || !hasViewport) return;
    if (Math.abs(panX - xMv.get()) < 1 && Math.abs(panY - yMv.get()) < 1) {
      return;
    }
    goTo({ s: scaleMv.get(), tx: panX, ty: panY });
  }, [panX, panY, hasViewport, goTo, scaleMv, xMv, yMv]);

  useMotionValueEvent(scaleMv, "change", (s) => {
    const next = levelOf(s);
    setLevel((prev) => (prev === next ? prev : next));
  });

  React.useEffect(() => {
    const t = window.setTimeout(() => setStaggered(false), 900);
    return () => window.clearTimeout(t);
  }, []);

  React.useEffect(
    () => () => {
      stopAnims();
      if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
      if (sayTimer.current !== null) window.clearTimeout(sayTimer.current);
      if (landTimer.current !== null) window.clearTimeout(landTimer.current);
    },
    [],
  );

  /* -------------------------------- wheel ------------------------------ */

  React.useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (!ready) return;
      event.preventDefault();
      const r = node.getBoundingClientRect();
      const px = event.clientX - r.left;
      const py = event.clientY - r.top;
      stopAnims();
      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.01);
        const s0 = scaleMv.get();
        const s1 = clamp(s0 * factor, minZoom, maxZoom);
        const k = s1 / s0;
        const v = clampView({
          s: s1,
          tx: px - (px - xMv.get()) * k,
          ty: py - (py - yMv.get()) * k,
        });
        scaleMv.set(v.s);
        xMv.set(v.tx);
        yMv.set(v.ty);
      } else {
        const dx =
          event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX;
        const dy = event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY;
        const v = clampView({
          s: scaleMv.get(),
          tx: xMv.get() - dx,
          ty: yMv.get() - dy,
        });
        xMv.set(v.tx);
        yMv.set(v.ty);
      }
      if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
      wheelTimer.current = window.setTimeout(() => {
        wheelTimer.current = null;
        settle();
        say(`Zoom ${Math.round(scaleMv.get() * 100)} percent`);
      }, 160);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [ready, minZoom, maxZoom, clampView, settle, say, scaleMv, xMv, yMv]);

  /* ------------------------------- changes ----------------------------- */

  const commit = (cardId: string, to: PinchPlacement) => {
    const from = placementOf(cardId);
    const next = { ...current, [cardId]: to };
    if (value === undefined) setOwn(next);
    onChange?.(next, { cardId, from, to });
    const card = cards.find((c) => c.id === cardId);
    const frame = to.frameId ? frameById.get(to.frameId) : null;
    say(
      `Moved ${card?.title ?? cardId} ${frame ? `to ${frame.title}` : "outside every frame"}`,
      120,
    );
  };

  const land = (id: string) => {
    setLanded(id);
    if (landTimer.current !== null) window.clearTimeout(landTimer.current);
    landTimer.current = window.setTimeout(() => {
      landTimer.current = null;
      setLanded(null);
    }, 800);
  };

  const open = (card: PinchCard) => {
    setSelected(card.id);
    onOpenCard?.(card);
    say(`Opened ${card.title}`);
  };

  /* ------------------------------- pointer ----------------------------- */

  const canvasPoint = (event: React.PointerEvent) => {
    const r = canvasRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (r?.left ?? 0),
      y: event.clientY - (r?.top ?? 0),
    };
  };

  const capture = (event: React.PointerEvent<HTMLDivElement>) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic pointer can retire before capture; the gesture still runs.
    }
  };

  const startPinch = () => {
    const [a, b] = [...pointers.current.entries()];
    if (!a || !b) return;
    stopAnims();
    const d0 = Math.hypot(b[1].x - a[1].x, b[1].y - a[1].y) || 1;
    const mx = (a[1].x + b[1].x) / 2;
    const my = (a[1].y + b[1].y) / 2;
    const s0 = scaleMv.get();
    gesture.current = {
      kind: "pinch",
      a: a[0],
      b: b[0],
      d0,
      s0,
      wx: (mx - xMv.get()) / s0,
      wy: (my - yMv.get()) / s0,
    };
    setPanning(true);
    setDrag(null);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!ready) return;
    const p = canvasPoint(event);
    pointers.current.set(event.pointerId, p);
    capture(event);

    if (pointers.current.size === 2) {
      startPinch();
      return;
    }
    if (pointers.current.size > 1) return;

    const target = event.target as HTMLElement;
    const cardEl = target.closest<HTMLElement>("[data-card]");
    const cardId = cardEl?.dataset.card ?? null;
    const frameId =
      target.closest<HTMLElement>("[data-frame]")?.dataset.frame ?? null;
    // Space, the middle button, or a press on the canvas itself pans; a
    // press on a note picks it up. A read-only board pans from anywhere.
    const wantsPan = spaceHeld || event.button === 1 || !cardId || inert;

    if (cardId && !wantsPan) {
      if (event.button !== 0) return;
      const at = placementOf(cardId);
      gesture.current = {
        kind: "card",
        id: event.pointerId,
        cardId,
        sx: p.x,
        sy: p.y,
        x0: at.x,
        y0: at.y,
        moved: false,
      };
      return;
    }
    if (event.button !== 0 && event.button !== 1) return;
    stopAnims();
    gesture.current = {
      kind: "pan",
      id: event.pointerId,
      sx: p.x,
      sy: p.y,
      tx0: xMv.get(),
      ty0: yMv.get(),
      moved: false,
      frameTap: cardId ? null : frameId,
    };
    setPanning(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    const p = canvasPoint(event);
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, p);
    }
    if (!g) return;
    if (g.kind === "pinch") {
      const a = pointers.current.get(g.a);
      const b = pointers.current.get(g.b);
      if (!a || !b) return;
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const s = clamp(g.s0 * (d / g.d0), minZoom, maxZoom);
      const v = clampView({ s, tx: mx - g.wx * s, ty: my - g.wy * s });
      scaleMv.set(v.s);
      xMv.set(v.tx);
      yMv.set(v.ty);
      return;
    }
    if (g.id !== event.pointerId) return;
    const dx = p.x - g.sx;
    const dy = p.y - g.sy;
    if (g.kind === "pan") {
      if (!g.moved && Math.abs(dx) < DRAG_START && Math.abs(dy) < DRAG_START) {
        return;
      }
      g.moved = true;
      const v = clampView({
        s: scaleMv.get(),
        tx: g.tx0 + dx,
        ty: g.ty0 + dy,
      });
      xMv.set(v.tx);
      yMv.set(v.ty);
      return;
    }
    if (!g.moved && Math.abs(dx) < DRAG_START && Math.abs(dy) < DRAG_START) {
      return;
    }
    g.moved = true;
    const s = scaleMv.get();
    setDrag({ id: g.cardId, x: g.x0 + dx / s, y: g.y0 + dy / s });
  };

  const endPointer = (
    event: React.PointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) => {
    pointers.current.delete(event.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      if (event.pointerId !== g.a && event.pointerId !== g.b) return;
      gesture.current = null;
      const rest = [...pointers.current.entries()][0];
      if (rest) {
        // One finger lifted: the other carries on as a pan.
        gesture.current = {
          kind: "pan",
          id: rest[0],
          sx: rest[1].x,
          sy: rest[1].y,
          tx0: xMv.get(),
          ty0: yMv.get(),
          moved: true,
          frameTap: null,
        };
      } else {
        setPanning(false);
        settle();
        say(`Zoom ${Math.round(scaleMv.get() * 100)} percent`);
      }
      return;
    }
    if (g.id !== event.pointerId) return;
    gesture.current = null;
    if (g.kind === "pan") {
      setPanning(false);
      if (g.moved) {
        settle();
        return;
      }
      if (cancelled) return;
      setSelected(null);
      if (g.frameTap) {
        const now = performance.now();
        const prev = lastTap.current;
        if (prev && prev.id === g.frameTap && now - prev.at < TAP_MS) {
          lastTap.current = null;
          fitFrame(g.frameTap);
        } else {
          lastTap.current = { id: g.frameTap, at: now };
        }
      }
      return;
    }
    // A card.
    if (!g.moved || cancelled) {
      setDrag(null);
      if (cancelled) return;
      const card = cards.find((c) => c.id === g.cardId);
      const now = performance.now();
      const prev = lastTap.current;
      if (card && prev && prev.id === g.cardId && now - prev.at < TAP_MS) {
        lastTap.current = null;
        open(card);
      } else {
        lastTap.current = { id: g.cardId, at: now };
        setSelected(g.cardId);
      }
      return;
    }
    const p = canvasPoint(event);
    const s = scaleMv.get();
    const x = Math.round(g.x0 + (p.x - g.sx) / s);
    const y = Math.round(g.y0 + (p.y - g.sy) / s);
    setDrag(null);
    commit(g.cardId, { x, y, frameId: frameAt(x, y)?.id ?? null });
    land(g.cardId);
    setSelected(g.cardId);
  };

  const cancelDrag = () => {
    const g = gesture.current;
    if (g?.kind === "card") {
      gesture.current = null;
      pointers.current.clear();
      setDrag(null);
      say("Move cancelled");
      return true;
    }
    return false;
  };

  /* ------------------------------ keyboard ----------------------------- */

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ready) return;
    const target = event.target as HTMLElement;
    const cardId = target.dataset.card ?? null;
    const frameId = target.dataset.frame ?? null;
    const key = event.key;

    if (key === "+" || key === "=") {
      event.preventDefault();
      zoomBy(ZOOM_STEP);
      return;
    }
    if (key === "-" || key === "_") {
      event.preventDefault();
      zoomBy(1 / ZOOM_STEP);
      return;
    }
    if (key === "0") {
      event.preventDefault();
      fitAll();
      return;
    }
    if (key === "Escape") {
      if (cancelDrag()) return;
      if (selected) {
        setSelected(null);
        say("Selection cleared");
      }
      return;
    }
    if (key === " ") {
      event.preventDefault();
      if (cardId) {
        if (!inert) {
          setSelected((s) => (s === cardId ? null : cardId));
        }
        return;
      }
      if (!spaceHeld) setSpaceHeld(true);
      return;
    }
    if (key === "f" || key === "F") {
      const id = frameId ?? (cardId ? placementOf(cardId).frameId : null);
      if (id) {
        event.preventDefault();
        fitFrame(id);
      }
      return;
    }
    if (key === "Enter") {
      if (frameId) {
        event.preventDefault();
        fitFrame(frameId);
        return;
      }
      if (cardId) {
        event.preventDefault();
        const card = cards.find((c) => c.id === cardId);
        if (card) open(card);
      }
      return;
    }
    const dir =
      key === "ArrowLeft"
        ? [-1, 0]
        : key === "ArrowRight"
          ? [1, 0]
          : key === "ArrowUp"
            ? [0, -1]
            : key === "ArrowDown"
              ? [0, 1]
              : null;
    if (!dir) return;
    event.preventDefault();
    const [dx, dy] = dir as [number, number];
    if (cardId) {
      if (inert) return;
      const step = event.shiftKey ? 50 : 10;
      const at = placementOf(cardId);
      const x = at.x + dx * step;
      const y = at.y + dy * step;
      commit(cardId, { x, y, frameId: frameAt(x, y)?.id ?? null });
      reveal({ x, y, frameId: null });
      return;
    }
    panBy(-dx * KEY_PAN, -dy * KEY_PAN);
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === " ") setSpaceHeld(false);
  };

  /* ------------------------------- render ------------------------------ */

  const dragFrame = drag ? frameAt(drag.x, drag.y) : null;
  const step = cascade(Math.min(cards.length, 12));
  const empty = ready && cards.length === 0;
  const minimapWidth = viewport && viewport.w < 448 ? 96 : 128;

  const notes = cards.map((card, i) => {
    const at = placementOf(card.id);
    const dragging = drag?.id === card.id;
    const pos = dragging && drag ? { ...at, x: drag.x, y: drag.y } : at;
    const frame = at.frameId ? frameById.get(at.frameId) : null;
    return (
      <Note
        key={card.id}
        card={card}
        placement={pos}
        frameName={frame?.title ?? null}
        size={size}
        cardStyle={cardStyle}
        level={level}
        dragging={dragging}
        selected={selected === card.id}
        landed={landed === card.id}
        enterDelay={staggered ? Math.min(i, 12) * step : 0}
        motionSafe={motionSafe}
        inert={inert}
      />
    );
  });

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <p id={hintId} className="sr-only">
        Arrow keys pan the board. Plus and minus zoom, zero shows everything.
        Tab moves through the notes; on a note, arrows nudge it, Shift and
        arrows move it further, Enter opens it, Space selects it, and F fits its
        frame. On a frame, Enter or F fits it.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          {ready ? (
            <p className="hidden shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[28rem]:block">
              {cards.length} {cards.length === 1 ? "note" : "notes"} ·{" "}
              {frames.length} {frames.length === 1 ? "frame" : "frames"}
            </p>
          ) : null}
        </div>
        {ready ? (
          <p
            aria-hidden
            className="hidden shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[40rem]:block"
          >
            {spaceHeld
              ? "Space held · drag pans"
              : "Pinch or Ctrl + wheel to zoom"}
          </p>
        ) : null}
      </header>

      <div
        ref={canvasRef}
        role="application"
        aria-label={`${title} board`}
        aria-describedby={hintId}
        aria-busy={status === "loading" || undefined}
        tabIndex={ready ? 0 : -1}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            setSpaceHeld(false);
          }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => endPointer(event, false)}
        onPointerCancel={(event) => endPointer(event, true)}
        className={cn(
          "relative min-h-0 flex-1 touch-none overflow-hidden bg-surface-0",
          panning
            ? "cursor-grabbing"
            : spaceHeld
              ? "cursor-grab"
              : "cursor-default",
          FOCUS_RING,
          "focus-visible:outline-offset-[-2px]",
        )}
      >
        {/* The dot grid moves and scales with the board. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(color-mix(in oklab, var(--ink-3) 38%, transparent) 1px, transparent 1.2px)",
            backgroundSize: gridSize,
            backgroundPosition: gridPos,
          }}
        />

        {status === "loading" ? (
          <div aria-hidden className="absolute inset-0 p-5">
            <div className="grid h-full grid-cols-2 gap-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-3 border border-hairline p-3 motion-safe:animate-pulse"
                  style={{ animationDelay: `${i * 110}ms` }}
                >
                  <span className="h-2.5 w-16 rounded-1 bg-surface-2" />
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 3 }, (_, j) => (
                      <span
                        key={j}
                        className="aspect-[3/2] rounded-2 bg-surface-2"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : status === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The board didn&apos;t load.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            ) : null}
          </div>
        ) : viewport ? (
          <motion.div
            className="absolute top-0 left-0 origin-top-left"
            style={{ x: xMv, y: yMv, scale: scaleMv }}
          >
            {frames.map((f) => {
              const target = dragFrame?.id === f.id;
              return (
                <div
                  key={f.id}
                  data-frame={f.id}
                  role="group"
                  tabIndex={0}
                  aria-label={`${f.title} frame, ${countIn(f.id)} notes`}
                  className={cn(
                    "absolute rounded-3 border transition-colors duration-150",
                    target
                      ? "border-cobalt-bright bg-[color-mix(in_oklab,var(--accent)_7%,transparent)]"
                      : "border-hairline-strong bg-[color-mix(in_oklab,var(--bg-1)_70%,transparent)]",
                    FOCUS_RING,
                  )}
                  style={{ left: f.x, top: f.y, width: f.w, height: f.h }}
                >
                  <div className="flex h-10 items-center justify-between gap-2 px-4">
                    <span className="font-mono text-[11px] tracking-[0.08em] text-ink-2 uppercase">
                      {f.title}
                    </span>
                    <span className="flex items-center gap-2">
                      <AnimatePresence initial={false}>
                        {target ? (
                          <motion.span
                            key="drop"
                            initial={{
                              opacity: 0,
                              scale: motionSafe ? 0.8 : 1,
                            }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{
                              opacity: 0,
                              transition: exitFor(durations.fast),
                            }}
                            transition={
                              motionSafe
                                ? {
                                    ...springs.snap,
                                    opacity: { duration: durations.fast },
                                  }
                                : { duration: durations.fast }
                            }
                            className="rounded-full bg-primary px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] text-primary-foreground uppercase"
                          >
                            Drop here
                          </motion.span>
                        ) : null}
                      </AnimatePresence>
                      <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                        {countIn(f.id)}
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
            <AnimatePresence>{notes}</AnimatePresence>
          </motion.div>
        ) : null}

        {empty ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <motion.div
              initial={
                motionSafe ? { opacity: 0, scale: 0.96 } : { opacity: 0 }
              }
              animate={{ opacity: 1, scale: 1 }}
              transition={
                motionSafe
                  ? { ...springs.recoil, opacity: { duration: durations.base } }
                  : { duration: durations.base }
              }
              className="pointer-events-auto flex max-w-xs flex-col items-center gap-3 rounded-3 border border-hairline bg-card px-5 py-5 text-center shadow-[0_12px_32px_-16px_color-mix(in_oklab,black_45%,transparent)]"
            >
              <StickyNote aria-hidden className="size-5 text-ink-3" />
              <p className="text-sm text-foreground">
                Nothing on the board yet.
              </p>
              <p className="text-xs text-ink-2">
                Add the first note and drag it into a frame.
              </p>
              {onAddCard && !disabled ? (
                <button
                  type="button"
                  onClick={onAddCard}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
                    FOCUS_RING,
                  )}
                >
                  <Plus aria-hidden className="size-3.5" />
                  Add a note
                </button>
              ) : null}
            </motion.div>
          </div>
        ) : null}

        {ready && viewport ? (
          <>
            <div
              role="toolbar"
              aria-label="Zoom"
              className="absolute bottom-3 left-3 flex items-center gap-0.5 rounded-2 border border-hairline-strong bg-[color-mix(in_oklab,var(--bg-2)_92%,transparent)] p-0.5 shadow-[0_8px_24px_-12px_color-mix(in_oklab,black_40%,transparent)] backdrop-blur-sm"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => zoomBy(1 / ZOOM_STEP)}
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-1 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <Minus aria-hidden className="size-3.5" />
              </button>
              <motion.span
                aria-hidden
                className="w-11 text-center font-mono text-[11px] text-foreground tabular-nums"
              >
                {zoomText}
              </motion.span>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => zoomBy(ZOOM_STEP)}
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-1 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <Plus aria-hidden className="size-3.5" />
              </button>
              <span aria-hidden className="mx-0.5 h-4 w-px bg-hairline" />
              <button
                type="button"
                onClick={fitAll}
                aria-label="Fit all"
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-1 px-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <Maximize aria-hidden className="size-3.5" />
                <span className="hidden text-xs @min-[28rem]:inline">
                  Fit all
                </span>
              </button>
            </div>

            {minimap && !empty ? (
              <div className="absolute right-3 bottom-3">
                <Minimap
                  bounds={{
                    x: bounds.x - 40,
                    y: bounds.y - 40,
                    w: bounds.w + 80,
                    h: bounds.h + 80,
                  }}
                  frames={frames}
                  cards={cards}
                  placements={current}
                  card={size}
                  size={viewport}
                  width={minimapWidth}
                  x={xMv}
                  y={yMv}
                  scale={scaleMv}
                  onJump={(wx, wy) => {
                    const s = scaleMv.get();
                    setView({
                      s,
                      tx: viewport.w / 2 - wx * s,
                      ty: viewport.h / 2 - wy * s,
                    });
                  }}
                  onSettle={settle}
                />
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
