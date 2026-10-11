"use client";

import * as React from "react";

import { motion, motionValue, type MotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type NotepadFlipBinding = "spiral" | "wire" | "glue";

export type NotepadFlipPaper = "white" | "legal" | "steno" | "kraft";

export type NotepadFlipProps = {
  /** One line per sheet, the top sheet first. */
  lines: string[];
  /** The pad's accessible name. @default "Notepad" */
  label?: string;
  /** Controlled: the index of the sheet showing (how many are turned). */
  value?: number;
  /** Initial sheet when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the scroll, drag, tap or key that turned to a new sheet. */
  onValueChange?: (index: number) => void;
  /** How the sheets are bound along the top. @default "spiral" */
  binding?: NotepadFlipBinding;
  /** Where a turned sheet comes to rest over the binding, degrees: under 180 the pile stands up, over 180 it leans away behind the pad. @default 190 */
  flipAngle?: number;
  /** The paper stock, with its ruling. @default "legal" */
  paperTone?: NotepadFlipPaper;
  /** How far the pad lies back on the desk, degrees. @default 24 */
  tilt?: number;
  /** How far a turning sheet's free half bends behind it, 0 to 1. @default 0.5 */
  curl?: number;
  /** How dark a lifted sheet's shadow falls on the next line, 0 to 1. @default 0.6 */
  shadow?: number;
  /** Scroll distance that turns one sheet, px. @default 90 */
  step?: number;
  /** Draw the blue rule under the words and the red margin line. @default true */
  ruled?: boolean;
  /** The colour of the writing, any CSS colour. @default a navy ballpoint */
  ink?: string;
  /** Scrolling, dragging, tapping and the keys turn the sheets. @default true */
  interactive?: boolean;
  /** Paper sounds for the turns the visitor makes. Off unless asked for. @default false */
  sound?: boolean;
  /** Shows the pad as it is; nothing turns it. @default false */
  disabled?: boolean;
  /** Size the pad with font-size: it is drawn in em. */
  className?: string;
};

/** A sheet's height, em. */
const H = 2.4;
/**
 * Perspective distance, em. It is applied along the pad's own normal, after
 * the turn and before the tilt, so a sheet lying on the pad is drawn without
 * the lean a page-wide vanishing point would give its writing, and only a
 * sheet in the air comes toward the eye.
 */
const P = 18;
/** How far, as a share of the pad's width, a sheet pointing at the eye widens past it. */
const WIDEN = 1 / (1 - H / P) - 1;
/** The pad's side margins, %, so that widening stays inside the box. */
const INSET = Math.ceil((WIDEN / (1 + WIDEN)) * 1000) / 20;
/** How fast the shown sheets may follow a jump in the scroll, sheets per second. */
const ORDER_RATE = 14;
/** Seconds per integration step. */
const STEP = 1 / 240;
/** The upper half overlaps the lower by this much, em, so no hairline shows between them. */
const SEAM = 0.04;
/** Where the upper half's back mirrors its writing about: the middle of its window. */
const MIRROR_A = `50% ${Math.round(((H / 2 + SEAM) / 2 / H) * 10000) / 100}%`;
/** A sheet the pointer hovers over lifts this far, degrees. */
const PEEK = 7;

type Stock = {
  paper: string;
  back: string;
  rule: string;
  margin: string;
  edge: string;
};

// Paper is pigment: the same stock in either theme, pulled a few per cent
// toward the page so a dark page does not glare round it.
const STOCKS: Record<NotepadFlipPaper, Stock> = {
  white: {
    paper: "oklch(0.975 0.004 95)",
    back: "oklch(0.935 0.005 95)",
    rule: "oklch(0.7 0.08 240 / 0.55)",
    margin: "oklch(0.64 0.16 22 / 0.6)",
    edge: "oklch(0.88 0.006 95)",
  },
  legal: {
    paper: "oklch(0.955 0.075 102)",
    back: "oklch(0.915 0.065 100)",
    rule: "oklch(0.66 0.08 235 / 0.5)",
    margin: "oklch(0.6 0.17 22 / 0.65)",
    edge: "oklch(0.86 0.07 100)",
  },
  steno: {
    paper: "oklch(0.945 0.045 150)",
    back: "oklch(0.905 0.04 150)",
    rule: "oklch(0.62 0.06 160 / 0.5)",
    margin: "oklch(0.6 0.12 30 / 0.5)",
    edge: "oklch(0.85 0.04 150)",
  },
  kraft: {
    paper: "oklch(0.79 0.06 72)",
    back: "oklch(0.745 0.055 70)",
    rule: "oklch(0.48 0.05 60 / 0.45)",
    margin: "oklch(0.5 0.12 30 / 0.55)",
    edge: "oklch(0.69 0.055 68)",
  },
};

const INK = "oklch(0.33 0.09 262)";
const BOARD = "oklch(0.5 0.035 68)";

/** Paper grain as an SVG noise tile: fixed art, the same in both themes. */
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.3 0 0 0 0 0.26 0 0 0 0 0.2 0 0 0 -1.2 0.5'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`;

const svgTile = (body: string, w: number, h: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'>${body}</svg>`,
  )}")`;

