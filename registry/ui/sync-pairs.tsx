"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Plus,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type SyncCableStyle = "soft" | "taut" | "dashed";
export type SyncDensity = "compact" | "regular" | "roomy";
export type SyncAccent = "cobalt" | "moss" | "plum" | "ember";
export type SyncStatus = "ready" | "loading" | "error";
export type SyncFieldType =
  | "text"
  | "email"
  | "phone"
  | "number"
  | "money"
  | "date"
  | "datetime"
  | "picklist"
  | "boolean";
/** Which way values flow: to the right-hand app, to the left-hand app, or both ways. */
export type SyncDirection = "right" | "left" | "both";

export type SyncField = { id: string; name: string; type: SyncFieldType };
export type SyncPair = {
  /** The left-hand field's id. */
  left: string;
  /** The right-hand field's id. */
  right: string;
  direction: SyncDirection;
};
export type SyncApp = { name: string; initials: string };

export type SyncPairsProps = {
  /** How a cable is drawn: a sagging cable with a soft under-stroke, a nearly straight one, or a dotted lead. @default "soft" */
  cableStyle?: SyncCableStyle;
  /** Row height and type: 36, 44 or 52px rows. @default "regular" */
  density?: SyncDensity;
  /** The cables' and ports' pigment. @default "cobalt" */
  accent?: SyncAccent;
  /** The app on the left. @default Coldbrook CRM */
  leftApp?: SyncApp;
  /** The app on the right. @default Fernworks Desk */
  rightApp?: SyncApp;
  /** The left app's fields. @default defaultSyncLeftFields */
  leftFields?: SyncField[];
  /** The right app's fields. @default defaultSyncRightFields */
  rightFields?: SyncField[];
  /** Controlled pairs. */
  pairs?: SyncPair[];
  /** Initial pairs when uncontrolled. @default defaultSyncPairs */
  defaultPairs?: SyncPair[];
  /** Fires with every pair after a pairing, an unpairing or a direction change. */
  onPairsChange?: (pairs: SyncPair[]) => void;
  /** Two fields were paired (a pair it replaced is reported through `onUnpair`). */
  onPair?: (pair: SyncPair) => void;
  /** A pair was taken apart. */
  onUnpair?: (pair: SyncPair) => void;
  /** A pair's direction was cycled. */
  onDirectionChange?: (pair: SyncPair, direction: SyncDirection) => void;
  /** Whether the fields have arrived. @default "ready" */
  status?: SyncStatus;
  /** "Try again" was pressed after the fields failed to load. */
  onRetry?: () => void;
  /** The heading. @default "Field sync" */
  title?: string;
  /** Height of the surface, px; the board scrolls inside. @default 540 */
  height?: number;
  /** Nothing can be paired, unpaired or turned. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultSyncLeftApp: SyncApp = {
  name: "Coldbrook CRM",
  initials: "CB",
};
export const defaultSyncRightApp: SyncApp = {
  name: "Fernworks Desk",
  initials: "FW",
};

export const defaultSyncLeftFields: SyncField[] = [
  { id: "name", name: "Full name", type: "text" },
  { id: "email", name: "Email", type: "email" },
  { id: "phone", name: "Phone", type: "phone" },
  { id: "company", name: "Company", type: "text" },
  { id: "ltv", name: "Lifetime value", type: "money" },
  { id: "since", name: "Customer since", type: "date" },
  { id: "plan", name: "Plan", type: "picklist" },
  { id: "optin", name: "Opted in", type: "boolean" },
];

export const defaultSyncRightFields: SyncField[] = [
  { id: "requester", name: "Requester name", type: "text" },
  { id: "contact", name: "Contact email", type: "email" },
  { id: "phoneno", name: "Phone number", type: "number" },
  { id: "org", name: "Organisation", type: "text" },
  { id: "value", name: "Account value", type: "number" },
  { id: "firstseen", name: "First seen", type: "datetime" },
  { id: "tier", name: "Tier", type: "picklist" },
  { id: "consent", name: "Marketing consent", type: "boolean" },
];

/** Five pairs; the phone number flows into a number field and loses its formatting. */
export const defaultSyncPairs: SyncPair[] = [
  { left: "name", right: "requester", direction: "both" },
  { left: "email", right: "contact", direction: "right" },
  { left: "phone", right: "phoneno", direction: "right" },
  { left: "company", right: "org", direction: "both" },
  { left: "ltv", right: "value", direction: "left" },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";

/** Filled shapes are pigment: each hue at a fixed lightness, so both themes read. */
const ACCENTS: Record<SyncAccent, string> = {
  cobalt: "oklch(from var(--accent-bright) 0.68 0.15 h)",
  moss: "oklch(from var(--success) 0.68 0.14 h)",
  plum: "oklch(from var(--accent-bright) 0.64 0.14 318)",
  ember: "oklch(from var(--warn) 0.7 0.15 52)",
};
const WARN = "oklch(from var(--warn) 0.74 0.16 h)";

const ROW: Record<SyncDensity, { h: number; text: string; meta: string }> = {
  compact: { h: 36, text: "text-[12.5px]", meta: "text-[10px]" },
  regular: { h: 44, text: "text-[13px]", meta: "text-[10.5px]" },
  roomy: { h: 52, text: "text-[13.5px]", meta: "text-[11px]" },
};
const HEAD = 44;

const r2 = (v: number) => Math.round(v * 100) / 100;
const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

type Level = "ok" | "lossy" | "none";
type Conv = { level: Level; note: string };

const LOSSY: Record<string, string> = {
  "text>email": "values that aren't addresses are skipped",
  "text>phone": "values that aren't phone numbers are skipped",
  "phone>number": "spaces and + signs are dropped",
  "text>number": "values that aren't numbers are skipped",
  "money>number": "the currency is dropped",
  "text>money": "values that aren't amounts are skipped",
  "datetime>date": "the time of day is dropped",
  "text>date": "values that aren't dates are skipped",
  "text>datetime": "values that aren't dates are skipped",
  "text>picklist": "values outside the list are skipped",
  "text>boolean": "only yes and no carry over",
};
const FINE = new Set(["number>money", "date>datetime", "number>phone"]);

/** What happens to a value flowing from one type into another. */
function convert(from: SyncFieldType, to: SyncFieldType): Conv {
  if (from === to || to === "text") return { level: "ok", note: "" };
  const key = `${from}>${to}`;
  if (FINE.has(key)) return { level: "ok", note: "" };
  const note = LOSSY[key];
  if (note) return { level: "lossy", note };
  return { level: "none", note: `${from} doesn't convert to ${to}` };
}

const worst = (a: Conv, b: Conv): Conv => {
  const rank = { ok: 0, lossy: 1, none: 2 } as const;
  return rank[b.level] > rank[a.level] ? b : a;
};

/** The flow a pair makes in a direction: the worst of the ways it runs. */
function flowOf(l: SyncField, r: SyncField, dir: SyncDirection): Conv {
  const toRight = convert(l.type, r.type);
  const toLeft = convert(r.type, l.type);
  return dir === "right"
    ? toRight
    : dir === "left"
      ? toLeft
      : worst(toRight, toLeft);
}

const ORDER: SyncDirection[] = ["right", "left", "both"];
const nextDirection = (l: SyncField, r: SyncField, dir: SyncDirection) => {
  const at = ORDER.indexOf(dir);
  for (let i = 1; i <= ORDER.length; i++) {
    const d = ORDER[(at + i) % ORDER.length] ?? "right";
    if (flowOf(l, r, d).level !== "none") return d;
  }
  return dir;
};
const firstDirection = (l: SyncField, r: SyncField): SyncDirection | null =>
  ORDER.find((d) => flowOf(l, r, d).level !== "none") ?? null;

const pairKey = (p: SyncPair) => `${p.left}|${p.right}`;

type Curve = {
  x1: number;
  y1: number;
  cx1: number;
  cy1: number;
  cx2: number;
  cy2: number;
  x2: number;
  y2: number;
};

const curveOf = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  sag: number,
): Curve => {
  const w = x2 - x1;
  return {
    x1,
    y1,
    cx1: x1 + w * 0.42,
    cy1: y1 + sag,
    cx2: x2 - w * 0.42,
    cy2: y2 + sag,
    x2,
    y2,
  };
};
const pointOn = (c: Curve, t: number) => {
  const u = 1 - t;
  return {
    x:
      u * u * u * c.x1 +
      3 * u * u * t * c.cx1 +
      3 * u * t * t * c.cx2 +
      t * t * t * c.x2,
    y:
      u * u * u * c.y1 +
      3 * u * u * t * c.cy1 +
      3 * u * t * t * c.cy2 +
      t * t * t * c.y2,
  };
};
const tangentOn = (c: Curve, t: number) => {
  const u = 1 - t;
  const x =
    3 * u * u * (c.cx1 - c.x1) +
    6 * u * t * (c.cx2 - c.cx1) +
    3 * t * t * (c.x2 - c.cx2);
  const y =
    3 * u * u * (c.cy1 - c.y1) +
    6 * u * t * (c.cy2 - c.cy1) +
    3 * t * t * (c.y2 - c.cy2);
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
};
const pathOf = (c: Curve) =>
  `M ${r2(c.x1)} ${r2(c.y1)} C ${r2(c.cx1)} ${r2(c.cy1)} ${r2(c.cx2)} ${r2(c.cy2)} ${r2(c.x2)} ${r2(c.y2)}`;

/**
 * A chevron riding the curve at `pos` (0 is the left port, 1 the right),
 * facing `face` (+1 toward the right-hand end, -1 toward the left). A face
 * passing through 0 collapses the chevron, which is what makes a turn read
 * as a flip.
 */
const chevronOf = (c: Curve, pos: number, face: number) => {
  const s = 0.1 + clamp(pos, 0, 1) * 0.8;
  const p = pointOn(c, s);
  const tg = tangentOn(c, s);
  const f = clamp(face, -1, 1);
  const dx = tg.x * f;
  const dy = tg.y * f;
  const nx = -tg.y;
  const ny = tg.x;
  const wing = 3.6 * Math.max(0.35, Math.abs(f));
  const tip = { x: p.x + dx * 3.4, y: p.y + dy * 3.4 };
  const back = { x: p.x - dx * 2.4, y: p.y - dy * 2.4 };
  return `M ${r2(back.x + nx * wing)} ${r2(back.y + ny * wing)} L ${r2(tip.x)} ${r2(tip.y)} L ${r2(back.x - nx * wing)} ${r2(back.y - ny * wing)}`;
};

const sagFor = (style: SyncCableStyle, dy: number, w: number) =>
  style === "taut" ? 1.5 : clamp(8 + Math.abs(dy) * 0.08 + w * 0.05, 8, 28);

/** Where the two chevrons rest for a direction: [pos, face, visible] each. */
const HEADS: Record<
  SyncDirection,
  [number, number, number, number, number, number]
> = {
  right: [1, 1, 0, 1, 1, 1],
  left: [0, -1, 1, 0, -1, 0],
  both: [0, -1, 1, 1, 1, 1],
};

/* ----------------------------------------------------------------------- */
/*                                 A cable                                  */
/* ----------------------------------------------------------------------- */

/**
 * One plugged cable. Its sag is a motion value: a new cable drops in slack
 * and swings taut on recoil (two visible bounces, a rope catching). Its two
 * chevrons ride the curve; a direction change turns them on flick and slides
 * them to their new ends on glide, so the arrowhead travels the cable.
 */
function Cable({
  pair,
  label,
  x1,
  y1,
  x2,
  y2,
  cableStyle,
  conv,
  swingKey,
  hidden,
  motionSafe,
  disabled,
  onCycle,
  onUnpair,
}: {
  pair: SyncPair;
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cableStyle: SyncCableStyle;
  conv: Conv;
  swingKey: number;
  hidden: boolean;
  motionSafe: boolean;
  disabled: boolean;
  onCycle: (pair: SyncPair) => void;
  onUnpair: (pair: SyncPair) => void;
}) {
  const swing = useMotionValue(1);
  const start = HEADS[pair.direction];
  const aPos = useMotionValue(start[0]);
  const aFace = useMotionValue(start[1]);
  const aVis = useMotionValue(start[2]);
  const bPos = useMotionValue(start[3]);
  const bFace = useMotionValue(start[4]);
  const bVis = useMotionValue(start[5]);

  React.useEffect(() => {
    if (swingKey === 0) return;
    swing.jump(motionSafe ? 2.6 : 1);
    if (!motionSafe) return;
    const controls = animate(
      swing,
      1,
      cableStyle === "taut" ? springs.snap : springs.recoil,
    );
    return () => controls.complete();
  }, [swingKey, swing, motionSafe, cableStyle]);

  const shown = React.useRef(pair.direction);
  React.useEffect(() => {
    if (shown.current === pair.direction) return;
    const from = shown.current;
    shown.current = pair.direction;
    const [ap, af, av, bp, bf, bv] = HEADS[pair.direction];
    const values: [MotionValue<number>, number][] = [
      [aPos, ap],
      [aFace, af],
      [aVis, av],
      [bPos, bp],
      [bFace, bf],
      [bVis, bv],
    ];
    if (!motionSafe) {
      for (const [mv, v] of values) mv.jump(v);
      return;
    }
    // A chevron that is about to appear starts where the visible one is.
    if (av > 0 && aVis.get() === 0) {
      aPos.jump(bPos.get());
      aFace.jump(bFace.get());
    }
    if (bv > 0 && bVis.get() === 0) {
      bPos.jump(aPos.get());
      bFace.jump(aFace.get());
    }
    const merging = from === "both";
    const running: AnimationPlaybackControls[] = [
      animate(aFace, af, springs.flick),
      animate(bFace, bf, springs.flick),
      animate(aPos, ap, springs.glide),
      animate(bPos, bp, springs.glide),
      animate(aVis, av, {
        duration: av > 0 ? durations.fast : durations.base,
        delay: av > 0 ? 0 : merging ? 0.22 : 0,
        ease: av > 0 ? easings.enter : easings.exit,
      }),
      animate(bVis, bv, {
        duration: bv > 0 ? durations.fast : durations.base,
        delay: bv > 0 ? 0 : merging ? 0.22 : 0,
        ease: bv > 0 ? easings.enter : easings.exit,
      }),
    ];
    // Finished, never frozen: a re-run lands them where they were going.
    return () => {
      for (const c of running) c.complete();
    };
  }, [pair.direction, motionSafe, aPos, aFace, aVis, bPos, bFace, bVis]);

  const dx = x2 - x1;
  const base = sagFor(cableStyle, y2 - y1, dx);
  const d = useTransform(swing, (s) =>
    pathOf(curveOf(x1, y1, x2, y2, base * s)),
  );
  const headA = useTransform(
    [swing, aPos, aFace] as MotionValue<number>[],
    ([s, p, f]) =>
      chevronOf(
        curveOf(x1, y1, x2, y2, base * (s as number)),
        p as number,
        f as number,
      ),
  );
  const headB = useTransform(
    [swing, bPos, bFace] as MotionValue<number>[],
    ([s, p, f]) =>
      chevronOf(
        curveOf(x1, y1, x2, y2, base * (s as number)),
        p as number,
        f as number,
      ),
  );
  const knotX = useTransform(swing, (s) =>
    r2(pointOn(curveOf(x1, y1, x2, y2, base * s), 0.5).x - 10),
  );
  const knotY = useTransform(swing, (s) =>
    r2(pointOn(curveOf(x1, y1, x2, y2, base * s), 0.5).y - 10),
  );

  const lossy = conv.level !== "ok";
  const stroke = lossy ? "stroke-(--sp-warn)" : "stroke-(--sp-accent)";
  return (
    <>
      <svg
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 size-full overflow-visible transition-opacity duration-150",
          hidden ? "opacity-0" : "opacity-100",
        )}
      >
        {cableStyle === "soft" ? (
          <motion.path
            d={d}
            fill="none"
            strokeWidth={6}
            strokeLinecap="round"
            className={cn(stroke, "opacity-15")}
          />
        ) : null}
        <motion.path
          d={d}
          fill="none"
          strokeWidth={cableStyle === "taut" ? 1.75 : 2}
          strokeLinecap="round"
          strokeDasharray={cableStyle === "dashed" ? "0.5 5" : undefined}
          className={stroke}
        />
        <motion.path
          d={headA}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={stroke}
          style={{ opacity: aVis }}
        />
        <motion.path
          d={headB}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={stroke}
          style={{ opacity: bVis }}
        />
      </svg>
      <motion.button
        type="button"
        data-sp-knot={pairKey(pair)}
        aria-label={label}
        aria-disabled={disabled || undefined}
        tabIndex={hidden ? -1 : 0}
        onClick={() => onCycle(pair)}
        onKeyDown={(event) => {
          if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            onUnpair(pair);
          } else if (event.key === "d" || event.key === "D") {
            event.preventDefault();
            onCycle(pair);
          }
        }}
        className={cn(
          "absolute top-0 left-0 z-10 flex size-5 items-center justify-center rounded-full border bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_18%,transparent)] transition-[opacity,border-color] duration-150",
          lossy ? "border-(--sp-warn)" : "border-(--sp-accent)",
          hidden && "pointer-events-none opacity-0",
          FOCUS_RING,
        )}
        style={{ x: knotX, y: knotY }}
        // Hover grows the knot inside motion's own transform: a CSS scale
        // would multiply the translate as well and throw it off the cable.
        whileHover={motionSafe && !hidden ? { scale: 1.15 } : undefined}
        transition={springs.flick}
      >
        {lossy ? (
          <TriangleAlert
            aria-hidden
            className="size-2.5 text-(--sp-warn)"
            strokeWidth={2.5}
          />
        ) : (
          <span
            aria-hidden
            className="size-1.5 rounded-full bg-(--sp-accent)"
          />
        )}
      </motion.button>
    </>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The mapping                               */
