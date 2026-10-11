"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound, type LoopHandle } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type MangleKind =
  "card" | "chart" | "poster" | "ticket" | "report" | "badge";

export type MangleItem = {
  /** Stable id. */
  id: string;
  /** What the finished result is called; announced when it lands. */
  title: string;
  /** Which drawn result it becomes. @default "card" */
  kind?: MangleKind;
  /** Your own plain page, filling the sheet before the press. */
  input?: React.ReactNode;
  /** Your own finished result, filling the sheet after the press. */
  output?: React.ReactNode;
};

export type ManglePalette = "studio" | "garden" | "harbour" | "ember";

export type ManglePressProps = {
  /** The documents in the queue; they go round and round. @default defaultMangleItems */
  items?: MangleItem[];
  /** The motor's pace, 0.25× to 2×. @default 1 */
  speed?: number;
  /** Rollers on the press, in pairs: 2, 4 or 6. Each pair is a stage — colour, then detail, then varnish. @default 2 */
  rollers?: number;
  /** The inks the results come out in. @default "studio" */
  palette?: ManglePalette;
  /** How heavy the rollers are, 0 to 1: a heavy press carries a wind for longer. @default 0.6 */
  heft?: number;
  /** How hard the rollers press, 0 to 1: how far they ride up over a sheet and how plain the crease is. @default 0.6 */
  squeeze?: number;
  /** Space between sheets in the queue, 0 to 1. @default 0.35 */
  spacing?: number;
  /** Show the crank. @default true */
  crank?: boolean;
  /** The motor is off: the press turns only when wound or stepped. @default false */
  paused?: boolean;
  /** Play the press's creak while you wind it. Off unless asked for. @default false */
  sound?: boolean;
  /** The press's accessible name. @default "Press" */
  label?: string;
  /** Fires when a finished result lands on the pile, with the item and its place in the queue. */
  onResult?: (item: MangleItem, index: number) => void;
  /** No winding and no steps. @default false */
  disabled?: boolean;
  /** Sizes the box. @default "h-56 w-full" */
  className?: string;
};

export const defaultMangleItems: MangleItem[] = [
  { id: "catalogue", title: "Spring catalogue", kind: "card" },
  { id: "orders", title: "Orders by region", kind: "chart" },
  { id: "open-house", title: "Open house", kind: "poster" },
  { id: "gala", title: "Harbour gala", kind: "ticket" },
  { id: "review", title: "Quarterly review", kind: "report" },
  { id: "member", title: "Member badge", kind: "badge" },
];

const KIND_WORD: Record<MangleKind, string> = {
  card: "a card",
  chart: "a chart",
  poster: "a poster",
  ticket: "a ticket",
  report: "a report",
  badge: "a badge",
};

/* -------------------------------- palettes -------------------------------- */

type Inks = { a: string; b: string; c: string; ink: string; paper: string };

/** Inks as pigments at fixed lightness, so a result prints the same in either theme. */
const PALETTES: Record<ManglePalette, Inks> = {
  studio: {
    a: "oklch(from var(--accent-bright) 0.58 0.16 h)",
    b: "oklch(0.72 0.13 35)",
    c: "oklch(0.88 0.06 85)",
    ink: "oklch(0.26 0.03 260)",
    paper: "oklch(0.985 0.006 90)",
  },
  garden: {
    a: "oklch(0.58 0.1 150)",
    b: "oklch(0.78 0.12 120)",
    c: "oklch(0.9 0.05 95)",
    ink: "oklch(0.28 0.04 150)",
    paper: "oklch(0.985 0.01 110)",
  },
  harbour: {
    a: "oklch(0.42 0.09 250)",
    b: "oklch(0.66 0.09 200)",
    c: "oklch(0.62 0.17 28)",
    ink: "oklch(0.24 0.04 250)",
    paper: "oklch(0.98 0.008 230)",
  },
  ember: {
    a: "oklch(0.55 0.15 40)",
    b: "oklch(0.78 0.13 75)",
    c: "oklch(0.48 0.09 340)",
    ink: "oklch(0.27 0.04 30)",
    paper: "oklch(0.975 0.015 80)",
  },
};

/** The plain page: the same layout in greys. */
const GREY = {
  paper: "color-mix(in oklab, var(--card) 92%, var(--foreground))",
  block: "color-mix(in oklab, var(--foreground) 16%, var(--card))",
  line: "color-mix(in oklab, var(--foreground) 24%, var(--card))",
} as const;

/* -------------------------------- constants ------------------------------- */

