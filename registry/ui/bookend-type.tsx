"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type BookendTypeElement =
  "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";

export type BookendTypeTrigger = "mount" | "inView" | "manual";

export type BookendTypeShelf = "wood" | "steel" | "none";

export type BookendTypePhase = "standing" | "slumping" | "slumped" | "tidying";

export type BookendTypeProps = {
  /** The words, one per round, cycled. */
  words: string[];
  /** The element that carries the current word. @default "p" */
  as?: BookendTypeElement;
  /** How far the books slump, degrees; it also sets the far bookend's gap. @default 16 */
  leanAngle?: number;
  /** Speed of the whole round, 0.5 to 2 times. @default 1 */
  pace?: number;
  /** The plank the books stand on. @default "wood" */
  shelf?: BookendTypeShelf;
  /** Set the books in capitals. @default true */
  caps?: boolean;
  /** The letters' colour, any CSS colour. @default "currentColor" */
  color?: string;
  /** The bookends' colour, any CSS colour. @default "var(--ink-3)" */
  bookendColor?: string;
  /** Rounds run on their own. @default true */
  autoplay?: boolean;
  /** How long a word stands upright before its round, ms. @default 1600 */
  interval?: number;
  /** Each round leans the other way, the bookends trading roles. @default true */
  alternate?: boolean;
  /** What starts the rounds. @default "inView" */
  trigger?: BookendTypeTrigger;
  /** With trigger "manual": true starts the rounds, false stops after the current one. @default false */
  play?: boolean;
  /** Wait before the first round, ms. @default 0 */
  delay?: number;
  /** A press, Enter or Space nudges the shelf (or tidies a slumped one). @default true */
  interactive?: boolean;
  /** Knocks for the rounds the visitor starts. Off unless asked for. @default false */
  sound?: boolean;
  /** A new word is on the shelf: its index in `words`. */
  onWordChange?: (index: number) => void;
  /** The round moved on. */
  onPhaseChange?: (phase: BookendTypePhase) => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;

/** The recoil calibration as a decaying wobble: a book knocking home. */
const RECOIL_W = Math.sqrt(springs.recoil.stiffness / springs.recoil.mass);
const RECOIL_Z =
  springs.recoil.damping /
  (2 * Math.sqrt(springs.recoil.stiffness * springs.recoil.mass));
const RECOIL_WD = RECOIL_W * Math.sqrt(1 - RECOIL_Z * RECOIL_Z);
const knockAt = (t: number) =>
  t <= 0 ? 0 : Math.exp(-RECOIL_Z * RECOIL_W * t) * Math.sin(RECOIL_WD * t);

function graphemes(text: string): string[] {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    return Array.from(
      new Seg(undefined, { granularity: "grapheme" }).segment(text),
      (s) => s.segment,
    );
  }
  return Array.from(text);
}

const PLANKS: Record<Exclude<BookendTypeShelf, "none">, string> = {
  // Wood and steel are materials: fixed pigments, the same in both themes.
  wood: "linear-gradient(180deg, oklch(0.62 0.07 62) 0%, oklch(0.53 0.07 55) 55%, oklch(0.42 0.06 50) 100%)",
  steel:
    "linear-gradient(180deg, oklch(0.86 0.005 250) 0%, oklch(0.66 0.008 250) 50%, oklch(0.5 0.01 250) 100%)",
};

type Book = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  rotate: MotionValue<number>;
  opacity: MotionValue<number>;
};

type Round = {
  /** New for every word put on the shelf. */
  n: number;
  index: number;
  /** +1 the books lean right (the row starts against the left bookend). */
  dir: 1 | -1;
};

type Geometry = {
  /** Advance widths and the cap height, px; the gap between books. */
  w: number[];
  H: number;
  g: number;
  /** Natural left of each book within the row. */
  L: number[];
  W: number;
  /** How far the row moves over a round: the slump's extra length. */
  slack: number;
  theta: number;
  em: number;
};

type Plan = {
  phase:
    | "arriving"
    | "standing"
    | "nudge"
    | "slumping"
    | "slumped"
    | "tidying"
    | "done";
  /** The round clock, s, and when the current phase began. */
  t: number;
  at: number;
  visitor: boolean;
  /** Per book, in lean order: slump and tidy progress, and its knock time. */
  p: Float64Array;
  u: Float64Array;
  leaned: Float64Array;
  stood: Float64Array;
};

