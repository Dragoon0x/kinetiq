"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type DeskSpikeSlip = {
  /** Stable id: the torn hole is remembered by it. */
  id: string;
  /** A small line above the title: the ticket number, the time, the sender. */
  kind?: string;
  /** The note's headline. */
  title: string;
  /** Up to four lines of the note. */
  lines?: string[];
  /** A short reading at the foot: a time, a total, an instruction. */
  meta?: string;
  /** A rubber stamp across the corner, one or two words. */
  stamp?: string;
};

export type DeskSpikePreset = "orders" | "messages" | "wire" | "receipts";
export type DeskSpikeTone = "white" | "canary" | "pink" | "mixed";

export type DeskSpikeProps = {
  /** The notes on the spike, top first: a preset or your own. @default "orders" */
  slips?: DeskSpikePreset | DeskSpikeSlip[];
  /** How far the slips turn about the needle, 0 (squared up) to 1 (a loose pile). @default 0.5 */
  tilt?: number;
  /** The paper: white, canary, pink, or the three carbon copies in turn. @default "white" */
  paperTone?: DeskSpikeTone;
  /** Controlled: how many slips are torn off the top. */
  value?: number;
  /** How many are torn off at first, when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the click or key that tore off, put back or refilled, with the new count. */
  onValueChange?: (value: number) => void;
  /** Fires when a slip is torn off, with the slip. */
  onTear?: (slip: DeskSpikeSlip) => void;
  /** Fires when a slip goes back on the spike, with the slip. */
  onRestore?: (slip: DeskSpikeSlip) => void;
  /** How far each slip's corner curls up, 0 to 1. @default 0.5 */
  curl?: number;
  /** How far the desk tips away from you, degrees, 20 to 50. @default 36 */
  angle?: number;
  /** The print's colour, any CSS colour. @default a dark ink pigment */
  ink?: string;
  /** A click on the empty spike puts every slip back. @default true */
  refill?: boolean;
  /** Seeds each slip's turn, flight and torn hole. @default 4 */
  seed?: number;
  /** A paper rip when a slip tears free, and a soft one when it lands. Off unless asked for. @default false */
  sound?: boolean;
  /** The spike's accessible name. @default "Note spike" */
  label?: string;
  /** Nothing tears. @default false */
  disabled?: boolean;
  /** Sizes the scene. @default "h-[34rem] w-full" */
  className?: string;
};

