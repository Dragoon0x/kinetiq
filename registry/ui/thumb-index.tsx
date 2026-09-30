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
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ThumbIndexSection = {
  id: string;
  /** Printed on the tab: a letter or a short range, e.g. "C" or "H–K". */
  label: string;
  /** The tab's accessible name and the page's heading. @default the label, a range read "H to K" */
  title?: string;
  /** The letters the section holds, for typing a letter to reach it. @default the label's letters, a range expanded */
  letters?: string;
  /** Makes the tab a link. */
  href?: string;
};

export type ThumbIndexTabs = "round" | "square";

export type ThumbIndexProps = {
  /** How many sections to split A–Z into, 4 to 12, or the sections themselves. @default 8 */
  sections?: number | ThumbIndexSection[];
  /** Controlled: the current section's id. */
  value?: string;
  /** The section open at first when uncontrolled. @default the first */
  defaultValue?: string;
  /** Fires from the press, key or scrub that chose a section, with its id. */
  onValueChange?: (id: string) => void;
  /** What the page shows for a section. */
  children?: (section: ThumbIndexSection, index: number) => React.ReactNode;
  /** The navigation's accessible name. @default "Sections" */
  label?: string;
  /** Half-moon notches with round tabs, or square-cut notches with square tabs. @default "round" */
  tabs?: ThumbIndexTabs;
  /** How many leaves turn on the way to a section, and how slowly, 0 to 1. 0 changes the page with a fade. @default 0.6 */
  riffle?: number;
  /** Play the pages and the thumb. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  /** Classes for the root, which sets the page's size. @default "h-104 w-full" */
  className?: string;
};

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/**
 * How much of a dictionary each letter fills, roughly, in percent: S and C
 * are fat, X, Y and Z barely a signature between them. Splitting by these
 * rather than by letter count gives tabs that sit where a real book's do.
 */
const WEIGHT = [
  6.4, 5.8, 9.4, 5.6, 3.9, 3.8, 3.3, 3.8, 3.4, 0.9, 0.9, 3.1, 5.4, 2, 2.4, 8.2,
  0.5, 5.1, 11.5, 5.2, 2.6, 1.5, 2.2, 0.1, 0.3, 0.2,
];

/** The alphabet in `count` runs of letters, as even by page weight as runs can be. */
function partition(count: number): string[] {
  const n = ALPHABET.length;
  const k = Math.max(1, Math.min(n, Math.round(count)));
  const prefix = [0];
  for (const w of WEIGHT) prefix.push((prefix[prefix.length - 1] ?? 0) + w);
  const total = prefix[n] ?? 1;
  const mean = total / k;
  const span = (a: number, b: number) => (prefix[b] ?? 0) - (prefix[a] ?? 0);
  // Least squares from the mean: every run near its share, none starved.
  const cost: number[][] = [];
  const cut: number[][] = [];
  for (let g = 0; g <= k; g += 1) {
    cost.push(new Array<number>(n + 1).fill(Infinity));
    cut.push(new Array<number>(n + 1).fill(0));
  }
  (cost[0] as number[])[0] = 0;
  for (let g = 1; g <= k; g += 1) {
    const row = cost[g] as number[];
    const back = cut[g] as number[];
    const prev = cost[g - 1] as number[];
    for (let i = g; i <= n; i += 1) {
      for (let j = g - 1; j < i; j += 1) {
        const d = span(j, i) - mean;
        const c = (prev[j] ?? Infinity) + d * d;
        if (c < (row[i] ?? Infinity) - 1e-9) {
          row[i] = c;
          back[i] = j;
        }
      }
    }
  }
  const runs: string[] = [];
  let i = n;
  for (let g = k; g > 0; g -= 1) {
    const j = (cut[g] as number[])[i] ?? 0;
    runs.unshift(ALPHABET.slice(j, i));
    i = j;
  }
  return runs;
}

/** A–Z split into `count` tabs, balanced the way a dictionary's are. */
export function alphabetSections(count: number): ThumbIndexSection[] {
  return partition(count).map((run) => {
    const first = run.charAt(0);
    const last = run.charAt(run.length - 1);
    const range = run.length > 1;
    return {
      id: range ? `${first}-${last}`.toLowerCase() : first.toLowerCase(),
      label: range ? `${first}–${last}` : first,
      title: range ? `${first} to ${last}` : first,
      letters: run,
    };
  });
}

const RANGE = /^\s*([a-z])\s*[–—-]\s*([a-z])\s*$/i;

function lettersOf(section: ThumbIndexSection): string {
  if (section.letters) return section.letters.toUpperCase();
  const m = RANGE.exec(section.label);
  if (m) {
    const a = ALPHABET.indexOf((m[1] ?? "").toUpperCase());
    const b = ALPHABET.indexOf((m[2] ?? "").toUpperCase());
    if (a !== -1 && b >= a) return ALPHABET.slice(a, b + 1);
  }
  return section.label.toUpperCase().replace(/[^A-Z]/g, "");
}