const NOMINAL = { w: 760, h: 216 };

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** A small seeded hash, 0–1. */
const hash = (n: number) => {
  let h = Math.imul(n | 0, 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};

/* --------------------------------- geometry -------------------------------- */

type Geo = {
  w: number;
  h: number;
  sw: number;
  sh: number;
  top: number;
  pitch: number;
  nips: number[];
  roller: number;
  pile: number;
  crank: { x: number; y: number; r: number };
  table: { top: number; h: number };
};

function geometry(w: number, h: number, pairs: number, spacing: number): Geo {
  const sh = Math.round(clamp(h * 0.54, 60, 260));
  const sw = Math.round(sh * 0.76);
  const top = Math.round(h / 2 - sh / 2 + h * 0.05);
  const roller = Math.round(clamp(h * 0.15, 20, 38));
  const gapN = roller * 1.3;
  const centre = w * (w < 420 ? 0.44 : 0.46);
  const first = centre - ((pairs - 1) * gapN) / 2;
  const nips = Array.from({ length: pairs }, (_, j) => r2(first + j * gapN));
  const last = nips[nips.length - 1] ?? first;
  const r = Math.round(clamp(h * 0.085, 11, 20));
  return {
    w,
    h,
    sw,
    sh,
    top,
    pitch: r2(sw * (1.15 + 0.6 * clamp(spacing, 0, 1))),
    nips,
    roller,
    pile: r2(Math.max(last + roller / 2 + sw + 14, w - 18)),
    crank: {
      x: r2(last + roller / 2 + r + 10),
      y: r2(Math.max(r + 4, top - 12 - r * 0.25)),
      r,
    },
    table: { top: r2(top - 12), h: r2(sh + 24) },
  };
}

/* ----------------------------------- art ---------------------------------- */

type Look = 0 | 1 | 2 | 3;

/** One of the drawn results, at a stage: plain grey, colour fields, finished, varnished. */
function Art({
  kind,
  title,
  look,
  inks,
  gloss,
}: {
  kind: MangleKind;
  title: string;
  look: Look;
  inks: Inks;
  gloss: string;
}) {
  const grey = look === 0;
  const detail = look >= 2;
  const paper = grey ? GREY.paper : inks.paper;
  const fa = grey ? GREY.block : inks.a;
  const fb = grey ? GREY.block : inks.b;
  const fc = grey ? GREY.line : inks.c;
  const ink = grey ? GREY.line : inks.ink;
  const text = (
    x: number,
    y: number,
    size: number,
    words: string,
    fill: string,
    weight = 600,
    anchor: "start" | "middle" = "start",
  ) =>
    detail ? (
      <text
        x={x}
        y={y}
        fontSize={size}
        fontWeight={weight}
        fill={fill}
        textAnchor={anchor}
        style={{ fontFamily: "inherit" }}
      >
        {words}
      </text>
    ) : (
      <rect
        x={r2(anchor === "middle" ? x - size * words.length * 0.27 : x)}
        y={r2(y - size * 0.75)}
        width={r2(size * words.length * 0.54)}
        height={r2(size * 0.8)}
        rx={r2(size * 0.2)}
        fill={grey ? GREY.line : fc}
        opacity={grey ? 1 : 0.6}
      />
    );
  const lines = (x: number, y: number, n: number, wdt: number) =>
    Array.from({ length: n }, (_, i) => (
      <rect
        key={i}
        x={x}
        y={r2(y + i * 6)}
        width={r2(i === n - 1 ? wdt * 0.6 : wdt)}
        height="2.4"
        rx="1.2"
        fill={grey ? GREY.line : ink}
        opacity={grey ? 1 : detail ? 0.28 : 0.12}
      />
    ));
  return (
    <svg viewBox="0 0 76 100" className="block size-full" aria-hidden>
      <rect width="76" height="100" fill={paper} />
      {kind === "card" ? (
        <>
          <rect x="7" y="7" width="62" height="44" rx="3" fill={fb} />
          {detail ? (
            <>
              <ellipse
                cx="38"
                cy="41"
                rx="16"
                ry="3"
                fill={inks.ink}
                opacity="0.15"
              />
              <path
                d="M28 22h20v17a4 4 0 0 1-4 4H32a4 4 0 0 1-4-4Z"
                fill={inks.a}
              />
              <path
                d="M48 26h3a4 4 0 0 1 0 8h-3"
                fill="none"
                stroke={inks.a}
                strokeWidth="2.2"
              />
              <rect
                x="28"
                y="20"
                width="20"
                height="3"
                rx="1.5"
                fill={inks.ink}
                opacity="0.3"
              />
            </>
          ) : null}
          {text(7, 62, 7, title, ink)}
          {lines(7, 69, 2, 54)}
          <rect x="7" y="83" width="26" height="10" rx="5" fill={fa} />
          {detail
            ? text(20, 90.2, 5.2, "Order", inks.paper, 600, "middle")
            : null}
          {text(69, 90, 7, "32", ink, 700, "middle")}
        </>
      ) : kind === "chart" ? (
        <>
          {text(7, 14, 6.4, title, ink)}
          {lines(7, 19, 1, 40)}
          <path
            d="M9 86H69"
            stroke={grey ? GREY.line : ink}
            strokeWidth="1"
            opacity="0.4"
          />
          {[28, 44, 36, 58, 50, 66].map((v, i) => (
            <rect
              key={i}
              x={r2(11 + i * 9.6)}
              y={86 - v}
              width="6.6"
              height={v}
              rx="1"
              fill={i === 3 ? fa : fb}
              opacity={i === 3 || grey ? 1 : 0.75}
            />
          ))}
          {detail ? (
            <path
              d="M14 66 L24 52 L33 59 L43 37 L52 44 L62 27"
              fill="none"
              stroke={inks.c}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          ) : null}
        </>
      ) : kind === "poster" ? (
        <>
          <rect width="76" height="100" fill={fa} />
          <circle cx="54" cy="30" r="17" fill={fc} />
          <path d="M0 74 Q20 58 40 70 T76 64 V100 H0 Z" fill={fb} />
          {text(8, 50, 11, "Open", grey ? GREY.paper : inks.paper, 800)}
          {text(8, 62, 11, "house", grey ? GREY.paper : inks.paper, 800)}
          {detail
            ? text(8, 90, 4.6, "Sat 12 · 10–4 · Fieldline yard", inks.ink, 500)
            : null}
        </>
      ) : kind === "ticket" ? (
        <>
          <rect x="5" y="10" width="66" height="80" rx="4" fill={fa} />
          <path
            d="M5 64h66"
            stroke={paper}
            strokeWidth="1.4"
            strokeDasharray="2.4 2.4"
          />
          <circle cx="5" cy="64" r="4" fill={paper} />
          <circle cx="71" cy="64" r="4" fill={paper} />
          {text(11, 26, 5, "Admit one", grey ? GREY.paper : inks.c, 600)}
          {text(11, 40, 8.6, "Harbour", grey ? GREY.paper : inks.paper, 800)}
          {text(11, 50, 8.6, "gala", grey ? GREY.paper : inks.paper, 800)}
          <rect
            x="11"
            y="72"
            width="40"
            height="10"
            rx="1"
            fill={fc}
            opacity={grey ? 1 : 0.9}
          />
          {detail
            ? Array.from({ length: 14 }, (_, i) => (
                <rect
                  key={i}
                  x={r2(12 + i * 2.8)}
                  y="73.5"
                  width={i % 3 ? 1 : 1.8}
                  height="7"
                  fill={inks.ink}
                />
              ))
            : null}
        </>
      ) : kind === "report" ? (
        <>
          <rect width="76" height="38" fill={fa} />
          <rect y="38" width="76" height="5" fill={fc} />
          {text(8, 22, 7.4, "Quarterly", grey ? GREY.paper : inks.paper, 700)}
          {text(8, 31, 7.4, "review", grey ? GREY.paper : inks.paper, 700)}
          {lines(8, 54, 4, 58)}
          <rect x="8" y="80" width="27" height="12" rx="2" fill={fb} />
          <rect
            x="41"
            y="80"
            width="27"
            height="12"
            rx="2"
            fill={fb}
            opacity="0.6"
          />
          {detail ? text(21.5, 88.5, 5, "+18%", inks.ink, 700, "middle") : null}
        </>
      ) : (
        <>
          <circle cx="38" cy="42" r="26" fill={fa} />
          <circle
            cx="38"
            cy="42"
            r="20"
            fill="none"
            stroke={fc}
            strokeWidth="1.6"
          />
          {detail ? (
            <path
              d="M38 28 l4.1 8.4 9.2 1.3 -6.6 6.5 1.6 9.1 -8.3-4.4 -8.3 4.4 1.6-9.1 -6.6-6.5 9.2-1.3Z"
              fill={inks.c}
            />
          ) : (
            <circle cx="38" cy="42" r="9" fill={fb} />
          )}
          {text(38, 82, 7, "Member", ink, 700, "middle")}
          {text(38, 91, 5, "Since 2026", ink, 500, "middle")}
        </>
      )}
      {look === 3 ? (
        <rect width="76" height="100" fill={`url(#${gloss})`} opacity="0.55" />
      ) : null}
    </svg>
  );
}

/* ---------------------------------- sheet --------------------------------- */

type SheetProps = {
  k: number;
  z: number;
  gloss: string;
  item: MangleItem;
  feed: MotionValue<number>;
  geo: Geo;
  looks: Look[];
  inks: Inks;
  squeeze: number;
  landedAt: (k: number) => MotionValue<number>;
};

/**
 * One document on its way through: its place is read from the press's single
 * feed value, and each stage of it is clipped exactly at the nip that made it.
 */
function Sheet({
  k,
  z,
  gloss,
  item,
  feed,
  geo,
  looks,
  inks,
  squeeze,
  landedAt,
  landAt,
}: SheetProps & { landAt: number }) {
  const { sw, sh, top, pitch, nips, pile } = geo;
  const first = nips[0] ?? 0;
  const lead = useTransform(feed, (s) =>
    Math.min(pile, first + (s - k) * pitch),
  );
  const x = useTransform(lead, (v) => r2(v - sw));
  const fan = (hash(k * 7 + 3) - 0.5) * 7;
  const drop = landedAt(k);
  // On the pile, each sheet lies a little askew, and the newest lands with a
  // bounce; three deep, the ones underneath fade away.
  const rotate = useTransform(lead, (v) => (v >= pile - 0.5 ? r2(fan) : 0));
  const scale = useTransform([drop, lead] as MotionValue<number>[], ([d, v]) =>
    (v as number) >= pile - 0.5 ? r2(1 + (d as number) * 0.035) : 1,
  );
  const opacity = useTransform(feed, (s) =>
    r2(clamp(4 - (s - landAt - k), 0, 1)),
  );
  const kind = item.kind ?? "card";
  return (
    <motion.div
      aria-hidden
      className="absolute top-0 left-0 overflow-hidden rounded-1 shadow-sm"
      style={{
        width: sw,
        height: sh,
        y: top,
        x,
        rotate,
        scale,
        opacity,
        zIndex: z,
        boxShadow:
          "0 1px 2px oklch(0.2 0.02 260 / 0.18), 0 4px 10px oklch(0.2 0.02 260 / 0.1)",
      }}
    >
      {looks.map((look, j) => (
        <Layer
          key={look}
          look={look}
          index={j}
          count={looks.length}
          lead={lead}
          geo={geo}
          kind={kind}
          item={item}
          inks={inks}
          squeeze={squeeze}
          gloss={gloss}
        />
      ))}
    </motion.div>
  );
}

function Layer({
  look,
  index,
  count,
  lead,
  geo,
  kind,
  item,
  inks,
  squeeze,
  gloss,
}: {
  look: Look;
  gloss: string;
  index: number;
  count: number;
  lead: MotionValue<number>;
  geo: Geo;
  kind: MangleKind;
  item: MangleItem;
  inks: Inks;
  squeeze: number;
}) {
  const { sw, nips } = geo;
  // Layer j shows between nip j-1 and nip j, in the sheet's own coordinates.
  const clip = useTransform(lead, (v) => {
    const left = v - sw;
    const from = index === 0 ? -Infinity : (nips[index - 1] ?? 0);
    const to = index === count - 1 ? Infinity : (nips[index] ?? 0);
    const l = clamp(from - left, 0, sw);
    const r = clamp(v - to, 0, sw);
    return `inset(0 ${r2(r)}px 0 ${r2(l)}px)`;
  });
  const custom = look === 0 ? item.input : item.output;
  return (
    <motion.div className="absolute inset-0" style={{ clipPath: clip }}>
      {custom ? (
        <div
          className="size-full"
          style={
            look === 1 ? { filter: "saturate(0.55) contrast(0.8)" } : undefined
          }
        >
          {custom}
        </div>
      ) : (
        <Art
          kind={kind}
          title={item.title}
          look={look}
          inks={inks}
          gloss={gloss}
        />
      )}
      {look >= 2 && squeeze > 0 ? (
        // The crease the rollers leave, faint, across the finished page.
        <span
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(104deg, transparent 47%, oklch(1 0 0 / ${r2(0.32 * squeeze)}) 49.5%, oklch(0.2 0.02 260 / ${r2(0.1 * squeeze)}) 50.5%, transparent 53%)`,
          }}
        />
      ) : null}
    </motion.div>
  );
}

/* --------------------------------- roller --------------------------------- */

function Roller({
  x,
  geo,
  angle,
  lift,
}: {
  x: number;
  geo: Geo;
  angle: MotionValue<number>;
  lift: MotionValue<number>;
}) {
  const r = geo.roller / 2;
  const top = geo.top - 10;
  const height = geo.sh + 20;
  // Knurl lines on the visible half of the drum: x = R·sin(θ), seen from above.
  const knurl = useTransform(angle, (a) => {
    const n = 16;
    let d = "";
    for (let i = 0; i < n; i += 1) {
      const phi = -a + (i * Math.PI * 2) / n;
      if (Math.cos(phi) <= 0.05) continue;
      const lx = r2(r + r * Math.sin(phi) * 0.92);
      d += `M${lx} 0V${height}`;
    }
    return d || "M0 0";
  });
  const y = useTransform(lift, (l) => r2(-l * 1.6));
  const shadow = useTransform(
    lift,
    (l) =>
      `0 ${r2(3 + l * 3)}px ${r2(6 + l * 5)}px oklch(0.15 0.02 260 / ${r2(0.35 + l * 0.1)})`,
  );
  return (
    <motion.div
      aria-hidden
      className="absolute"
      style={{
        left: r2(x - r),
        top,
        width: geo.roller,
        height,
        y,
        zIndex: 2000,
        borderRadius: 4,
        boxShadow: shadow,
        backgroundImage:
          "linear-gradient(90deg, oklch(0.32 0.01 260), oklch(0.62 0.012 250) 22%, oklch(0.88 0.01 240) 40%, oklch(0.66 0.012 250) 62%, oklch(0.3 0.01 260))",
      }}
    >
      <svg
        className="absolute inset-0 size-full"
        viewBox={`0 0 ${geo.roller} ${height}`}
        preserveAspectRatio="none"
      >
        <motion.path
          d={knurl}
          stroke="oklch(0.2 0.01 260)"
          strokeOpacity="0.3"
          strokeWidth="0.8"
          fill="none"
        />
      </svg>
      {/* Pressure either side of the nip, where the paper meets the drum. */}
      <span
        className="absolute inset-y-2 -left-1.5 w-1.5"
        style={{
          backgroundImage:
            "linear-gradient(to left, oklch(0.2 0.02 260 / 0.28), transparent)",
        }}
      />
      <span
        className="absolute inset-y-2 -right-1.5 w-1.5"
        style={{
          backgroundImage:
            "linear-gradient(to right, oklch(0.2 0.02 260 / 0.28), transparent)",
        }}
      />
    </motion.div>
  );
}

/* -------------------------------- component ------------------------------ */

/**
 * A press seen from above: heavy steel rollers stand across the middle of a
 * feed path, plain grey pages — wireframes of what they will become — slide
 * in from the left, are drawn under the rollers, and come out on the right as
 * finished results (a product card, a chart, a poster, a ticket, a report, a
 * badge) that settle onto a fanned pile with a bounce on springs.recoil. Each
 * pair of rollers is a stage, and every part of a sheet shows the stage it has
 * passed, clipped exactly at each nip.
 *
 * Everything is one feed value: sheets, clips, and the rollers' knurled
 * surfaces, which turn by the distance the paper moves over their radius. The
 * motor pulls a heavy flywheel toward `speed`. Wind the crank and the rollers
 * follow the handle 1:1; let go and the flywheel carries the wind before
 * easing back. As a sheet enters a nip the top roller rides up over it and
 * drops back with a bounce when it leaves. The crank is a button: Right,
 * Enter or Space wind one document through on springs.glide, Left winds one
 * back, Home and End go to the first and last. Under reduced motion the motor
 * is off and every step is an instant swap with a short dip.
 */
export function ManglePress({
  items = defaultMangleItems,
  speed = 1,
  rollers = 2,
  palette = "studio",
  heft = 0.6,
  squeeze = 0.6,
  spacing = 0.35,
  crank = true,
  paused = false,
  sound = false,
  label = "Press",
  onResult,
  disabled = false,
  className,
}: ManglePressProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const gloss = `${uid.replace(/[^a-zA-Z0-9_-]/g, "")}-gloss`;
  const list = items.length > 0 ? items : defaultMangleItems;
  const n = list.length;
  const pairs = clamp(Math.round(clamp(rollers, 2, 6) / 2), 1, 3);
  const inks = PALETTES[palette] ?? PALETTES.studio;
  const looks: Look[] =
    pairs === 1 ? [0, 2] : pairs === 2 ? [0, 1, 2] : [0, 1, 2, 3];

  const [box, setBox] = React.useState(NOMINAL);
  const geo = React.useMemo(
    () => geometry(box.w, box.h, pairs, spacing),
    [box.w, box.h, pairs, spacing],
  );
  const lastNip = geo.nips[geo.nips.length - 1] ?? 0;
  const firstNip = geo.nips[0] ?? 0;
  /** Feed position at which sheet k has fully left the last nip. */
  const outAt = (lastNip + geo.sw - firstNip) / geo.pitch;
  /** Feed position at which sheet k lands on the pile. */
  const landAt = (geo.pile - firstNip) / geo.pitch;

  const feed = useMotionValue(outAt - 0.25);
  const angle = useTransform(feed, (s) => (s * geo.pitch) / (geo.roller / 2));
  const [base, setBase] = React.useState(() => Math.floor(outAt - 0.25));
  useMotionValueEvent(feed, "change", (s) => {
    const b = Math.floor(s);
    setBase((was) => (was === b ? was : b));
  });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const crankRef = React.useRef<HTMLButtonElement | null>(null);
  const visible = React.useRef(true);
  const omega = React.useRef(0);
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const stepping = React.useRef<AnimationPlaybackControls | null>(null);
  const winding = React.useRef(false);
  const grab = React.useRef({ a: 0, s: 0, t: 0, prev: 0 });
  const creak = React.useRef<LoopHandle | null>(null);
  const dim = useMotionValue(1);
  const [said, setSaid] = React.useState({ text: "", n: 0 });

  // Per-pair lift: the top roller rides up over a sheet.
  const liftA = useMotionValue(0);
  const liftB = useMotionValue(0);
  const liftC = useMotionValue(0);
  const lifts = [liftA, liftB, liftC];
  const under = React.useRef<boolean[]>([false, false, false]);

  // A landed sheet's bounce, keyed by its place in the endless queue.
  const dropA = useMotionValue(0);
  const dropB = useMotionValue(0);
  const dropC = useMotionValue(0);
  const dropD = useMotionValue(0);
  const drops = [dropA, dropB, dropC, dropD];
  const landedAt = (k: number) => drops[mod(k, 4)] ?? dropA;
  const landed = React.useRef(Math.floor(outAt - 0.25 - landAt));

  const live = React.useRef({
    speed,
    heft,
    paused,
    motionSafe,
    disabled,
    pitch: geo.pitch,
    radius: geo.roller / 2,
  });
  React.useEffect(() => {
    live.current = {
      speed,
      heft,
      paused,
      motionSafe,
      disabled,
      pitch: geo.pitch,
      radius: geo.roller / 2,
    };
  });

  /** Sheets per second the motor wants. */
  const motorRate = () => {
    const l = live.current;
    if (l.paused || !l.motionSafe || l.disabled) return 0;
    return 0.42 * clamp(l.speed, 0.25, 2);
  };

  const kick = React.useCallback(() => {
    if (frame.current || !visible.current || document.hidden) return;
    const tick = (now: number) => {
      frame.current = 0;
      if (!visible.current || document.hidden) {
        last.current = 0;
        return;
      }
      const dt = last.current
        ? Math.min(0.05, (now - last.current) / 1000)
        : 1 / 60;
      last.current = now;
      if (!winding.current && !stepping.current) {
        const want = motorRate();
        const tau = 0.25 + 1.4 * clamp(live.current.heft, 0, 1);
        omega.current += (want - omega.current) * (1 - Math.exp(-dt / tau));
        if (Math.abs(omega.current - want) < 0.002) omega.current = want;
        if (omega.current !== 0) feed.set(feed.get() + omega.current * dt);
      }
      const moving =
        winding.current ||
        stepping.current !== null ||
        omega.current !== 0 ||
        motorRate() !== 0;
      if (creak.current && !winding.current && !stepping.current) {
        creak.current.stop();
        creak.current = null;
      }
      if (moving) frame.current = window.requestAnimationFrame(tick);
      else last.current = 0;
    };
    frame.current = window.requestAnimationFrame(tick);
    // The loop reads everything else through refs.
  }, [feed]);

  React.useEffect(() => {
    kick();
  });

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (frame.current) window.cancelAnimationFrame(frame.current);
      frame.current = 0;
      stepping.current?.stop();
      stepping.current = null;
      creak.current?.stop();
      creak.current = null;
    };
  }, [kick]);

  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const sizer = new ResizeObserver(() => {
        const w = Math.round(node.clientWidth);
        const h = Math.round(node.clientHeight);
        if (w > 0 && h > 0)
          setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
      });
      sizer.observe(node);
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        visible.current = Boolean(entry?.isIntersecting);
        if (visible.current) kick();
      });
      watcher.observe(node);
      return () => {
        sizer.disconnect();
        watcher.disconnect();
      };
    },
    [kick],
  );

  // Rollers ride up over paper and drop back; results land on the pile.
  useMotionValueEvent(feed, "change", (s) => {
    const l = live.current;
    for (let j = 0; j < pairs; j += 1) {
      const nip = geo.nips[j] ?? 0;
      const u = mod(s * geo.pitch + firstNip - nip, geo.pitch);
      const on = u <= geo.sw;
      if (on !== under.current[j]) {
        under.current[j] = on;
        const lift = lifts[j];
        if (!lift) continue;
        const to = on ? clamp(squeeze, 0, 1) : 0;
        if (l.motionSafe) animate(lift, to, springs.recoil);
        else lift.jump(to);
      }
    }
    const k = Math.floor(s - landAt);
    if (k !== landed.current) {
      const forward = k > landed.current;
      landed.current = k;
      if (forward) {
        const drop = landedAt(k);
        if (l.motionSafe) {
          drop.jump(1);
          animate(drop, 0, springs.recoil);
        }
        const item = list[mod(k, n)];
        if (item) {
          onResult?.(item, mod(k, n));
          setSaid((st) => ({
            text: `Printed: ${item.title}, ${KIND_WORD[item.kind ?? "card"]}.`,
            n: st.n + 1,
          }));
        }
      }
    }
  });

  const startCreak = () => {
    if (creak.current) return;
    creak.current = audio.start("creak", { gain: 0.45, pitch: 0.8 });
  };

  /** Winds the press to a feed position on the glide spring, or at once. */
  const windTo = (target: number) => {
    stepping.current?.stop();
    if (!motionSafe) {
      stepping.current = null;
      feed.jump(target);
      animate(dim, [1, 0.6, 1], {
        duration: durations.base,
        ease: easings.move,
      });
      return;
    }
    startCreak();
    omega.current = 0;
    const run = animate(feed, target, {
      ...springs.glide,
      onUpdate: () => creak.current?.set({ pitch: 0.9 }),
      onComplete: () => {
        if (stepping.current === run) stepping.current = null;
        kick();
      },
    });
    stepping.current = run;
    kick();
  };

  const stepBy = (dir: 1 | -1 | "home" | "end") => {
    if (disabled) return;
    const s = feed.get();
    if (dir === 1) windTo(Math.floor(s - outAt + 0.02) + 1 + outAt);
    else if (dir === -1) windTo(Math.ceil(s - outAt - 0.02) - 1 + outAt);
    else {
      const cycle = Math.floor((s - outAt + 0.02) / n) * n;
      windTo(cycle + (dir === "home" ? 0 : n - 1) + outAt);
    }
  };

  const angleAt = (clientX: number, clientY: number) => {
    const el = crankRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.atan2(
      clientY - (r.top + r.height / 2),
      clientX - (r.left + r.width / 2),
    );
  };

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ point, event }) => {
      stepping.current?.stop();
      stepping.current = null;
      winding.current = true;
      const a = angleAt(point.x, point.y);
      grab.current = { a, s: feed.get(), t: event.timeStamp, prev: a };
      startCreak();
      kick();
    },
    onMove: ({ point, event }) => {
      const a = angleAt(point.x, point.y);
      let d = a - grab.current.prev;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      grab.current.prev = a;
      const ds = (d * (geo.roller / 2)) / geo.pitch;
      const s = feed.get() + ds;
      feed.set(s);
      const dt = Math.max(1, event.timeStamp - grab.current.t) / 1000;
      grab.current.t = event.timeStamp;
      omega.current = omega.current * 0.6 + (ds / dt) * 0.4;
      creak.current?.set({
        pitch: clamp(0.6 + Math.abs(omega.current) * 0.45, 0.5, 2),
        gain: clamp(0.25 + Math.abs(omega.current) * 0.2, 0.2, 0.6),
      });
    },
    onEnd: () => {
      winding.current = false;
      omega.current = clamp(omega.current, -4, 4);
      if (!motionSafe) {
        omega.current = 0;
        windTo(Math.round(feed.get() - outAt) + outAt);
      }
      kick();
    },
    onCancel: () => {
      winding.current = false;
      kick();
    },
    onTap: () => stepBy(1),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const keys: Record<string, 1 | -1 | "home" | "end"> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
      Home: "home",
      End: "end",
    };
    const dir = keys[event.key];
    if (dir === undefined) return;
    event.preventDefault();
    stepBy(dir);
  };

  const crankAngle = useTransform(angle, (a) =>
    r2(((a * 180) / Math.PI) % 360),
  );

  // The window of the endless queue worth drawing: a few on the pile, the
  // ones in the press, and those waiting on the feed table.
  const ahead = Math.ceil(firstNip / geo.pitch) + 1;
  const behind = Math.ceil(landAt) + 3;
  const ks: number[] = [];
  for (let k = base - behind; k <= base + ahead; k += 1) ks.push(k);

  const machineLeft = r2(firstNip - geo.roller / 2 - 10);
  const machineRight = r2(lastNip + geo.roller / 2 + 10);

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-label={label}
      aria-describedby={`${uid}-hint`}
      className={cn(
        "group/mangle-press relative isolate h-56 w-full overflow-clip rounded-3 bg-surface-2 select-none",
        className,
      )}
    >
      <svg aria-hidden className="absolute size-0">
        <defs>
          <linearGradient id={gloss} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0.25" stopColor="white" stopOpacity="0" />
            <stop offset="0.45" stopColor="white" stopOpacity="0.7" />
            <stop offset="0.6" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      <motion.div className="absolute inset-0" style={{ opacity: dim }}>
        {/* The feed table and the out table, either side of the press. */}
        <div
          aria-hidden
          className="absolute left-2 rounded-2 border border-hairline bg-card"
          style={{
            top: geo.table.top,
            height: geo.table.h,
            width: r2(Math.max(0, machineLeft - 8)),
          }}
        />
        <div
          aria-hidden
          className="absolute right-2 rounded-2 border border-hairline bg-card"
          style={{
            top: geo.table.top,
            height: geo.table.h,
            left: machineRight,
          }}
        />
        {ks.map((k) => {
          const item = list[mod(k, n)];
          if (!item) return null;
          return (
            <Sheet
              key={k}
              k={k}
              z={100 + (k - base)}
              gloss={gloss}
              landAt={landAt}
              item={item}
              feed={feed}
              geo={geo}
              looks={looks}
              inks={inks}
              squeeze={squeeze}
              landedAt={landedAt}
            />
          );
        })}
        {/* The frame: side rails the rollers turn in. */}
        <div
          aria-hidden
          className="absolute rounded-1"
          style={{
            left: machineLeft,
            width: r2(machineRight - machineLeft),
            top: r2(geo.top - 18),
            height: 8,
            zIndex: 2001,
            backgroundImage:
              "linear-gradient(oklch(0.42 0.01 260), oklch(0.28 0.01 260))",
          }}
        />
        <div
          aria-hidden
          className="absolute rounded-1"
          style={{
            left: machineLeft,
            width: r2(machineRight - machineLeft),
            top: r2(geo.top + geo.sh + 10),
            height: 8,
            zIndex: 2001,
            backgroundImage:
              "linear-gradient(oklch(0.42 0.01 260), oklch(0.28 0.01 260))",
          }}
        />
        {geo.nips.map((x, j) => (
          <Roller
            key={j}
            x={x}
            geo={geo}
            angle={angle}
            lift={lifts[j] ?? liftA}
          />
        ))}
      </motion.div>

      {crank ? (
        <button
          ref={crankRef}
          type="button"
          aria-label="Wind the press"
          aria-describedby={`${uid}-hint`}
          aria-disabled={disabled || undefined}
          onKeyDown={onKeyDown}
          onClick={(event) => {
            // Enter, Space and assistive technology: one document through.
            if (event.detail === 0) stepBy(1);
          }}
          {...drag}
          className={cn(
            "absolute grid touch-none place-items-center rounded-full outline-none",
            disabled
              ? "cursor-not-allowed opacity-60"
              : "cursor-grab active:cursor-grabbing",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
          style={{
            left: r2(geo.crank.x - geo.crank.r - 6),
            top: r2(geo.crank.y - geo.crank.r - 6),
            width: r2(geo.crank.r * 2 + 12),
            height: r2(geo.crank.r * 2 + 12),
            zIndex: 2002,
          }}
        >
          <motion.svg
            aria-hidden
            viewBox="-24 -24 48 48"
            className="block"
            style={{
              width: geo.crank.r * 2 + 8,
              height: geo.crank.r * 2 + 8,
              rotate: crankAngle,
            }}
          >
            <circle r="19" fill="oklch(0.36 0.01 260)" />
            <circle r="16" fill="oklch(0.5 0.012 250)" />
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <path
                key={i}
                d="M0 0L15 0"
                stroke="oklch(0.36 0.01 260)"
                strokeWidth="2.4"
                transform={`rotate(${i * 60})`}
              />
            ))}
            <circle r="4.5" fill="oklch(0.3 0.01 260)" />
            <circle cx="12" cy="0" r="5.5" className="fill-primary" />
            <circle cx="10.8" cy="-1.4" r="1.8" fill="white" opacity="0.5" />
          </motion.svg>
        </button>
      ) : null}

      <p id={`${uid}-hint`} className="sr-only">
        Wind the crank to run the press faster. With the crank focused, Right,
        Enter or Space presses the next document, Left winds the last one back,
        Home and End go to the first and last.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
