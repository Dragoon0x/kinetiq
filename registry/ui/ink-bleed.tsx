"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionStyle,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type InkBleedPaper = "plain" | "laid" | "kraft";

export type InkBleedProps = {
  /** The status phrases, written one after another and cycled in order. */
  phrases: string[];
  /** Writing. False lifts the line, writes `doneText` and stops. @default true */
  active?: boolean;
  /** What stays written once inactive. @default the last phrase */
  doneText?: string;
  /** How fast the pen, the drying and the blotter run, 0.5 to 2. @default 1 */
  speed?: number;
  /** How far the ink feathers into the paper, 0 (crisp) to 1 (blotting paper). @default 0.5 */
  spread?: number;
  /** The stock, which also sets how the ink soaks and dries. @default "laid" */
  paper?: InkBleedPaper;
  /** Play the blotter. Off unless asked for. @default false */
  sound?: boolean;
  /** Keep writing, but the line cannot be blotted. */
  disabled?: boolean;
  /** A phrase began: its index in `phrases`, or -1 for `doneText`. */
  onPhraseChange?: (index: number) => void;
  className?: string;
};

/** The blotter's width, px. */
const PAD = 34;
/** Rest between a dry phrase and the blotter, s at speed 1. */
const HOLD = 0.9;
/** Clean paper before the next phrase, s at speed 1. */
const GAP = 0.15;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (v: number) => Math.round(clamp01(v) * 100);
/** A hand's ease: the blotter starts and stops, it never arrives at speed. */
const sway = (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(u));

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator: the same pen rhythm for the same phrase. */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Paper grain as an SVG noise tile: fixed art, the same in both themes. */
const noise = (frequency: string, alpha: string, size: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.32 0 0 0 0 0.26 0 0 0 0 0.2 ${alpha}'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
  )}")`;

const GRAIN = noise("0.9", "0 0 0 -1.2 0.56", 140);
const MOTTLE = noise("0.02", "0 0 0 -0.3 0.16", 260);
const FIBRE = noise("0.012 0.42", "0 0 0 -1.6 0.8", 220);

type Stock = {
  /** Soak time, times the laid baseline: coated paper drinks slowly. */
  absorb: number;
  /** Drying time, times the baseline. */
  dry: number;
  /** How much wet gloss the ink keeps on this stock, 0 to 1. */
  sheen: number;
  /** How far ink feathers here, times `spread`. */
  feather: number;
  base: string;
  texture: string;
  size: string;
  /** Ink pigments: fresh, dried matte, and dried after a blot. */
  wet: string;
  ink: string;
  blotted: string;
};

// Paper and ink are pigments — they read the same in both themes. The paper
// is pulled a tenth of the way toward the page so a dark page does not glare.
const STOCKS: Record<InkBleedPaper, Stock> = {
  plain: {
    absorb: 1.25,
    dry: 1.45,
    sheen: 1,
    feather: 0.6,
    base: "oklch(0.975 0.006 95)",
    texture: `${MOTTLE}, ${GRAIN}`,
    size: "260px 260px, 140px 140px",
    wet: "oklch(0.24 0.11 266)",
    ink: "oklch(0.33 0.085 262)",
    blotted: "oklch(0.5 0.07 258)",
  },
  laid: {
    absorb: 1,
    dry: 1,
    sheen: 0.75,
    feather: 1,
    base: "oklch(0.955 0.021 88)",
    texture: `repeating-linear-gradient(0deg, transparent 0 2px, oklch(0.5 0.05 80 / 0.07) 2px 3px), repeating-linear-gradient(90deg, transparent 0 38px, oklch(0.5 0.05 80 / 0.09) 38px 39px), ${MOTTLE}, ${GRAIN}`,
    size: "auto, auto, 260px 260px, 140px 140px",
    wet: "oklch(0.24 0.11 266)",
    ink: "oklch(0.33 0.085 262)",
    blotted: "oklch(0.5 0.07 258)",
  },
  kraft: {
    absorb: 0.7,
    dry: 0.55,
    sheen: 0.35,
    feather: 1.55,
    base: "oklch(0.74 0.068 66)",
    texture: `${FIBRE}, ${MOTTLE}, ${GRAIN}`,
    size: "220px 220px, 260px 260px, 140px 140px",
    wet: "oklch(0.21 0.08 262)",
    ink: "oklch(0.29 0.045 245)",
    blotted: "oklch(0.42 0.04 240)",
  },
};