const planOf = (n: number): Plan => ({
  phase: "arriving",
  t: 0,
  at: 0,
  visitor: false,
  p: new Float64Array(n),
  u: new Float64Array(n),
  leaned: new Float64Array(n).fill(Number.NaN),
  stood: new Float64Array(n).fill(Number.NaN),
});

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

function Bookend({
  side,
  x,
  color,
}: {
  side: "left" | "right";
  x: MotionValue<number>;
  color: string;
}) {
  // An L of bent steel seen edge on: a plate standing a little taller than
  // the capitals, its foot reaching in under the nearest book.
  const inner = side === "left" ? "left" : "right";
  return (
    <motion.span
      aria-hidden
      className="relative block shrink-0 self-end"
      style={{ x, width: "0.075em", height: "0.98em" }}
    >
      <span
        className="absolute inset-0 block rounded-[0.03em]"
        style={{ background: color }}
      />
      <span
        className="absolute bottom-0 block rounded-[0.02em]"
        style={{
          [inner]: 0,
          width: "0.38em",
          height: "0.045em",
          background: color,
        }}
      />
    </motion.span>
  );
}

type Api = {
  wake: () => void;
  halt: () => void;
  measure: () => void;
  nudge: (visitor: boolean) => void;
  arrive: () => void;
  place: () => void;
};

/**
 * Letters standing on a shelf like books. A round: the near bookend gives
 * the first book a nudge and the lean runs down the line — each book falls
 * with a gravity ease, pushing the one ahead (a follower is never more than a
 * short lag behind, so no book passes through another) and comes to rest
 * slanted against its neighbour with a small recoil, the last one resting its
 * top on the far bookend, which stands exactly where that slump puts it.
 * After a beat the near bookend slides in and tidies the shelf, pushing the
 * books upright one after another, each straightening on a snap-like ease
 * and landing against its neighbour with a soft knock (a one-degree wobble on
 * the recoil calibration). Then the next word takes the shelf and the next
 * round runs from the other end.
 *
 * The geometry is solved from the measured letter widths and cap height:
 * the slumped books stack parallel, so the row grows by a known amount, and
 * that is how far the bookends stand apart. If the slumped row would not fit,
 * the type is scaled down to fit. The shelf is a real button: a press, Enter
 * or Space starts a round now, or tidies a slumped shelf at once. The current
 * word is the heading's text. One loop runs only while books move; between
 * rounds a single timer waits, and nothing runs off screen. Under reduced
 * motion the books never lean: the words cross-fade on an upright shelf.
 */
