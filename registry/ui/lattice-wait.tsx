"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LatticeWaitStatus = "loading" | "success" | "error";

export type LatticeWaitSize = "sm" | "md" | "lg";

/** Pigments that read the same on a light page and a dark one. */
export type LatticeWaitColor = "cobalt" | "signal" | "ember" | "rose";

export type LatticeWaitProps = {
  /** Weaving while loading; collapsing into a check or a cross when it is done. @default "loading" */
  status?: LatticeWaitStatus;
  /** What is loading: the status text while weaving. @default "Loading" */
  label?: string;
  /** The status text once it succeeds. @default "Done" */
  successLabel?: string;
  /** The status text if it fails. @default "Failed" */
  errorLabel?: string;
  /** Show the status text beside the lattice; otherwise it is for assistive technology only. @default false */
  showLabel?: boolean;
  /** Dots on each side of the lattice, 3 to 5. @default 4 */
  grid?: number;
  /** Weaving speed: 1 draws five threads a second. @default 1 */
  pace?: number;
  /** How long each finished pattern holds before it unweaves, in ms. @default 420 */
  hold?: number;
  /** Seeds the walks the thread takes; the same seed weaves the same patterns. @default 7 */
  seed?: number;
  /** The thread and the lit dots: a preset or any CSS colour. @default "cobalt" */
  color?: LatticeWaitColor | (string & {});
  /** The check's colour. @default "var(--success)" */
  successColor?: string;
  /** The cross's colour. @default "var(--danger)" */
  errorColor?: string;
  /** 28, 44 or 64 px. @default "md" */
  size?: LatticeWaitSize;
  /** Hold the weave still where it is. */
  paused?: boolean;
  /** Fires when the lattice has finished collapsing into its mark (or back into the weave). */
  onSettle?: (status: LatticeWaitStatus) => void;
  /** Classes for the status root. */
  className?: string;
};

const PALETTE: Record<LatticeWaitColor, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ember: "oklch(from var(--warn) 0.74 c h)",
  rose: "oklch(from var(--danger) 0.64 c h)",
};

type Metrics = { box: number; dot: number; thread: number; text: string };

/** Strokes and dots in viewBox units (the box is 100), heavier when small so they stay crisp. */
const SIZES: Record<LatticeWaitSize, Metrics> = {
  sm: { box: 28, dot: 5, thread: 5.4, text: "text-xs" },
  md: { box: 44, dot: 4, thread: 4.2, text: "text-sm" },
  lg: { box: 64, dot: 3.4, thread: 3.4, text: "text-sm" },
};

/** Threads drawn per second at pace 1. */
const BASE_RATE = 5;
/** Unweaving runs this much faster than weaving. */
const UNWEAVE = 1.6;
/** Distinct cycles before the weave repeats. */
const CYCLES = 8;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** A small, fast, seeded generator: the same seed weaves the same lattice on the server and in the browser. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One weave: a walk through the 8-neighbourhood that never revisits a dot,
 * preferring a turn to a straight run and a diagonal to an edge, so threads
 * cross and the lattice reads as woven rather than ruled.
 */
function weave(g: number, start: number, rand: () => number, most: number) {
  const path = [start];
  const seen = new Set([start]);
  let dr = 0;
  let dc = 0;
  while (path.length - 1 < most) {
    const cur = path[path.length - 1] ?? 0;
    const r = Math.floor(cur / g);
    const c = cur % g;
    const options: { id: number; dr: number; dc: number; w: number }[] = [];
    for (let a = -1; a <= 1; a += 1) {
      for (let b = -1; b <= 1; b += 1) {
        if (a === 0 && b === 0) continue;
        const nr = r + a;
        const nc = c + b;
        if (nr < 0 || nc < 0 || nr >= g || nc >= g) continue;
        const id = nr * g + nc;
        if (seen.has(id)) continue;
        const straight = a === dr && b === dc;
        const diagonal = a !== 0 && b !== 0;
        options.push({
          id,
          dr: a,
          dc: b,
          w: (straight ? 0.3 : 1) * (diagonal ? 1.4 : 1),
        });
      }
    }
    if (options.length === 0) break;
    let pick = rand() * options.reduce((sum, o) => sum + o.w, 0);
    let chosen = options[options.length - 1];
    for (const o of options) {
      pick -= o.w;
      if (pick <= 0) {
        chosen = o;
        break;
      }
    }
    if (!chosen) break;
    path.push(chosen.id);
    seen.add(chosen.id);
    dr = chosen.dr;
    dc = chosen.dc;
  }
  return path;
}

type Cycle = {
  walk: number[];
  start: number;
  form: number;
  hold: number;
  total: number;
};