const BLOTTER = "oklch(0.85 0.07 8)";
const SHEEN =
  "linear-gradient(100deg, transparent 38%, oklch(1 0 0 / 0.9) 47%, oklch(1 0 0 / 0.35) 52%, transparent 62%)";
const STAIN =
  "radial-gradient(38% 26% at 30% 38%, oklch(0.36 0.09 262 / 0.55), transparent), radial-gradient(30% 22% at 68% 62%, oklch(0.36 0.09 262 / 0.45), transparent), radial-gradient(22% 34% at 52% 24%, oklch(0.36 0.09 262 / 0.35), transparent)";

type Timeline = {
  /** When each character's ink lands, s at speed 1; -1 for spaces. */
  starts: number[];
  /** Where across each letter the drop lands, %. */
  wick: number[];
  soak: number;
  dry: number;
  last: number;
  writeEnd: number;
  holdEnd: number;
};

function timelineOf(
  chars: string[],
  stock: Stock,
  motionSafe: boolean,
  seed: number,
): Timeline {
  const rand = lcg(seed);
  const letters = chars.filter((c) => c.trim() !== "").length;
  // Long phrases write a little faster, so none takes more than ~2s of pen.
  const step = motionSafe ? Math.min(0.075, 1.8 / Math.max(1, letters)) : 0;
  const starts: number[] = [];
  const wick: number[] = [];
  let at = 0.1;
  let last = at;
  for (const ch of chars) {
    const jitter = rand();
    wick.push(Math.round(38 + rand() * 24));
    if (ch.trim() === "") {
      // The pen lifts between words.
      starts.push(-1);
      at += step * 1.4;
      continue;
    }
    const s = at + (jitter - 0.5) * step * 0.5;
    starts.push(s);
    last = Math.max(last, s);
    at += step;
  }
  const soak = (motionSafe ? 0.55 : 0.4) * stock.absorb;
  const dry = 1.25 * stock.dry;
  const writeEnd = last + soak * 0.6 + dry;
  // Written all at once, a phrase keeps the reading time the pen would have
  // given it.
  const pen = motionSafe ? 0 : Math.min(1.8, letters * 0.075);
  return {
    starts,
    wick,
    soak,
    dry,
    last,
    writeEnd,
    holdEnd: writeEnd + HOLD + pen,
  };
}

const soakOf = (tl: Timeline, i: number, t: number) =>
  clamp01((t - (tl.starts[i] ?? 0)) / tl.soak);
const dryOf = (tl: Timeline, i: number, t: number) =>
  clamp01((t - (tl.starts[i] ?? 0) - tl.soak * 0.6) / tl.dry);

/**
 * The automatic blotter's centre, from its pass (0–1) and how far the ink
 * reaches: it slides in from the paper's edge, crosses the writing and is
 * lifted off just past its end.
 */
const padAt = (u: number, reach: number) =>
  lerp(-PAD, reach, sway(Math.min(1, u)));
/** The pass's last stretch is the pad being lifted off the paper. */
const LIFT_OFF = 0.82;

/** A CSS custom property carried by a motion value (motion sets it with setProperty). */
const cssVar = (name: `--${string}`, value: MotionValue<string>) =>
  ({ [name]: value }) as MotionStyle;

type Cell = {
  blot: MotionValue<number>;
  smear: MotionValue<number>;
  centre: MotionValue<number>;
};

type Slot = {
  /** New for every phrase written, so the same phrase twice is two runs. */
  n: number;
  /** Index in `phrases`, or -1 for the done text. */
  index: number;
  text: string;
  /** The done text: written, then it stays. */
  final: boolean;
};

type Look = {
  soak: number;
  dry: number;
  wet: number;
  blot: number;
  gone: number;
  smear: number;
};

type LetterProps = {
  char: string;
  at: number;
  cell: Cell;
  clock: MotionValue<number>;
  lift: MotionValue<number>;
  reach: MotionValue<number>;
  tl: Timeline;
  stock: Stock;
  feather: number;
  motionSafe: boolean;
  bind: (node: HTMLSpanElement | null) => void;
};