/* ----------------------------------------------------------------------- */

type Side = "left" | "right";
type Said = { n: number; text: string };
type Live = {
  side: Side;
  id: string;
  /** Pointer, in board coordinates. */
  x: number;
  y: number;
  over: { side: Side; id: string; level: Level } | null;
};

/**
 * Two apps' fields facing each other across a gutter, paired by soft
 * cables. Drag from a field (or tap one field, then another) and a live
 * cable follows the pointer 1:1; plugged into a compatible field it swings
 * taut on recoil. Pressing a cable's knot cycles its direction — right,
 * left, both — and the arrowhead turns on flick and slides along the cable
 * to its new end on glide; for "both" a second chevron slides out to the
 * far end. Lossy flows (text into a number, a date-time into a date) draw
 * the cable in warn with a warning knot and say what is lost; types that do
 * not convert refuse to pair. Dragging a plugged field's cable into empty
 * space unpairs it.
 *
 * Each side is a listbox: Enter opens the partner list, D cycles the focused
 * pair's direction, Delete unpairs. Narrow containers turn cables into rows
 * with direction chips. Under reduced motion cables appear without swinging
 * and arrowheads jump to their ends.
 */
export function SyncPairs({
  cableStyle = "soft",
  density = "regular",
  accent = "cobalt",
  leftApp = defaultSyncLeftApp,
  rightApp = defaultSyncRightApp,
  leftFields = defaultSyncLeftFields,
  rightFields = defaultSyncRightFields,
  pairs,
  defaultPairs,
  onPairsChange,
  onPair,
  onUnpair,
  onDirectionChange,
  status = "ready",
  onRetry,
  title = "Field sync",
  height = 540,
  disabled = false,
  className,
}: SyncPairsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";
  const row = ROW[density] ?? ROW.regular;

  /* ------------------------------- state --------------------------------- */

  const [own, setOwn] = React.useState<SyncPair[]>(
    () => defaultPairs ?? defaultSyncPairs,
  );
  const list = pairs ?? own;
  const leftById = React.useMemo(
    () => new Map(leftFields.map((f) => [f.id, f])),
    [leftFields],
  );
  const rightById = React.useMemo(
    () => new Map(rightFields.map((f) => [f.id, f])),
    [rightFields],
  );
  const pairOf = (side: Side, id: string) =>
    list.find((p) => (side === "left" ? p.left : p.right) === id);

  const [swings, setSwings] = React.useState<Record<string, number>>({});
  const [selected, setSelected] = React.useState<{
    side: Side;
    id: string;
  } | null>(null);
  const [live, setLive] = React.useState<Live | null>(null);
  const [focus, setFocus] = React.useState<{ side: Side; id: string } | null>(
    null,
  );
  const [picker, setPicker] = React.useState<{
    side: Side;
    id: string;
    active: number;
  } | null>(null);
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /* ------------------------------ geometry ------------------------------- */

  const boardRef = React.useRef<HTMLDivElement | null>(null);
  const [gutter, setGutter] = React.useState<{ left: number; width: number }>({
    left: 0,
    width: 0,
  });
  const [gutterNode, setGutterNode] = React.useState<HTMLDivElement | null>(
    null,
  );
  React.useLayoutEffect(() => {
    if (!gutterNode) return;
    const read = () => {
      const left = Math.round(gutterNode.offsetLeft);
      const width = Math.round(gutterNode.offsetWidth);
      setGutter((g) =>
        g.left === left && g.width === width ? g : { left, width },
      );
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(gutterNode);
    return () => ro.disconnect();
  }, [gutterNode]);

  const yOf = (side: Side, id: string) => {
    const fields = side === "left" ? leftFields : rightFields;
    const i = fields.findIndex((f) => f.id === id);
    return HEAD + Math.max(0, i) * row.h + row.h / 2;
  };
  const portX = (side: Side) =>
    side === "left" ? gutter.left : gutter.left + gutter.width;
  const boardH = HEAD + Math.max(leftFields.length, rightFields.length) * row.h;

  /* ------------------------------ commits -------------------------------- */

  const write = (next: SyncPair[]) => {
    if (pairs === undefined) setOwn(next);
    onPairsChange?.(next);
  };
  const nameOf = (side: Side, id: string) =>
    (side === "left" ? leftById : rightById).get(id)?.name ?? id;
  const dirWords = (dir: SyncDirection) =>
    dir === "both"
      ? "both ways"
      : dir === "right"
        ? `one way to ${rightApp.name}`
        : `one way to ${leftApp.name}`;

  const connect = (leftId: string, rightId: string) => {
    const l = leftById.get(leftId);
    const r = rightById.get(rightId);
    if (!l || !r || disabled) return false;
    const dir = firstDirection(l, r);
    if (!dir) {
      say(
        `${l.name} and ${r.name} can't be paired: ${l.type} doesn't convert to ${r.type}.`,
      );
      return false;
    }
    const existing = list.find((p) => p.left === leftId && p.right === rightId);
    if (existing) return true;
    const replaced = list.filter(
      (p) => p.left === leftId || p.right === rightId,
    );
    const made: SyncPair = { left: leftId, right: rightId, direction: dir };
    const next = [...list.filter((p) => !replaced.includes(p)), made];
    write(next);
    for (const p of replaced) onUnpair?.(p);
    onPair?.(made);
    setSwings((s) => ({ ...s, [pairKey(made)]: (s[pairKey(made)] ?? 0) + 1 }));
    const conv = flowOf(l, r, dir);
    say(
      `Paired ${l.name} with ${r.name}, ${dirWords(dir)}${conv.level === "lossy" ? `; ${conv.note}` : ""}.`,
    );
    return true;
  };

  const unpair = (p: SyncPair) => {
    if (disabled) return;
    write(list.filter((x) => pairKey(x) !== pairKey(p)));
    onUnpair?.(p);
    say(`Unpaired ${nameOf("left", p.left)} and ${nameOf("right", p.right)}.`);
  };

  const cycle = (p: SyncPair) => {
    if (disabled) return;
    const l = leftById.get(p.left);
    const r = rightById.get(p.right);
    if (!l || !r) return;
    const dir = nextDirection(l, r, p.direction);
    if (dir === p.direction) return;
    write(
      list.map((x) =>
        pairKey(x) === pairKey(p) ? { ...x, direction: dir } : x,
      ),
    );
    onDirectionChange?.(p, dir);
    const conv = flowOf(l, r, dir);
    say(
      `${l.name} and ${r.name}: ${dirWords(dir)}${conv.level === "lossy" ? `; ${conv.note}` : ""}.`,
    );
  };

  /* ------------------------------- pointer ------------------------------- */

  const toBoard = (clientX: number, clientY: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    return rect
      ? { x: r2(clientX - rect.left), y: r2(clientY - rect.top) }
      : { x: 0, y: 0 };
  };
  const fieldAt = (clientX: number, clientY: number) => {
    const hit = document.elementFromPoint(clientX, clientY);
    const el = hit?.closest<HTMLElement>("[data-sp-field]");
    if (!el || !boardRef.current?.contains(el)) return null;
    const [side = "", id = ""] = (el.dataset.spField ?? "").split("|");
    return side === "left" || side === "right"
      ? { side: side as Side, id }
      : null;
  };
  const levelBetween = (
    a: { side: Side; id: string },
    b: { side: Side; id: string },
  ) => {
    const l = leftById.get(a.side === "left" ? a.id : b.id);
    const r = rightById.get(a.side === "left" ? b.id : a.id);
    if (!l || !r) return "none" as Level;
    const dir = firstDirection(l, r);
    return dir ? flowOf(l, r, dir).level : ("none" as Level);
  };

  // The free end flies back to its port when a drop finds nothing.
  const retract = React.useRef<AnimationPlaybackControls[]>([]);
  const tipX = useMotionValue(0);
  const tipY = useMotionValue(0);
  React.useEffect(
    () => () => {
      for (const c of retract.current) c.stop();
    },
    [],
  );

  const startDrag = (
    side: Side,
    id: string,
    clientX: number,
    clientY: number,
  ) => {
    if (disabled || !ready) return;
    for (const c of retract.current) c.stop();
    retract.current = [];
    const p = toBoard(clientX, clientY);
    tipX.jump(p.x);
    tipY.jump(p.y);
    setSelected(null);
    setPicker(null);
    setLive({ side, id, x: p.x, y: p.y, over: null });
  };
  const moveDrag = (clientX: number, clientY: number) => {
    const p = toBoard(clientX, clientY);
    tipX.set(p.x);
    tipY.set(p.y);
    const target = fieldAt(clientX, clientY);
    setLive((lv) => {
      if (!lv) return lv;
      const over =
        target && target.side !== lv.side
          ? { ...target, level: levelBetween(lv, target) }
          : null;
      const same =
        (over === null && lv.over === null) ||
        (over !== null &&
          lv.over !== null &&
          over.id === lv.over.id &&
          over.side === lv.over.side);
      return same ? lv : { ...lv, over };
    });
  };
  const endDrag = (clientX: number, clientY: number) => {
    const lv = live;
    if (!lv) return;
    const target = fieldAt(clientX, clientY);
    if (target && target.side !== lv.side) {
      const leftId = lv.side === "left" ? lv.id : target.id;
      const rightId = lv.side === "left" ? target.id : lv.id;
      if (connect(leftId, rightId)) {
        setLive(null);
        return;
      }
    } else {
      const was = pairOf(lv.side, lv.id);
      if (was && !target) unpair(was);
    }
    if (!motionSafe) {
      setLive(null);
      return;
    }
    const home = { x: portX(lv.side), y: yOf(lv.side, lv.id) };
    retract.current = [
      animate(tipX, home.x, { duration: durations.fast, ease: easings.exit }),
      animate(tipY, home.y, {
        duration: durations.fast,
        ease: easings.exit,
        onComplete: () => setLive(null),
      }),
    ];
  };

  const tapField = (side: Side, id: string) => {
    if (disabled || !ready) return;
    if (selected && selected.side !== side) {
      const leftId = side === "left" ? id : selected.id;
      const rightId = side === "left" ? selected.id : id;
      connect(leftId, rightId);
      setSelected(null);
      return;
    }
    if (selected && selected.id === id && selected.side === side) {
      setSelected(null);
      return;
    }
    setSelected({ side, id });
    say(`${nameOf(side, id)} chosen. Choose its partner on the other side.`);
  };

  /* ------------------------------ keyboard ------------------------------- */

  const rowNodes = React.useRef(new Map<string, HTMLDivElement>());
  const focusRow = (side: Side, id: string) => {
    setFocus({ side, id });
    rowNodes.current.get(`${side}|${id}`)?.focus();
  };

  const onRowKey = (event: React.KeyboardEvent, side: Side, id: string) => {
    if (!ready) return;
    const fields = side === "left" ? leftFields : rightFields;
    const i = fields.findIndex((f) => f.id === id);
    const go = (j: number) => {
      const f = fields[clamp(j, 0, fields.length - 1)];
      if (f) focusRow(side, f.id);
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        go(i + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        go(i - 1);
        return;
      case "Home":
        event.preventDefault();
        go(0);
        return;
      case "End":
        event.preventDefault();
        go(fields.length - 1);
        return;
      case "ArrowRight":
      case "ArrowLeft": {
        const to: Side = event.key === "ArrowRight" ? "right" : "left";
        if (to === side) return;
        event.preventDefault();
        const others = to === "left" ? leftFields : rightFields;
        const p = pairOf(side, id);
        const partner = p ? (to === "left" ? p.left : p.right) : null;
        const f =
          (partner && others.find((x) => x.id === partner)) ??
          others[Math.min(i, others.length - 1)];
        if (f) focusRow(to, f.id);
        return;
      }
      case "Enter":
      case " ": {
        event.preventDefault();
        if (disabled) return;
        const others = side === "left" ? rightFields : leftFields;
        const p = pairOf(side, id);
        const partner = p ? (side === "left" ? p.right : p.left) : null;
        const start = Math.max(
          0,
          others.findIndex((x) => x.id === partner),
        );
        setPicker({ side, id, active: start });
        return;
      }
      case "d":
      case "D": {
        const p = pairOf(side, id);
        if (!p) return;
        event.preventDefault();
        cycle(p);
        return;
      }
      case "Delete":
      case "Backspace": {
        const p = pairOf(side, id);
        if (!p) return;
        event.preventDefault();
        unpair(p);
        return;
      }
      default:
        return;
    }
  };

  const pickerRef = React.useCallback((node: HTMLDivElement | null) => {
    node?.focus({ preventScroll: true });
  }, []);
  const closePicker = (returnFocus: boolean) => {
    const p = picker;
    setPicker(null);
    if (returnFocus && p) {
      const node = rowNodes.current.get(`${p.side}|${p.id}`);
      if (node?.isConnected) node.focus();
    }
  };
  const pickPartner = (otherId: string) => {
    if (!picker) return;
    const leftId = picker.side === "left" ? picker.id : otherId;
    const rightId = picker.side === "left" ? otherId : picker.id;
    if (connect(leftId, rightId)) closePicker(true);
  };
  const onPickerKey = (event: React.KeyboardEvent) => {
    if (!picker) return;
    const others = picker.side === "left" ? rightFields : leftFields;
    const move = (j: number) =>
      setPicker({ ...picker, active: clamp(j, 0, others.length - 1) });
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(picker.active + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        move(picker.active - 1);
        return;
      case "Home":
        event.preventDefault();
        move(0);
        return;
      case "End":
        event.preventDefault();
        move(others.length - 1);
        return;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        closePicker(true);
        return;
      case "Tab":
        closePicker(false);
        return;
      case "Enter":
      case " ": {
        event.preventDefault();
        const f = others[picker.active];
        if (f) pickPartner(f.id);
        return;
      }
      default:
        return;
    }
  };

  /* -------------------------------- parts -------------------------------- */

  const typeBadge = (t: SyncFieldType) => (
    <span className="inline-flex h-[18px] shrink-0 items-center rounded-1 bg-surface-2 px-1.5 font-mono text-[10px] text-ink-2">
      {t}
    </span>
  );

  const fieldRow = (side: Side, f: SyncField, i: number) => {
    const p = pairOf(side, f.id);
    const isSel = selected?.side === side && selected.id === f.id;
    const isOver = live?.over?.side === side && live.over.id === f.id;
    const overLevel = isOver ? live?.over?.level : undefined;
    const fields = side === "left" ? leftFields : rightFields;
    const tabStop =
      focus?.side === side
        ? focus.id === f.id
        : (fields[0]?.id ?? "") === f.id && (side === "left" || !focus);
    const partner = p
      ? nameOf(
          side === "left" ? "right" : "left",
          side === "left" ? p.right : p.left,
        )
      : null;
    const conv = p
      ? (() => {
          const l = leftById.get(p.left);
          const r = rightById.get(p.right);
          return l && r ? flowOf(l, r, p.direction) : null;
        })()
      : null;
    return (
      <FieldRow
        key={f.id}
        side={side}
        field={f}
        index={i}
        rowH={row.h}
        text={row.text}
        meta={row.meta}
        paired={Boolean(p)}
        selected={isSel}
        over={overLevel ?? null}
        tabStop={tabStop}
        disabled={disabled || !ready}
        label={`${f.name}, ${f.type}${partner && p ? `, paired with ${partner}, ${dirWords(p.direction)}${conv?.level === "lossy" ? `, lossy: ${conv.note}` : ""}` : ", not paired"}`}
        partner={partner}
        flow={
          p
            ? p.direction === "both"
              ? "⇄"
              : (p.direction === "right") === (side === "left")
                ? "→"
                : "←"
            : null
        }
        badge={typeBadge(f.type)}
        register={(node) => {
          if (node) rowNodes.current.set(`${side}|${f.id}`, node);
        }}
        onFocus={() => setFocus({ side, id: f.id })}
        onKeyDown={(event) => onRowKey(event, side, f.id)}
        onTap={() => tapField(side, f.id)}
        onDragStart={(x, y) => startDrag(side, f.id, x, y)}
        onDragMove={moveDrag}
        onDragEnd={endDrag}
        onDragCancel={() => setLive(null)}
        hintId={hintId}
      />
    );
  };

  const appHead = (app: SyncApp, n: number) => (
    <div
      className={cn("flex items-center gap-2 border-b border-hairline", "px-4")}
      style={{ height: HEAD }}
    >
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-2 border border-hairline bg-surface-1 font-mono text-[9.5px] font-semibold text-ink-2"
      >
        {app.initials}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
        {app.name}
      </span>
      <span className="shrink-0 text-[11px] text-ink-3 tabular-nums">
        {n} fields
      </span>
    </div>
  );

  // The partner list's rows, worked out as plain data so the list itself
  // is a small component of its own.
  const pickerSource = picker
    ? (picker.side === "left" ? leftById : rightById).get(picker.id)
    : undefined;
  const pickerOthers = picker
    ? picker.side === "left"
      ? rightFields
      : leftFields
    : [];
  const pickerItems: PickItem[] =
    picker && pickerSource
      ? pickerOthers.map((f) => {
          const l = picker.side === "left" ? pickerSource : f;
          const r = picker.side === "left" ? f : pickerSource;
          const dir = firstDirection(l, r);
          const conv = dir
            ? flowOf(l, r, dir)
            : { level: "none" as Level, note: "doesn't convert" };
          const taken = pairOf(picker.side === "left" ? "right" : "left", f.id);
          return {
            id: f.id,
            name: f.name,
            type: f.type,
            level: conv.level,
            text:
              conv.level === "ok"
                ? taken
                  ? `Converts · now paired with ${nameOf(picker.side, picker.side === "left" ? taken.left : taken.right)}`
                  : "Converts cleanly"
                : conv.level === "lossy"
                  ? `Lossy · ${conv.note}`
                  : "Doesn't convert",
          };
        })
      : [];
  const pickerTop = (() => {
    if (!picker) return 0;
    const y = yOf(picker.side, picker.id) + row.h / 2 + 4;
    const tall = Math.min(pickerOthers.length * 40 + 12, 260);
    return y + tall > boardH ? Math.max(4, y - row.h - tall - 8) : y;
  })();
  const pickerView =
    picker && pickerSource ? (
      <PartnerPicker
        uid={uid}
        label={`Pair ${pickerSource.name} with`}
        items={pickerItems}
        active={picker.active}
        top={pickerTop}
        maxHeight={Math.min(pickerOthers.length * 40 + 12, 260)}
        anchor={picker.side === "left" ? "right" : "left"}
        focusRef={pickerRef}
        onKeyDown={onPickerKey}
        onLeave={() => setPicker(null)}
        onPick={pickPartner}
        badge={typeBadge}
      />
    ) : null;

  const liveCable = live
    ? (() => {
        const x1 = portX(live.side);
        const y1 = yOf(live.side, live.id);
        return (
          <LiveCable
            x1={x1}
            y1={y1}
            tipX={tipX}
            tipY={tipY}
            side={live.side}
            level={live.over?.level ?? null}
            cableStyle={cableStyle}
          />
        );
      })()
    : null;

  const counts = (() => {
    let both = 0;
    let lossy = 0;
    const notes: string[] = [];
    for (const p of list) {
      const l = leftById.get(p.left);
      const r = rightById.get(p.right);
      if (!l || !r) continue;
      if (p.direction === "both") both += 1;
      const c = flowOf(l, r, p.direction);
      if (c.level === "lossy") {
        lossy += 1;
        const arrow =
          p.direction === "left" ? "←" : p.direction === "both" ? "⇄" : "→";
        notes.push(`${l.name} ${arrow} ${r.name}: ${c.note}`);
      }
    }
    return { both, lossy, notes };
  })();

  const board = (
    <div className="hidden @min-[36rem]:block">
      <div
        ref={boardRef}
        className="relative grid select-none"
        style={{
          gridTemplateColumns:
            "minmax(0,1fr) clamp(7.5rem,24%,13rem) minmax(0,1fr)",
          height: boardH,
          ["--sp-accent" as string]: ACCENTS[accent],
          ["--sp-warn" as string]: WARN,
        }}
      >
        <div
          role="listbox"
          aria-label={`${leftApp.name} fields`}
          aria-describedby={hintId}
          className="min-w-0 border-r border-hairline"
        >
          {appHead(leftApp, leftFields.length)}
          {leftFields.map((f, i) => fieldRow("left", f, i))}
        </div>
        <div ref={setGutterNode} aria-hidden className="relative">
          <span
            className="absolute inset-x-0 top-0 flex items-center justify-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            style={{ height: HEAD }}
          >
            {list.length} {list.length === 1 ? "pair" : "pairs"}
          </span>
        </div>
        <div
          role="listbox"
          aria-label={`${rightApp.name} fields`}
          aria-describedby={hintId}
          className="min-w-0 border-l border-hairline"
        >
          {appHead(rightApp, rightFields.length)}
          {rightFields.map((f, i) => fieldRow("right", f, i))}
        </div>

        {gutter.width > 0 ? (
          <>
            {list.map((p) => {
              const l = leftById.get(p.left);
              const r = rightById.get(p.right);
              if (!l || !r) return null;
              const conv = flowOf(l, r, p.direction);
              const dragged =
                live !== null &&
                ((live.side === "left" && live.id === p.left) ||
                  (live.side === "right" && live.id === p.right));
              return (
                <Cable
                  key={pairKey(p)}
                  pair={p}
                  label={`${l.name} to ${r.name}, ${dirWords(p.direction)}${conv.level === "lossy" ? `, lossy: ${conv.note}` : ""}. Press to change direction; Delete unpairs.`}
                  x1={portX("left")}
                  y1={yOf("left", p.left)}
                  x2={portX("right")}
                  y2={yOf("right", p.right)}
                  cableStyle={cableStyle}
                  conv={conv}
                  swingKey={swings[pairKey(p)] ?? 0}
                  hidden={dragged}
                  motionSafe={motionSafe}
                  disabled={disabled || !ready}
                  onCycle={cycle}
                  onUnpair={unpair}
                />
              );
            })}
            {liveCable}
          </>
        ) : null}
        {pickerView}
      </div>
    </div>
  );

  const [addLeft, setAddLeft] = React.useState("");
  const [addRight, setAddRight] = React.useState("");

  const rowsView = (
    <div
      className="flex flex-col gap-3 @min-[36rem]:hidden"
      style={{
        ["--sp-accent" as string]: ACCENTS[accent],
        ["--sp-warn" as string]: WARN,
      }}
    >
      <ul aria-label="Pairs" className="flex flex-col">
        {list.map((p) => {
          const l = leftById.get(p.left);
          const r = rightById.get(p.right);
          if (!l || !r) return null;
          const conv = flowOf(l, r, p.direction);
          const Icon =
            p.direction === "both"
              ? ArrowLeftRight
              : p.direction === "right"
                ? ArrowRight
                : ArrowLeft;
          return (
            <li
              key={pairKey(p)}
              className="flex flex-col gap-1 border-b border-hairline py-2.5 last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[12.5px]">{l.name}</p>
                  <p className="truncate font-mono text-[10px] text-ink-3">
                    {l.type}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => cycle(p)}
                  aria-label={`${l.name} to ${r.name}, ${dirWords(p.direction)}. Change direction.`}
                  aria-disabled={disabled || undefined}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] transition-colors hover:bg-surface-2",
                    conv.level === "lossy"
                      ? "border-(--sp-warn) text-warn"
                      : "border-(--sp-accent) text-foreground",
                    FOCUS_RING,
                  )}
                >
                  <motion.span
                    key={p.direction}
                    className="inline-flex"
                    initial={motionSafe ? { opacity: 0, rotate: -90 } : false}
                    animate={{ opacity: 1, rotate: 0 }}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  >
                    <Icon aria-hidden className="size-3.5" />
                  </motion.span>
                  {p.direction === "both"
                    ? "Both"
                    : p.direction === "right"
                      ? rightApp.initials
                      : leftApp.initials}
                </button>
                <div className="min-w-0 flex-1 text-right leading-tight">
                  <p className="truncate text-[12.5px]">{r.name}</p>
                  <p className="truncate font-mono text-[10px] text-ink-3">
                    {r.type}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => unpair(p)}
                  aria-label={`Unpair ${l.name} and ${r.name}`}
                  aria-disabled={disabled || undefined}
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </div>
              {conv.level === "lossy" ? (
                <p className="flex items-start gap-1.5 text-[11px] leading-snug text-warn">
                  <TriangleAlert
                    aria-hidden
                    className="mt-px size-3 shrink-0"
                  />
                  {conv.note}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-2.5">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Add a pair
        </p>
        <div className="grid grid-cols-2 gap-2">
          <select
            aria-label={`${leftApp.name} field`}
            value={addLeft}
            onChange={(event) => {
              const v = event.currentTarget.value;
              setAddLeft(v);
            }}
            className={cn(
              "h-8 min-w-0 rounded-2 border border-input bg-card px-2 text-[12px]",
              FOCUS_RING,
            )}
          >
            <option value="">{leftApp.initials} field…</option>
            {leftFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <select
            aria-label={`${rightApp.name} field`}
            value={addRight}
            onChange={(event) => {
              const v = event.currentTarget.value;
              setAddRight(v);
            }}
            className={cn(
              "h-8 min-w-0 rounded-2 border border-input bg-card px-2 text-[12px]",
              FOCUS_RING,
            )}
          >
            <option value="">{rightApp.initials} field…</option>
            {rightFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!addLeft || !addRight) {
              say("Choose a field on each side first.");
              return;
            }
            if (connect(addLeft, addRight)) {
              setAddLeft("");
              setAddRight("");
            }
          }}
          aria-disabled={disabled || !addLeft || !addRight || undefined}
          className={cn(
            "inline-flex h-8 items-center justify-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 aria-disabled:opacity-50",
            FOCUS_RING,
          )}
        >
          <Plus aria-hidden className="size-3.5" />
          Pair
        </button>
      </div>
      {(() => {
        const lfree = leftFields.filter((f) => !pairOf("left", f.id));
        const rfree = rightFields.filter((f) => !pairOf("right", f.id));
        if (lfree.length + rfree.length === 0) return null;
        return (
          <p className="text-[11.5px] leading-snug text-ink-3">
            Not synced: {lfree.map((f) => f.name).join(", ") || "—"} ·{" "}
            {rfree.map((f) => f.name).join(", ") || "—"}
          </p>
        );
      })()}
    </div>
  );

  const loading = (
    <div aria-busy="true" className="grid grid-cols-2 gap-x-16 gap-y-2.5 p-4">
      <p className="sr-only">Loading the fields.</p>
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className="h-7 rounded-2 bg-surface-2 motion-safe:animate-pulse"
          style={{ opacity: i % 3 === 2 ? 0.5 : 1 }}
        />
      ))}
    </div>
  );

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative grid w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
        <div className="min-w-0 flex-1 basis-48">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate text-[12px] text-ink-3">
            {leftApp.name} ⇄ {rightApp.name}
          </p>
        </div>
        <p className="hidden shrink-0 text-[11px] text-ink-3 @min-[36rem]:block">
          Drag a field to its partner · press a knot to turn it
        </p>
      </header>

      <p id={hintId} className="sr-only">
        Up and Down move through a side, Left and Right cross to the other side.
        Enter opens the list of partners; D changes a pair&apos;s direction;
        Delete unpairs.
      </p>

      {status === "error" ? (
        <div className="flex flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The fields did not load.</p>
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
      ) : status === "loading" ? (
        <div className="overflow-y-auto">{loading}</div>
      ) : (
        <div className="[scrollbar-width:thin] overflow-y-auto overscroll-contain px-4 py-3 @min-[36rem]:px-0 @min-[36rem]:py-0">
          {board}
          {rowsView}
        </div>
      )}

      <footer className="flex flex-col gap-1 border-t border-hairline bg-surface-1 px-4 py-2.5">
        <p className="text-[12px] text-ink-2 tabular-nums">
          {plural(list.length, "pair", "pairs")} ·{" "}
          {plural(counts.both, "both ways", "both ways")} ·{" "}
          <span className={counts.lossy > 0 ? "text-warn" : undefined}>
            {counts.lossy} lossy
          </span>
        </p>
        {counts.notes.slice(0, 2).map((n) => (
          <p
            key={n}
            className="flex items-start gap-1.5 truncate text-[11px] text-warn"
          >
            <TriangleAlert aria-hidden className="mt-px size-3 shrink-0" />
            <span className="truncate">{n}</span>
          </p>
        ))}
      </footer>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

