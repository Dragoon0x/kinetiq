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

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import {
  project,
  rubberClamp,
  useDrag,
  type Point,
} from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type LibraryCardInk = "violet" | "red" | "black";

export type LibraryCardProps = {
  /** The book's title, printed at the head of the card. */
  title: string;
  /** Who wrote it, printed under the title. */
  author?: string;
  /** The shelf mark, printed beside the author in mono. */
  callNumber?: string;
  /** The library's name, printed on the pocket. @default "Public Library" */
  library?: string;
  /** What the stamp is set to print next, e.g. "14 OCT 2026". */
  due: string;
  /** Controlled: the dates stamped so far, oldest first. */
  value?: string[];
  /** The dates already stamped when uncontrolled. @default [] */
  defaultValue?: string[];
  /** Fires from the strike that inked a row, with every date now on the card. */
  onValueChange?: (value: string[]) => void;
  /** Controlled: whether the card is out of its pocket. */
  open?: boolean;
  /** Whether the card starts out of its pocket when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from the drag, tap or key that slid the card out or in. */
  onOpenChange?: (open: boolean) => void;
  /** How many rows the card is ruled into, 4 to 10. They share its height. @default 6 */
  rows?: number;
  /** The colour of the pad and of every new impression. @default "violet" */
  ink?: LibraryCardInk;
  /** How far a stamp may land off square, in degrees, 0 to 6. @default 3 */
  crooked?: number;
  /** Play the strike and the card. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* The desk, in px. The card column is fluid; everything else is fixed. */
const H = 220;
const TOOLS_W = 108;
const POCKET_H = 46;
/** Where the pocket's mouth is, from the top. */
const MOUTH = H - POCKET_H;
const CARD_TOP = 6;
const CARD_INSET = 8;
const CARD_H = 206;
const HEAD_H = 34;
/** How far down the card sits when it is in its pocket: only its head shows. */
const TUCK = MOUTH - HEAD_H - CARD_TOP;
const ROWS_TOP = HEAD_H + 3;
/** The rows stop short of the pocket's mouth, so every one can be stamped. */
const ROWS_H = MOUTH - CARD_TOP - 4 - ROWS_TOP;
/** Across the card, where a stamp's centre lands. */
const AIM_X = 0.44;
const STAMP_W = 64;
const STAMP_H = 40;
const STAMP_RIGHT = (TOOLS_W - STAMP_W) / 2;
const STAMP_TOP = 16;
/** The stamp's resting centre, from the desk's right edge and its top. */
const HOME_DX = STAMP_RIGHT + STAMP_W / 2;
const HOME_Y = STAMP_TOP + STAMP_H / 2;
const INK_USE = 0.21;
const INK_FLOOR = 0.12;

// Paper, kraft and wood are pigments: a token's hue at a fixed lightness, so
// the card is the same card on a light page and a dark one.
const PAPER = "oklch(from var(--warn) 0.965 0.02 h)";
const PAPER_EDGE = "oklch(from var(--warn) 0.8 0.035 h)";
const PRINT = "oklch(from var(--ink) 0.27 0.03 h)";
const PRINT_SOFT = "oklch(from var(--ink) 0.47 0.03 h)";
const RULE = "oklch(from var(--accent) 0.76 0.07 h)";
const MARGIN = "oklch(from var(--danger) 0.64 0.14 h)";
const KRAFT = "oklch(from var(--warn) 0.75 0.06 calc(h - 14))";
const KRAFT_EDGE = "oklch(from var(--warn) 0.6 0.06 calc(h - 14))";
const KRAFT_INK = "oklch(from var(--warn) 0.33 0.05 calc(h - 14))";
const ENDPAPER = "oklch(from var(--accent) 0.5 0.035 calc(h - 40))";
const SEAL = "oklch(from var(--accent) 0.6 0.035 calc(h - 40))";
const LINEN =
  "repeating-linear-gradient(0deg, color-mix(in oklab, white 5%, transparent) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, color-mix(in oklab, black 7%, transparent) 0 1px, transparent 1px 3px)";
const WOOD = "oklch(from var(--warn) 0.6 0.08 calc(h - 28))";
const WOOD_DARK = "oklch(from var(--warn) 0.46 0.07 calc(h - 28))";
const WOOD_LIGHT = "oklch(from var(--warn) 0.72 0.08 calc(h - 20))";

const INKS: Record<LibraryCardInk, string> = {
  violet: "oklch(from var(--accent) 0.46 0.17 calc(h + 42))",
  red: "oklch(from var(--danger) 0.52 0.19 h)",
  black: "oklch(from var(--ink) 0.25 0.015 h)",
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator: the same crooked stamp every time. */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Look = {
  /** The impression's turn, in degrees. */
  angle: number;
  /** How far off the row's aim it lands, in px. */
  dx: number;
  dy: number;
  /** The ink an earlier stamp (not made here) was printed with. */
  ink: number;
  seed: number;
};

/** A row's crookedness, seeded by the row and its date. */
function lookOf(index: number, date: string, crooked: number): Look {
  const seed = hash(`${index}|${date}`);
  const rand = lcg(seed);
  const a = rand() * 2 - 1;
  const b = rand() * 2 - 1;
  const c = rand() * 2 - 1;
  return {
    angle: r2(a * crooked),
    dx: r2(b * (2 + crooked * 0.9)),
    dy: r2(c * (0.3 + crooked * 0.12)),
    ink: r2(0.72 + rand() * 0.24),
    seed,
  };
}

const rowsText = (n: number) => (n === 1 ? "1 row" : `${n} rows`);

/**
 * One date, inked: the stamp's face is uneven, so a thin stamp leaves voids
 * in the letters (a seeded mask, more voids as the ink thins) and a little
 * spread beside them.
 */
function Impression({
  date,
  look,
  ink,
  rowH,
  maskId,
  fresh,
  motionSafe,
}: {
  date: string;
  look: Look;
  ink: number;
  rowH: number;
  maskId: string;
  fresh: boolean;
  motionSafe: boolean;
}) {
  const font = r2(clamp(rowH * 0.6, 7.5, 13));
  const w = r2(font * 7.8);
  const h = r2(font * 1.6);
  const length = r2(Math.min(w * 0.96, font * 0.68 * date.length));
  const rand = lcg(look.seed ^ 0x9e3779b9);
  const count = 2 + Math.round((1 - ink) * 18);
  const voids: { cx: number; cy: number; r: number }[] = [];
  for (let k = 0; k < count; k += 1) {
    voids.push({
      cx: r2(w * 0.04 + rand() * w * 0.92),
      cy: r2(h * 0.22 + rand() * h * 0.56),
      r: r2((0.3 + rand() * 0.75) * font * 0.13),
    });
  }
  const opacity = r2(0.3 + 0.62 * ink);
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute top-1/2 block"
      style={{
        left: `calc(${AIM_X * 100}% - ${r2(w / 2 - look.dx)}px)`,
        marginTop: r2(look.dy - h / 2),
        width: w,
        height: h,
        rotate: look.angle,
      }}
      initial={
        fresh
          ? motionSafe
            ? { opacity: 0, scale: 1.06 }
            : { opacity: 0 }
          : false
      }
      animate={{ opacity, scale: 1 }}
      transition={
        motionSafe
          ? { opacity: { duration: durations.blink }, scale: springs.flick }
          : { duration: durations.base, ease: easings.enter }
      }
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className="block overflow-visible"
      >
        <defs>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x={-w}
            y={-h}
            width={r2(w * 3)}
            height={r2(h * 3)}
          >
            <rect
              x={-w}
              y={-h}
              width={r2(w * 3)}
              height={r2(h * 3)}
              fill="white"
            />
            {voids.map((v, k) => (
              <circle key={k} cx={v.cx} cy={v.cy} r={v.r} fill="black" />
            ))}
          </mask>
        </defs>
        <g mask={`url(#${maskId})`} style={{ fill: "var(--lc-ink)" }}>
          <text
            x={r2(w / 2 + 0.5)}
            y={r2(h / 2)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={font}
            fontWeight={700}
            textLength={length}
            lengthAdjust="spacing"
            opacity={0.28}
            className="font-mono"
          >
            {date}
          </text>
          <text
            x={r2(w / 2)}
            y={r2(h / 2)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={font}
            fontWeight={700}
            textLength={length}
            lengthAdjust="spacing"
            className="font-mono"
          >
            {date}
          </text>
        </g>
      </svg>
    </motion.span>
  );
}

/** The stamp from above: a rubber rim that shows its ink, a mount, a knob. */
function StampArt({ rim }: { rim: MotionValue<number> }) {
  return (
    <svg
      aria-hidden
      width={STAMP_W}
      height={STAMP_H}
      viewBox={`0 0 ${STAMP_W} ${STAMP_H}`}
      className="block"
    >
      <motion.rect
        x={1}
        y={1}
        width={STAMP_W - 2}
        height={STAMP_H - 2}
        rx={5}
        style={{ fill: "var(--lc-ink)", opacity: rim }}
      />
      <rect
        x={4}
        y={4}
        width={STAMP_W - 8}
        height={STAMP_H - 8}
        rx={4}
        style={{ fill: WOOD, stroke: WOOD_DARK }}
        strokeWidth={1}
      />
      <g style={{ stroke: WOOD_DARK }} strokeWidth={0.8} fill="none">
        <path d="M 7 11 C 18 9.5 24 12.5 34 10.5 S 50 9 57 11" opacity={0.4} />
        <path d="M 7 28 C 16 29.5 27 27 38 29 S 51 30 57 28.5" opacity={0.4} />
        <path d="M 8 33 C 20 32 30 34 44 32.5" opacity={0.3} />
      </g>
      <circle
        cx={STAMP_W / 2}
        cy={STAMP_H / 2}
        r={11}
        style={{ fill: WOOD_LIGHT, stroke: WOOD_DARK }}
        strokeWidth={1}
      />
      <circle
        cx={STAMP_W / 2}
        cy={STAMP_H / 2}
        r={7.5}
        fill="none"
        style={{ stroke: WOOD_DARK }}
        strokeWidth={0.7}
        opacity={0.5}
      />
      <ellipse
        cx={STAMP_W / 2 - 3.5}
        cy={STAMP_H / 2 - 4}
        rx={4.2}
        ry={2.6}
        fill="white"
        opacity={0.38}
      />
    </svg>
  );
}

type Said = { n: number; count: number; open: boolean; text: string };

type Latest = {
  stamped: string[];
  rowsN: number;
  due: string;
  crooked: number;
  isOpen: boolean;
  controlled: boolean;
  controlledOpen: boolean;
  rowH: number;
};

type Api = {
  settleCard: (open: boolean, velocity?: number) => void;
  stamp: () => Promise<void>;
  reink: () => Promise<void>;
};

/**
 * A library book's date-due card in its pocket, with the date stamp and the
 * ink pad beside it. Drag the card up out of its pocket (it follows 1:1,
 * rubber-bands at the ends, and a release commits to the side the throw was
 * heading for on the glide spring), then press the stamp: it lifts off the
 * desk, glides over the next empty row turning to that row's seeded crooked
 * angle, strikes on an accelerating tween with a thud, and the date is inked
 * where it landed. The stamp can be dragged too — to the card to stamp, or to
 * the pad to re-ink.
 *
 * Every strike uses ink: the rim of the stamp thins, and each impression is
 * printed with the ink the stamp had — fainter, with more voids in the
 * letters — until the pad fills it again. The card, the stamp and the pad
 * are real buttons, so Enter or Space slides the card, stamps the next row
 * and re-inks, and every change is spoken once. Under reduced motion nothing
 * flies or bounces: the card jumps, and the date fades in where it lands.
 */
export function LibraryCard({
  title,
  author,
  callNumber,
  library = "Public Library",
  due,
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen = false,
  onOpenChange,
  rows = 6,
  ink = "violet",
  crooked = 3,
  sound = false,
  disabled = false,
  className,
}: LibraryCardProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const rowsId = `${uid}-rows`;
  const inkId = `${uid}-ink`;
  const hintId = `${uid}-hint`;

  const rowsN = Math.round(clamp(rows, 2, 12));
  const tilt = clamp(crooked, 0, 12);
  const rowH = r3(ROWS_H / rowsN);
  const inkColour = INKS[ink] ?? INKS.violet;

  const [own, setOwn] = React.useState<string[]>(() => defaultValue ?? []);
  const stamped = (value ?? own).slice(0, rowsN);
  const full = stamped.length >= rowsN;
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = open ?? ownOpen;

  const [inkPct, setInkPct] = React.useState(100);
  const [inks, setInks] = React.useState<Record<string, number>>({});
  const [fresh, setFresh] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);
  const [aim, setAim] = React.useState<"card" | "pad" | null>(null);

  const [said, setSaid] = React.useState<Said>({
    n: 0,
    count: stamped.length,
    open: isOpen,
    text: "",
  });
  if (said.count !== stamped.length || said.open !== isOpen) {
    let text: string;
    if (said.count !== stamped.length) {
      const last = stamped[stamped.length - 1];
      if (stamped.length > said.count && last) {
        text = `Stamped ${last} in row ${stamped.length} of ${rowsN}.${
          inkPct < 40 ? " The stamp is running dry." : ""
        }`;
      } else if (stamped.length === 0) {
        text = "A fresh card, no rows stamped.";
      } else {
        text = `${rowsText(stamped.length)} of ${rowsN} stamped.`;
      }
    } else {
      text = isOpen
        ? `Card out of its pocket. ${stamped.length} of ${rowsN} stamped.`
        : "Card back in its pocket.";
    }
    setSaid({ n: said.n + 1, count: stamped.length, open: isOpen, text });
  }
  const say = (text: string) => setSaid((s) => ({ ...s, n: s.n + 1, text }));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const columnRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const padRef = React.useRef<HTMLButtonElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef(new Set<number>());
  const token = React.useRef(0);
  const busy = React.useRef(false);
  const grabbed = React.useRef(false);
  /** Presses that arrived mid-flight, in order: each one still happens. */
  const queued = React.useRef<("stamp" | "reink")[]>([]);
  const dragging = React.useRef(false);
  const cardStart = React.useRef(0);
  const stampStart = React.useRef<Point>({ x: 0, y: 0 });
  const bounds = React.useRef({ x0: 0, x1: 0, y0: 0, y1: 0 });
  const aimed = React.useRef<"card" | "pad" | null>(null);
  const lastVelocity = React.useRef(0);
  const shownOpen = React.useRef(isOpen);
  const latest = React.useRef<Latest>({
    stamped,
    rowsN,
    due,
    crooked: tilt,
    isOpen,
    controlled: value !== undefined,
    controlledOpen: open !== undefined,
    rowH,
  });
  const api = React.useRef<Api | null>(null);

  const cardY = useMotionValue(isOpen ? 0 : TUCK);
  const jolt = useMotionValue(0);
  const sx = useMotionValue(0);
  const sy = useMotionValue(0);
  const rot = useMotionValue(0);
  /** How high the stamp is off the desk: 1 lifted, 0 resting, below 0 pressed. */
  const lift = useMotionValue(0);
  const dip = useMotionValue(1);
  const inkLeft = useMotionValue(1);
  const padPress = useMotionValue(0);

  const cardShift = useTransform(
    [cardY, jolt] as MotionValue<number>[],
    ([y = 0, j = 0]: number[]) => r2(y + j),
  );
  const stampScale = useTransform(lift, (l) => r3(1 + 0.12 * l));
  const shadowX = useTransform(
    [sx, lift] as MotionValue<number>[],
    ([x = 0, l = 0]: number[]) => r2(x + 1.5 + 7 * Math.max(0, l)),
  );
  const shadowY = useTransform(
    [sy, lift] as MotionValue<number>[],
    ([y = 0, l = 0]: number[]) => r2(y + 2.5 + 9 * Math.max(0, l)),
  );
  const shadowScale = useTransform(lift, (l) => r3(1 + 0.12 * Math.max(0, l)));
  const shadowOpacity = useTransform(lift, (l) =>
    r3(0.62 - 0.3 * Math.max(0, l)),
  );
  const rim = useTransform(inkLeft, (i) => r3(0.16 + 0.84 * i));
  const feltPress = useTransform(padPress, (p) => r3(p * 0.7));

  React.useEffect(() => {
    latest.current = {
      stamped,
      rowsN,
      due,
      crooked: tilt,
      isOpen,
      controlled: value !== undefined,
      controlledOpen: open !== undefined,
      rowH,
    };
  });

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
    return controls;
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };
  const done = (controls: AnimationPlaybackControls) =>
    new Promise<void>((resolve) => {
      controls.finished.then(
        () => resolve(),
        () => resolve(),
      );
    });
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = window.setTimeout(() => {
        timers.current.delete(t);
        resolve();
      }, ms);
      timers.current.add(t);
    });

  const panOf = (el: Element | null | undefined) => {
    const r = el?.getBoundingClientRect();
    return r ? panFrom(r.left + r.width / 2, null) : 0;
  };

  /* ------------------------------ geometry ------------------------------ */

  const homeCentre = (): Point => {
    const r = rootRef.current?.getBoundingClientRect();
    return r ? { x: r.right - HOME_DX, y: r.top + HOME_Y } : { x: 0, y: 0 };
  };
  const stampCentre = (): Point => {
    const h = homeCentre();
    return { x: h.x + sx.get(), y: h.y + sy.get() };
  };
  /** Where row `i`'s impression is centred, with the card all the way out. */
  const rowCentre = (i: number, look: Look): Point => {
    const col = columnRef.current?.getBoundingClientRect();
    if (!col) return homeCentre();
    const cardW = col.width - 2 * CARD_INSET;
    return {
      x: col.left + CARD_INSET + cardW * AIM_X + look.dx,
      y:
        col.top +
        CARD_TOP +
        ROWS_TOP +
        (i + 0.5) * latest.current.rowH +
        look.dy,
    };
  };
  const padCentre = (): Point => {
    const r = padRef.current?.getBoundingClientRect();
    return r
      ? { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      : homeCentre();
  };
  const offsetTo = (p: Point): Point => {
    const h = homeCentre();
    return { x: r2(p.x - h.x), y: r2(p.y - h.y) };
  };
  const inside = (p: Point, el: Element | null) => {
    const r = el?.getBoundingClientRect();
    return (
      !!r && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom
    );
  };

  /* -------------------------------- card -------------------------------- */

  const settleCard = (to: boolean, velocity = 0) => {
    const target = to ? 0 : TUCK;
    if (!motionSafe) {
      halt("card");
      cardY.set(target);
      return;
    }
    run("card", animate(cardY, target, { ...springs.glide, velocity }));
  };

  const openTo = (next: boolean, velocity = 0) => {
    const now = latest.current;
    if (next === now.isOpen) {
      settleCard(next, velocity);
      return;
    }
    audio.play("paper", {
      pitch: next ? 1.15 : 0.88,
      gain: 0.45,
      pan: panOf(cardRef.current),
    });
    if (now.controlledOpen) {
      // The host answers on its own schedule: the card goes back to where
      // the host says it is, and the effect below carries it once it agrees.
      lastVelocity.current = velocity;
      settleCard(now.isOpen, velocity);
    } else {
      shownOpen.current = next;
      setOwnOpen(next);
      settleCard(next, velocity);
    }
    onOpenChange?.(next);
  };

  /* -------------------------------- stamp ------------------------------- */

  const begin = () => {
    busy.current = true;
    setWorking(true);
    token.current += 1;
    return token.current;
  };
  const finish = () => {
    busy.current = false;
    setWorking(false);
    // A press that arrived mid-flight is not lost: it runs now.
    const next = queued.current.shift();
    if (next === "stamp") void api.current?.stamp();
    else if (next === "reink") void api.current?.reink();
  };

  /** True once `test` holds; false as soon as another sequence takes over. */
  const until = async (test: () => boolean, mine: number, limit = 900) => {
    for (let t = 0; t < limit && !test(); t += 16) {
      await sleep(16);
      if (mine !== token.current) return false;
    }
    return mine === token.current;
  };

  const fly = (to: Point, angle: number, velocity: Point = { x: 0, y: 0 }) => {
    run("sx", animate(sx, to.x, { ...springs.glide, velocity: velocity.x }));
    run("sy", animate(sy, to.y, { ...springs.glide, velocity: velocity.y }));
    run("rot", animate(rot, angle, springs.glide));
  };
  const near = (to: Point, angle: number, slack = 0.8) =>
    Math.abs(sx.get() - to.x) < slack &&
    Math.abs(sy.get() - to.y) < slack &&
    Math.abs(rot.get() - angle) < 0.4;

  const snapHome = () => {
    for (const key of ["sx", "sy", "rot", "lift"]) halt(key);
    sx.set(0);
    sy.set(0);
    rot.set(0);
    lift.set(0);
  };

  /** Back to its place on the desk, where it sets down. */
  const settleHome = async (mine: number, velocity?: Point) => {
    fly({ x: 0, y: 0 }, 0, velocity);
    if (!(await until(() => near({ x: 0, y: 0 }, 0, 1.5), mine))) return;
    // It lands back on the desk: the one place it is allowed to bounce.
    run("lift", animate(lift, 0, springs.recoil));
  };

  const home = (velocity?: Point) => {
    const mine = begin();
    if (!motionSafe) {
      snapHome();
      finish();
      return;
    }
    run("lift", animate(lift, 1, springs.snap));
    void settleHome(mine, velocity);
    finish();
  };

  /** The date goes onto the card: reported from the strike that made it. */
  const impact = (index: number, date: string, inkAt: number) => {
    const now = latest.current;
    if (now.stamped.length !== index) return;
    const next = [...now.stamped, date];
    const left = Math.max(INK_FLOOR, r2(inkAt - INK_USE));
    halt("ink");
    inkLeft.set(left);
    setInkPct(Math.round(left * 100));
    setInks((m) => ({ ...m, [`${index}|${date}`]: inkAt }));
    setFresh(`${index}|${date}`);
    if (!now.controlled) setOwn(next);
    onValueChange?.(next);
    audio.play("thud", {
      pitch: r2(lerp(1.28, 0.95, inkAt)),
      gain: r2(lerp(0.32, 0.68, inkAt)),
      pan: panOf(cardRef.current),
    });
    if (motionSafe) {
      jolt.set(1.2);
      run("jolt", animate(jolt, 0, springs.flick));
    }
  };

  const refuse = () => {
    say(`The card is full: all ${rowsText(latest.current.rowsN)} are stamped.`);
    if (!motionSafe) return;
    lift.set(0.45);
    run("lift", animate(lift, 0, springs.recoil));
  };

  const stamp = async (velocity?: Point, dropped = false) => {
    if (disabled) return;
    if (busy.current && !dropped) {
      if (queued.current.length < 4) queued.current.push("stamp");
      return;
    }
    const now = latest.current;
    const index = now.stamped.length;
    if (index >= now.rowsN) {
      if (dropped) home(velocity);
      else refuse();
      return;
    }
    const mine = begin();
    const date = now.due;
    const look = lookOf(index, date, now.crooked);
    const inkAt = inkLeft.get();
    if (!now.isOpen) openTo(true);
    if (!motionSafe) {
      snapHome();
      impact(index, date, inkAt);
      run(
        "dip",
        animate(dip, [1, 0.5, 1], {
          duration: durations.slow,
          ease: easings.move,
        }),
      );
      finish();
      return;
    }
    run("lift", animate(lift, 1, springs.snap));
    const to = offsetTo(rowCentre(index, look));
    fly(to, look.angle, velocity);
    // Over its row, the stamp waits for the card to finish coming out.
    const ready = await until(
      () => near(to, look.angle) && Math.abs(cardY.get()) < 0.75,
      mine,
    );
    if (!ready) return;
    if (!latest.current.isOpen) {
      // The host kept the card in its pocket: nothing to stamp on.
      queued.current = [];
      home();
      return;
    }
    // A strike falls: an accelerating ease, never a spring, onto the paper.
    await done(
      run("lift", animate(lift, -0.25, { duration: 0.08, ease: easings.exit })),
    );
    if (mine !== token.current) return;
    impact(index, date, inkAt);
    await sleep(120);
    if (mine !== token.current) return;
    run("lift", animate(lift, 1, springs.snap));
    await sleep(60);
    if (mine !== token.current) return;
    void settleHome(mine);
    finish();
  };

  const reink = async (velocity?: Point, dropped = false) => {
    if (disabled) return;
    if (busy.current && !dropped) {
      if (queued.current.length < 4) queued.current.push("reink");
      return;
    }
    const mine = begin();
    const pan = panOf(padRef.current);
    const press = () => {
      padPress.set(1);
      run(
        "pad",
        animate(padPress, 0, { duration: durations.slow, ease: easings.enter }),
      );
    };
    const refill = () => {
      run(
        "ink",
        animate(inkLeft, 1, { duration: durations.base, ease: easings.enter }),
      );
      setInkPct(100);
      say("Stamp re-inked.");
    };
    if (!motionSafe) {
      snapHome();
      press();
      refill();
      audio.play("thud", { pitch: 1.6, gain: 0.22, pan });
      finish();
      return;
    }
    run("lift", animate(lift, 1, springs.snap));
    const to = offsetTo(padCentre());
    fly(to, 0, velocity);
    if (!(await until(() => near(to, 0), mine))) return;
    for (let k = 0; k < 2; k += 1) {
      await done(
        run(
          "lift",
          animate(lift, -0.2, { duration: 0.07, ease: easings.exit }),
        ),
      );
      if (mine !== token.current) return;
      audio.play("thud", { pitch: r2(1.55 + k * 0.12), gain: 0.22, pan });
      press();
      if (k === 1) refill();
      run("lift", animate(lift, k === 0 ? 0.45 : 1, springs.snap));
      await sleep(k === 0 ? 120 : 60);
      if (mine !== token.current) return;
    }
    void settleHome(mine);
    finish();
  };

  React.useEffect(() => {
    api.current = { settleCard, stamp, reink };
  });

  // What the host says about the pocket: a press's own report is already
  // moving; anything else (a refusal, a reset) moves the card now.
  React.useEffect(() => {
    if (shownOpen.current === isOpen) return;
    shownOpen.current = isOpen;
    if (!dragging.current)
      api.current?.settleCard(isOpen, lastVelocity.current);
    lastVelocity.current = 0;
  }, [isOpen]);

  // Disabled mid-flight: the stamp goes straight home and the card to its side.
  React.useEffect(() => {
    if (!disabled) return;
    token.current += 1;
    for (const c of anims.current.values()) c.stop();
    anims.current.clear();
    sx.set(0);
    sy.set(0);
    rot.set(0);
    lift.set(0);
    busy.current = false;
    grabbed.current = false;
    queued.current = [];
  }, [disabled, sx, sy, rot, lift]);

  React.useEffect(() => {
    const running = anims.current;
    const waiting = timers.current;
    return () => {
      token.current += 1;
      for (const c of running.values()) c.stop();
      running.clear();
      for (const t of waiting) window.clearTimeout(t);
      waiting.clear();
      busy.current = false;
      queued.current = [];
    };
  }, []);

  /* ------------------------------ gestures ------------------------------ */

  const cardDrag = useDrag({
    axis: "y",
    threshold: 4,
    disabled: disabled || working,
    onStart: () => {
      dragging.current = true;
      halt("card");
      cardStart.current = cardY.get();
      audio.play("paper", {
        pitch: 1.25,
        gain: 0.18,
        pan: panOf(cardRef.current),
      });
    },
    onMove: ({ offset }) => {
      cardY.set(r2(rubberClamp(cardStart.current + offset.y, 0, TUCK, TUCK)));
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const landing = project(cardY.get(), velocity.y, 0.99);
      openTo(landing < TUCK / 2, velocity.y);
    },
    onCancel: () => {
      dragging.current = false;
      settleCard(latest.current.isOpen);
    },
    onTap: () => {
      if (!busy.current) openTo(!latest.current.isOpen);
    },
  });

  const stampDrag = useDrag({
    threshold: 4,
    disabled,
    onStart: () => {
      if (busy.current) {
        grabbed.current = false;
        return;
      }
      grabbed.current = true;
      queued.current = [];
      begin();
      for (const key of ["sx", "sy", "rot"]) halt(key);
      stampStart.current = { x: sx.get(), y: sy.get() };
      const root = rootRef.current?.getBoundingClientRect();
      const h = homeCentre();
      if (root) {
        bounds.current = {
          x0: root.left + STAMP_W / 2 - h.x,
          x1: root.right - STAMP_W / 2 - h.x,
          y0: root.top + STAMP_H / 2 - h.y,
          y1: root.bottom - STAMP_H / 2 - h.y,
        };
      }
      if (motionSafe) run("lift", animate(lift, 1, springs.snap));
    },
    onMove: ({ offset }) => {
      if (!grabbed.current) return;
      const b = bounds.current;
      sx.set(
        r2(rubberClamp(stampStart.current.x + offset.x, b.x0, b.x1, STAMP_W)),
      );
      sy.set(
        r2(rubberClamp(stampStart.current.y + offset.y, b.y0, b.y1, STAMP_H)),
      );
      const c = stampCentre();
      const over = inside(c, columnRef.current)
        ? "card"
        : inside(c, padRef.current)
          ? "pad"
          : null;
      if (over !== aimed.current) {
        aimed.current = over;
        setAim(over);
      }
    },
    onEnd: ({ velocity }) => {
      if (!grabbed.current) return;
      grabbed.current = false;
      aimed.current = null;
      setAim(null);
      const c = stampCentre();
      if (inside(c, columnRef.current)) void stamp(velocity, true);
      else if (inside(c, padRef.current)) void reink(velocity, true);
      else home(velocity);
    },
    onCancel: () => {
      if (!grabbed.current) return;
      grabbed.current = false;
      aimed.current = null;
      setAim(null);
      home();
    },
    onTap: () => void stamp(),
  });

  /* ------------------------------- render ------------------------------- */

  const nextLook = full ? null : lookOf(stamped.length, due, tilt);
  const initials = library
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
  const guideW = r2(clamp(rowH * 0.6, 7.5, 13) * 7.2);
  const stampName = full
    ? `The card is full: all ${rowsText(rowsN)} are stamped`
    : `Stamp ${due} in row ${stamped.length + 1}`;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={`Date-due card: ${title}`}
      className={cn(
        "relative grid w-full max-w-[22.5rem] grid-cols-[minmax(0,1fr)_6.75rem] gap-3 select-none",
        disabled && "opacity-50",
        className,
      )}
      style={{ height: H, ["--lc-ink" as string]: inkColour }}
    >
      {/* The card and its pocket. */}
      <div
        ref={columnRef}
        className="relative h-full overflow-clip rounded-2"
        style={{
          backgroundColor: ENDPAPER,
          backgroundImage: LINEN,
        }}
      >
        {/* The inside of the back cover: cloth, with the library's seal
            pressed into it where the card stands when it is out. */}
        <span
          aria-hidden
          className="absolute top-5 left-1/2 flex size-14 -translate-x-1/2 items-center justify-center rounded-full font-mono text-[11px] font-semibold tracking-[0.14em]"
          style={{
            color: SEAL,
            boxShadow: `inset 0 0 0 1.5px ${SEAL}, inset 0 0 0 4px ${ENDPAPER}, inset 0 0 0 5px ${SEAL}`,
          }}
        >
          {initials}
        </span>
        <motion.div
          ref={cardRef}
          {...cardDrag}
          className={cn(
            "absolute touch-pan-x rounded-1 print:transform-none!",
            disabled
              ? "cursor-not-allowed"
              : "cursor-grab active:cursor-grabbing",
          )}
          style={{
            left: CARD_INSET,
            right: CARD_INSET,
            top: CARD_TOP,
            height: CARD_H,
            y: cardShift,
            background: PAPER,
            boxShadow: `0 0 0 1px ${PAPER_EDGE}, 0 1px 2px color-mix(in oklab, black 16%, transparent)`,
          }}
        >
          <button
            type="button"
            aria-label="Date-due card"
            aria-expanded={isOpen}
            aria-controls={rowsId}
            aria-describedby={hintId}
            disabled={disabled}
            onClick={(event) => {
              // Pointer presses arrive through the card's drag as a tap; a
              // click with no pointer behind it is Space, Enter or assistive
              // technology, and slides the card the same way.
              if (event.detail === 0 && !busy.current) openTo(!isOpen);
            }}
            className={cn(
              "block w-full rounded-t-1 px-2.5 pt-1.5 text-left outline-none",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              disabled ? "cursor-not-allowed" : "cursor-[inherit]",
            )}
            style={{ height: HEAD_H }}
          >
            <span
              className="block truncate text-[12px] leading-4 font-semibold"
              style={{ color: PRINT }}
              title={title}
            >
              {title}
            </span>
            <span
              className="flex gap-2 font-mono text-[10px] leading-3.5"
              style={{ color: PRINT_SOFT }}
            >
              {author ? (
                <span className="min-w-0 truncate" title={author}>
                  {author}
                </span>
              ) : null}
              {callNumber ? (
                <span className="ml-auto shrink-0 tabular-nums">
                  {callNumber}
                </span>
              ) : null}
            </span>
          </button>
          <span
            aria-hidden
            className="absolute inset-x-0 block"
            style={{
              top: HEAD_H,
              height: 3,
              borderTop: `1px solid ${MARGIN}`,
              borderBottom: `1px solid ${MARGIN}`,
            }}
          />
          <span
            aria-hidden
            className="absolute block w-px"
            style={{
              left: 14,
              top: HEAD_H + 3,
              bottom: 0,
              background: MARGIN,
              opacity: 0.55,
            }}
          />
          <span
            aria-hidden
            className="absolute inset-x-0 block"
            style={{
              top: ROWS_TOP,
              height: ROWS_H,
              backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${r3(rowH - 1)}px, ${RULE} ${r3(rowH - 1)}px ${rowH}px)`,
            }}
          />
          {aim === "card" && nextLook ? (
            <span
              aria-hidden
              className="absolute block rounded-1 border border-dashed"
              style={{
                left: `calc(${AIM_X * 100}% - ${r2(guideW / 2)}px)`,
                top: r2(ROWS_TOP + stamped.length * rowH + 1),
                width: guideW,
                height: r2(rowH - 2),
                borderColor:
                  "color-mix(in oklab, var(--lc-ink) 45%, transparent)",
              }}
            />
          ) : null}
          <ol
            id={rowsId}
            aria-label="Date due"
            aria-hidden={!isOpen || undefined}
            className="absolute inset-x-0"
            style={{ top: ROWS_TOP, height: ROWS_H }}
          >
            {stamped.map((date, i) => {
              const look = lookOf(i, date, tilt);
              const key = `${i}|${date}`;
              return (
                <li
                  key={key}
                  className="absolute inset-x-0"
                  style={{ top: r3(i * rowH), height: rowH }}
                >
                  <span className="sr-only">{date}</span>
                  <Impression
                    date={date}
                    look={look}
                    ink={inks[key] ?? look.ink}
                    rowH={rowH}
                    maskId={`${uid}-v${i}`}
                    fresh={fresh === key}
                    motionSafe={motionSafe}
                  />
                </li>
              );
            })}
          </ol>
        </motion.div>

        {/* The pocket's lip throws a little shade onto the card. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 block"
          style={{
            top: MOUTH - 7,
            height: 7,
            background:
              "linear-gradient(to bottom, transparent, color-mix(in oklab, black 14%, transparent))",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end gap-0.5 rounded-b-2 pb-1.5"
          style={{
            height: POCKET_H,
            background: `linear-gradient(to bottom, color-mix(in oklab, ${KRAFT} 92%, white), ${KRAFT} 30%)`,
            boxShadow: `inset 0 0 0 1px ${KRAFT_EDGE}`,
            color: KRAFT_INK,
            maskImage:
              "radial-gradient(circle at 50% 0, transparent 11px, black 11.5px)",
            WebkitMaskImage:
              "radial-gradient(circle at 50% 0, transparent 11px, black 11.5px)",
          }}
        >
          <span className="max-w-full truncate px-2 text-[10px] leading-3.5 font-semibold tracking-[0.12em] uppercase">
            {library}
          </span>
          <span className="font-mono text-[10px] leading-3 tracking-[0.06em] uppercase opacity-80">
            Return by last date
          </span>
        </div>
      </div>

      {/* The tools: the stamp's place, what it is set to, and the pad. */}
      <div className="relative h-full">
        <p
          className="absolute inset-x-0 text-center"
          style={{ top: STAMP_TOP + STAMP_H + 12 }}
        >
          <span className="block text-[10px] leading-3.5 text-ink-3">
            Set to
          </span>
          <span className="block font-mono text-[11px] leading-4 text-foreground tabular-nums">
            {due}
          </span>
        </p>
        <button
          ref={padRef}
          type="button"
          aria-label="Re-ink the stamp"
          disabled={disabled}
          onClick={() => void reink()}
          className={cn(
            "absolute bottom-3.5 left-1/2 h-16 w-[100px] -translate-x-1/2 touch-manipulation rounded-2 border bg-surface-2 p-1.5 outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            aim === "pad" ? "border-cobalt-bright" : "border-hairline-strong",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
        >
          <span
            aria-hidden
            className="relative block h-full w-full overflow-clip rounded-1"
            style={{
              background: "color-mix(in oklab, var(--lc-ink) 72%, black)",
            }}
          >
            <span
              className="absolute inset-0 block"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(115deg, color-mix(in oklab, white 7%, transparent) 0 1px, transparent 1px 4px), linear-gradient(160deg, color-mix(in oklab, white 16%, transparent), transparent 55%)",
              }}
            />
            <motion.span
              className="absolute top-1/2 left-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-1"
              style={{
                width: STAMP_W - 8,
                height: STAMP_H - 8,
                background: "color-mix(in oklab, var(--lc-ink) 45%, black)",
                opacity: feltPress,
              }}
            />
          </span>
        </button>
      </div>

      {/* The stamp travels over everything, so it lives on the desk itself. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute z-10 block"
        style={{
          right: STAMP_RIGHT - 8,
          top: STAMP_TOP - 8,
          width: STAMP_W + 16,
          height: STAMP_H + 16,
          x: shadowX,
          y: shadowY,
          scale: shadowScale,
          rotate: rot,
          opacity: shadowOpacity,
          background:
            "radial-gradient(closest-side, color-mix(in oklab, black 34%, transparent), transparent)",
        }}
      />
      <motion.button
        type="button"
        aria-label={stampName}
        aria-describedby={`${inkId} ${hintId}`}
        disabled={disabled}
        onClick={(event) => {
          if (event.detail === 0) void stamp();
        }}
        {...stampDrag}
        className={cn(
          "absolute z-20 block touch-none rounded-2 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab active:cursor-grabbing",
        )}
        style={{
          right: STAMP_RIGHT,
          top: STAMP_TOP,
          width: STAMP_W,
          height: STAMP_H,
          x: sx,
          y: sy,
          rotate: rot,
          scale: stampScale,
          opacity: dip,
        }}
      >
        <StampArt rim={rim} />
      </motion.button>

      <span id={inkId} className="sr-only">
        Ink {inkPct}%.
      </span>
      <span id={hintId} className="sr-only">
        Drag the card up out of its pocket. Drag the stamp onto the card to
        stamp the next row, or onto the pad to re-ink it.
      </span>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