const PRESETS: Record<DeskSpikePreset, DeskSpikeSlip[]> = {
  orders: [
    {
      id: "o214",
      kind: "Order 214",
      title: "Table 6",
      lines: ["2 × Flat white", "1 × Cardamom bun", "1 × Iced oat latte"],
      meta: "12:41",
      stamp: "Paid",
    },
    {
      id: "o215",
      kind: "Order 215",
      title: "Takeaway · Ines",
      lines: ["1 × Cold brew, large", "1 × Rye toast, butter"],
      meta: "12:43",
    },
    {
      id: "o216",
      kind: "Order 216",
      title: "Table 2",
      lines: ["3 × Espresso", "1 × Almond croissant"],
      meta: "12:44",
      stamp: "Rush",
    },
    {
      id: "o217",
      kind: "Order 217",
      title: "Bar · Theo",
      lines: ["1 × Pour-over, Fernworks", "1 × Sparkling water"],
      meta: "12:47",
    },
    {
      id: "o218",
      kind: "Order 218",
      title: "Table 9",
      lines: ["2 × Chai", "2 × Banana bread"],
      meta: "12:50",
      stamp: "Paid",
    },
  ],
  messages: [
    {
      id: "m1",
      kind: "While you were out · 09:12",
      title: "Mara, Gaugeworks",
      lines: ["Wants the dial mock-ups", "before Thursday."],
      meta: "Please call back",
      stamp: "Urgent",
    },
    {
      id: "m2",
      kind: "While you were out · 10:05",
      title: "Front desk",
      lines: ["A parcel from Basinworks", "is waiting downstairs."],
      meta: "No reply needed",
    },
    {
      id: "m3",
      kind: "While you were out · 11:30",
      title: "Theo, Fieldline",
      lines: ["Lunch moved to one.", "Same place."],
      meta: "Will call again",
    },
    {
      id: "m4",
      kind: "While you were out · 14:20",
      title: "Coldbrook Bank",
      lines: ["The new card is", "ready to collect."],
      meta: "Returned your call",
      stamp: "Done",
    },
  ],
  wire: [
    {
      id: "w1",
      kind: "Wire · 06:02",
      title: "Fog holds the morning ferries",
      lines: ["Harbour office expects", "sailings by nine."],
      meta: "Waylight Desk",
    },
    {
      id: "w2",
      kind: "Wire · 06:40",
      title: "Mill Lane reopens",
      lines: ["Resurfacing finished", "a day early."],
      meta: "Waylight Desk",
      stamp: "Run",
    },
    {
      id: "w3",
      kind: "Wire · 07:15",
      title: "Orchard fair opens Saturday",
      lines: ["Forty growers,", "free entry before ten."],
      meta: "Fieldline Post",
    },
    {
      id: "w4",
      kind: "Wire · 07:58",
      title: "Quarry walk closed",
      lines: ["Storm damage on the", "upper path."],
      meta: "Waylight Desk",
      stamp: "Hold",
    },
  ],
  receipts: [
    {
      id: "r1",
      kind: "Basinworks Hardware",
      title: "Receipt 0412",
      lines: ["Brass hinges × 4 · 12.80", "Wood glue · 6.40"],
      meta: "Total 19.20",
      stamp: "Paid",
    },
    {
      id: "r2",
      kind: "Coldbrook Café",
      title: "Receipt 1187",
      lines: ["Flat white · 3.60", "Cardamom bun · 3.20"],
      meta: "Total 6.80",
    },
    {
      id: "r3",
      kind: "Fernworks Garden",
      title: "Receipt 0098",
      lines: ["Seed tray × 2 · 5.00", "Twine · 2.40"],
      meta: "Total 7.40",
    },
    {
      id: "r4",
      kind: "Gaugeworks Supply",
      title: "Receipt 2210",
      lines: ["Pencils × 12 · 4.80", "Graph pad · 3.90"],
      meta: "Total 8.70",
      stamp: "Filed",
    },
  ],
};