export function BookendType({
  words,
  as = "p",
  leanAngle = 16,
  pace = 1,
  shelf = "wood",
  caps = true,
  color = "currentColor",
  bookendColor = "var(--ink-3)",
  autoplay = true,
  interval = 1600,
  alternate = true,
  trigger = "inView",
  play = false,
  delay = 0,
  interactive = true,
  sound = false,
  onWordChange,
  onPhaseChange,
  className,
}: BookendTypeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const list = React.useMemo(() => {
    const clean = words.map((w) => w.trim()).filter(Boolean);
    return (clean.length ? clean : [""]).map((w) =>
      caps ? w.toUpperCase() : w,
    );
  }, [words, caps]);
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;
  const [entrance, setEntrance] = React.useState({ n: 0, on: false });
  const started = entrance.on && (trigger !== "manual" || play);
  const [round, setRound] = React.useState<Round>({ n: 0, index: 0, dir: 1 });
  const [fit, setFit] = React.useState(1);
  const [slackEm, setSlackEm] = React.useState<number | null>(null);
  const [baseline, setBaseline] = React.useState(0.8);
  const word = list[round.index % list.length] ?? "";
  const chars = React.useMemo(() => graphemes(word), [word]);
  const theta = (clamp(leanAngle, 4, 34) * Math.PI) / 180;
  const rate = clamp(pace, 0.5, 2);

  // The far bookend's gap before measuring, from typical capitals: the cap
  // height leaning over, and each book's extra width when slanted.
  const estimate = r3(
    0.72 * Math.sin(theta) + chars.length * 0.68 * (1 / Math.cos(theta) - 1),
  );
  const gap = slackEm ?? estimate;

  const books = React.useMemo(
    () =>
      chars.map((): Book => ({
        x: motionValue(0),
        y: motionValue(0),
        rotate: motionValue(0),
        opacity: motionValue(1),
      })),
    // A new set of books for every word put on the shelf.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [round.n, chars],
  );
  const [ends] = React.useState(() => ({
    left: motionValue(0),
    right: motionValue(0),
  }));

  const rootRef = React.useRef<HTMLButtonElement | null>(null);
  const rowRef = React.useRef<HTMLSpanElement | null>(null);
  const measureRef = React.useRef<HTMLSpanElement | null>(null);
  const leftRef = React.useRef<HTMLSpanElement | null>(null);
  const rightRef = React.useRef<HTMLSpanElement | null>(null);
  const geo = React.useRef<Geometry | null>(null);
  const plan = React.useRef<Plan>(planOf(0));
  const raf = React.useRef(0);
  const last = React.useRef(0);
  const live = React.useRef(running);
  const wait = React.useRef<number | null>(null);
  const endRuns = React.useRef<AnimationPlaybackControls[]>([]);
  const flip = React.useRef<{ left: number; right: number } | null>(null);
  const api = React.useRef<Api | null>(null);
  const cfg = React.useRef({
    rate,
    theta,
    interval,
    autoplay,
    alternate,
    motionSafe,
    started,
    count: list.length,
    round,
    audio,
    onWordChange,
    onPhaseChange,
  });
  const frameRef = React.useRef((now: number) => {
    void now;
  });

  const wake = () => {
    if (raf.current || !live.current) return;
    last.current = performance.now();
    raf.current = window.requestAnimationFrame((t) => frameRef.current(t));
  };
  const halt = () => {
    if (raf.current) window.cancelAnimationFrame(raf.current);
    raf.current = 0;
  };
  const clearWait = () => {
    if (wait.current !== null) window.clearTimeout(wait.current);
    wait.current = null;
  };

  const report = (phase: BookendTypePhase) => {
    cfg.current.onPhaseChange?.(phase);
  };

  /**
   * Widths, cap height and the slump's geometry, from a hidden copy of every
   * word (so the type size is fitted to the longest slump, not each word).
   */
  const measure = () => {
    const root = rootRef.current;
    const box = measureRef.current;
    if (!root || !box) return;
    const c = cfg.current;
    const em = parseFloat(getComputedStyle(box).fontSize) || 16;
    const probe = document.createElement("canvas").getContext("2d");
    const s = getComputedStyle(box);
    let H = em * 0.72;
    let base = 0.8;
    if (probe) {
      probe.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      const m = probe.measureText("H");
      if (m.actualBoundingBoxAscent > 0) H = m.actualBoundingBoxAscent;
      const asc = m.fontBoundingBoxAscent;
      const desc = m.fontBoundingBoxDescent;
      if (asc > 0) base = clamp01(((em - (asc + desc)) / 2 + asc) / em);
    }
    const g = em * 0.035;
    const cos = Math.cos(c.theta);
    const sin = Math.sin(c.theta);
    let widest = 0;
    let mine: Geometry | null = null;
    box.querySelectorAll<HTMLSpanElement>("[data-word]").forEach((node) => {
      const w = Array.from(
        node.querySelectorAll<HTMLSpanElement>("[data-book]"),
      ).map((b) => b.getBoundingClientRect().width);
      const L: number[] = [];
      let x = 0;
      for (const wi of w) {
        L.push(x);
        x += wi + g;
      }
      const W = Math.max(0, x - g);
      // Slumped books stack parallel: every pivot moves out by 1/cos θ from
      // the row's start, and the last one's top reaches H·sin θ further.
      const slack = W * (1 / cos - 1) + H * sin;
      widest = Math.max(widest, W + slack);
      if (node.dataset.word === String(c.round.index % c.count)) {
        mine = { w, H, g, L, W, slack, theta: c.theta, em };
      }
    });
    geo.current = mine;
    // Both bookends, their clearance and the slump must fit the shelf.
    const room = root.clientWidth - em * 0.9;
    const need = widest + em * 0.5;
    const nextFit = r3(clamp(need > 0 ? room / need : 1, 0.3, 1) * fit);
    const settledFit =
      Math.abs(nextFit - fit) < 0.01 ? fit : Math.min(1, nextFit);
    setFit((prev) => (Math.abs(prev - settledFit) < 0.01 ? prev : settledFit));
    const m = geo.current as Geometry | null;
    if (m) {
      const next = r3(m.slack / em);
      setSlackEm((prev) =>
        prev !== null && Math.abs(prev - next) < 0.002 ? prev : next,
      );
    }
    setBaseline((prev) => (Math.abs(prev - base) < 0.005 ? prev : r3(base)));
  };

  /** Pose of every book for the plan as it stands, written to motion values. */
  const place = () => {
    const m = geo.current;
    const pl = plan.current;
    const c = cfg.current;
    const dir = c.round.dir;
    const n = books.length;
    if (!m || m.w.length !== n) return;
    const cos = Math.cos(m.theta);
    const deg = (m.theta * 180) / Math.PI;
    const tidy = pl.phase === "tidying" || pl.phase === "done";
    let nearFace = 0;
    for (let k = 0; k < n; k += 1) {
      // k is the lean order; i the book's place in the word. The lean frame
      // runs from the near end, so the pivots are the books' far corners.
      const i = dir > 0 ? k : n - 1 - k;
      const book = books[i];
      if (!book) continue;
      const w = m.w[i] ?? 0;
      const Lv = dir > 0 ? (m.L[i] ?? 0) : m.W - (m.L[i] ?? 0) - w;
      const cu = Lv + w;
      const cs = cu / cos;
      const cr = cu + m.slack;
      const p = pl.p[k] ?? 0;
      const u = pl.u[k] ?? 0;
      const c0 = tidy ? lerp(cs, cr, u) : lerp(cu, cs, p);
      const a = tidy ? m.theta * (1 - u) : m.theta * p;
      // The knocks: a lean coming to rest, a book coming upright.
      const leaned = pl.leaned[k] ?? Number.NaN;
      const stood = pl.stood[k] ?? Number.NaN;
      let wobble = 0;
      if (tidy && !Number.isNaN(stood)) wobble = -1.2 * knockAt(pl.t - stood);
      else if (!tidy && !Number.isNaN(leaned))
        wobble = -0.09 * deg * knockAt(pl.t - leaned);
      const real = dir > 0 ? c0 - w : m.W - c0;
      book.x.set(r2(real - (m.L[i] ?? 0)));
      book.rotate.set(r2(dir * ((a * 180) / Math.PI + wobble)));
      // The near bookend rides the first book's lifted lower corner.
      if (k === 0) nearFace = c0 - w * Math.cos(a);
    }
    let near = 0;
    if (pl.phase === "nudge") {
      near = Math.sin(Math.PI * clamp01((pl.t - pl.at) / 0.16)) * 0.09 * m.em;
    } else if (tidy) {
      // It closes the last hair of gap before it starts to push.
      near =
        Math.max(0, nearFace) *
        (pl.phase === "done" ? 1 : clamp01((pl.t - pl.at) / 0.1));
    }
    if (dir > 0) ends.left.set(r2(near));
    else ends.right.set(r2(-near));
  };

  /** Slump and tidy progress, advanced with the round clock. */
  const advance = (dt: number) => {
    const pl = plan.current;
    const c = cfg.current;
    const n = pl.p.length;
    const r = c.rate;
    pl.t += dt;
    const age = pl.t - pl.at;
    const set = (phase: Plan["phase"]) => {
      pl.phase = phase;
      pl.at = pl.t;
    };
    const audio = c.audio;
    const pan = (k: number) => {
      const root = rootRef.current;
      const row = rowRef.current;
      if (!root || !row) return 0;
      const rect = row.getBoundingClientRect();
      const t = n > 1 ? k / (n - 1) : 0.5;
      const x =
        c.round.dir > 0
          ? rect.left + rect.width * t
          : rect.right - rect.width * t;
      return panFrom(x, root);
    };
    switch (pl.phase) {
      case "arriving":
        if (age > Math.max(0, n - 1) * cascade(n) + 0.3) set("standing");
        return true;
      case "standing":
        return false;
      case "nudge":
        if (age > 0.08 / r) {
          set("slumping");
          report("slumping");
        }
        return true;
      case "slumping": {
        // Each book falls under gravity; a follower is pushed so it never
        // lags its leader by more than a quarter of the fall.
        const fall = 0.34 / r;
        const gapT = 0.075 / r;
        let all = true;
        for (let k = 0; k < n; k += 1) {
          const own = clamp01(((age - k * gapT) / fall) ** 2);
          const lead = k > 0 ? (pl.p[k - 1] ?? 0) - 0.25 : 0;
          const p = Math.max(own, lead);
          pl.p[k] = p;
          if (p >= 1 && Number.isNaN(pl.leaned[k] ?? Number.NaN)) {
            pl.leaned[k] = pl.t;
            if (pl.visitor) {
              audio.play("thock", { pitch: 1.25, gain: 0.16, pan: pan(k) });
            }
          }
          if (p < 1) all = false;
        }
        if (all && age > n * gapT + fall + 0.25) {
          set("slumped");
          report("slumped");
        }
        return true;
      }
      case "slumped":
        if (c.autoplay || pl.visitor) {
          if (age > 0.7 / r) {
            set("tidying");
            report("tidying");
          }
          return true;
        }
        return false;
      case "tidying": {
        // The bookend pushes them upright one after another; a book is
        // never left more than a third of its straightening behind.
        const lift = 0.2 / r;
        const gapT = 0.085 / r;
        let all = true;
        for (let k = 0; k < n; k += 1) {
          const own = easeOut((age - 0.12 / r - k * gapT) / lift);
          const lead = k > 0 ? (pl.u[k - 1] ?? 0) - 0.35 : 0;
          const u = Math.max(own, lead, 0);
          pl.u[k] = u;
          if (u >= 1 && Number.isNaN(pl.stood[k] ?? Number.NaN)) {
            pl.stood[k] = pl.t;
            if (pl.visitor) {
              audio.play("thock", {
                pitch: 0.95 + (k % 3) * 0.05,
                gain: 0.42,
                pan: pan(k),
              });
            }
          }
          if (u < 1) all = false;
        }
        if (all && age > 0.12 / r + n * gapT + lift + 0.7) {
          set("done");
          report("standing");
          return false;
        }
        return true;
      }
      default:
        return false;
    }
  };

  const frame = (now: number) => {
    raf.current = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last.current) / 1000));
    last.current = now;
    const pl = plan.current;
    const moving = advance(dt);
    place();
    // Arriving letters fade up a nudge, cascaded.
    if (pl.phase === "arriving") {
      const step = cascade(books.length);
      books.forEach((book, i) => {
        const t = clamp01((pl.t - i * step) / 0.24);
        book.opacity.set(r3(easeOut(t)));
        book.y.set(r2((1 - easeOut(t)) * 4));
      });
    } else if (pl.phase === "standing") {
      for (const book of books) {
        book.opacity.set(1);
        book.y.set(0);
      }
    }
    if (moving && live.current) {
      raf.current = window.requestAnimationFrame((t) => frameRef.current(t));
    } else {
      api.current?.place();
      schedule();
    }
  };

  /** What happens next, from a standing or finished shelf. */
  const schedule = () => {
    clearWait();
    const pl = plan.current;
    const c = cfg.current;
    if (!c.started || !live.current) return;
    if (pl.phase === "standing" && c.autoplay) {
      wait.current = window.setTimeout(
        () => api.current?.nudge(false),
        Math.round(c.interval),
      );
    } else if (pl.phase === "done" && c.autoplay) {
      wait.current = window.setTimeout(
        () => nextWord(),
        Math.round(500 / c.rate),
      );
    }
  };

  /** The next word takes the shelf; the next round leans the other way. */
  const nextWord = () => {
    const c = cfg.current;
    // Where the bookends are seen now, offsets included, for the glide.
    const left =
      (leftRef.current?.getBoundingClientRect().left ?? 0) + ends.left.get();
    const right =
      (rightRef.current?.getBoundingClientRect().left ?? 0) + ends.right.get();
    flip.current = { left, right };
    // The old books leave on the exit ease before the new ones arrive.
    books.forEach((book) =>
      animate(book.opacity, 0, { duration: 0.14, ease: [0.5, 0, 0.75, 0] }),
    );
    wait.current = window.setTimeout(() => {
      wait.current = null;
      setRound((r) => ({
        n: r.n + 1,
        index: (r.index + 1) % Math.max(1, c.count),
        dir: c.alternate && c.motionSafe ? (r.dir > 0 ? -1 : 1) : r.dir,
      }));
    }, 150);
  };

  /** A nudge: a round starts, or a slumped shelf is tidied at once. */
  const nudge = (visitor: boolean) => {
    const pl = plan.current;
    const c = cfg.current;
    clearWait();
    if (!c.motionSafe) {
      // The shelf stays upright: the word simply changes.
      nextWord();
      return;
    }
    if (pl.phase === "slumped") {
      pl.visitor = pl.visitor || visitor;
      pl.phase = "tidying";
      pl.at = pl.t;
      report("tidying");
      wake();
      return;
    }
    if (pl.phase === "done") {
      if (visitor) nextWord();
      return;
    }
    if (pl.phase !== "standing") return;
    pl.visitor = visitor;
    pl.phase = "nudge";
    pl.at = pl.t;
    wake();
  };

  /** A new word is on the shelf: fresh books, bookends gliding to it. */
  const arrive = () => {
    const pl = planOf(books.length);
    plan.current = pl;
    for (const run of endRuns.current) run.stop();
    endRuns.current = [];
    const was = flip.current;
    flip.current = null;
    ends.left.jump(0);
    ends.right.jump(0);
    if (was) {
      // The bookends were somewhere else a moment ago: start them there and
      // let them glide to the new word.
      const left = leftRef.current?.getBoundingClientRect().left ?? was.left;
      const right = rightRef.current?.getBoundingClientRect().left ?? was.right;
      if (cfg.current.motionSafe) {
        ends.left.jump(r2(was.left - left));
        ends.right.jump(r2(was.right - right));
        endRuns.current = [
          animate(ends.left, 0, springs.glide),
          animate(ends.right, 0, springs.glide),
        ];
      }
    }
    books.forEach((book) => {
      book.opacity.jump(cfg.current.started || was ? 0 : 1);
      book.y.jump(0);
      book.x.jump(0);
      book.rotate.jump(0);
    });
    if (!cfg.current.started && !was) pl.phase = "standing";
    cfg.current.onWordChange?.(cfg.current.round.index);
    report("standing");
    wake();
    schedule();
  };

  React.useLayoutEffect(() => {
    cfg.current = {
      rate,
      theta,
      interval,
      autoplay,
      alternate,
      motionSafe,
      started,
      count: list.length,
      round,
      audio,
      onWordChange,
      onPhaseChange,
    };
    frameRef.current = frame;
    live.current = running;
    api.current = { wake, halt, measure, nudge, arrive, place };
  });

  // Every word put on the shelf: measured, then its books arrive.
  React.useLayoutEffect(() => {
    api.current?.measure();
    api.current?.arrive();
  }, [round]);

  React.useLayoutEffect(() => {
    api.current?.measure();
    api.current?.place();
  }, [fit, leanAngle, list]);

  React.useEffect(() => {
    if (!started) {
      if (wait.current !== null) window.clearTimeout(wait.current);
      wait.current = null;
      return;
    }
    // The first nudge comes quickly; on an upright-only shelf the first
    // word gets its full stand before the next one replaces it.
    const id = window.setTimeout(
      () => {
        const pl = plan.current;
        if (pl.phase === "standing") api.current?.nudge(false);
      },
      Math.max(0, delay) + (cfg.current.motionSafe ? 500 : interval),
    );
    return () => window.clearTimeout(id);
    // The delay belongs to the trigger, not to a later change of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, entrance.n]);

  React.useEffect(() => {
    if (running) {
      api.current?.wake();
    } else {
      api.current?.halt();
      if (wait.current !== null) window.clearTimeout(wait.current);
      wait.current = null;
    }
  }, [running]);

  React.useEffect(() => {
    const runs = endRuns;
    return () => {
      api.current?.halt();
      if (wait.current !== null) window.clearTimeout(wait.current);
      wait.current = null;
      for (const run of runs.current) run.stop();
    };
  }, []);

  const timer = React.useRef<number | null>(null);
  const begin = React.useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on ? e : { n: e.n + 1, on: true }));
    }, 0);
  }, []);
  const rest = React.useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on ? { n: e.n, on: false } : e));
    }, 0);
  }, []);

  React.useEffect(() => {
    if (trigger === "mount") begin();
    if (trigger === "manual") {
      if (play) begin();
      else rest();
    }
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [trigger, play, begin, rest]);

  const seen = React.useRef(trigger);
  React.useLayoutEffect(() => {
    seen.current = trigger;
  });

  const bindRoot = React.useCallback(
    (node: HTMLButtonElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const relayout = () => {
        api.current?.measure();
        api.current?.place();
      };
      const sizer = new ResizeObserver(relayout);
      sizer.observe(node);
      document.fonts?.addEventListener?.("loadingdone", relayout);
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        const visible = Boolean(entry?.isIntersecting);
        setOnScreen(visible);
        if (seen.current === "inView" && visible) begin();
      });
      watcher.observe(node);
      return () => {
        sizer.disconnect();
        watcher.disconnect();
        document.fonts?.removeEventListener?.("loadingdone", relayout);
      };
    },
    [begin],
  );

  const Tag = as;
  const descent = r3(1 - baseline);
  const spacer = (
    <span
      aria-hidden
      className="block shrink-0"
      style={{ width: `${gap}em` }}
    />
  );

  return (
    <div className={cn("relative w-full", className)}>
      <Tag className="sr-only">{word}</Tag>
      <button
        ref={bindRoot}
        type="button"
        aria-label="Nudge the shelf"
        aria-describedby={hintId}
        disabled={!interactive}
        onClick={() => api.current?.nudge(true)}
        className={cn(
          "relative block w-full overflow-clip rounded-3 px-[0.45em] pt-[0.32em] text-left outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          interactive ? "cursor-pointer" : "cursor-default",
        )}
        style={{ paddingBottom: "0.2em" }}
      >
        <span
          aria-hidden
          className="relative flex items-end justify-center"
          style={{ fontSize: `${fit}em`, color }}
        >
          <span ref={leftRef} className="block shrink-0">
            <Bookend side="left" x={ends.left} color={bookendColor} />
          </span>
          {round.dir < 0 ? spacer : null}
          <span ref={rowRef} className="flex items-end">
            {chars.map((ch, i) => {
              const book = books[i];
              if (!book) return null;
              return (
                <motion.span
                  key={`${round.n}:${i}`}
                  className="block leading-none whitespace-pre"
                  style={{
                    x: book.x,
                    y: book.y,
                    rotate: book.rotate,
                    opacity: book.opacity,
                    originX: round.dir > 0 ? "100%" : "0%",
                    originY: `${r2(baseline * 100)}%`,
                    marginRight: i < chars.length - 1 ? "0.035em" : 0,
                    marginBottom: `${-descent}em`,
                  }}
                >
                  {ch}
                </motion.span>
              );
            })}
          </span>
          {round.dir > 0 ? spacer : null}
          <span ref={rightRef} className="block shrink-0">
            <Bookend side="right" x={ends.right} color={bookendColor} />
          </span>
        </span>
        {shelf !== "none" ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-[0.2em] block rounded-[0.04em] shadow-[0_0.06em_0.12em_-0.04em_oklch(0_0_0/0.35)]"
            style={{
              bottom: `${r3(0.2 - (shelf === "wood" ? 0.13 : 0.06) * fit)}em`,
              height: `${r3((shelf === "wood" ? 0.13 : 0.06) * fit)}em`,
              background: PLANKS[shelf],
            }}
          />
        ) : null}
      </button>
      <span id={hintId} className="sr-only">
        Press, Enter or Space to nudge the books over; again to tidy them.
      </span>
      {/* Every word, unseen and clipped to the shelf's own box, so the type
          is fitted to the longest slump. */}
      <span
        aria-hidden
        className="pointer-events-none invisible absolute inset-0 overflow-hidden"
      >
        <span
          ref={measureRef}
          className="absolute top-0 left-0 flex flex-col whitespace-pre"
          style={{ fontSize: `${fit}em` }}
        >
          {list.map((w, wi) => (
            <span key={wi} data-word={wi} className="flex">
              {graphemes(w).map((ch, i) => (
                <span key={i} data-book="" className="block leading-none">
                  {ch}
                </span>
              ))}
            </span>
          ))}
        </span>
      </span>
    </div>
  );
}