function Letter({
  char,
  at,
  cell,
  clock,
  lift,
  reach,
  tl,
  stock,
  feather,
  motionSafe,
  bind,
}: LetterProps) {
  const wick = tl.wick[at] ?? 50;
  // The front of the soak is feathered by the spread: a crisp nib wets a
  // sharp edge, a thirsty sheet a soft one.
  const front = Math.min(60, 10 + 38 * feather);

  const look = useTransform(
    [clock, lift, reach, cell.blot, cell.smear, cell.centre],
    ([t = 0, u = 0, w = 0, b = 0, sm = 0, c = 0]: number[]): Look => {
      // A blot presses whatever ink has landed into the whole letter at once.
      const soak = Math.max(soakOf(tl, at, t), soakOf(tl, at, t) > 0 ? b : 0);
      const dry = dryOf(tl, at, t);
      const wet = soak > 0 ? (1 - dry) * (1 - b) : 0;
      // The blotter takes the ink up as its leading edge crosses the letter;
      // under reduced motion the line simply fades.
      const gone =
        u <= 0
          ? 0
          : motionSafe
            ? clamp01((padAt(u, w) + PAD / 2 - c) / (PAD * 0.75))
            : clamp01(u * 1.6);
      return { soak, dry, wet, blot: b, gone, smear: sm };
    },
  );

  const mask = useTransform(look, ({ soak }) => {
    if (soak >= 1) return "none";
    const p = r2(lerp(-front, 100, soak));
    return `radial-gradient(ellipse 95% 125% at ${wick}% 80%, black ${p}%, transparent ${r2(p + front)}%)`;
  });
  const fade = useTransform(look, ({ gone }) => r2(1 - gone));
  const ink = useTransform(
    look,
    ({ wet, blot }) =>
      `color-mix(in oklab, ${stock.wet} ${pct(wet)}%, color-mix(in oklab, ${stock.blotted} ${pct(blot)}%, ${stock.ink}))`,
  );
  const shadow = useTransform(look, ({ soak, wet, smear }) => {
    // The ink's own edge thickens as it soaks; the halo it leaves in the
    // fibres grows with it and stays once dry.
    const parts = [
      `0 0 ${r2(0.25 + 0.6 * feather * soak)}px color-mix(in oklab, ${stock.ink} ${60 + Math.round(20 * wet)}%, transparent)`,
    ];
    if (feather > 0.02) {
      parts.push(
        `0 ${r2(0.4 * feather)}px ${r2(3.4 * feather * soak)}px color-mix(in oklab, ${stock.ink} ${18 + Math.round(14 * wet)}%, transparent)`,
      );
    }
    if (Math.abs(smear) > 0.05) {
      parts.push(
        `${r2(smear)}px 0 ${r2(Math.abs(smear) * 0.8)}px color-mix(in oklab, ${stock.ink} 36%, transparent)`,
      );
    }
    return parts.join(", ");
  });
  const gloss = useTransform(look, ({ soak, wet }) =>
    motionSafe ? r2(stock.sheen * wet * Math.min(1, soak * 1.5) * 0.9) : 0,
  );
  // One glint slides across each letter while it dries.
  const glint = useTransform(look, ({ dry }) => `${r2(lerp(86, 6, dry))}% 0%`);
  // The drop on the baseline: it spreads as it lands, then is drawn up into
  // the letter and shrinks.
  const poolOpacity = useTransform(look, ({ soak }) =>
    motionSafe && soak > 0 && soak < 1
      ? r2(0.5 * Math.sin(Math.PI * clamp01(soak / 0.7)))
      : 0,
  );
  const poolScale = useTransform(look, ({ soak }) =>
    soak < 0.2
      ? r2(0.3 + 3.5 * soak)
      : r2(1 - 0.55 * clamp01((soak - 0.2) / 0.5)),
  );
  const poolWidth = r2(0.42 + 0.3 * feather);

  return (
    <motion.span
      ref={bind}
      className="relative inline-block"
      style={{ opacity: fade, ...cssVar("--ink-soak", mask) }}
    >
      {/* Grown past the glyph on every side, so the mask never trims the halo. */}
      <motion.span
        className="relative -mx-1 -my-0.5 block [mask-image:var(--ink-soak)] px-1 py-0.5 [-webkit-mask-image:var(--ink-soak)]"
        style={{ color: ink, textShadow: shadow }}
      >
        {char}
      </motion.span>
      {motionSafe && stock.sheen > 0 ? (
        <motion.span
          className="pointer-events-none absolute inset-0 -mx-1 -my-0.5 block [mask-image:var(--ink-soak)] bg-clip-text px-1 py-0.5 text-transparent [-webkit-mask-image:var(--ink-soak)]"
          style={{
            backgroundImage: SHEEN,
            backgroundSize: "300% 100%",
            backgroundPosition: glint,
            opacity: gloss,
          }}
        >
          {char}
        </motion.span>
      ) : null}
      <motion.span
        className="pointer-events-none absolute bottom-[0.24em] h-[0.2em] rounded-full"
        style={{
          left: `calc(${wick}% - ${r2(poolWidth / 2)}em)`,
          width: `${poolWidth}em`,
          background: `radial-gradient(closest-side, ${stock.wet}, transparent)`,
          opacity: poolOpacity,
          scale: poolScale,
        }}
      />
    </motion.span>
  );
}

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Api = {
  play: () => void;
  blotSpan: (a: number, b: number, vx: number, clientX: number) => void;
  halt: () => void;
  advance: () => void;
  turn: (on: boolean) => void;
  measure: () => void;
};