/** Paper as pigment: a token's hue at a fixed lightness, the same sheet on any page. */
const TONES: Record<Exclude<DeskSpikeTone, "mixed">, string> = {
  white: "oklch(from var(--warn) 0.975 0.008 h)",
  canary: "oklch(from var(--warn) 0.94 0.075 calc(h + 16))",
  pink: "oklch(from var(--danger) 0.925 0.04 h)",
};
const MIXED = [TONES.white, TONES.canary, TONES.pink];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function hash(seed: number, i: number, k: number): number {
  let h = Math.imul(seed | 0, 374761393) ^ Math.imul(i + 1, 668265263);
  h = Math.imul(h ^ Math.imul(k + 7, 2246822519), 3266489917);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** The stack's camera: one perspective for every slip, seen from above the front. */
const PERSPECTIVE = 1000;
const ORIGIN_Y = 0.3;
const SPIKE_Y = 0.5;
/** Where on a slip the needle goes through, as a fraction of its height. */
const HOLE = 0.28;
/** The tear's beats along its progress: the tug, then the slide up and away. */
const TUG = 0.22;
const RISE = 0.45;

type Geometry = {
  sw: number;
  sh: number;
  hx: number;
  hy: number;
  a: number;
  plate: number;
  gap: number;
  tip: number;
};

function geometryOf(width: number, n: number, angle: number): Geometry {
  const sw = Math.round(clamp(width * 0.72, 150, 236));
  const sh = Math.round(sw * 1.06);
  const plate = 6;
  const gap = 1.7;
  return {
    sw,
    sh,
    hx: sw / 2,
    hy: Math.round(sh * HOLE),
    a: (clamp(angle, 20, 50) * Math.PI) / 180,
    plate,
    gap,
    tip: plate + (n - 1) * gap + 1 + sw * 0.5,
  };
}

/** The height on the needle where slip `j` (0 is the top of a full stack) sits. */
const restZ = (g: Geometry, n: number, j: number) =>
  g.plate + 1 + (n - 1 - j) * g.gap;

/**
 * Where a point on the needle lands on screen: the needle stands along the
 * desk's normal at the spike, so the browser's own perspective puts it at
 * this many percent of the height less this many pixels.
 */
function yOn(g: Geometry, z: number) {
  const k = PERSPECTIVE / (PERSPECTIVE - z * Math.cos(g.a));
  return {
    pct: (ORIGIN_Y + (SPIKE_Y - ORIGIN_Y) * k) * 100,
    px: z * Math.sin(g.a) * k,
  };
}

/** A needle segment from height `lo` to `hi`, tapering to its point. */
function needleStyle(g: Geometry, lo: number, hi: number) {
  const top = yOn(g, hi);
  const bottom = yOn(g, lo);
  const widthAt = (z: number) =>
    0.5 + 4 * Math.pow(clamp(1 - z / g.tip, 0, 1), 0.55);
  const wt = widthAt(hi);
  const wb = widthAt(lo);
  return {
    top: `calc(${r3(top.pct)}% - ${r2(top.px)}px)`,
    height: `max(0px, calc(${r3(bottom.pct - top.pct)}% - ${r2(bottom.px - top.px)}px))`,
    clipPath: `polygon(${r2(2.5 - wt / 2)}px 0, ${r2(2.5 + wt / 2)}px 0, ${r2(2.5 + wb / 2)}px 100%, ${r2(2.5 - wb / 2)}px 100%)`,
  };
}

/** The ragged hole a slip keeps once it has been pulled over the point. */
function raggedMask(g: Geometry, seed: number, key: number): string {
  const pts: string[] = [];
  const N = 16;
  for (let i = 0; i < N; i += 1) {
    const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
    let rad = 4 + 3.5 * hash(seed, key, i);
    // The tear runs up from the hole toward the top edge.
    if (i === 0) rad = 13 + 6 * hash(seed, key, 40);
    if (i === 1 || i === N - 1) rad = 5 + 2 * hash(seed, key, 41 + i);
    pts.push(
      `${r1(g.hx + Math.cos(ang) * rad)} ${r1(g.hy + Math.sin(ang) * rad)}`,
    );
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${g.sw}' height='${g.sh}'><path fill='black' fill-rule='evenodd' d='M0 0H${g.sw}V${g.sh}H0Z M${pts.join(" L")}Z'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

type SlipProps = {
  slip: DeskSpikeSlip;
  index: number;
  count: number;
  gone: boolean;
  ripped: boolean;
  top: boolean;
  g: Geometry;
  turn: number;
  dir: number;
  paper: string;
  ink: string;
  curl: number;
  seed: number;
  delay: number;
  width: number;
  motionSafe: boolean;
  flying: boolean;
  onRip: (id: string) => void;
  onLand: (id: string) => void;
  onFly: (z: number) => void;
};

/**
 * One slip on the spike. Its whole journey is one progress value: 0 on the
 * stack, the tug up to TUG, the slide up the needle to RISE, then away and
 * gone at 1; the pose is a pure function of it, so a tear and a put-back are
 * the same path run either way.
 */
function Slip({
  slip,
  index,
  count,
  gone,
  ripped,
  top,
  g,
  turn,
  dir,
  paper,
  ink,
  curl,
  seed,
  delay,
  width,
  motionSafe,
  flying,
  onRip,
  onLand,
  onFly,
}: SlipProps) {
  const t = useMotionValue(gone ? 1 : 0);
  const fade = useMotionValue(gone ? 0 : 1);
  const z0 = restZ(g, count, index);
  const deg = (g.a * 180) / Math.PI;

  const pose = useTransform(t, (v) => {
    let z = z0;
    let dx = 0;
    let dy = 0;
    let spin = 0;
    let bend = 0;
    let roll = 0;
    let scale = 1;
    if (v < 0) {
      // The recoil's overshoot: pressed a hair into the stack.
      scale = 1 + v * 0.18;
    } else if (v < TUG) {
      const u = v / TUG;
      z = z0 + 16 * u;
      bend = -13 * u;
    } else if (v < RISE) {
      const u = (v - TUG) / (RISE - TUG);
      z = z0 + 16 + (g.tip + 16 - z0 - 16) * u;
      bend = -13 + 9 * u;
      spin = dir * 4 * u;
    } else {
      const u = (v - RISE) / (1 - RISE);
      z = g.tip + 16 + u * 140;
      dx = dir * u * u * width * 0.62;
      dy = -u * g.sh * 0.9;
      spin = dir * (4 + u * 78);
      bend = -4 + Math.sin(u * Math.PI * 3) * 24;
      roll = dir * Math.sin(u * Math.PI * 2.4) * 28;
    }
    return `rotateX(${r2(deg)}deg) translate3d(${r1(dx)}px, ${r1(dy)}px, ${r2(z)}px) rotateZ(${r2(turn + spin)}deg) rotateX(${r2(bend)}deg) rotateY(${r2(roll)}deg) scale(${r3(scale)})`;
  });
  const flightOpacity = useTransform(t, (v) =>
    r3(1 - smooth(RISE + (1 - RISE) * 0.55, 1, v)),
  );
  const opacity = motionSafe ? flightOpacity : fade;
  const shadowOpacity = useTransform(t, (v) =>
    r3((top || v > 0 ? 1 : 0.55) * (1 - smooth(TUG, RISE, v) * 0.7)),
  );

  const crossed = React.useRef(gone);
  useMotionValueEvent(t, "change", (v) => {
    if (flying && v >= 1) onFly(-1);
    else if (flying) {
      const z =
        v < TUG
          ? z0 + 16 * (v / TUG)
          : v < RISE
            ? z0 + 16 + (g.tip + 16 - z0 - 16) * ((v - TUG) / (RISE - TUG))
            : g.tip + 40;
      onFly(z);
    }
    if (!crossed.current && v >= TUG) {
      crossed.current = true;
      onRip(slip.id);
    } else if (crossed.current && v < 0.04) {
      crossed.current = false;
      onLand(slip.id);
    }
  });

  const seen = React.useRef(gone);
  React.useEffect(() => {
    if (seen.current === gone) return;
    seen.current = gone;
    const runs: AnimationPlaybackControls[] = [];
    let timer = 0;
    if (!motionSafe) {
      // No tug, no flight: the sheet is simply gone, or back.
      if (gone) onRip(slip.id);
      t.jump(gone ? 1 : 0);
      runs.push(
        animate(fade, gone ? 0 : 1, {
          duration: durations.base,
          ease: gone ? easings.exit : easings.enter,
        }),
      );
    } else if (gone) {
      // The tug is a press against the paper: quick and firm, on flick.
      // Then it rips and goes, accelerating away on the exit ease.
      runs.push(
        animate(t, TUG, {
          ...springs.flick,
          onComplete: () => {
            // Up the needle at an even pull, then free and away.
            runs.push(
              animate(t, RISE, {
                duration: 0.16,
                ease: easings.move,
                onComplete: () => {
                  runs.push(
                    animate(t, 1, { duration: 0.52, ease: easings.exit }),
                  );
                },
              }),
            );
          },
        }),
      );
    } else {
      const start = () => {
        // Back over the point and down the needle, landing on recoil.
        runs.push(
          animate(t, TUG, {
            duration: 0.42,
            ease: easings.enter,
            onComplete: () => {
              runs.push(animate(t, 0, springs.recoil));
            },
          }),
        );
      };
      if (delay > 0) timer = window.setTimeout(start, Math.round(delay * 1000));
      else start();
    }
    return () => {
      window.clearTimeout(timer);
      for (const run of runs) run.stop();
      // Finish, never freeze: whatever was interrupted lands where it was going.
      t.jump(gone ? 1 : 0);
      fade.jump(gone ? 0 : 1);
    };
    // The journey starts when `gone` flips; the rest is read as it was then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone]);

  const fontSize = r1(g.sw / 16.5);
  const c = Math.round(clamp(curl, 0, 1) * g.sw * 0.16);
  const pad = Math.round(g.sw * 0.08);
  const lines = (slip.lines ?? []).slice(0, 4);
  const shadowAngle = r2(38 - turn);
  const shadowLength = Math.round((g.tip - z0) * 0.62);

  return (
    <motion.div
      aria-hidden={top ? undefined : true}
      className="pointer-events-none absolute"
      style={{
        left: `calc(50% - ${g.hx}px)`,
        top: `calc(${SPIKE_Y * 100}% - ${g.hy}px)`,
        width: g.sw,
        height: g.sh,
        zIndex: 2 * (count - index) + 2,
        transformOrigin: `${g.hx}px ${g.hy}px`,
        // Rastered once at rest scale, so a flight never re-rasters the sheet.
        willChange: "transform",
        transform: pose,
        opacity,
      }}
    >
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-[3px] blur-[3px]"
        style={{
          translateX: 2.5,
          translateY: 3.5,
          opacity: shadowOpacity,
          backgroundColor: "oklch(0.15 0.02 258 / 0.3)",
          // The torn hole goes through the sheet's shadow too.
          maskImage: ripped ? raggedMask(g, seed, index + 1) : undefined,
          maskSize: ripped ? "100% 100%" : undefined,
          maskRepeat: ripped ? "no-repeat" : undefined,
        }}
      />
      <article
        className="absolute inset-0 overflow-hidden rounded-[2px]"
        style={{
          backgroundColor: paper,
          backgroundImage:
            "linear-gradient(160deg, oklch(1 0 0 / 0.4) 0%, oklch(1 0 0 / 0) 38%, oklch(0 0 0 / 0.05) 100%)",
          clipPath: c
            ? `polygon(0 0, 100% 0, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0 100%)`
            : undefined,
          maskImage: ripped ? raggedMask(g, seed, index + 1) : undefined,
          maskSize: ripped ? "100% 100%" : undefined,
          maskRepeat: ripped ? "no-repeat" : undefined,
          color: ink,
          fontSize,
          padding: `${pad}px ${pad}px`,
        }}
      >
        <div
          className="flex flex-col"
          style={{ paddingTop: Math.round(g.hy - pad + fontSize * 0.9) }}
        >
          {slip.kind ? (
            <p className="truncate font-mono text-[0.68em] tracking-[0.08em] uppercase opacity-70">
              {slip.kind}
            </p>
          ) : null}
          <p className="mt-[0.2em] truncate text-[1.12em] leading-tight font-semibold">
            {slip.title}
          </p>
          <div className="mt-[0.5em] flex flex-col gap-[0.25em] border-t border-dashed border-current/25 pt-[0.5em]">
            {lines.map((line, i) => (
              <p key={i} className="truncate leading-snug">
                {line}
              </p>
            ))}
          </div>
          {slip.meta ? (
            <p className="mt-[0.6em] truncate font-mono text-[0.72em] tracking-[0.04em] opacity-75">
              {slip.meta}
            </p>
          ) : null}
        </div>
        {/* The hole the needle makes: the paper puckers a little round it. */}
        <span
          className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: g.hx,
            top: g.hy,
            backgroundImage:
              "radial-gradient(circle, oklch(0.2 0.02 258 / 0.55) 0%, oklch(0.2 0.02 258 / 0.12) 55%, oklch(0.2 0.02 258 / 0) 100%)",
          }}
        />
        {top ? (
          <span
            className="absolute h-[3px] origin-left rounded-full blur-[1.5px]"
            style={{
              left: g.hx,
              top: g.hy - 1,
              width: shadowLength,
              rotate: `${shadowAngle}deg`,
              backgroundImage:
                "linear-gradient(to right, oklch(0.18 0.02 258 / 0.38), oklch(0.18 0.02 258 / 0))",
            }}
          />
        ) : null}
        {slip.stamp ? (
          <span
            className="absolute right-[9%] bottom-[16%] rounded-[3px] border-2 px-[0.4em] font-mono text-[0.8em] font-bold tracking-[0.1em] uppercase"
            style={{
              rotate: `${r2(-8 + hash(seed, index, 9) * 10)}deg`,
              color: "oklch(from var(--danger) 0.55 0.17 h / 0.72)",
              borderColor: "oklch(from var(--danger) 0.55 0.17 h / 0.6)",
            }}
          >
            {slip.stamp}
          </span>
        ) : null}
      </article>
      {c ? (
        // The curled corner: its paler underside, lifted off the sheet.
        <span
          className="absolute right-0 bottom-0"
          style={{
            width: c,
            height: c,
            clipPath: "polygon(0 0, 100% 0, 0 100%)",
            backgroundColor: paper,
            backgroundImage:
              "linear-gradient(135deg, oklch(0 0 0 / 0.16) 0%, oklch(1 0 0 / 0.45) 60%, oklch(1 0 0 / 0.2) 100%)",
            filter: "drop-shadow(-1px -1px 1px oklch(0 0 0 / 0.12))",
          }}
        />
      ) : null}
    </motion.div>
  );
}

/**
 * A desk spike with notes impaled on it, seen at a three-quarter angle: a
 * heavy base, a steel needle, and paper slips turned a little about it, each
 * curled at a corner. The stack is real CSS 3D — one perspective, each slip a
 * hair above the last — and the needle is drawn from the top slip's hole to
 * its point. A click or Space tears the top slip: it tugs up on
 * `springs.flick`, rips over the point (its hole tears ragged) and flutters
 * away on the exit ease; Backspace brings the last one back down the needle to
 * land on `springs.recoil`. An empty spike refills in a cascade. Under reduced
 * motion slips fade out and in, and the holes still tear.
 */
export function DeskSpike({
  slips = "orders",
  tilt = 0.5,
  paperTone = "white",
  value,
  defaultValue = 0,
  onValueChange,
  onTear,
  onRestore,
  curl = 0.5,
  angle = 36,
  ink = "oklch(from var(--ink) 0.27 0.02 h)",
  refill = true,
  seed = 4,
  sound = false,
  label = "Note spike",
  disabled = false,
  className,
}: DeskSpikeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const list =
    (typeof slips === "string" ? PRESETS[slips] : slips) ?? PRESETS.orders;
  const notes = list.length > 0 ? list.slice(0, 9) : PRESETS.orders;
  const n = notes.length;

  const [own, setOwn] = React.useState(defaultValue);
  const torn = clamp(Math.round(value ?? own), 0, n);
  const [ripped, setRipped] = React.useState<Set<string>>(() => new Set());
  const [delays, setDelays] = React.useState<Record<string, number>>({});
  const [flyIndex, setFlyIndex] = React.useState(-1);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [width, setWidth] = React.useState(360);
  const active = !disabled;

  const g = geometryOf(width, n, angle);
  const flyZ = useMotionValue(-1);
  const lowRef = React.useRef<HTMLSpanElement | null>(null);
  const highRef = React.useRef<HTMLSpanElement | null>(null);

  const topZ = torn < n ? restZ(g, n, torn) + 0.5 : g.plate;
  const restNeedle = needleStyle(g, topZ, g.tip);

  // The needle in two parts while a slip rides it: below the slip's hole it is
  // hidden behind that slip, above it in front of everything.
  const placeNeedle = (z: number) => {
    const low = lowRef.current;
    const high = highRef.current;
    if (!low || !high) return;
    const cut = clamp(z, topZ, g.tip);
    const a = needleStyle(g, topZ, z < 0 ? topZ : cut);
    const b = needleStyle(g, z < 0 ? topZ : cut, g.tip);
    low.style.top = a.top;
    low.style.height = a.height;
    low.style.clipPath = a.clipPath;
    high.style.top = b.top;
    high.style.height = b.height;
    high.style.clipPath = b.clipPath;
  };
  const placeRef = React.useRef(placeNeedle);
  React.useLayoutEffect(() => {
    placeRef.current = placeNeedle;
  });
  useMotionValueEvent(flyZ, "change", (z) => placeRef.current(z));

  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const sizer = new ResizeObserver(() => {
        const w = Math.round(node.clientWidth);
        setWidth((prev) => (prev === w ? prev : w));
      });
      sizer.observe(node);
      return () => sizer.disconnect();
    },
    [setWidth],
  );

  const commit = (next: number) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const tear = () => {
    if (!active) return;
    if (torn >= n) {
      if (!refill) return;
      const order: Record<string, number> = {};
      const step = cascade(n);
      notes.forEach((s, j) => {
        order[s.id] = (n - 1 - j) * step;
      });
      setDelays(order);
      setFlyIndex(-1);
      commit(0);
      setSaid((s) => ({
        n: s.n + 1,
        text: `All ${n} ${n === 1 ? "slip" : "slips"} back on the spike.`,
      }));
      return;
    }
    const slip = notes[torn];
    if (!slip) return;
    setDelays({});
    setFlyIndex(torn);
    commit(torn + 1);
    onTear?.(slip);
    const left = n - torn - 1;
    setSaid((s) => ({
      n: s.n + 1,
      text: `Torn off: ${slip.title}. ${left === 0 ? "Spike clear." : `${left} left.`}`,
    }));
  };

  const putBack = () => {
    if (!active || torn <= 0) return;
    const slip = notes[torn - 1];
    if (!slip) return;
    setDelays({});
    setFlyIndex(torn - 1);
    commit(torn - 1);
    onRestore?.(slip);
    setSaid((s) => ({
      n: s.n + 1,
      text: `Back on the spike: ${slip.title}. ${n - torn + 1} on it.`,
    }));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      putBack();
    }
  };

  const top = notes[torn];
  const name = top
    ? `Tear off the top slip: ${top.title}`
    : refill
      ? "Put every slip back on the spike"
      : "The spike is empty";

  const base = Math.round(g.sw * 0.9);
  const deg = r2((g.a * 180) / Math.PI);
  const turnOf = (j: number) =>
    r2(
      (hash(seed, j, 1) - 0.5) * 2 * 14 * clamp(tilt, 0, 1) +
        (hash(seed, j, 2) - 0.5) * 2,
    );
  const paperOf = (j: number) =>
    paperTone === "mixed"
      ? (MIXED[j % MIXED.length] ?? TONES.white)
      : TONES[paperTone];

  return (
    <div
      ref={bindRoot}
      className={cn(
        "relative isolate h-[34rem] w-full overflow-clip select-none",
        className,
      )}
      style={{
        perspective: `${PERSPECTIVE}px`,
        perspectiveOrigin: `50% ${ORIGIN_Y * 100}%`,
      }}
    >
      {/* The base: a heavy disc lying on the desk, with its edge and shadow. */}
      {[
        { z: -9, kind: "shadow" },
        { z: -6, kind: "edge" },
        { z: 0, kind: "face" },
      ].map((layer) => (
        <span
          key={layer.kind}
          aria-hidden
          className={cn(
            "pointer-events-none absolute rounded-full",
            layer.kind === "shadow" && "blur-md",
          )}
          style={{
            left: `calc(50% - ${base / 2}px)`,
            top: `calc(${SPIKE_Y * 100}% - ${base / 2}px)`,
            width: base,
            height: base,
            zIndex: 1,
            transform: `rotateX(${deg}deg) translate3d(${layer.kind === "shadow" ? 10 : 0}px, ${layer.kind === "shadow" ? 14 : 0}px, ${layer.z}px)`,
            backgroundColor:
              layer.kind === "shadow"
                ? "oklch(0.15 0.02 258 / 0.3)"
                : layer.kind === "edge"
                  ? "oklch(0.22 0.012 258)"
                  : "oklch(0.34 0.012 258)",
            backgroundImage:
              layer.kind === "face"
                ? "radial-gradient(circle at 38% 34%, oklch(0.56 0.01 258) 0%, oklch(0.36 0.012 258) 46%, oklch(0.26 0.012 258) 100%)"
                : undefined,
            boxShadow:
              layer.kind === "face"
                ? "inset 0 0 0 2px oklch(1 0 0 / 0.08), inset 0 -3px 6px oklch(0 0 0 / 0.3)"
                : undefined,
          }}
        />
      ))}
      {notes.map((slip, j) => (
        <Slip
          key={slip.id}
          slip={slip}
          index={j}
          count={n}
          gone={j < torn}
          ripped={ripped.has(slip.id)}
          top={j === torn}
          g={g}
          turn={turnOf(j)}
          dir={hash(seed, j, 3) < 0.5 ? -1 : 1}
          paper={paperOf(j)}
          ink={ink}
          curl={curl}
          seed={seed}
          delay={delays[slip.id] ?? 0}
          width={width}
          motionSafe={motionSafe}
          flying={flyIndex === j}
          onRip={(id) => {
            setRipped((s) => (s.has(id) ? s : new Set(s).add(id)));
            if (flyIndex === j) audio.play("paper", { gain: 0.6, pitch: 1.05 });
          }}
          onLand={() => {
            if (flyIndex === j || flyIndex < 0) {
              audio.play("paper", { gain: 0.32, pitch: 0.78 });
            }
            if (flyIndex === j) {
              setFlyIndex(-1);
              flyZ.set(-1);
            }
          }}
          onFly={(z) => flyZ.set(z)}
        />
      ))}
      {/* The needle: under a slip riding it, and over everything above that. */}
      <span
        ref={lowRef}
        aria-hidden
        className="pointer-events-none absolute left-1/2 -ml-[2.5px] w-[5px]"
        style={{
          zIndex: flyIndex >= 0 ? 2 * (n - flyIndex) + 1 : 1,
          top: restNeedle.top,
          height: "0px",
          clipPath: restNeedle.clipPath,
          backgroundImage:
            "linear-gradient(to right, oklch(0.86 0.005 258), oklch(0.62 0.01 258) 45%, oklch(0.34 0.01 258))",
        }}
      />
      <span
        ref={highRef}
        aria-hidden
        className="pointer-events-none absolute left-1/2 -ml-[2.5px] w-[5px]"
        style={{
          zIndex: 2 * n + 6,
          top: restNeedle.top,
          height: restNeedle.height,
          clipPath: restNeedle.clipPath,
          backgroundImage:
            "linear-gradient(to right, oklch(0.9 0.005 258), oklch(0.64 0.01 258) 45%, oklch(0.34 0.01 258))",
        }}
      />
      {torn >= n && refill ? (
        <p
          aria-hidden
          className="pointer-events-none absolute inset-x-0 text-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          style={{
            top: `calc(${SPIKE_Y * 100}% + ${Math.round(base * 0.58 + 10)}px)`,
          }}
        >
          Spike clear · click to refill
        </p>
      ) : null}
      <button
        type="button"
        aria-label={`${label}. ${name}`}
        aria-describedby={hintId}
        disabled={!active}
        onClick={tear}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute inset-0 z-[60] size-full cursor-pointer rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-default",
        )}
      />
      <p id={hintId} className="sr-only">
        Space or Enter tears off the top slip; Backspace puts the last one back.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