function plan(g: number, seed: number, holdUnits: number) {
  const most = g === 3 ? 8 : g === 4 ? 12 : 15;
  const cycles: Cycle[] = [];
  let at = 0;
  let from = Math.floor(rng(seed)() * g * g);
  for (let k = 0; k < CYCLES; k += 1) {
    let walk = [from];
    // A walk that boxes itself in early is tried again from the same dot.
    for (let tryN = 0; tryN < 6 && walk.length < Math.min(most, 5); tryN += 1) {
      walk = weave(g, from, rng(seed * 7919 + k * 104729 + tryN * 13), most);
    }
    const form = walk.length - 1;
    const total = form + holdUnits + form / UNWEAVE;
    cycles.push({ walk, start: at, form, hold: holdUnits, total });
    at += total;
    from = walk[walk.length - 1] ?? 0;
  }
  return { cycles, length: at };
}

type Pt = [number, number];

const MARKS: Record<"success" | "error", Pt[][]> = {
  success: [
    [
      [25, 53],
      [43, 71],
      [76, 33],
    ],
  ],
  error: [
    [
      [31, 31],
      [69, 69],
    ],
    [
      [69, 31],
      [31, 69],
    ],
  ],
};

/** `count` points spread evenly along the strokes of a mark, in drawing order. */
function along(strokes: Pt[][], count: number): Pt[] {
  const segs: { a: Pt; b: Pt; len: number }[] = [];
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i += 1) {
      const a = stroke[i - 1];
      const b = stroke[i];
      if (a && b)
        segs.push({ a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) });
    }
  }
  const total = segs.reduce((s, x) => s + x.len, 0);
  const out: Pt[] = [];
  for (let k = 0; k < count; k += 1) {
    let d = count > 1 ? (total * k) / (count - 1) : total / 2;
    for (const s of segs) {
      if (d <= s.len || s === segs[segs.length - 1]) {
        const t = s.len > 0 ? Math.min(1, d / s.len) : 0;
        out.push([r2(lerp(s.a[0], s.b[0], t)), r2(lerp(s.a[1], s.b[1], t))]);
        break;
      }
      d -= s.len;
    }
  }
  return out;
}

const markPath = (strokes: Pt[][]) =>
  strokes
    .map((s) => `M ${s.map(([x, y]) => `${x} ${y}`).join(" L ")}`)
    .join(" ");

const circle = (x: number, y: number, r: number) =>
  `M ${r2(x - r)} ${r2(y)} a ${r2(r)} ${r2(r)} 0 1 0 ${r2(2 * r)} 0 a ${r2(r)} ${r2(r)} 0 1 0 ${r2(-2 * r)} 0 `;

/**
 * A loading indicator that weaves itself. A thread draws from dot to dot of a
 * small lattice along a seeded walk — turning more than it runs straight,
 * crossing on the diagonals — forming a pattern segment by segment, holding
 * it a moment, then unweaving from its tail, and the next cycle starts where
 * the last one ended with the next seed: never the same pattern twice, never
 * random. Each dot pops as the thread reaches it. One linear clock drives it
 * all, so `pace` is simply its speed.
 *
 * When the work is done the thread lets go and the dots glide, one after
 * another, onto a check mark — or a cross — whose stroke then draws through
 * them as they arrive, and they dissolve into it. Back to loading, the mark
 * undraws and the dots glide home. The root is `role="status"`, its text
 * changing only with `status`. Under reduced motion the lattice holds one
 * still pattern and breathes, and the mark cross-fades in.
 */