function titleOf(section: ThumbIndexSection): string {
  if (section.title) return section.title;
  const m = RANGE.exec(section.label);
  return m
    ? `${(m[1] ?? "").toUpperCase()} to ${(m[2] ?? "").toUpperCase()}`
    : section.label;
}

/** The page's box, in px: tabs hang from its fore-edge, the thumb reaches in past it. */
const DEFAULT_HEIGHT = 416;
/** The page stack under the top page. */
const STACK = 6;
/** Room beyond the fore-edge for the thumb. */
const GUTTER = 28;
/** How deep a notch bites into the page. */
const DEPTH = 28;
/** Page kept between the deepest notch and the text block. */
const LAND = 8;
const RAIL = DEPTH + LAND;
const NAV = RAIL + GUTTER;
/** Page above the first notch and below the last. */
const PAD = 14;
const CHIP_W = 21;
const CHIP_H = 14;
const CHIP_LEFT = RAIL - 2 - CHIP_W;
const CORNER = 10;
/** Where the thumb's tip rests: a little way into the notch's mouth. */
const REST = RAIL - 1;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Layout = { pageH: number; pitch: number; ry: number; ys: number[] };

function layoutOf(height: number, count: number): Layout {
  const pageH = Math.max(96, Math.round(height) - STACK);
  const n = Math.max(1, count);
  const pitch = (pageH - 2 * PAD) / n;
  const ry = r2(clamp(pitch * 0.4, 6, 15));
  const ys = Array.from({ length: n }, (_, i) => r2(PAD + pitch * (i + 0.5)));
  return { pageH, pitch, ry, ys };
}

/** The top page's fore-edge, notches and all, in the rail's own box. */
function edgePath(l: Layout, tabs: ThumbIndexTabs, fill: boolean): string {
  const e = RAIL - 0.5;
  const top = 0.5;
  const bottom = r2(l.pageH - 0.5);
  const d: string[] = [
    `M ${fill ? -1 : 0} ${top}`,
    `H ${e - CORNER}`,
    `A ${CORNER} ${CORNER} 0 0 1 ${e} ${top + CORNER}`,
  ];
  for (const y of l.ys) {
    const a = r2(y - l.ry);
    const b = r2(y + l.ry);
    d.push(`L ${e} ${a}`);
    if (tabs === "square") {
      const r = Math.min(5, l.ry);
      const x = e - DEPTH;
      d.push(
        `H ${r2(x + r)}`,
        `Q ${x} ${a} ${x} ${r2(a + r)}`,
        `V ${r2(b - r)}`,
        `Q ${x} ${b} ${r2(x + r)} ${b}`,
        `H ${e}`,
      );
    } else {
      d.push(`A ${DEPTH} ${l.ry} 0 0 0 ${e} ${b}`);
    }
  }
  d.push(
    `L ${e} ${r2(bottom - CORNER)}`,
    `A ${CORNER} ${CORNER} 0 0 1 ${r2(e - CORNER)} ${bottom}`,
    `H ${fill ? -1 : 0}`,
  );
  if (fill) d.push("Z");
  return d.join(" ");
}

/** One notch's rim alone, for the shade just inside it. */
function notchPath(y: number, ry: number, tabs: ThumbIndexTabs): string {
  const e = RAIL - 0.5;
  const a = r2(y - ry);
  const b = r2(y + ry);
  if (tabs === "square") {
    const r = Math.min(5, ry);
    const x = e - DEPTH;
    return `M ${e} ${a} H ${r2(x + r)} Q ${x} ${a} ${x} ${r2(a + r)} V ${r2(b - r)} Q ${x} ${b} ${r2(x + r)} ${b} H ${e}`;
  }
  return `M ${e} ${a} A ${DEPTH} ${ry} 0 0 0 ${e} ${b}`;
}

/** A small seeded generator, so a leaf's ghost text is the same every time. */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Run = {
  key: number;
  to: number;
  forward: boolean;
  /** The section each leaf belongs to, in the order they turn. */
  leaves: number[];
  turn: number;
  gap: number;
  total: number;
};

type Shown = { index: number; layout: string; check: number };

type Api = {
  go: (from: number, to: number, visitor: boolean) => void;
  snap: (to: number) => void;
  home: (visitor: boolean) => void;
  end: (key: number) => void;
};