/**
 * A status line written in ink. Each phrase soaks into the paper letter by
 * letter on a seeded pen rhythm: the ink lands as a small pool on the
 * baseline and wicks up and out through the glyph behind a feathered front,
 * deep and glossy while wet — a glint slides across each letter — then dries
 * to a lighter matte, leaving a halo in the fibres. When the phrase has dried
 * and rested, a pad of blotting paper sweeps across and lifts it, and the
 * next phrase is written on the clean sheet.
 *
 * The blotter can be picked up: pressing the paper brings it down under the
 * pointer, dragging rubs it along the line 1:1, and every letter still wet
 * under it is blotted — its soak completes at once and it dries lighter, the
 * way blotted ink does, smeared a little when the pass was fast. Enter or
 * Space runs the same pad along the whole line. One clock per phrase drives
 * every letter through motion values; nothing renders per frame.
 *
 * The current phrase is in a polite live region, announced once; the root is
 * busy while active. Under reduced motion the whole phrase soaks in at once,
 * wet to dry is a colour change, and the lift is a fade.
 */
export function InkBleed({
  phrases,
  active = true,
  doneText,
  speed = 1,
  spread = 0.5,
  paper = "laid",
  sound = false,
  disabled = false,
  onPhraseChange,
  className,
}: InkBleedProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const stock = STOCKS[paper] ?? STOCKS.laid;
  const rate = clamp(speed, 0.5, 2);
  const feather = clamp01(spread) * stock.feather;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;

  const list = phrases.length > 0 ? phrases : [doneText ?? ""];
  const done = doneText ?? list[list.length - 1] ?? "";

  const [slot, setSlot] = React.useState<Slot>(() =>
    active
      ? { n: 0, index: 0, text: list[0] ?? "", final: false }
      : { n: 0, index: -1, text: done, final: true },
  );
  const [holding, setHolding] = React.useState(false);
  const [height, setHeight] = React.useState<number | null>(null);

  const run = React.useMemo(() => {
    const chars = Array.from(slot.text);
    return {
      chars,
      cells: chars.map((): Cell => ({
        blot: motionValue(0),
        smear: motionValue(0),
        centre: motionValue(0),
      })),
    };
  }, [slot]);
  const tl = React.useMemo(
    () => timelineOf(run.chars, stock, motionSafe, hash(slot.text)),
    [run, stock, motionSafe, slot.text],
  );

  // A line that starts finished is already dry: its clock starts at the end.
  const [firstT] = React.useState(() =>
    slot.final
      ? timelineOf(run.chars, stock, true, hash(slot.text)).writeEnd
      : 0,
  );
  const clock = useMotionValue(firstT);
  const lift = useMotionValue(0);
  const width = useMotionValue(0);
  const reach = useMotionValue(0);
  const handX = useMotionValue(0);
  const handOn = useMotionValue(0);
  const handY = useMotionValue(0);
  const handScale = useMotionValue(1);
  const handStain = useMotionValue(0);

  const paperRef = React.useRef<HTMLButtonElement | null>(null);
  const letters = React.useRef(new Map<string, HTMLSpanElement>());
  const phase = React.useRef<"write" | "lift">("write");
  /** How long this pass of the blotter takes, s at speed 1: it has a line to cross. */
  const liftTime = React.useRef(0.8);
  const clockRun = React.useRef<AnimationPlaybackControls | null>(null);
  const sweepRun = React.useRef<AnimationPlaybackControls | null>(null);
  const handRuns = React.useRef<AnimationPlaybackControls[]>([]);
  const blots = React.useRef<AnimationPlaybackControls[]>([]);
  const hand = React.useRef({
    on: false,
    x: 0,
    t: 0,
    blotted: 0,
    release: 0,
    clientX: 0,
  });
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onPhraseChange);
  const wasActive = React.useRef(active);

  const stopHand = () => {
    for (const c of handRuns.current) c.stop();
    handRuns.current = [];
  };

  const halt = () => {
    clockRun.current?.stop();
    clockRun.current = null;
  };

  /** Runs the phrase's clock from wherever it is to wherever it may go now. */
  const play = () => {
    halt();
    if (!running) return;
    const resting = slot.final && !active;
    if (phase.current === "write") {
      const target = resting ? tl.writeEnd : tl.holdEnd;
      const from = clock.get();
      if (from < target - 1e-3) {
        clockRun.current = animate(clock, target, {
          duration: (target - from) / rate,
          ease: "linear",
          onComplete: () => api.current?.play(),
        });
        return;
      }
      // Finished and resting, or the blotter is in the visitor's hand: the
      // lift waits for it to be let go.
      if (resting || holding) return;
      phase.current = "lift";
      api.current?.measure();
    }
    const pass = liftTime.current;
    const end = 1 + GAP / pass;
    const from = lift.get();
    clockRun.current = animate(lift, end, {
      duration: Math.max(0.01, ((end - from) * pass) / rate),
      ease: "linear",
      onComplete: () => api.current?.advance(),
    });
  };

  /** The next phrase on clean paper. */
  const advance = () => {
    halt();
    for (const c of blots.current) c.stop();
    blots.current = [];
    phase.current = "write";
    clock.set(0);
    lift.set(0);
    let next: Slot;
    if (!active) {
      next = { n: slot.n + 1, index: -1, text: done, final: true };
    } else {
      const index = slot.final ? 0 : (slot.index + 1) % list.length;
      next = { n: slot.n + 1, index, text: list[index] ?? "", final: false };
    }
    setSlot(next);
    report.current?.(next.index);
  };

  /** The host switched writing on or off. */
  const turn = (on: boolean) => {
    if (on) {
      // Finished text is lifted and the phrases begin again.
      if (slot.final) {
        phase.current = "lift";
        play();
      }
      return;
    }
    // Off mid-phrase: the blotter lifts what has been written, as it is.
    if (!slot.final && phase.current === "write") {
      phase.current = "lift";
      measure();
      play();
    }
  };

  const measure = () => {
    const box = paperRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const w = box.clientWidth;
    width.set(r2(w));
    let right = 0;
    run.cells.forEach((cell, i) => {
      const node = letters.current.get(`${slot.n}:${i}`);
      if (!node) return;
      const r = node.getBoundingClientRect();
      const left = r.left - rect.left - box.clientLeft;
      cell.centre.set(r2(left + r.width / 2));
      right = Math.max(right, left + r.width);
    });
    const end = Math.min(w + PAD, right + PAD * 0.6);
    reach.set(r2(end));
    liftTime.current = clamp(0.3 + (end + PAD) / 650, 0.5, 1.1);
  };

  // The first phrase is state too: the host hears it from the first commit.
  React.useEffect(() => {
    report.current?.(slot.index);
    // Reported once, as the component arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (wasActive.current === active) return;
    wasActive.current = active;
    api.current?.turn(active);
  }, [active]);

  // Anything that changes where the clock may run restarts it from where it
  // stands: a new phrase, the page or the element coming and going, a speed.
  React.useEffect(() => {
    api.current?.play();
    return () => api.current?.halt();
  }, [slot, running, holding, active, rate, tl]);

  React.useEffect(() => {
    const anims = blots;
    const hands = handRuns;
    const sweeping = sweepRun;
    return () => {
      for (const c of anims.current) c.stop();
      for (const c of hands.current) c.stop();
      sweeping.current?.stop();
    };
  }, []);

  // The paper's size and whether it is on screen, bound to the node when it
  // arrives. Off screen the clock stops where it is.
  const bindPaper = React.useCallback((node: HTMLButtonElement | null) => {
    paperRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.measure());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    void document.fonts?.ready.then(() => api.current?.measure());
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  // The text's own height, so a phrase that wraps to two lines grows the
  // paper on the glide spring instead of jumping.
  const bindLine = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      setHeight(Math.round(node.offsetHeight));
    });
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  const bindLetter = (key: string) => (node: HTMLSpanElement | null) => {
    if (node) letters.current.set(key, node);
    else letters.current.delete(key);
  };

  const local = (clientX: number) => {
    const box = paperRef.current;
    if (!box) return 0;
    return clientX - box.getBoundingClientRect().left - box.clientLeft;
  };

  /** Blots every wet letter the pad covered between two of its positions. */
  const blotSpan = (a: number, b: number, vx: number, clientX: number) => {
    if (phase.current !== "write") return;
    const lo = Math.min(a, b) - PAD / 2;
    const hi = Math.max(a, b) + PAD / 2;
    const t = clock.get();
    let blotted = 0;
    run.cells.forEach((cell, i) => {
      const start = tl.starts[i] ?? -1;
      if (start < 0 || t < start) return;
      const c = cell.centre.get();
      if (c < lo || c > hi || cell.blot.get() > 0.5) return;
      const wetness = 1 - dryOf(tl, i, t);
      if (wetness < 0.03) return;
      blotted += 1;
      cell.smear.set(
        r2(clamp(vx / 600, -1, 1) * 1.9 * (0.4 + feather) * wetness),
      );
      if (motionSafe) {
        blots.current.push(
          animate(cell.blot, 1, {
            duration: durations.fast,
            ease: easings.enter,
          }),
        );
      } else {
        cell.blot.set(1);
      }
      audio.play("paper", {
        pitch: r2(0.9 + ((hash(`${slot.text}${i}`) % 100) / 100) * 0.35),
        gain: r2(0.25 + 0.35 * Math.min(1, Math.abs(vx) / 900)),
        pan: panFrom(clientX, paperRef.current),
      });
    });
    if (blotted === 0) return;
    hand.current.blotted += blotted;
    handStain.set(r2(Math.min(0.6, handStain.get() + 0.07 * blotted)));
    // Every letter written and each one dry or blotted: the phrase does not
    // wait out drying it no longer needs.
    const left = run.cells.some((cell, i) => {
      const start = tl.starts[i] ?? -1;
      if (start < 0) return false;
      return t < start || (cell.blot.get() < 0.5 && dryOf(tl, i, t) < 1);
    });
    if (!left && t < tl.writeEnd) {
      clock.set(tl.writeEnd);
      play();
    }
  };

  /** The pad comes down under the pointer. */
  const grab = (clientX: number, timeStamp: number) => {
    measure();
    sweepRun.current?.stop();
    sweepRun.current = null;
    // A lift already under way finishes under the hand.
    if (phase.current === "lift") advance();
    const x = rubberClamp(local(clientX), 0, width.get(), PAD);
    hand.current = {
      on: true,
      x,
      t: timeStamp,
      blotted: 0,
      release: 0,
      clientX,
    };
    stopHand();
    handX.set(r2(x));
    handY.set(0);
    handStain.set(0);
    if (motionSafe) {
      handScale.set(0.94);
      handRuns.current = [
        animate(handOn, 1, { duration: durations.blink, ease: easings.enter }),
        animate(handScale, 1, springs.flick),
      ];
    } else {
      handScale.set(1);
      handOn.set(1);
    }
    setHolding(true);
    // The pad meeting the paper, before anything it blots.
    audio.play("paper", {
      pitch: 0.8,
      gain: 0.16,
      pan: panFrom(clientX, paperRef.current),
    });
    blotSpan(x, x, 0, clientX);
  };

  const rub = (clientX: number, timeStamp: number) => {
    const h = hand.current;
    if (!h.on) return;
    const x = rubberClamp(local(clientX), 0, width.get(), PAD);
    const vx = ((x - h.x) / Math.max(8, timeStamp - h.t)) * 1000;
    handX.set(r2(x));
    blotSpan(h.x, x, vx, clientX);
    h.x = x;
    h.t = timeStamp;
    h.clientX = clientX;
  };

  const letGo = () => {
    const h = hand.current;
    if (!h.on) return;
    h.on = false;
    setHolding(false);
    if (h.blotted > 0 && Math.abs(h.release) > 450) {
      audio.play("swish", {
        pitch: r2(clamp(0.8 + Math.abs(h.release) / 3000, 0.8, 1.4)),
        gain: 0.4,
        pan: panFrom(h.clientX, paperRef.current),
      });
    }
    stopHand();
    handRuns.current = [
      animate(handOn, 0, { duration: durations.fast, ease: easings.exit }),
    ];
    if (motionSafe) {
      handRuns.current.push(
        animate(handY, -distances.nudge, {
          duration: durations.fast,
          ease: easings.exit,
        }),
      );
    }
  };

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onMove: ({ point, event }) => rub(point.x, event.timeStamp),
    onEnd: ({ velocity }) => {
      hand.current.release = velocity.x;
    },
  });

  /** The keyboard's blot: the same pad, run along the whole line. */
  const sweep = () => {
    if (disabled) return;
    measure();
    if (phase.current === "lift") advance();
    audio.play("swish", { pitch: 1.1, gain: 0.4 });
    const rect = paperRef.current?.getBoundingClientRect();
    const clientAt = (x: number) => (rect ? rect.left + x : 0);
    if (!motionSafe) {
      blotSpan(-1e6, 1e6, 0, clientAt(width.get() / 2));
      return;
    }
    sweepRun.current?.stop();
    stopHand();
    const w = width.get();
    let prev = -PAD;
    hand.current = { ...hand.current, blotted: 0 };
    handStain.set(0);
    handY.set(0);
    handScale.set(1);
    handX.set(prev);
    handOn.set(1);
    sweepRun.current = animate(0, 1, {
      duration: 0.5,
      ease: easings.move,
      onUpdate: (v) => {
        const x = lerp(-PAD, w + PAD, v);
        handX.set(r2(x));
        // Through the latest render: a phrase may begin under the pass.
        api.current?.blotSpan(prev, x, 700, clientAt(x));
        prev = x;
      },
      onComplete: () => {
        sweepRun.current = null;
        handOn.set(0);
      },
    });
  };

  // Before the layout effect below, so a measure on arrival finds it.
  React.useLayoutEffect(() => {
    api.current = { play, blotSpan, halt, advance, turn, measure };
    report.current = onPhraseChange;
  });

  React.useLayoutEffect(() => {
    api.current?.measure();
  }, [run]);

  // One pad on the paper: in the visitor's hand when it is there, otherwise
  // the automatic blotter's pass.
  const padLeft = useTransform(
    [lift, reach, handOn, handX],
    ([u = 0, end = 0, on = 0, x = 0]: number[]) =>
      r2((on > 0.001 ? x : padAt(u, end)) - PAD / 2),
  );
  // Past the writing the pad is lifted off: it fades as it rises a nudge.
  const offU = (u: number) => clamp01((u - LIFT_OFF) / (1 - LIFT_OFF));
  const padOn = useTransform([lift, handOn], ([u = 0, on = 0]: number[]) =>
    Math.max(on, motionSafe && u > 0 ? r2(1 - offU(u)) : 0),
  );
  const padY = useTransform(
    [lift, handOn, handY],
    ([u = 0, on = 0, y = 0]: number[]) =>
      on > 0.001 ? y : r2(-distances.nudge * offU(u)),
  );
  const padStain = useTransform(
    [lift, handOn, handStain],
    ([u = 0, on = 0, s = 0]: number[]) =>
      on > 0.001 ? s : r2(Math.min(0.55, sway(Math.min(1, u)) * 0.6)),
  );

  // Words stay whole: a phrase that is too long for the paper wraps between
  // them, never inside one.
  const words: { chars: { char: string; at: number }[]; key: number }[] = [];
  let current: { char: string; at: number }[] = [];
  run.chars.forEach((char, at) => {
    if (char.trim() === "") {
      if (current.length) words.push({ chars: current, key: at });
      current = [];
      return;
    }
    current.push({ char, at });
  });
  if (current.length) words.push({ chars: current, key: run.chars.length });

  const paperColour = `color-mix(in oklab, ${stock.base} 90%, var(--background))`;

  return (
    <>
      <div
        className={cn("relative w-full", className)}
        aria-busy={active || undefined}
      >
        <button
          ref={bindPaper}
          type="button"
          aria-label="Blot the wet ink"
          aria-describedby={hintId}
          disabled={disabled}
          onClick={(event) => {
            // Pointer blotting arrives through the drag. A click with no
            // pointer behind it — Space, Enter, assistive technology — runs
            // the pad along the line.
            if (event.detail === 0) sweep();
          }}
          onPointerDown={(event) => {
            drag.onPointerDown(event);
            if (disabled) return;
            if (event.pointerType === "mouse" && event.button !== 0) return;
            grab(event.clientX, event.timeStamp);
          }}
          onPointerMove={drag.onPointerMove}
          onPointerUp={(event) => {
            drag.onPointerUp(event);
            letGo();
          }}
          onPointerCancel={(event) => {
            drag.onPointerCancel(event);
            letGo();
          }}
          onLostPointerCapture={drag.onLostPointerCapture}
          className={cn(
            "relative block w-full touch-pan-y overflow-clip rounded-3 border border-hairline-strong text-left outline-none select-none [-webkit-touch-callout:none]",
            "shadow-[0_1px_2px_color-mix(in_oklab,black_10%,transparent)]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing",
          )}
          style={{
            backgroundColor: paperColour,
            backgroundImage: stock.texture,
            backgroundSize: stock.size,
          }}
        >
          <motion.div
            initial={false}
            animate={{ height: height ?? "auto" }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          >
            <div
              ref={bindLine}
              aria-hidden
              className="px-5 py-4 text-xl leading-7 font-medium tracking-[0.005em]"
            >
              {words.map((word, w) => (
                <React.Fragment key={word.key}>
                  {w > 0 ? " " : null}
                  <span className="inline-block whitespace-nowrap">
                    {word.chars.map(({ char, at }) => (
                      <Letter
                        key={at}
                        char={char}
                        at={at}
                        cell={run.cells[at] as Cell}
                        clock={clock}
                        lift={lift}
                        reach={reach}
                        tl={tl}
                        stock={stock}
                        feather={feather}
                        motionSafe={motionSafe}
                        bind={bindLetter(`${slot.n}:${at}`)}
                      />
                    ))}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </motion.div>

          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-y-1 left-0 rounded-2 shadow-[0_1px_2px_color-mix(in_oklab,black_22%,transparent),0_6px_12px_-6px_color-mix(in_oklab,black_35%,transparent)]"
            style={{
              width: PAD,
              x: padLeft,
              y: padY,
              scale: handScale,
              opacity: padOn,
              backgroundColor: BLOTTER,
              backgroundImage: GRAIN,
              backgroundSize: "140px 140px",
            }}
          >
            <motion.span
              className="absolute inset-0 rounded-[inherit]"
              style={{ opacity: padStain, backgroundImage: STAIN }}
            />
          </motion.span>
        </button>
        <span id={hintId} className="sr-only">
          Drag across wet ink to blot it, or press Enter to blot the whole line.
        </span>
      </div>
      {/* Outside the busy root: a busy ancestor may hold announcements back. */}
      <p role="status" className="sr-only">
        {slot.text}
      </p>
    </>
  );
}