type PickItem = {
  id: string;
  name: string;
  type: SyncFieldType;
  level: Level;
  text: string;
};

/** The partner list: a popover listbox of the other side's fields. */
function PartnerPicker({
  uid,
  label,
  items,
  active,
  top,
  maxHeight,
  anchor,
  focusRef,
  onKeyDown,
  onLeave,
  onPick,
  badge,
}: {
  uid: string;
  label: string;
  items: PickItem[];
  active: number;
  top: number;
  maxHeight: number;
  anchor: "left" | "right";
  focusRef: (node: HTMLDivElement | null) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onLeave: () => void;
  onPick: (id: string) => void;
  badge: (t: SyncFieldType) => React.ReactNode;
}) {
  return (
    <div
      ref={focusRef}
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-activedescendant={`${uid}-pick-${active}`}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          onLeave();
      }}
      className={cn(
        "absolute z-30 flex w-64 max-w-[calc(100%-1rem)] flex-col overflow-y-auto overscroll-contain rounded-3 border border-hairline-strong bg-popover p-1 text-popover-foreground shadow-[0_12px_32px_-12px_color-mix(in_oklab,black_45%,transparent)]",
        FOCUS_RING,
      )}
      style={{
        top,
        maxHeight,
        ...(anchor === "right" ? { right: 8 } : { left: 8 }),
      }}
    >
      {items.map((f, i) => (
        <div
          key={f.id}
          id={`${uid}-pick-${i}`}
          role="option"
          aria-selected={i === active}
          aria-disabled={f.level === "none" || undefined}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            if (f.level !== "none") onPick(f.id);
          }}
          className={cn(
            "flex min-w-0 cursor-pointer flex-col gap-0.5 rounded-2 px-2.5 py-1.5",
            i === active && "bg-surface-2",
            f.level === "none" && "cursor-not-allowed opacity-50",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[12.5px]">
              {f.name}
            </span>
            {badge(f.type)}
          </span>
          <span
            className={cn(
              "truncate text-[11px]",
              f.level === "lossy" ? "text-warn" : "text-ink-3",
            )}
          >
            {f.text}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The cable being dragged: 1:1 under the pointer, sagging, its free end a plug. */
function LiveCable({
  x1,
  y1,
  tipX,
  tipY,
  side,
  level,
  cableStyle,
}: {
  x1: number;
  y1: number;
  tipX: MotionValue<number>;
  tipY: MotionValue<number>;
  side: Side;
  level: Level | null;
  cableStyle: SyncCableStyle;
}) {
  const d = useTransform([tipX, tipY] as MotionValue<number>[], ([x, y]) => {
    const tx = x as number;
    const ty = y as number;
    const span = Math.hypot(tx - x1, ty - y1);
    const sag = cableStyle === "taut" ? 2 : clamp(10 + span * 0.12, 10, 40);
    return side === "left"
      ? pathOf(curveOf(x1, y1, tx, ty, sag))
      : pathOf(curveOf(tx, ty, x1, y1, sag));
  });
  const stroke =
    level === "none"
      ? "stroke-danger"
      : level === "lossy"
        ? "stroke-(--sp-warn)"
        : "stroke-(--sp-accent)";
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 size-full overflow-visible"
    >
      <motion.path
        d={d}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={cableStyle === "dashed" ? "0.5 5" : undefined}
        className={stroke}
      />
      <motion.circle
        r={4.5}
        className={cn("fill-card stroke-2", stroke)}
        style={{ cx: tipX, cy: tipY }}
      />
    </svg>
  );
}

/** One field: an option in its side's listbox, and a drag handle for a cable. */
function FieldRow({
  side,
  field,
  index,
  rowH,
  text,
  meta,
  paired,
  selected,
  over,
  tabStop,
  disabled,
  label,
  partner,
  flow,
  badge,
  register,
  onFocus,
  onKeyDown,
  onTap,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
  hintId,
}: {
  side: Side;
  field: SyncField;
  index: number;
  rowH: number;
  text: string;
  meta: string;
  paired: boolean;
  selected: boolean;
  over: Level | null;
  tabStop: boolean;
  disabled: boolean;
  label: string;
  partner: string | null;
  /** Which way values flow, from this row's side: → out, ← in, ⇄ both. */
  flow: string | null;
  badge: React.ReactNode;
  register: (node: HTMLDivElement | null) => void;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onTap: () => void;
  onDragStart: (x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
  onDragCancel: () => void;
  hintId: string;
}) {
  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: ({ point }) => onDragStart(point.x, point.y),
    onMove: ({ point }) => onDragMove(point.x, point.y),
    onEnd: ({ point }) => onDragEnd(point.x, point.y),
    onCancel: onDragCancel,
    onTap: () => onTap(),
  });
  return (
    <div
      ref={register}
      role="option"
      data-sp-field={`${side}|${field.id}`}
      aria-selected={selected}
      aria-label={label}
      aria-describedby={hintId}
      aria-disabled={disabled || undefined}
      tabIndex={tabStop ? 0 : -1}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        // Pointer presses arrive through the drag's tap; a click with no
        // pointer behind it (assistive technology) is a press too.
        if (event.detail === 0) onTap();
      }}
      {...drag}
      className={cn(
        "relative flex touch-pan-y items-center gap-2 border-b border-hairline transition-colors",
        side === "left" ? "pr-4 pl-4" : "pr-4 pl-4",
        disabled ? "cursor-default" : "cursor-grab",
        selected && "bg-[color-mix(in_oklab,var(--sp-accent)_12%,transparent)]",
        over === "none" &&
          "bg-[color-mix(in_oklab,var(--danger)_10%,transparent)]",
        over === "lossy" &&
          "bg-[color-mix(in_oklab,var(--sp-warn)_14%,transparent)]",
        over === "ok" &&
          "bg-[color-mix(in_oklab,var(--sp-accent)_14%,transparent)]",
        !selected && !over && "hover:bg-surface-1",
        FOCUS_IN,
      )}
      style={{ height: rowH }}
      data-index={index}
    >
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col leading-tight",
          side === "right" && "items-start",
        )}
      >
        <span className={cn("max-w-full truncate", text)}>{field.name}</span>
        {partner && rowH >= 44 ? (
          <span className={cn("max-w-full truncate text-ink-3", meta)}>
            {flow ? `${flow} ` : ""}
            {partner}
          </span>
        ) : null}
      </div>
      {badge}
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full border-2 transition-colors",
          side === "left" ? "-right-[5px]" : "-left-[5px]",
          paired || selected
            ? "border-(--sp-accent) bg-(--sp-accent)"
            : "border-hairline-strong bg-card",
        )}
      />
    </div>
  );
}