function PageFace({
  section,
  index,
  render,
}: {
  section: ThumbIndexSection;
  index: number;
  render?: ThumbIndexProps["children"];
}) {
  const title = titleOf(section);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-end justify-between gap-3 border-b border-hairline pt-3 pr-3 pb-2 pl-5">
        <span className="text-3xl leading-none font-semibold tracking-tight text-foreground">
          {section.label}
        </span>
        {title !== section.label ? (
          <span
            className="truncate pb-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            title={title}
          >
            {title}
          </span>
        ) : null}
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain py-3 pr-3 pl-5">
        {render?.(section, index)}
      </div>
    </div>
  );
}

/** A page passed on the way: its running head, and lines of text too quick to read. */
function GhostFace({
  section,
  index,
}: {
  section: ThumbIndexSection;
  index: number;
}) {
  const rand = lcg(index * 7919 + 17);
  const lines = Array.from({ length: 9 }, () => Math.round(46 + rand() * 48));
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-end border-b border-hairline pt-3 pr-3 pb-2 pl-5">
        <span className="text-3xl leading-none font-semibold tracking-tight text-ink-3">
          {section.label}
        </span>
      </div>
      <div className="flex flex-col gap-3 py-4 pr-3 pl-5">
        {lines.map((w, i) => (
          <span
            key={i}
            className="block h-1.5 rounded-full bg-ink-3/15"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * One leaf of the riffle. Hinged at the spine, it turns through 90° while
 * the shared clock passes its window: seen from above that is its width going
 * as cos θ, a shade coming up as sin θ, and a soft shadow cast on the page
 * just past its free edge.
 */
function Leaf({
  clock,
  start,
  turn,
  total,
  forward,
  z,
  children,
}: {
  clock: MotionValue<number>;
  start: number;
  turn: number;
  total: number;
  forward: boolean;
  z: number;
  children: React.ReactNode;
}) {
  const theta = useTransform(clock, (c) => {
    const u = clamp01((c * total - start) / turn);
    // Lifted off the thumb a page whips up and slows toward upright; falling
    // back, it leaves upright slowly and lands fast.
    return forward ? 90 * (1 - (1 - u) * (1 - u)) : 90 * (1 - u * u);
  });
  const rad = (d: number) => (d * Math.PI) / 180;
  const scaleX = useTransform(theta, (d) =>
    Number(Math.max(0, Math.cos(rad(d))).toFixed(5)),
  );
  const shown = useTransform(theta, (d) => (d > 89.8 ? 0 : 1));
  const shade = useTransform(theta, (d) => r3(0.3 * Math.sin(rad(d))));
  const castX = useTransform(scaleX, (s) => `${r3(s * 100)}%`);
  const cast = useTransform(theta, (d) =>
    d > 89.8 ? 0 : r3(Math.sin(rad(d)) * 0.9),
  );

  return (
    <>
      <motion.div
        className="absolute inset-y-0 left-0 w-full"
        style={{ x: castX, opacity: cast, zIndex: z }}
      >
        <div
          className="h-full w-4"
          style={{
            background:
              "linear-gradient(90deg, color-mix(in oklab, black 18%, transparent), transparent)",
          }}
        />
      </motion.div>
      <motion.div
        className="absolute inset-0 overflow-clip bg-card"
        style={{ scaleX, originX: 0, opacity: shown, zIndex: z }}
      >
        {children}
        <motion.div
          className="absolute inset-0"
          style={{
            opacity: shade,
            background:
              "linear-gradient(90deg, color-mix(in oklab, var(--card) 70%, black), color-mix(in oklab, var(--card) 45%, black))",
          }}
        />
        <div className="absolute inset-y-0 right-0 w-px bg-hairline-strong" />
      </motion.div>
    </>
  );
}

/**
 * Section navigation cut into a book's fore-edge. The component is one page
 * with its spine on the left and half-moon notches down its right edge, a
 * printed tab at the bottom of each: a letter, or a run of letters balanced
 * the way a dictionary balances them. A drawn thumb rests in the current
 * section's notch.
 *
 * Pressing a tab lifts the thumb on the flick spring, carries it down the
 * edge on glide and drops it into the new notch on snap, whose one overshoot
 * is the thumb pressing a hair too deep; the tab it lands on goes down and
 * stays down. From that moment the pages riffle: leaves hinged at the spine
 * turn over one after another — the old page first, then the pages between,
 * whose running heads flick past, until the new page is uncovered (going
 * back, they fall onto the page instead, the new page last). One clock drives
 * every leaf, staggered by `cascade`. The thumb can also be dragged down the
 * edge: it follows the finger 1:1 with a loupe naming the tab under it, and
 * drops into the notch the throw was heading for.
 *
 * It is a real `<nav>` of links or buttons with `aria-current` on the current
 * section. Arrow keys move between tabs, Home and End jump, a letter moves to
 * the tab that holds it, and Enter or Space presses. Under reduced motion the
 * thumb fades between notches and the page cross-fades; the pressed tab, the
 * page and the announcement still change, because they are the state.
 */
export function ThumbIndex({
  sections = 8,
  value,
  defaultValue,
  onValueChange,
  children,
  label = "Sections",
  tabs = "round",
  riffle = 0.6,
  sound = false,
  disabled = false,
  className,
}: ThumbIndexProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const rf = clamp01(riffle);

  const list = React.useMemo(
    () =>
      typeof sections === "number"
        ? alphabetSections(clamp(Math.round(sections), 1, 26))
        : sections,
    [sections],
  );
  const n = list.length;
  const letters = React.useMemo(() => list.map(lettersOf), [list]);

  const resolve = (id: string | undefined): number => {
    if (id === undefined || n === 0) return 0;
    const exact = list.findIndex((s) => s.id === id);
    if (exact !== -1) return exact;
    const ch = id.charAt(0).toUpperCase();
    const holder = /[A-Z]/.test(ch)
      ? letters.findIndex((l) => l.includes(ch))
      : -1;
    return holder === -1 ? 0 : holder;
  };

  const [own, setOwn] = React.useState(defaultValue);
  const index = clamp(resolve(value ?? own), 0, Math.max(0, n - 1));

  const [height, setHeight] = React.useState(DEFAULT_HEIGHT);
  const layout = layoutOf(height, n);
  const layoutKey = `${n}:${list.map((s) => s.id).join(",")}:${layout.pageH}`;

  const [page, setPage] = React.useState({ index, fade: false });
  const [pressed, setPressed] = React.useState(index);
  const [run, setRun] = React.useState<Run | null>(null);
  const [scrub, setScrub] = React.useState<number | null>(null);
  const [focusIdx, setFocusIdx] = React.useState<number | null>(null);
  const [check, setCheck] = React.useState(0);

  // Said once per change, frozen in the render that makes it.
  const [said, setSaid] = React.useState({ key: index, n: 0, text: "" });
  if (said.key !== index) {
    const s = list[index];
    setSaid({ key: index, n: said.n + 1, text: s ? titleOf(s) : "" });
  }

  const thumbY = useMotionValue(layout.ys[index] ?? PAD);
  const lift = useMotionValue(0);
  const press = useMotionValue(0);
  const thumbAlpha = useMotionValue(1);
  const clock = useMotionValue(0);
  const loupe = useMotionValue(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const tabRefs = React.useRef(new Map<string, HTMLElement>());
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const runRef = React.useRef<Run | null>(null);
  const offClock = React.useRef<(() => void) | null>(null);
  const shown = React.useRef<Shown>({ index, layout: layoutKey, check });
  const visitor = React.useRef(false);
  const dragged = React.useRef(false);
  const scrubbing = React.useRef<{ from: number; at: number } | null>(null);
  const counter = React.useRef(0);
  const api = React.useRef<Api | null>(null);

  const run1 = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  const panAt = (fraction: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width * fraction, null) : 0;
  };
  const pitchOf = (i: number) => r2(lerp(1.18, 0.84, n > 1 ? i / (n - 1) : 0));

  /** Ends a riffle where it was going: the page it was bound for, no leaves. */
  const finishRun = () => {
    anims.current.get("clock")?.stop();
    anims.current.delete("clock");
    offClock.current?.();
    offClock.current = null;
    const r = runRef.current;
    runRef.current = null;
    if (r) {
      setPage({ index: r.to, fade: false });
      setRun(null);
    }
  };

  const riffleTo = (from: number, to: number, withSound: boolean) => {
    const dist = Math.abs(to - from);
    const count =
      rf <= 0 || dist === 0
        ? 0
        : clamp(Math.round(rf * (2 + 8 * Math.min(1, dist / 6))), 1, 10);
    if (count === 0) {
      setPage({ index: to, fade: true });
      return;
    }
    const forward = to > from;
    const leaves: number[] = [];
    for (let k = 0; k < count; k += 1) {
      if (forward) {
        leaves.push(k === 0 ? from : from + Math.round((k * dist) / count));
      } else {
        leaves.push(
          k === count - 1 ? to : from - Math.round(((k + 1) * dist) / count),
        );
      }
    }
    const turn = lerp(0.22, 0.42, rf);
    const gap = count > 1 ? cascade(count) * lerp(0.8, 1, rf) : 0;
    const total = gap * (count - 1) + turn;
    counter.current += 1;
    const r: Run = {
      key: counter.current,
      to,
      forward,
      leaves,
      turn,
      gap,
      total,
    };
    runRef.current = r;
    clock.set(0);
    setRun(r);
    // Forward, the new page is already underneath; back, it arrives last.
    if (forward) setPage({ index: to, fade: false });
    if (withSound) {
      const pan = panAt(0.62);
      let next = 0;
      const rand = lcg(r.key * 131 + to);
      offClock.current = clock.on("change", (c) => {
        while (
          next < count &&
          c * total >= next * gap + (forward ? 0 : turn * 0.7)
        ) {
          audio.play("paper", {
            pitch: r2(0.86 + rand() * 0.36),
            gain: r2(lerp(0.24, 0.42, rf)),
            pan,
          });
          next += 1;
        }
      });
    }
    run1(
      "clock",
      animate(clock, 1, {
        duration: total,
        ease: "linear",
        onComplete: () => api.current?.end(r.key),
      }),
    );
  };

  /** The thumb comes down into notch `to`: the tab goes down with it. */
  const drop = (from: number, to: number, withSound: boolean) => {
    run1("lift", animate(lift, 0, springs.snap));
    run1("press", animate(press, 1, springs.flick));
    later(110, () => run1("press", animate(press, 0, springs.glide)));
    setPressed(to);
    if (withSound) {
      audio.play("thock", {
        pitch: pitchOf(to),
        gain: 0.6,
        pan: panAt(0.96),
      });
    }
    if (from !== to) later(40, () => riffleTo(from, to, withSound));
  };

  const go = (from: number, to: number, withSound: boolean) => {
    finishRun();
    clearTimers();
    const y = layout.ys[to] ?? PAD;
    if (!motionSafe) {
      for (const c of anims.current.values()) c.stop();
      anims.current.clear();
      thumbY.set(y);
      lift.set(0);
      press.set(0);
      thumbAlpha.set(0);
      run1(
        "alpha",
        animate(thumbAlpha, 1, {
          duration: durations.fast,
          ease: easings.enter,
        }),
      );
      setPressed(to);
      setPage({ index: to, fade: true });
      if (withSound) {
        audio.play("thock", {
          pitch: pitchOf(to),
          gain: 0.6,
          pan: panAt(0.96),
        });
      }
      return;
    }
    thumbAlpha.set(1);
    run1("lift", animate(lift, 1, springs.flick));
    run1("y", animate(thumbY, y, springs.glide));
    const hop = Math.abs(to - from);
    // The thumb comes down while the glide is finishing, a little later for
    // a longer carry, so it lands as it arrives rather than after.
    const wait = Math.round(1000 * clamp(0.1 + 0.03 * hop, 0.12, 0.3));
    later(wait, () => drop(from, to, withSound));
  };

  /** No animation: the page, tab and thumb go straight to `to`. */
  const snap = (to: number) => {
    finishRun();
    clearTimers();
    for (const c of anims.current.values()) c.stop();
    anims.current.clear();
    thumbY.set(layout.ys[to] ?? PAD);
    lift.set(0);
    press.set(0);
    thumbAlpha.set(1);
    setPressed(to);
    setPage({ index: to, fade: false });
  };

  /** The thumb back down into the current notch, after a scrub or a refusal. */
  const home = (withSound: boolean) => {
    const at = shown.current.index;
    const y = layout.ys[at] ?? PAD;
    if (!motionSafe) {
      thumbY.set(y);
      lift.set(0);
      return;
    }
    run1("y", animate(thumbY, y, springs.glide));
    later(90, () => {
      run1("lift", animate(lift, 0, springs.snap));
      if (withSound) {
        audio.play("thock", {
          pitch: pitchOf(at),
          gain: 0.4,
          pan: panAt(0.96),
        });
      }
    });
  };

  const end = (key: number) => {
    const r = runRef.current;
    if (!r || r.key !== key) return;
    offClock.current?.();
    offClock.current = null;
    anims.current.delete("clock");
    runRef.current = null;
    setPage({ index: r.to, fade: false });
    setRun(null);
  };

  React.useEffect(() => {
    api.current = { go, snap, home, end };
  });

  // What the page shows follows the value, wherever the change came from; a
  // change the visitor made is heard, one the host made is only seen.
  React.useEffect(() => {
    const prev = shown.current;
    const now = api.current;
    if (!now) return;
    shown.current = { index, layout: layoutKey, check };
    if (prev.layout !== layoutKey) {
      visitor.current = false;
      now.snap(index);
      return;
    }
    if (prev.index !== index) {
      const heard = visitor.current;
      visitor.current = false;
      now.go(prev.index, index, heard);
      return;
    }
    if (prev.check !== check) {
      // A scrub the host did not take: the thumb goes back to its notch.
      const heard = visitor.current;
      visitor.current = false;
      now.home(heard);
    }
  }, [index, layoutKey, check]);

  React.useEffect(() => {
    const running = anims.current;
    const pending = timers.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      for (const t of pending) window.clearTimeout(t);
      offClock.current?.();
      offClock.current = null;
    };
  }, []);

  // The page's height, bound to the node when it arrives: the notches are
  // spread down whatever height the host gives it.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const measure = () => setHeight(Math.round(node.clientHeight));
    measure();
    const sizer = new ResizeObserver(measure);
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  const choose = (i: number) => {
    if (disabled) return;
    const s = list[i];
    if (!s) return;
    setFocusIdx(i);
    if (i === index) {
      // The tab already down: the thumb presses it again, and nothing turns.
      if (motionSafe) {
        run1("press", animate(press, 1, springs.flick));
        later(110, () => run1("press", animate(press, 0, springs.glide)));
      }
      audio.play("thock", { pitch: pitchOf(i), gain: 0.45, pan: panAt(0.96) });
      return;
    }
    visitor.current = true;
    if (value === undefined) setOwn(s.id);
    onValueChange?.(s.id);
  };

  const nearest = (y: number) => {
    let best = 0;
    let gap = Infinity;
    layout.ys.forEach((c, i) => {
      const d = Math.abs(c - y);
      if (d < gap) {
        gap = d;
        best = i;
      }
    });
    return best;
  };

  const first = layout.ys[0] ?? PAD;
  const last = layout.ys[layout.ys.length - 1] ?? first;

  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled: disabled || n < 2,
    onStart: () => {
      dragged.current = true;
      // A press still landing lands now: the page and the pressed tab catch
      // up with the value before the thumb is picked up again.
      const at = shown.current.index;
      finishRun();
      clearTimers();
      anims.current.get("y")?.stop();
      setPage({ index: at, fade: false });
      setPressed(at);
      run1("press", animate(press, 0, springs.glide));
      scrubbing.current = { from: at, at };
      setScrub(at);
      thumbAlpha.set(1);
      run1(
        "lift",
        animate(lift, 1, motionSafe ? springs.flick : { duration: 0 }),
      );
      run1(
        "loupe",
        animate(loupe, 1, { duration: durations.fast, ease: easings.enter }),
      );
    },
    onMove: ({ offset }) => {
      const s = scrubbing.current;
      if (!s) return;
      const start = layout.ys[s.from] ?? first;
      const y = rubberClamp(start + offset.y, first, last, layout.pitch * 2);
      thumbY.set(r2(y));
      const k = nearest(y);
      if (k !== s.at) {
        s.at = k;
        setScrub(k);
        audio.play("paper", {
          pitch: r2(pitchOf(k) * 1.1),
          gain: 0.14,
          pan: panAt(0.96),
        });
      }
    },
    onEnd: ({ velocity }) => {
      const s = scrubbing.current;
      scrubbing.current = null;
      setScrub(null);
      run1(
        "loupe",
        animate(loupe, 0, { duration: durations.fast, ease: easings.exit }),
      );
      if (!s) return;
      const landing = clamp(
        project(thumbY.get(), velocity.y, 0.99),
        first,
        last,
      );
      const k = nearest(landing);
      const target = list[k];
      visitor.current = true;
      if (k === index || !target) {
        api.current?.home(true);
        visitor.current = false;
        return;
      }
      if (value === undefined) setOwn(target.id);
      onValueChange?.(target.id);
      setFocusIdx(k);
      // A host that refuses gets its thumb back once it has had its turn.
      if (value !== undefined)
        React.startTransition(() => setCheck((c) => c + 1));
    },
    onCancel: () => {
      scrubbing.current = null;
      setScrub(null);
      loupe.set(0);
      api.current?.home(false);
    },
  });

  const focusTab = (i: number) => {
    const s = list[(i + n) % n];
    if (!s) return;
    setFocusIdx((i + n) % n);
    tabRefs.current.get(s.id)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (n === 0) return;
    const at = focusIdx ?? index;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        focusTab(at + 1);
        return;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        focusTab(at - 1);
        return;
      case "Home":
        event.preventDefault();
        focusTab(0);
        return;
      case "End":
        event.preventDefault();
        focusTab(n - 1);
        return;
      case " ": {
        const target = event.target as HTMLElement;
        if (target.tagName === "A") {
          event.preventDefault();
          target.click();
        }
        return;
      }
    }
    if (
      event.key.length === 1 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      const ch = event.key.toUpperCase();
      if (!/[A-Z]/.test(ch)) return;
      for (let step = 1; step <= n; step += 1) {
        const i = (at + step) % n;
        if (letters[i]?.includes(ch)) {
          event.preventDefault();
          focusTab(i);
          return;
        }
      }
    }
  };

  const tipX = useTransform(
    [lift, press] as MotionValue<number>[],
    ([l = 0, p = 0]: number[]) => r2(REST + 5 * l - 7 * p),
  );
  const thumbScale = useTransform(
    [lift, press] as MotionValue<number>[],
    ([l = 0, p = 0]: number[]) => r3(1 + 0.07 * l - 0.02 * p),
  );
  const shadowX = useTransform(
    [tipX, lift] as MotionValue<number>[],
    ([x = 0, l = 0]: number[]) => r2(x + 1.5 + 3 * l),
  );
  const shadowY = useTransform(
    [thumbY, lift] as MotionValue<number>[],
    ([y = 0, l = 0]: number[]) => r2(y + 2 + 4.5 * l),
  );
  const shadowAlpha = useTransform(
    [lift, press, thumbAlpha] as MotionValue<number>[],
    ([l = 0, p = 0, a = 1]: number[]) =>
      r3(clamp01(0.9 - 0.5 * l + 0.1 * p) * a),
  );
  const loupeY = useTransform(thumbY, (y) => r2(y - 20));

  const pageSection = list[clamp(page.index, 0, Math.max(0, n - 1))];
  const pageIndex = clamp(page.index, 0, Math.max(0, n - 1));
  const current = list[index];
  const roving = focusIdx ?? index;

  return (
    <div
      ref={bindRoot}
      className={cn(
        "relative isolate h-104 w-full overflow-clip select-none",
        disabled && "opacity-50",
        className,
      )}
    >
      {/* The book: two pages of the block under the top one, then the top page. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0"
        style={{ right: GUTTER + 4 }}
      >
        <div className="h-4 rounded-br-3 rounded-bl-1 border border-hairline bg-card" />
      </div>
      <div
        aria-hidden
        className="absolute inset-x-0"
        style={{ right: GUTTER + 2, bottom: STACK / 2 }}
      >
        <div className="h-4 rounded-br-3 rounded-bl-1 border border-hairline-strong bg-card" />
      </div>

      <div
        className="absolute top-0 left-0"
        style={{ right: GUTTER, height: layout.pageH }}
      >
        <svg
          aria-hidden
          width={RAIL + 1}
          height={layout.pageH}
          viewBox={`-1 0 ${RAIL + 1} ${layout.pageH}`}
          className="absolute top-0 right-0 block"
        >
          {layout.ys.map((y, i) => (
            <rect
              key={list[i]?.id ?? i}
              x={RAIL - DEPTH - 1}
              y={r2(y - layout.ry)}
              width={DEPTH + 1}
              height={r2(layout.ry * 2)}
              className="fill-background"
            />
          ))}
          <g
            fill="none"
            strokeWidth={3}
            style={{ stroke: "color-mix(in oklab, black 9%, transparent)" }}
          >
            {layout.ys.map((y, i) => (
              <path key={list[i]?.id ?? i} d={notchPath(y, layout.ry, tabs)} />
            ))}
          </g>
          <path d={edgePath(layout, tabs, true)} className="fill-card" />
          <path
            d={edgePath(layout, tabs, false)}
            fill="none"
            strokeWidth={1}
            className="stroke-hairline-strong"
          />
        </svg>

        <div
          className="absolute inset-y-0 left-0 isolate overflow-clip rounded-l-1 border-y border-l border-hairline-strong bg-card"
          style={{ right: RAIL }}
        >
          {pageSection ? (
            <motion.div
              key={`${pageSection.id}-${pageIndex}`}
              role="region"
              aria-label={titleOf(pageSection)}
              className="absolute inset-0"
              initial={page.fade ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              <PageFace
                section={pageSection}
                index={pageIndex}
                render={children}
              />
            </motion.div>
          ) : null}

          {run ? (
            <div
              aria-hidden
              inert
              className="pointer-events-none absolute inset-0"
            >
              {run.leaves.map((s, k) => {
                const section = list[s];
                if (!section) return null;
                const real = run.forward
                  ? k === 0
                  : k === run.leaves.length - 1;
                return (
                  <Leaf
                    key={`${run.key}-${k}`}
                    clock={clock}
                    start={k * run.gap}
                    turn={run.turn}
                    total={run.total}
                    forward={run.forward}
                    z={run.forward ? run.leaves.length - k : k + 1}
                  >
                    {real ? (
                      <PageFace section={section} index={s} render={children} />
                    ) : (
                      <GhostFace section={section} index={s} />
                    )}
                  </Leaf>
                );
              })}
            </div>
          ) : null}

          {/* The gutter by the spine, where the page curves into the binding. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-20 w-4"
            style={{
              background:
                "linear-gradient(90deg, color-mix(in oklab, black 10%, transparent), transparent)",
            }}
          />
        </div>
      </div>

      <nav
        aria-label={label}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
            setFocusIdx(null);
          }
        }}
        {...drag}
        onPointerDown={(event) => {
          dragged.current = false;
          drag.onPointerDown(event);
        }}
        className={cn(
          "absolute top-0 right-0 touch-pan-x",
          disabled ? "cursor-not-allowed" : "cursor-ns-resize",
        )}
        style={{ width: NAV, height: layout.pageH }}
      >
        <ol className="absolute inset-0">
          {list.map((s, i) => {
            const y = layout.ys[i] ?? PAD;
            const down = pressed === i;
            const isCurrent = index === i;
            const common = {
              ref: (node: HTMLElement | null) => {
                if (node) tabRefs.current.set(s.id, node);
                else tabRefs.current.delete(s.id);
              },
              "aria-current": isCurrent ? ("page" as const) : undefined,
              "aria-label": titleOf(s),
              tabIndex: i === roving ? 0 : -1,
              onFocus: () => setFocusIdx(i),
              onClick: (event: React.MouseEvent<HTMLElement>) => {
                if (dragged.current && event.detail !== 0) {
                  dragged.current = false;
                  event.preventDefault();
                  return;
                }
                if (disabled) {
                  event.preventDefault();
                  return;
                }
                choose(i);
              },
              className: cn(
                "absolute inset-0 flex items-center justify-center leading-none font-semibold tracking-[-0.02em] outline-none",
                "transition-[background-color,color,translate,box-shadow] duration-150",
                "before:absolute before:-inset-y-1.5 before:-right-5 before:-left-2 before:content-['']",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                tabs === "square" ? "rounded-[3px]" : "rounded-full",
                down
                  ? "-translate-x-[1.5px] bg-primary text-primary-foreground"
                  : "bg-ink text-background hover:-translate-x-px hover:bg-ink-2",
                disabled ? "cursor-not-allowed" : "cursor-pointer",
              ),
              style: {
                fontSize: s.label.length > 1 ? 8.5 : 10.5,
                boxShadow: down
                  ? "inset 1px 1px 2px color-mix(in oklab, black 38%, transparent)"
                  : undefined,
              },
            };
            return (
              <li
                key={s.id}
                className="absolute"
                style={{
                  left: CHIP_LEFT,
                  top: r2(y - CHIP_H / 2),
                  width: CHIP_W,
                  height: CHIP_H,
                }}
              >
                {s.href ? (
                  <a
                    {...common}
                    href={disabled ? undefined : s.href}
                    aria-disabled={disabled || undefined}
                  >
                    {s.label}
                  </a>
                ) : (
                  <button {...common} type="button" disabled={disabled}>
                    {s.label}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <svg
        aria-hidden
        width={NAV}
        height={layout.pageH}
        viewBox={`0 0 ${NAV} ${layout.pageH}`}
        className="pointer-events-none absolute top-0 right-0 block"
      >
        <motion.g
          style={{
            x: shadowX,
            y: shadowY,
            rotate: -6,
            opacity: shadowAlpha,
            originX: 0,
            originY: 0.5,
          }}
        >
          <path
            d="M 12 -12 C 22 -13 34 -14.5 96 -14.5 L 96 14.5 C 34 14.5 22 13 12 12 A 12 12 0 0 1 12 -12 Z"
            style={{ fill: "color-mix(in oklab, black 16%, transparent)" }}
          />
        </motion.g>
        <motion.g
          style={{
            x: tipX,
            y: thumbY,
            scale: thumbScale,
            rotate: -6,
            opacity: thumbAlpha,
            originX: 0,
            originY: 0.5,
          }}
        >
          <path
            d="M 12 -12 C 22 -13 34 -14.5 96 -14.5 L 96 14.5 C 34 14.5 22 13 12 12 A 12 12 0 0 1 12 -12 Z"
            strokeWidth={1}
            style={{
              fill: "oklch(from var(--ink-3) 0.86 0.012 h)",
              stroke: "oklch(from var(--ink-3) 0.5 0.02 h)",
            }}
          />
          <path
            d="M 11 -8.5 H 19 Q 23 -8.5 23 -4.5 V 4.5 Q 23 8.5 19 8.5 H 11 A 8.5 8.5 0 0 1 11 -8.5 Z"
            strokeWidth={0.75}
            style={{
              fill: "oklch(from var(--ink-3) 0.95 0.008 h)",
              stroke: "oklch(from var(--ink-3) 0.6 0.02 h)",
            }}
          />
          <path
            d="M 11.5 -6.6 A 6.6 6.6 0 0 0 11.5 6.6 M 22.6 -4.6 Q 18.6 0 22.6 4.6 M 28.5 -12 Q 25.5 0 28.5 12"
            fill="none"
            strokeWidth={0.75}
            strokeLinecap="round"
            style={{ stroke: "oklch(from var(--ink-3) 0.66 0.02 h)" }}
          />
        </motion.g>
      </svg>

      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-0 flex size-10 items-center justify-center rounded-full border border-hairline-strong bg-popover text-lg leading-none font-semibold text-foreground shadow-[var(--shadow-raised)]"
        style={{ right: NAV + 2, y: loupeY, opacity: loupe }}
      >
        {scrub !== null ? (list[scrub]?.label ?? "") : (current?.label ?? "")}
      </motion.div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