// Bindings are fixed art: a dark helix through round holes, a twin-loop wire
// through square ones, or a gummed strip. One tile per coil, repeated with
// `space` so the coils fall evenly whatever the pad's width.
const BINDINGS: Record<
  NotepadFlipBinding,
  { tile: string; size: string; band: boolean }
> = {
  spiral: {
    tile: svgTile(
      "<ellipse cx='27' cy='73' rx='8.5' ry='4.6' fill='oklch(0.22 0.02 260 / 0.85)'/>" +
        "<path d='M33 8 C50 5 56 32 49 61' fill='none' stroke='oklch(0.34 0.01 260)' stroke-width='6' stroke-linecap='round'/>" +
        "<path d='M23 74 C10 50 13 11 33 8' fill='none' stroke='oklch(0.5 0.012 260)' stroke-width='7' stroke-linecap='round'/>" +
        "<path d='M17 58 C13 38 16 19 28 13' fill='none' stroke='oklch(0.92 0.006 260)' stroke-width='2.2' stroke-linecap='round' opacity='0.9'/>" +
        "<path d='M45 20 C49 30 49 44 47 56' fill='none' stroke='oklch(0.7 0.008 260)' stroke-width='1.4' stroke-linecap='round' opacity='0.6'/>",
      64,
      96,
    ),
    size: "0.64em 0.96em",
    band: false,
  },
  wire: {
    tile: svgTile(
      "<rect x='11' y='68' width='18' height='8' rx='1.5' fill='oklch(0.22 0.02 260 / 0.8)'/>" +
        "<path d='M14 72 C10 42 13 18 17 16 C21 15 23 34 22 61' fill='none' stroke='oklch(0.6 0.006 260)' stroke-width='3' stroke-linecap='round'/>" +
        "<path d='M22 72 C18 42 21 18 25 16 C29 15 31 34 30 61' fill='none' stroke='oklch(0.6 0.006 260)' stroke-width='3' stroke-linecap='round'/>" +
        "<path d='M13 56 C11 40 13 24 16 19' fill='none' stroke='oklch(0.93 0.004 260)' stroke-width='1.1' stroke-linecap='round'/>",
      40,
      96,
    ),
    size: "0.4em 0.96em",
    band: false,
  },
  glue: { tile: "none", size: "auto", band: true },
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const rad = (deg: number) => (deg * Math.PI) / 180;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/**
 * A scroll is not a user activation: a sound asked for before the page has
 * had a click, tap or key would only make a context the browser will not start.
 */
const activated = (fallback: boolean) =>
  typeof navigator !== "undefined" &&
  ((navigator as { userActivation?: { hasBeenActive: boolean } }).userActivation
    ?.hasBeenActive ??
    fallback);

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

/** How much of the top-front light a face takes, from its angle off the screen's downward axis. */
const lightOn = (phi: number) =>
  0.6 * Math.sin(rad(phi)) + 0.8 * Math.cos(rad(phi));

/** The highest a turning sheet reaches above the hinge, em, for a tilt. */
function roomAbove(tilt: number): number {
  let top = 0;
  const ct = Math.cos(rad(tilt));
  const st = Math.sin(rad(tilt));
  for (let deg = 0; deg <= 250; deg += 2) {
    const y = H * Math.cos(rad(deg));
    const z = H * Math.sin(rad(deg));
    top = Math.max(top, -(y * ct - z * st) / (1 - z / P));
  }
  return Math.ceil((top + 0.16) * 100) / 100;
}

type Pose = {
  turn: string;
  bend: string;
  z: number;
  frontA: number;
  frontB: number;
  backA: number;
  backB: number;
};

/** Everything drawn for one sheet, from its angle, its curl and the pad's tilt. */
function poseOf(i: number, a: number, c: number, tilt: number): Pose {
  const rest = lightOn(tilt);
  const phiA = tilt + a;
  const phiB = phiA + c;
  // Paper is translucent and takes bounce light from the desk, so even its
  // underside never goes darker than about a third.
  const front = (phi: number) =>
    r3(Math.min(0.34, clamp01((rest - Math.max(0, lightOn(phi))) * 0.42)));
  const back = (phi: number) =>
    r3(Math.min(0.34, clamp01((rest - Math.max(0, -lightOn(phi))) * 0.42)));
  return {
    turn: `rotateX(${r2(tilt)}deg) perspective(${P}em) rotateX(${r2(a)}deg)`,
    bend: `rotateX(${r2(c)}deg)`,
    // A sheet in the air or over the binding is drawn above every sheet still
    // in the pile, the most recently turned on top; the pile itself stacks
    // first sheet uppermost.
    z: a > 0.4 ? 100 + i : 50 - i,
    frontA: front(phiA),
    frontB: front(phiB),
    backA: back(phiA),
    backB: back(phiB),
  };
}

/** The shadow a sheet lifted to `a` throws on the line below it. */
function shadowOf(a: number, strength: number) {
  const lift = clamp01(a / 150);
  return {
    opacity: a >= 150 ? 0 : r3(strength * 0.5 * Math.sin(Math.PI * lift)),
    image: `linear-gradient(to bottom, oklch(0.2 0.02 60), transparent ${Math.round(18 + 72 * clamp01(a / 80))}%)`,
  };
}

type Cell = {
  turn: MotionValue<string>;
  bend: MotionValue<string>;
  z: MotionValue<number>;
  frontA: MotionValue<number>;
  frontB: MotionValue<number>;
  backA: MotionValue<number>;
  backB: MotionValue<number>;
  shade: MotionValue<number>;
  reach: MotionValue<string>;
  fade: MotionValue<number>;
};

/** Where a turned sheet rests: each one a little nearer than the last, a fanned pile. */
const restOf = (flip: number, i: number) =>
  clamp(flip, 140, 240) - 0.9 * Math.min(i, 8);

function cellsOf(
  n: number,
  index: number,
  flip: number,
  tilt: number,
  strength: number,
): Cell[] {
  const angles = Array.from({ length: n }, (_, i) =>
    i < index ? restOf(flip, i) : 0,
  );
  return angles.map((a, i) => {
    const pose = poseOf(i, a, 0, tilt);
    const above = shadowOf(i > 0 ? (angles[i - 1] ?? 0) : 0, strength);
    return {
      turn: motionValue(pose.turn),
      bend: motionValue(pose.bend),
      z: motionValue(pose.z),
      frontA: motionValue(pose.frontA),
      frontB: motionValue(pose.frontB),
      backA: motionValue(pose.backA),
      backB: motionValue(pose.backB),
      shade: motionValue(above.opacity),
      reach: motionValue(above.image),
      fade: motionValue(1),
    };
  });
}

type Body = {
  /** Scroll progress in sheets, read from the scroller. */
  p: number;
  /** The progress the sheets are shown at: it chases p, in order. */
  q: number;
  a: Float64Array;
  v: Float64Array;
  c: Float64Array;
  cv: Float64Array;
  /** Reduced motion: each sheet's shown angle and its cross-fade. */
  shown: Float64Array;
  fade: Float64Array;
  /** Which side of upright each sheet was on, for the crinkle. */
  side: Uint8Array;
  hover: boolean;
  focus: boolean;
  /** The last turn came from the visitor's own scroll, drag, tap or key. */
  visitor: boolean;
  pressed: boolean;
};

const bodyOf = (n: number, index: number, flip: number): Body => {
  const a = new Float64Array(n);
  for (let i = 0; i < Math.min(index, n); i += 1) a[i] = restOf(flip, i);
  return {
    p: index,
    q: index,
    a,
    v: new Float64Array(n),
    c: new Float64Array(n),
    cv: new Float64Array(n),
    shown: Float64Array.from(a),
    fade: new Float64Array(n).fill(1),
    side: Uint8Array.from(a, (x) => (x > 90 ? 1 : 0)),
    hover: false,
    focus: false,
    visitor: false,
    pressed: false,
  };
};

/** One printed side of a sheet, full height; a face's window shows half of it. */
function Print({
  line,
  fit,
  stock,
  paper,
  ruled,
  ink,
  back,
}: {
  line: string;
  fit: number;
  stock: Stock;
  paper: string;
  ruled: boolean;
  ink: string;
  back: boolean;
}) {
  // The back is the same paper a shade greyer, with the front's writing and
  // ruling showing through faintly.
  return (
    <span
      className="absolute inset-x-0 top-0 block"
      style={{
        height: `${H}em`,
        backgroundColor: paper,
        backgroundImage: GRAIN,
        backgroundSize: "150px 150px",
      }}
    >
      {ruled ? (
        <>
          <span
            className="absolute inset-x-0 block"
            style={{
              top: "1.72em",
              height: "0.05em",
              background: stock.rule,
              opacity: back ? 0.3 : 1,
            }}
          />
          <span
            className="absolute inset-y-0 block"
            style={{
              left: "1.02em",
              width: "0.05em",
              background: stock.margin,
              opacity: back ? 0.3 : 1,
            }}
          />
        </>
      ) : null}
      <span
        className="absolute block font-medium whitespace-nowrap"
        style={{
          left: ruled ? "1.42em" : "0.9em",
          top: "0.6em",
          lineHeight: "1.2em",
          color: ink,
          opacity: back ? 0.08 : 1,
          transform: fit < 1 ? `scale(${fit})` : undefined,
          transformOrigin: "0 75%",
        }}
      >
        {line}
      </span>
    </span>
  );
}

function Sheet({
  line,
  fit,
  stock,
  paper,
  backPaper,
  ruled,
  ink,
  cell,
  top,
}: {
  line: string;
  fit: number;
  stock: Stock;
  paper: string;
  backPaper: string;
  ruled: boolean;
  ink: string;
  cell: Cell;
  top: number;
}) {
  const face = (half: "a" | "b", back: boolean) => (
    <span
      className="absolute inset-0 block overflow-hidden [backface-visibility:hidden]"
      style={back ? { transform: "rotateX(180deg)" } : undefined}
    >
      <span
        className="absolute inset-x-0 block"
        style={{
          top: half === "a" ? 0 : `${-H / 2}em`,
          height: `${H}em`,
          // Seen from behind after turning over the top, the writing shows
          // through upside down: a vertical mirror about the window's middle.
          transform: back ? "scaleY(-1)" : undefined,
          transformOrigin: back
            ? half === "a"
              ? MIRROR_A
              : "50% 75%"
            : undefined,
        }}
      >
        <Print
          line={line}
          fit={fit}
          stock={stock}
          paper={back ? backPaper : paper}
          ruled={ruled}
          ink={ink}
          back={back}
        />
        {back ? null : (
          <motion.span
            className="absolute inset-0 block"
            style={{ opacity: cell.shade, backgroundImage: cell.reach }}
          />
        )}
      </span>
      <motion.span
        className="absolute inset-0 block bg-[oklch(0.18_0.02_60)]"
        style={{
          opacity: back
            ? half === "a"
              ? cell.backA
              : cell.backB
            : half === "a"
              ? cell.frontA
              : cell.frontB,
        }}
      />
    </span>
  );

  return (
    <motion.span
      className="absolute inset-x-0 block [transform-style:preserve-3d]"
      style={{
        top: `${top}em`,
        height: `${H}em`,
        transform: cell.turn,
        transformOrigin: "50% 0",
        zIndex: cell.z,
        opacity: cell.fade,
      }}
    >
      <span
        className="absolute inset-x-0 top-0 block [transform-style:preserve-3d]"
        style={{ height: `${H / 2 + SEAM}em` }}
      >
        {face("a", false)}
        {face("a", true)}
      </span>
      <motion.span
        className="absolute inset-x-0 block [transform-style:preserve-3d]"
        style={{
          top: `${H / 2}em`,
          height: `${H / 2}em`,
          transform: cell.bend,
          transformOrigin: "50% 0",
        }}
      >
        {face("b", false)}
        {face("b", true)}
      </motion.span>
    </motion.span>
  );
}

type Api = {
  wake: () => void;
  halt: () => void;
  goTo: (index: number, visitor: boolean) => void;
  fitLines: () => void;
};

/**
 * A top-bound reporter's pad lying on the desk, seen from the front and a
 * little above, every line of text its own sheet. Scroll over it and the top
 * sheet peels up off the pile, turns over the binding — curling as it goes,
 * its lower half lagging on the air — and comes to rest on the turned pile
 * above the spiral, its back showing the writing through; its shadow sweeps
 * down the next line as it lifts. Scroll back and the sheets fall back down
 * in order.
 *
 * The pad is a real scroll region (a transparent native scroller over it,
 * `step` px per sheet, snapping to whole sheets), so wheel, trackpad and touch
 * all turn it and the page takes the scroll back at either end. Each sheet's
 * angle is a spring toward the scroll: it rises on the snap calibration (one
 * flap at the top of its arc) and falls back on glide with a soft landing on
 * the pile; a jump in the scroll is followed one sheet after another. A mouse
 * drag scrubs 1:1 and commits by projection; a tap turns the next sheet, and
 * on the last one sends them all back down.
 *
 * It is a vertical slider: Down and Up turn one sheet at a time, Page Down
 * and Page Up two, Home and End jump, Enter and Space turn the next. The lines
 * are read once from an sr-only list. Under reduced motion no sheet travels:
 * the top sheet cross-fades away to the line beneath.
 */
export function NotepadFlip({
  lines,
  label = "Notepad",
  value,
  defaultValue = 0,
  onValueChange,
  binding = "spiral",
  flipAngle = 190,
  paperTone = "legal",
  tilt = 24,
  curl = 0.5,
  shadow = 0.6,
  step = 90,
  ruled = true,
  ink = INK,
  interactive = true,
  sound = false,
  disabled = false,
  className,
}: NotepadFlipProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const n = lines.length;
  const lastIndex = Math.max(0, n - 1);
  const stock = STOCKS[paperTone] ?? STOCKS.legal;
  const bind = BINDINGS[binding] ?? BINDINGS.spiral;
  const t = clamp(tilt, 0, 40);
  const flip = clamp(flipAngle, 140, 240);
  const pitch = Math.max(30, step);
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;

  const [own, setOwn] = React.useState(() =>
    clamp(Math.round(defaultValue), 0, lastIndex),
  );
  const index = clamp(Math.round(value ?? own), 0, lastIndex);
  const [fits, setFits] = React.useState<number[]>([]);

  const [first] = React.useState(() => ({ index, flip, t, shadow }));
  const cells = React.useMemo(
    () => cellsOf(n, first.index, first.flip, first.t, first.shadow),
    [n, first],
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const measureRef = React.useRef<HTMLSpanElement | null>(null);
  const body = React.useRef<Body>(bodyOf(0, 0, flip));
  const raf = React.useRef(0);
  const last = React.useRef(0);
  const live = React.useRef(running);
  const reported = React.useRef(index);
  const quiet = React.useRef(0);
  const dragFrom = React.useRef<number | null>(null);
  const api = React.useRef<Api | null>(null);
  const cfg = React.useRef({
    n,
    flip,
    t,
    curl,
    shadow,
    pitch,
    motionSafe,
    audio,
    lines,
    ruled,
    value,
    onValueChange,
  });
  const frameRef = React.useRef((now: number) => {
    void now;
  });

  const wake = () => {
    if (raf.current || !live.current) return;
    last.current = performance.now();
    raf.current = window.requestAnimationFrame((ts) => frameRef.current(ts));
  };
  const halt = () => {
    if (raf.current) window.cancelAnimationFrame(raf.current);
    raf.current = 0;
  };

  /** Advances every sheet by dt seconds; returns whether anything still moves. */
  const stepAll = (dt: number): boolean => {
    const b = body.current;
    const c = cfg.current;
    const count = Math.min(b.a.length, cells.length);
    let busy = false;
    // The shown progress follows the scroll 1:1 while it is near, and at a
    // bounded rate when it jumps, so sheets go over (or come back) in order.
    const gap = b.p - b.q;
    if (!c.motionSafe || Math.abs(gap) <= 1) b.q = b.p;
    else {
      b.q += Math.sign(gap) * Math.min(Math.abs(gap) - 1, ORDER_RATE * dt);
      busy = true;
    }
    const top = Math.round(b.q);
    const settled = Math.abs(b.q - top) < 0.02;
    const kUp = springs.snap.stiffness / springs.snap.mass;
    const cUp = springs.snap.damping / springs.snap.mass;
    const kDown = springs.glide.stiffness / springs.glide.mass;
    const cDown = springs.glide.damping / springs.glide.mass;
    const kCurl = springs.flick.stiffness / springs.flick.mass;
    const cCurl = springs.flick.damping / springs.flick.mass;
    const upright = 90 - c.t;
    for (let i = 0; i < count; i += 1) {
      const rest = restOf(c.flip, i);
      let target = clamp01(b.q - i) * rest;
      if (
        c.motionSafe &&
        settled &&
        i === top &&
        i < c.n - 1 &&
        (b.hover || b.focus)
      ) {
        target = PEEK;
      }
      let a = b.a[i] ?? 0;
      let v = b.v[i] ?? 0;
      let cu = b.c[i] ?? 0;
      let cv = b.cv[i] ?? 0;
      if (!c.motionSafe) {
        // Still: a sheet is either on the pile or turned; a change is a
        // cross-fade — out where it was, then in where it goes.
        const goal = b.q >= i + 0.5 ? rest : 0;
        let fade = b.fade[i] ?? 1;
        let shown = b.shown[i] ?? 0;
        if (Math.abs(shown - goal) > 0.01) {
          fade = Math.max(0, fade - dt / (durations.fast * 0.9));
          if (fade <= 0) shown = goal;
          busy = true;
        } else if (fade < 1) {
          fade = Math.min(1, fade + dt / durations.base);
          busy = true;
        }
        b.fade[i] = fade;
        b.shown[i] = shown;
        a = shown;
        v = 0;
        cu = 0;
        cv = 0;
      } else {
        b.fade[i] = 1;
        let left = dt;
        while (left > 1e-7) {
          const h = Math.min(STEP, left);
          left -= h;
          const up = target > a;
          const k = up ? kUp : kDown;
          const damp = up ? cUp : cDown;
          v += (-k * (a - target) - damp * v) * h;
          a += v * h;
          // A sheet cannot fall through the pile: it lands, and bounces a
          // little.
          if (a < 0) {
            a = 0;
            v = -v * 0.2;
          }
          // The free half lags on the air in proportion to the turn's speed,
          // through a quick spring so it bends and straightens smoothly.
          const lag = clamp(-v * 0.06 * c.curl, -60 * c.curl, 60 * c.curl);
          cv += (-kCurl * (cu - lag) - cCurl * cv) * h;
          cu += cv * h;
        }
        // Never bent down into the pile.
        if (a + cu < 0) cu = -a;
      }
      b.a[i] = a;
      b.v[i] = v;
      b.c[i] = cu;
      b.cv[i] = cv;
      if (
        Math.abs(a - target) > 0.04 ||
        Math.abs(v) > 0.05 ||
        Math.abs(cu) > 0.04 ||
        Math.abs(cv) > 0.05
      ) {
        if (c.motionSafe) busy = true;
      }
      // The crinkle of a sheet going over the top — only when the visitor
      // turned it, and only once the page has been pressed or typed in.
      const over = a > upright ? 1 : 0;
      if (over !== b.side[i]) {
        b.side[i] = over;
        if (b.visitor && c.motionSafe && activated(b.pressed)) {
          c.audio.play("paper", {
            pitch: r2(
              0.88 + ((hash(`${c.lines[i] ?? ""}${i}`) % 100) / 100) * 0.3,
            ),
            gain: over ? 0.3 : 0.22,
          });
        }
      }
      const cell = cells[i];
      if (!cell) continue;
      const pose = poseOf(i, a, cu, c.t);
      cell.turn.set(pose.turn);
      cell.bend.set(pose.bend);
      cell.z.set(pose.z);
      cell.frontA.set(pose.frontA);
      cell.frontB.set(pose.frontB);
      cell.backA.set(pose.backA);
      cell.backB.set(pose.backB);
      cell.fade.set(r3(b.fade[i] ?? 1));
      const below = cells[i + 1];
      if (below) {
        const s = shadowOf(c.motionSafe ? a : 0, c.shadow);
        below.shade.set(s.opacity);
        below.reach.set(s.image);
      }
    }
    return busy;
  };

  const frame = (now: number) => {
    raf.current = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last.current) / 1000));
    last.current = now;
    const busy = stepAll(dt);
    if (busy && live.current) {
      raf.current = window.requestAnimationFrame((ts) => frameRef.current(ts));
    }
  };

  /** A new sheet showing: reported from the gesture that turned to it. */
  const report = (next: number) => {
    if (next === reported.current) return;
    reported.current = next;
    if (cfg.current.value === undefined) setOwn(next);
    cfg.current.onValueChange?.(next);
  };

  /** Scrolls the pad to a whole sheet; the springs carry the sheets there. */
  const goTo = (target: number, visitor: boolean) => {
    const scroller = scrollerRef.current;
    const b = body.current;
    const to = clamp(Math.round(target), 0, Math.max(0, cfg.current.n - 1));
    b.visitor = visitor;
    if (visitor) report(to);
    else reported.current = to;
    if (scroller) {
      scroller.scrollTop = to * cfg.current.pitch;
      // Snap is restored once the position has landed on a snap point.
      window.requestAnimationFrame(() => {
        scroller.style.scrollSnapType = "";
      });
    }
    b.p = to;
    wake();
  };

  /** Each line scaled to fit its sheet, never wrapped. */
  const fitLines = () => {
    const root = rootRef.current;
    const measure = measureRef.current;
    if (!root || !measure) return;
    const em = parseFloat(getComputedStyle(root).fontSize) || 16;
    const room =
      root.clientWidth * 0.9 - (cfg.current.ruled ? 1.42 : 0.9) * em - 0.7 * em;
    const next = Array.from(measure.children, (child) => {
      const natural = (child as HTMLElement).offsetWidth;
      if (natural <= 0 || room <= 0) return 1;
      return Math.max(
        0.5,
        Math.min(1, Math.floor((room / natural) * 1000) / 1000),
      );
    });
    setFits((prev) =>
      prev.length === next.length && prev.every((f, i) => f === next[i])
        ? prev
        : next,
    );
  };

  React.useLayoutEffect(() => {
    cfg.current = {
      n,
      flip,
      t,
      curl: clamp01(curl),
      shadow: clamp01(shadow),
      pitch,
      motionSafe,
      audio,
      lines,
      ruled,
      value,
      onValueChange,
    };
    frameRef.current = frame;
    live.current = running;
    api.current = { wake, halt, goTo, fitLines };
  });

  // A new set of sheets starts from where the pad is.
  React.useLayoutEffect(() => {
    const at = clamp(reported.current, 0, Math.max(0, n - 1));
    body.current = bodyOf(n, at, cfg.current.flip);
    reported.current = at;
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = at * cfg.current.pitch;
    api.current?.fitLines();
    api.current?.wake();
  }, [cells, n]);

  React.useEffect(() => {
    if (running) api.current?.wake();
    else api.current?.halt();
    return () => api.current?.halt();
  }, [running]);

  // A change of feel re-poses the sheets at once.
  React.useEffect(() => {
    api.current?.wake();
  }, [flip, t, curl, shadow, motionSafe]);

  // A host that moves `value` turns the sheets the way a scroll would.
  React.useEffect(() => {
    if (value === undefined) return;
    const to = clamp(Math.round(value), 0, Math.max(0, n - 1));
    if (Math.round(body.current.p) !== to) api.current?.goTo(to, false);
    else reported.current = to;
  }, [value, n]);

  React.useEffect(() => {
    const timer = quiet;
    return () => window.clearTimeout(timer.current);
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const refit = () => api.current?.fitLines();
    const sizer = new ResizeObserver(refit);
    sizer.observe(node);
    document.fonts?.addEventListener?.("loadingdone", refit);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      document.fonts?.removeEventListener?.("loadingdone", refit);
    };
  }, []);

  const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const scroller = event.currentTarget;
    const b = body.current;
    const max = Math.max(0, n - 1);
    b.p = clamp(scroller.scrollTop / pitch, 0, max);
    // A sheet the pad was sent to is already reported, so a scroll that only
    // lands there says nothing; a drag reports once, on release.
    if (dragFrom.current === null) report(clamp(Math.round(b.p), 0, max));
    wake();
    // Controlled and refused: once the scroll comes to rest, the pad goes
    // back to the sheet the host says it is on.
    window.clearTimeout(quiet.current);
    quiet.current = window.setTimeout(() => {
      const v = cfg.current.value;
      if (v === undefined || dragFrom.current !== null) return;
      const held = clamp(Math.round(v), 0, max);
      if (Math.round(body.current.p) !== held) api.current?.goTo(held, false);
    }, 160);
  };

  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled: !interactive || disabled,
    onStart: ({ event }) => {
      const scroller = scrollerRef.current;
      // Touch scrolls the pad natively; the drag is for mouse and pen.
      if (!scroller || event.pointerType === "touch") return;
      dragFrom.current = scroller.scrollTop;
      scroller.style.scrollSnapType = "none";
      body.current.visitor = true;
      body.current.pressed = true;
    },
    onMove: ({ offset }) => {
      const scroller = scrollerRef.current;
      if (!scroller || dragFrom.current === null) return;
      scroller.scrollTop = dragFrom.current - offset.y;
    },
    onEnd: ({ velocity }) => {
      const scroller = scrollerRef.current;
      if (!scroller || dragFrom.current === null) return;
      dragFrom.current = null;
      const landing = project(scroller.scrollTop, -velocity.y, 0.995);
      goTo(landing / pitch, true);
    },
    onCancel: () => {
      if (dragFrom.current === null) return;
      dragFrom.current = null;
      goTo(body.current.p, true);
    },
    onTap: () => {
      body.current.pressed = true;
      const at = Math.round(body.current.p);
      goTo(at >= n - 1 ? 0 : at + 1, true);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || n < 2) return;
    const at = Math.round(body.current.p);
    let to: number;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        to = at + 1;
        break;
      case "ArrowUp":
      case "ArrowLeft":
        to = at - 1;
        break;
      case "PageDown":
        to = at + 2;
        break;
      case "PageUp":
        to = at - 2;
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = n - 1;
        break;
      case "Enter":
      case " ":
        to = at >= n - 1 ? 0 : at + 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    body.current.pressed = true;
    goTo(to, true);
  };

  // The pile under the top sheet thins as sheets are turned.
  const remaining = Math.max(0, n - 1 - index);
  const edge = r3(0.05 + 0.055 * Math.min(6, remaining + 1));
  const top = roomAbove(t);
  const below = r3(H * Math.cos(rad(t)));
  const height = r3(top + below + edge + 0.34);
  const paper = `color-mix(in oklab, ${stock.paper} 93%, var(--background))`;
  const backPaper = `color-mix(in oklab, ${stock.back} 93%, var(--background))`;

  return (
    <div
      ref={bindRoot}
      className={cn("relative w-full", disabled && "opacity-60", className)}
    >
      <ol className="sr-only">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
      <div
        aria-hidden
        className="relative overflow-clip [contain:paint] select-none"
        style={{ height: `${height}em` }}
      >
        <span
          ref={measureRef}
          className="invisible absolute top-0 left-0 block font-medium whitespace-nowrap"
        >
          {lines.map((line, i) => (
            <span key={i} className="block w-max">
              {line}
            </span>
          ))}
        </span>
        <div
          className="absolute inset-y-0"
          style={{ left: `${INSET}%`, right: `${INSET}%` }}
        >
          {/* The chipboard back and the edges of the sheets still to come. */}
          <span
            className="absolute inset-x-0 block"
            style={{
              top: `${top}em`,
              height: `${H}em`,
              transform: `rotateX(${t}deg)`,
              transformOrigin: "50% 0",
              background: BOARD,
              zIndex: 0,
            }}
          />
          <span
            className="absolute block"
            style={{
              top: `${r3(top + below - 0.02)}em`,
              left: 0,
              right: 0,
              height: `${edge}em`,
              backgroundColor: stock.edge,
              backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 0.045em, oklch(0.3 0.03 70 / 0.22) 0.045em 0.055em)`,
              zIndex: 1,
            }}
          />
          <span
            className="absolute block rounded-b-[0.12em] shadow-[0_0.35em_0.7em_-0.3em_oklch(0_0_0/0.45)]"
            style={{
              top: `${r3(top + below + edge - 0.02)}em`,
              left: 0,
              right: 0,
              height: "0.14em",
              background: BOARD,
              zIndex: 1,
            }}
          />
          {lines.map((line, i) => (
            <Sheet
              key={i}
              line={line}
              fit={fits[i] ?? 1}
              stock={stock}
              paper={paper}
              backPaper={backPaper}
              ruled={ruled}
              ink={ink}
              cell={cells[i] as Cell}
              top={top}
            />
          ))}
          {bind.band ? (
            <span
              className="absolute inset-x-0 block shadow-[0_0.08em_0.12em_oklch(0_0_0/0.3)]"
              style={{
                top: `${r3(top - 0.2)}em`,
                height: "0.36em",
                background:
                  "linear-gradient(to bottom, oklch(0.42 0.13 25), oklch(0.55 0.15 25) 38%, oklch(0.4 0.12 25))",
                zIndex: 300,
              }}
            />
          ) : (
            <span
              className="absolute inset-x-[1.5%] block"
              style={{
                top: `${r3(top - 0.64)}em`,
                height: "0.96em",
                backgroundImage: bind.tile,
                backgroundSize: bind.size,
                backgroundRepeat: "space no-repeat",
                zIndex: 300,
              }}
            />
          )}
        </div>
      </div>
      {interactive ? (
        <>
          <div
            ref={scrollerRef}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label={label}
            aria-describedby={hintId}
            aria-orientation="vertical"
            aria-valuemin={1}
            aria-valuemax={Math.max(1, n)}
            aria-valuenow={index + 1}
            aria-valuetext={`Sheet ${index + 1} of ${Math.max(1, n)}`}
            aria-disabled={disabled || undefined}
            onScroll={onScroll}
            onWheel={() => {
              body.current.visitor = true;
            }}
            onKeyDown={onKeyDown}
            onFocus={(event) => {
              body.current.focus =
                event.currentTarget.matches(":focus-visible");
              wake();
            }}
            onBlur={() => {
              body.current.focus = false;
              wake();
            }}
            onPointerEnter={(event) => {
              if (event.pointerType === "touch") return;
              body.current.hover = true;
              wake();
            }}
            onPointerLeave={() => {
              body.current.hover = false;
              wake();
            }}
            onPointerDown={(event) => {
              drag.onPointerDown(event);
              if (event.pointerType === "touch") body.current.visitor = true;
            }}
            onPointerMove={drag.onPointerMove}
            onPointerUp={drag.onPointerUp}
            onPointerCancel={drag.onPointerCancel}
            onLostPointerCapture={drag.onLostPointerCapture}
            className={cn(
              "absolute inset-0 snap-y snap-mandatory [scrollbar-width:none] overflow-y-auto overscroll-auto rounded-3 outline-none [&::-webkit-scrollbar]:hidden",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              disabled
                ? "cursor-not-allowed overflow-hidden"
                : "cursor-grab touch-pan-y active:cursor-grabbing",
            )}
          >
            {lines.map((_, i) => (
              <div
                key={i}
                className="snap-start"
                style={{ height: i < n - 1 ? pitch : "100%" }}
              />
            ))}
          </div>
          <span id={hintId} className="sr-only">
            Scroll, drag or use the arrow keys to turn the sheets one at a time.
          </span>
        </>
      ) : null}
    </div>
  );
}