export function LatticeWait({
  status = "loading",
  label = "Loading",
  successLabel = "Done",
  errorLabel = "Failed",
  showLabel = false,
  grid = 4,
  pace = 1,
  hold = 420,
  seed = 7,
  color = "cobalt",
  successColor = "var(--success)",
  errorColor = "var(--danger)",
  size = "md",
  paused = false,
  onSettle,
  className,
}: LatticeWaitProps) {
  const motionSafe = useMotionSafe();
  const m = SIZES[size] ?? SIZES.md;
  const paint = (PALETTE as Record<string, string>)[color] ?? color;
  const g = Math.max(3, Math.min(5, Math.round(grid)));
  const rate = BASE_RATE * Math.max(0.1, pace);
  const holdUnits = (Math.max(0, hold) / 1000) * BASE_RATE;
  const done = status !== "loading";
  const markKind: "success" | "error" =
    status === "error" ? "error" : "success";

  const { cycles, length } = React.useMemo(
    () => plan(g, Math.round(seed), holdUnits),
    [g, seed, holdUnits],
  );
  const dots = React.useMemo(() => {
    const out: Pt[] = [];
    for (let r = 0; r < g; r += 1) {
      for (let c = 0; c < g; c += 1) {
        out.push([r2(14 + (72 * c) / (g - 1)), r2(14 + (72 * r) / (g - 1))]);
      }
    }
    return out;
  }, [g]);
  // Dots in drawing order for the mark: left to right, so the check is
  // filled from its short stroke up its long one with no crossings.
  const targets = React.useMemo(() => {
    const order = dots
      .map((p, i) => ({ p, i }))
      .sort((a, b) => a.p[0] - b.p[0] || a.p[1] - b.p[1]);
    const spots = along(MARKS[markKind], dots.length);
    const out: { to: Pt; rank: number }[] = dots.map(() => ({
      to: [50, 50] as Pt,
      rank: 0,
    }));
    order.forEach(({ i }, rank) => {
      out[i] = { to: spots[rank] ?? [50, 50], rank };
    });
    return out;
  }, [dots, markKind]);

  // The first frame — on the server too — shows a weave already under way,
  // not an empty grid.
  const clock = useMotionValue(Math.min(3, cycles[0]?.form ?? 0));
  const collapse = useMotionValue(done ? 1 : 0);
  const swap = useMotionValue(done ? 1 : 0);
  const mark = useMotionValue(done ? 1 : 0);
  const melt = useMotionValue(done ? 1 : 0);
  const breath = useMotionValue(1);
  /** The thread drawing back into its head as the work completes. */
  const retract = useMotionValue(done ? 1 : 0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const seen = React.useRef(status);
  const [inView, setInView] = React.useState(true);
  const [pageShown, setPageShown] = React.useState(true);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  // The clock: one rAF chain, only while loading, on screen, visible and
  // allowed to move.
  const weaving = !done && inView && pageShown && motionSafe && !paused;
  React.useEffect(() => {
    if (!weaving) return;
    let raf = 0;
    let last = 0;
    const frame = (t: number) => {
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
      last = t;
      clock.set(Number(((clock.get() + dt * rate) % length).toFixed(4)));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [weaving, rate, length, clock]);

  // A calm pulse stands in for the weave under reduced motion.
  React.useEffect(() => {
    if (motionSafe || done || !inView || !pageShown) {
      breath.set(1);
      return;
    }
    const pulse = animate(breath, [1, 0.5, 1], {
      duration: 1.6,
      ease: "easeInOut",
      repeat: Infinity,
    });
    return () => pulse.stop();
  }, [motionSafe, done, inView, pageShown, breath]);

  React.useEffect(() => {
    const root = rootRef.current;
    const onVisibility = () => setPageShown(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    let io: IntersectionObserver | null = null;
    if (root && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((entries) =>
        setInView(entries.some((e) => e.isIntersecting)),
      );
      io.observe(root);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
    };
  }, []);

  // Done: the thread lets go, the dots glide onto the mark and its stroke
  // draws through them. Back to loading: the reverse.
  React.useEffect(() => {
    if (seen.current === status) return;
    const was = seen.current;
    seen.current = status;
    const settle = () => onSettle?.(status);
    if (!motionSafe) {
      for (const c of anims.current.values()) c.stop();
      collapse.jump(done ? 1 : 0);
      retract.jump(done ? 1 : 0);
      mark.jump(done ? 1 : 0);
      melt.jump(done ? 1 : 0);
      run(
        "swap",
        animate(swap, done ? 1 : 0, {
          duration: durations.base,
          ease: easings.enter,
          onComplete: settle,
        }),
      );
      return;
    }
    if (done) {
      run(
        "retract",
        animate(retract, 1, { duration: 0.2, ease: easings.exit }),
      );
      if (was !== "loading") {
        // One mark to another: straight across, the dots already gathered.
        mark.jump(0);
        melt.jump(0);
        collapse.jump(0.4);
      }
      run(
        "swap",
        animate(swap, 1, { duration: durations.base, ease: easings.enter }),
      );
      run("collapse", animate(collapse, 1, springs.glide));
      run(
        "mark",
        animate(mark, 1, {
          duration: 0.36,
          delay: 0.22,
          ease: easings.enter,
          onComplete: () =>
            run(
              "melt",
              animate(melt, 1, {
                duration: durations.base,
                ease: easings.exit,
                onComplete: settle,
              }),
            ),
        }),
      );
      return;
    }
    run(
      "melt",
      animate(melt, 0, { duration: durations.fast, ease: easings.enter }),
    );
    run(
      "mark",
      animate(mark, 0, { duration: durations.base, ease: easings.exit }),
    );
    run(
      "collapse",
      animate(collapse, 0, {
        ...springs.glide,
        delay: 0.08,
        onComplete: () => {
          // The weave comes back as it was, thread and all.
          retract.jump(0);
          run(
            "swap",
            animate(swap, 0, {
              duration: durations.fast,
              ease: easings.enter,
              onComplete: settle,
            }),
          );
        },
      }),
    );
    // Status is the only input; the rest is read as it is now.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const weaveLayer = useTransform(() => {
    const u0 = clock.get();
    const back = retract.get();
    // Under reduced motion the first pattern is drawn whole and held.
    const still = !motionSafe;
    let cycle = cycles[0];
    for (const c of cycles) {
      if (u0 >= c.start && u0 < c.start + c.total) {
        cycle = c;
        break;
      }
    }
    if (!cycle) return { thread: "", dim: "", lit: "", pop: "" };
    const u = still ? cycle.form : u0 - cycle.start;
    const head = Math.min(cycle.form, u);
    const unwoven = still
      ? 0
      : clamp01((u - cycle.form - cycle.hold) / (cycle.form / UNWEAVE || 1)) *
        cycle.form;
    // Done: the thread draws back into its head before the dots let go.
    const tail = lerp(unwoven, head, back);
    const at = (f: number): Pt => {
      const i = Math.min(cycle.walk.length - 1, Math.max(0, Math.floor(f)));
      const j = Math.min(cycle.walk.length - 1, i + 1);
      const a = dots[cycle.walk[i] ?? 0] ?? [50, 50];
      const b = dots[cycle.walk[j] ?? 0] ?? [50, 50];
      const t = f - i;
      return [r2(lerp(a[0], b[0], t)), r2(lerp(a[1], b[1], t))];
    };
    let thread = "";
    if (head - tail > 0.01) {
      const pts: Pt[] = [at(tail)];
      for (let i = Math.ceil(tail); i <= Math.floor(head); i += 1) {
        if (i > tail) pts.push(at(i));
      }
      pts.push(at(head));
      thread = `M ${pts.map(([x, y]) => `${x} ${y}`).join(" L ")}`;
    }
    const lit = new Set<number>();
    for (let i = Math.ceil(tail - 1e-6); i <= Math.floor(head + 1e-6); i += 1) {
      const id = cycle.walk[i];
      if (id !== undefined && head - tail > 0.01) lit.add(id);
    }
    let dim = "";
    let litD = "";
    dots.forEach(([x, y], id) => {
      if (lit.has(id)) litD += circle(x, y, m.dot);
      else dim += circle(x, y, m.dot * 0.85);
    });
    // The dot the thread has just reached swells and settles.
    let pop = "";
    const reached = Math.floor(head);
    const since = head - reached;
    if (!still && head < cycle.form + 1e-6 && since < 0.6) {
      const id = cycle.walk[reached];
      const p = id === undefined ? undefined : dots[id];
      if (p) pop = circle(p[0], p[1], m.dot * (1 + 0.9 * (1 - since / 0.6)));
    }
    return { thread, dim, lit: litD, pop };
  });

  const threadD = useTransform(weaveLayer, (w) => w.thread);
  const dimD = useTransform(weaveLayer, (w) => w.dim);
  const litD = useTransform(weaveLayer, (w) => w.lit);
  const popD = useTransform(weaveLayer, (w) => w.pop);
  const weaveOpacity = useTransform(() => r2((1 - swap.get()) * breath.get()));

  const gather = useTransform(() => {
    const k = collapse.get();
    const fade = melt.get();
    let d = "";
    const n = dots.length;
    dots.forEach((home, i) => {
      const target = targets[i];
      if (!target) return;
      const delay = n > 1 ? (target.rank / (n - 1)) * 0.35 : 0;
      const t = clamp01((k - delay) / 0.65);
      const x = lerp(home[0], target.to[0], t);
      const y = lerp(home[1], target.to[1], t);
      d += circle(x, y, m.dot * (1 - fade));
    });
    return d;
  });

  const markColor = status === "error" ? errorColor : successColor;
  const text =
    status === "success"
      ? successLabel
      : status === "error"
        ? errorLabel
        : label;

  return (
    <div
      ref={rootRef}
      role="status"
      className={cn("inline-flex items-center gap-3", className)}
    >
      <svg
        aria-hidden
        width={m.box}
        height={m.box}
        viewBox="0 0 100 100"
        className="block shrink-0"
      >
        <g style={{ color: paint }}>
          <motion.g style={{ opacity: weaveOpacity }}>
            <motion.path d={dimD} className="fill-ink-3/35" />
            <motion.path
              d={threadD}
              fill="none"
              stroke="currentColor"
              strokeWidth={m.thread}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <motion.path d={litD} fill="currentColor" />
            <motion.path d={popD} fill="currentColor" opacity={0.85} />
          </motion.g>
        </g>
        <g style={{ color: markColor }}>
          <motion.g style={{ opacity: swap }}>
            <motion.path
              d={markPath(MARKS[markKind])}
              fill="none"
              stroke="currentColor"
              strokeWidth={r2(m.thread * 1.5)}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pathLength: mark }}
            />
            <motion.path d={gather} fill="currentColor" />
          </motion.g>
        </g>
      </svg>
      <span className={showLabel ? cn("text-ink-2", m.text) : "sr-only"}>
        {text}
      </span>
    </div>
  );
}
