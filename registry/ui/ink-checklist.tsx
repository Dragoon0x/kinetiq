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
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
  type TactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type InkChecklistItem = {
  id: string;
  /** The item's words: its checkbox's label, struck through when done. */
  label: string;
  disabled?: boolean;
};

export type InkChecklistInk = "blue" | "black" | "red";

export type InkChecklistProps = {
  /** What the list is for. The group's legend. */
  label: string;
  items: InkChecklistItem[];
  /** Controlled: the ids of the ticked items. */
  value?: string[];
  /** Initial ticked ids when uncontrolled. @default [] */
  defaultValue?: string[];
  /** Fires from the press or key that ticked or unticked an item, with every ticked id in list order. */
  onValueChange?: (value: string[]) => void;
  /** The pen. @default "blue" */
  ink?: InkChecklistInk;
  /** Strike an item's words through when it is ticked. @default true */
  strike?: boolean;
  /** How unsteady the hand is, 0 to 1: the boxes' corners, the tick's path and the strike's waver. @default 0.4 */
  wobble?: number;
  /** The form field name. Each ticked item submits its id under it. */
  name?: string;
  /** Helper text under the legend. */
  hint?: string;
  /** An error from the host. Replaces the hint. */
  error?: string;
  /** Every item must be ticked before the form submits. */
  required?: boolean;
  disabled?: boolean;
  /** Play the pen and the eraser. Off unless asked for. @default false */
  sound?: boolean;
  className?: string;
};

// The pad is paper and the pen is ink: pigments, the same in both themes.
const INKS: Record<InkChecklistInk, string> = {
  blue: "oklch(0.44 0.15 262)",
  black: "oklch(0.26 0.02 260)",
  red: "oklch(0.52 0.19 27)",
};
const PAPER = "oklch(0.985 0.01 95)";
const PAPER_EDGE = "oklch(0.86 0.02 90)";
const RULE = "oklch(0.83 0.045 240)";
const MARGIN = "oklch(0.7 0.12 22)";
const TEXT = "oklch(0.27 0.02 260)";
const TEXT_DONE = "oklch(0.5 0.015 260)";
const TEXT_SOFT = "oklch(0.48 0.02 260)";
const ERROR_INK = "oklch(0.5 0.19 27)";
const PENCIL = "oklch(0.46 0.02 260)";
const RUBBER = "oklch(0.8 0.08 12)";
const SLEEVE = "oklch(0.6 0.08 245)";

/** The drawn box, and the tick's canvas around it (the flick overshoots). */
const BOX = 18;
const TICK_W = 32;
const TICK_H = 28;
const TICK_X = -3;
const TICK_Y = -9;
/** Where the label starts, measured from the box's left edge. */
const LABEL_X = BOX + 10;

type Pt = readonly [number, number];
type Stroke = { pts: Pt[]; at: number[]; widths: number[]; total: number };
type Line = { x: number; y: number; w: number; h: number };

const r2 = (v: number) => Math.round(v * 100) / 100;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const smooth = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator: the same hand draws the same item every time. */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function quad(a: Pt, c: Pt, b: Pt, steps: number, out: Pt[], skip: boolean) {
  for (let i = skip ? 1 : 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    out.push([
      u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
    ]);
  }
}

function lengths(pts: Pt[]) {
  const at = [0];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1] as Pt;
    const b = pts[i] as Pt;
    at.push((at[i - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return { at, total: at[at.length - 1] ?? 0 };
}

/** A control point bowed off the chord from a to b by k px, to its right. */
function bow(a: Pt, b: Pt, k: number): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [
    (a[0] + b[0]) / 2 - (dy / len) * k,
    (a[1] + b[1]) / 2 + (dx / len) * k,
  ];
}

/**
 * The tick as a pen draws it: a short press down into the corner, then a
 * long flick up past the box. The pen's pressure is the width — it lands
 * light, is heaviest at the bottom of the tick, and lifts to a hairline.
 */
function tickStroke(seed: number, wobble: number): Stroke {
  const rand = lcg(seed);
  const shake = 0.3 + wobble * 1.6;
  const j = () => (rand() - 0.5) * 2 * shake;
  const p0: Pt = [6.5 + j(), 18 + j()];
  const p1: Pt = [11.5 + j() * 0.6, 24.5 + j() * 0.5];
  const p2: Pt = [29 + j(), 3.5 + j()];
  const pts: Pt[] = [];
  quad(p0, bow(p0, p1, 0.6 + (rand() - 0.5) * wobble * 2), p1, 9, pts, false);
  quad(
    p1,
    bow(p1, p2, 1.2 + wobble * 1.6 + (rand() - 0.5) * wobble),
    p2,
    16,
    pts,
    true,
  );
  const { at, total } = lengths(pts);
  const vertex = (at[9] ?? 0) / (total || 1);
  const widths = at.map((d) => {
    const u = d / (total || 1);
    const base =
      u < vertex
        ? lerp(0.9, 2.5, smooth(u / vertex))
        : lerp(2.5, 0.3, Math.pow((u - vertex) / (1 - vertex), 0.75));
    return base * (1 + (rand() - 0.5) * 0.3 * wobble);
  });
  return { pts, at, widths, total };
}

/** A pen line through one line of words: rising a little, wavering a little. */
function strikeStroke(line: Line, seed: number, wobble: number): Stroke {
  const rand = lcg(seed ^ 0x9e3779b9);
  const x0 = line.x - 2.5 - rand() * 1.5;
  const x1 = line.x + line.w + 2 + rand() * 2.5;
  const base = line.y + line.h * 0.56;
  const rise = (0.4 + wobble * 1.6) * (0.6 + rand() * 0.8);
  const amp = 0.2 + wobble * 1.1;
  const phase = rand() * Math.PI * 2;
  const cycles = 1 + rand() * 1.5;
  const steps = Math.max(6, Math.ceil((x1 - x0) / 5));
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    pts.push([
      lerp(x0, x1, t),
      base - rise * t + amp * Math.sin(phase + t * cycles * Math.PI * 2),
    ]);
  }
  const { at, total } = lengths(pts);
  const widths = at.map((d) => {
    const t = d / (total || 1);
    return (
      (t < 0.04 ? 2.1 : lerp(1.8, 1.0, t)) * (1 + (rand() - 0.5) * 0.2 * wobble)
    );
  });
  return { pts, at, widths, total };
}

/** The same stroke thickened and shifted: where an eraser smears the ink. */
function smeared(s: Stroke, k: number, dx: number, dy: number): Stroke {
  return {
    ...s,
    pts: s.pts.map(([x, y]): Pt => [x + dx, y + dy]),
    widths: s.widths.map((w) => w * k + 0.8),
  };
}

/**
 * The outline of a stroke drawn up to `p` of its length, as one closed
 * path: the left edge out, a cap, the right edge back. Rebuilt each frame
 * from the progress, so the pen's line grows rather than being uncovered.
 */
function outline(s: Stroke, p: number): string {
  if (p <= 0.001 || s.pts.length < 2) return "";
  const cut = clamp(p, 0, 1) * s.total;
  const pts: Pt[] = [];
  const ws: number[] = [];
  for (let i = 0; i < s.pts.length; i += 1) {
    const d = s.at[i] ?? 0;
    const pt = s.pts[i] as Pt;
    if (d <= cut) {
      pts.push(pt);
      ws.push(s.widths[i] ?? 1);
      continue;
    }
    const prev = s.pts[i - 1] as Pt;
    const d0 = s.at[i - 1] ?? 0;
    const t = d > d0 ? (cut - d0) / (d - d0) : 0;
    pts.push([lerp(prev[0], pt[0], t), lerp(prev[1], pt[1], t)]);
    ws.push(lerp(s.widths[i - 1] ?? 1, s.widths[i] ?? 1, t));
    break;
  }
  if (pts.length < 2) return "";
  const left: string[] = [];
  const right: string[] = [];
  const last = pts.length - 1;
  const dir = (i: number): Pt => {
    const a = pts[Math.max(0, i - 1)] as Pt;
    const b = pts[Math.min(last, i + 1)] as Pt;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  };
  const f = (x: number, y: number) => `${r2(x)} ${r2(y)}`;
  pts.forEach((pt, i) => {
    const [tx, ty] = dir(i);
    const half = (ws[i] ?? 1) / 2;
    left.push(f(pt[0] - ty * half, pt[1] + tx * half));
    right.push(f(pt[0] + ty * half, pt[1] - tx * half));
  });
  const [hx, hy] = dir(last);
  const [sx, sy] = dir(0);
  const head = pts[last] as Pt;
  const tail = pts[0] as Pt;
  const hw = (ws[last] ?? 1) / 2;
  const tw = (ws[0] ?? 1) / 2;
  return [
    `M ${f(tail[0] - sx * tw, tail[1] - sy * tw)}`,
    `L ${left.join(" L ")}`,
    `Q ${f(head[0] + hx * hw * 1.6, head[1] + hy * hw * 1.6)} ${right[last] ?? ""}`,
    `L ${right.reverse().join(" L ")}`,
    "Z",
  ].join(" ");
}

/** A run of strokes drawn one after another, `p` of the way through all of them. */
function outlines(strokes: Stroke[], p: number): string {
  const total = strokes.reduce((sum, s) => sum + s.total, 0);
  if (total <= 0) return "";
  let left = p * total;
  const out: string[] = [];
  for (const s of strokes) {
    const part = clamp(left / (s.total || 1), 0, 1);
    left -= s.total;
    const d = outline(s, part);
    if (d) out.push(d);
  }
  return out.join(" ");
}

/** A box drawn in four quick pencil strokes that overshoot their corners. */
function boxPath(seed: number, wobble: number): string {
  const rand = lcg(seed ^ 0x51ed27);
  const shake = 0.2 + wobble * 0.9;
  const j = () => (rand() - 0.5) * 2 * shake;
  const c: Pt[] = [
    [1.5 + j(), 1.5 + j()],
    [16.5 + j(), 1.5 + j()],
    [16.5 + j(), 16.5 + j()],
    [1.5 + j(), 16.5 + j()],
  ];
  const out: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    const a = c[i] as Pt;
    const b = c[(i + 1) % 4] as Pt;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const over = 0.5 + rand() * (0.4 + wobble * 1.2);
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    const mid = bow(a, b, (rand() - 0.5) * wobble * 1.4);
    out.push(
      `M ${r2(a[0] - ux * 0.3)} ${r2(a[1] - uy * 0.3)} Q ${r2(mid[0])} ${r2(mid[1])} ${r2(b[0] + ux * over)} ${r2(b[1] + uy * over)}`,
    );
  }
  return out.join(" ");
}

/** The text's line boxes inside its label, merged per line and rounded. */
function linesOf(text: HTMLElement, label: HTMLElement): Line[] {
  const range = document.createRange();
  range.selectNodeContents(text);
  const base = label.getBoundingClientRect();
  const lines: Line[] = [];
  for (const r of Array.from(range.getClientRects())) {
    if (r.width < 1) continue;
    const y = r2(r.top - base.top);
    const same = lines.find((l) => Math.abs(l.y - y) < 2);
    if (same) {
      const right = Math.max(same.x + same.w, r.right - base.left);
      same.x = Math.min(same.x, r2(r.left - base.left));
      same.w = r2(right - same.x);
    } else {
      lines.push({
        x: r2(r.left - base.left),
        y,
        w: r2(r.width),
        h: r2(r.height),
      });
    }
  }
  return lines;
}

type RowProps = {
  item: InkChecklistItem;
  checked: boolean;
  inputId: string;
  ink: string;
  strike: boolean;
  wobble: number;
  name?: string;
  required: boolean;
  invalid: boolean;
  describedBy?: string;
  motionSafe: boolean;
  audio: TactileSound;
  heard: (id: string) => boolean;
  onToggle: (id: string) => void;
  onInvalid: (event: React.FormEvent<HTMLInputElement>) => void;
};

function Row({
  item,
  checked,
  inputId,
  ink,
  strike,
  wobble,
  name,
  required,
  invalid,
  describedBy,
  motionSafe,
  audio,
  heard,
  onToggle,
  onInvalid,
}: RowProps) {
  const seed = hash(item.id);
  const w = clamp(wobble, 0, 1);
  const tick = React.useMemo(() => tickStroke(seed, w), [seed, w]);
  const box = React.useMemo(() => boxPath(seed, w), [seed, w]);
  const [lines, setLines] = React.useState<Line[]>([]);
  const strokes = React.useMemo(
    () => lines.map((l, i) => strikeStroke(l, seed + i * 7919, w)),
    [lines, seed, w],
  );
  const smudgeTick = React.useMemo(
    () => outline(smeared(tick, 2.6, 0.8, 0.5), 1),
    [tick],
  );
  const smudgeStrike = React.useMemo(
    () =>
      outlines(
        strokes.map((s) => smeared(s, 2.8, 1, 0.4)),
        1,
      ),
    [strokes],
  );

  const tickP = useMotionValue(checked ? 1 : 0);
  const strikeP = useMotionValue(checked ? 1 : 0);
  const inkOp = useMotionValue(1);
  const smudge = useMotionValue(0);
  const eraserX = useMotionValue(BOX / 2);
  const eraserY = useMotionValue(BOX / 2);
  const eraserOp = useMotionValue(0);
  const tickD = useTransform(tickP, (p) => outline(tick, p));
  const strikeD = useTransform(strikeP, (p) => outlines(strokes, p));

  const boxRef = React.useRef<HTMLSpanElement | null>(null);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const timers = React.useRef<number[]>([]);
  const loop = React.useRef<LoopHandle | null>(null);

  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    loop.current?.stop();
    loop.current = null;
  }, []);

  const panHere = () => {
    const rect = boxRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const draw = () => {
    halt();
    smudge.set(0);
    eraserOp.set(0);
    if (!motionSafe) {
      tickP.set(1);
      strikeP.set(1);
      inkOp.set(0);
      running.current.push(
        animate(inkOp, 1, { duration: durations.base, ease: easings.enter }),
      );
      return;
    }
    inkOp.set(1);
    tickP.set(0);
    strikeP.set(0);
    const loud = heard(item.id);
    const pan = panHere();
    if (loud) {
      audio.play("tick", {
        pitch: r2(1.05 + (seed % 7) * 0.03),
        gain: 0.4,
        pan,
      });
    }
    running.current.push(animate(tickP, 1, springs.flick));
    const length = strokes.reduce((sum, s) => sum + s.total, 0);
    if (!strike || length <= 0) {
      strikeP.set(1);
      return;
    }
    // The pen crosses from the box to the words and strikes them at its own
    // pace: a longer label takes longer.
    const duration = clamp(0.16 + length / 700, 0.2, 0.55);
    timers.current.push(
      window.setTimeout(() => {
        if (loud) {
          loop.current = audio.start("scratch", { pitch: 1.6, gain: 0.3, pan });
        }
        running.current.push(
          animate(strikeP, 1, {
            duration,
            ease: [0.35, 0, 0.3, 1],
            onUpdate: (v) =>
              loop.current?.set({
                gain: r2(0.18 + 0.3 * Math.sin(v * Math.PI)),
              }),
            onComplete: () => {
              loop.current?.stop();
              loop.current = null;
            },
          }),
        );
      }, 110),
    );
  };

  const erase = () => {
    halt();
    if (!motionSafe) {
      running.current.push(
        animate(inkOp, 0, {
          duration: durations.base,
          ease: easings.exit,
          onComplete: () => {
            tickP.set(0);
            strikeP.set(0);
            inkOp.set(1);
          },
        }),
      );
      return;
    }
    const loud = heard(item.id);
    const first = lines[0];
    const struck = strike && strikeP.get() > 0.05 && first;
    // The eraser scrubs the tick, then (if there is a strike) swipes along it.
    const xs = [9, 3, 14, 4, 13, 8];
    const ys = [9, 12, 7, 12, 8, 10];
    if (struck) {
      const y = r2(first.y + first.h * 0.56);
      xs.push(r2(LABEL_X + first.x), r2(LABEL_X + first.x + first.w));
      ys.push(y, y);
    }
    const duration = struck ? 0.62 : 0.42;
    const times = xs.map((_, i) => r2(i / (xs.length - 1)));
    eraserX.set(xs[0] ?? 9);
    eraserY.set(ys[0] ?? 9);
    if (loud) {
      loop.current = audio.start("scratch", {
        pitch: 0.55,
        gain: 0.35,
        pan: panHere(),
      });
    }
    running.current.push(
      animate(eraserOp, 1, { duration: durations.blink }),
      animate(eraserX, xs, { duration, times, ease: "easeInOut" }),
      animate(eraserY, ys, { duration, times, ease: "easeInOut" }),
      animate(inkOp, [1, 0.65, 0.4, 0.15, 0], { duration, ease: "linear" }),
      animate(smudge, [0, 0.34, 0.26], { duration, ease: "linear" }),
      animate(0, 1, {
        duration,
        ease: "linear",
        onUpdate: (v) =>
          loop.current?.set({
            gain: r2(0.2 + 0.25 * Math.abs(Math.sin(v * Math.PI * 5))),
          }),
        onComplete: () => {
          loop.current?.stop();
          loop.current = null;
          tickP.set(0);
          strikeP.set(0);
          inkOp.set(1);
          running.current.push(
            animate(eraserOp, 0, {
              duration: durations.fast,
              ease: easings.exit,
            }),
            // The smudge the eraser leaves fades over the next second.
            animate(smudge, 0, { duration: 0.9, ease: easings.enter }),
          );
        },
      }),
    );
  };

  const api = React.useRef({ draw, erase });
  React.useEffect(() => {
    api.current = { draw, erase };
  });

  // A tick from anywhere — a press, a key, the host — is drawn or rubbed out
  // the same way; only the visitor's own is heard.
  const shown = React.useRef(checked);
  React.useEffect(() => {
    if (shown.current === checked) return;
    shown.current = checked;
    if (checked) api.current.draw();
    else api.current.erase();
  }, [checked]);

  React.useEffect(() => halt, [halt]);

  const labelRef = React.useRef<HTMLLabelElement | null>(null);
  const bindText = React.useCallback((node: HTMLSpanElement | null) => {
    if (!node) return;
    // The strike follows the words' own line boxes, re-read when they move.
    const observer = new ResizeObserver(() => {
      const label = labelRef.current;
      if (!label) return;
      const next = linesOf(node, label);
      setLines((prev) =>
        JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const smear = `color-mix(in oklab, ${ink} 30%, oklch(0.62 0.01 260))`;

  return (
    <li
      className="relative flex items-start gap-2.5 py-1.5"
      style={{
        borderBottom: `1px solid color-mix(in oklab, ${RULE} 70%, transparent)`,
      }}
    >
      <span ref={boxRef} className="relative mt-px size-[18px] shrink-0">
        <svg
          aria-hidden
          viewBox={`0 0 ${BOX} ${BOX}`}
          className="absolute inset-0 size-full overflow-visible"
        >
          <path
            d={box}
            fill="none"
            stroke={PENCIL}
            strokeWidth={1.1}
            strokeLinecap="round"
          />
        </svg>
        <input
          id={inputId}
          type="checkbox"
          name={name}
          value={item.id}
          checked={checked}
          onChange={() => onToggle(item.id)}
          onInvalid={onInvalid}
          required={required}
          disabled={item.disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(
            "absolute inset-0 m-0 size-full cursor-pointer appearance-none rounded-[3px] bg-transparent outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed",
          )}
        />
        <svg
          aria-hidden
          viewBox={`0 0 ${TICK_W} ${TICK_H}`}
          className="pointer-events-none absolute overflow-visible"
          style={{ left: TICK_X, top: TICK_Y, width: TICK_W, height: TICK_H }}
        >
          <motion.path
            d={smudgeTick}
            style={{ fill: smear, opacity: smudge }}
          />
          <motion.path
            data-tick=""
            d={tickD}
            style={{ fill: ink, opacity: inkOp }}
          />
        </svg>
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-10 flex h-[7px] w-3.5 -translate-x-1/2 -translate-y-1/2 overflow-clip rounded-[2px]"
          style={{
            x: eraserX,
            y: eraserY,
            opacity: eraserOp,
            rotate: -24,
            boxShadow: `0 1px 1.5px color-mix(in oklab, black 25%, transparent)`,
          }}
        >
          <span className="h-full flex-1" style={{ background: RUBBER }} />
          <span className="h-full w-1.5" style={{ background: SLEEVE }} />
        </motion.span>
      </span>
      <label
        ref={labelRef}
        htmlFor={inputId}
        className={cn(
          "relative min-w-0 flex-1 text-sm leading-5 transition-colors",
          item.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        )}
        style={{ color: checked ? TEXT_DONE : TEXT }}
      >
        <span ref={bindText}>{item.label}</span>
        <svg
          aria-hidden
          width={1}
          height={1}
          className="pointer-events-none absolute top-0 left-0 overflow-visible"
        >
          <motion.path
            d={smudgeStrike}
            style={{ fill: smear, opacity: smudge }}
          />
          <motion.path
            data-strike=""
            d={strikeD}
            style={{ fill: ink, opacity: strike ? inkOp : 0 }}
          />
        </svg>
      </label>
    </li>
  );
}

/**
 * A checklist on a notepad, ticked with a pen. Each tick is drawn, not
 * revealed: a filled outline rebuilt every frame from a pen stroke with
 * pressure — light where the nib lands, heaviest at the bottom of the tick,
 * lifting to a hairline as it flicks past the box — on the flick spring.
 * Then the pen crosses the words: a line that rises and wavers a little,
 * drawn at the pen's own pace with a scratch that follows the nib, and struck
 * line by line when the words wrap. Unticking rubs both out: a small eraser
 * scrubs the tick and swipes along the strike while the ink thins, and it
 * leaves a grey smudge that fades over the next second.
 *
 * In the margin a bar fills with ink to the share of items done, on glide.
 * Every item is a native checkbox in a fieldset, so Tab reaches each box and
 * Space ticks it exactly as a press does. Every stroke is seeded from the
 * item's id: the server and the browser draw the same hand. Under reduced
 * motion the ink simply appears and fades; the bar and count still move.
 */
export function InkChecklist({
  label,
  items,
  value,
  defaultValue = [],
  onValueChange,
  ink = "blue",
  strike = true,
  wobble = 0.4,
  name,
  hint,
  error,
  required = false,
  disabled = false,
  sound = false,
  className,
}: InkChecklistProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const pen = INKS[ink] ?? INKS.blue;

  const [own, setOwn] = React.useState<string[]>(defaultValue);
  const ticked = value ?? own;
  const has = (id: string) => ticked.includes(id);
  const total = items.length;
  const done = items.filter((i) => has(i.id)).length;
  const left = total - done;

  const [tried, setTried] = React.useState(false);
  const problem =
    error ??
    (required && tried && left > 0
      ? left === total
        ? "Tick every item before you go on."
        : `Tick the last ${left === 1 ? "item" : `${left} items`}.`
      : null);

  // One sentence per change, frozen at the render that made it.
  const progress =
    done === total ? `All ${total} done.` : `${done} of ${total} done.`;
  const key = `${done}|${problem ?? ""}`;
  const [said, setSaid] = React.useState({ key, n: 0, text: "" });
  if (said.key !== key) {
    setSaid({
      key,
      n: said.n + 1,
      text: problem ? `${progress} ${problem}` : progress,
    });
  }

  const heardIds = React.useRef(new Set<string>());
  const heard = React.useCallback((id: string) => {
    const was = heardIds.current.has(id);
    heardIds.current.delete(id);
    return was;
  }, []);

  const toggle = (id: string) => {
    if (disabled) return;
    heardIds.current.add(id);
    const next = items
      .filter((i) => (i.id === id ? !has(i.id) : has(i.id)))
      .map((i) => i.id);
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const onInvalid = (event: React.FormEvent<HTMLInputElement>) => {
    // The list says what is missing itself, in place of the browser's bubble,
    // and the first box still unticked takes focus.
    event.preventDefault();
    if (!tried) setTried(true);
    const first = items.find((i) => !has(i.id) && !i.disabled);
    if (first && event.currentTarget.value === first.id) {
      event.currentTarget.focus();
    }
  };

  const bar = useMotionValue(total ? done / total : 0);
  React.useEffect(() => {
    const target = total ? done / total : 0;
    if (!motionSafe) {
      bar.set(target);
      return;
    }
    const controls = animate(bar, target, springs.glide);
    return () => controls.stop();
  }, [bar, done, motionSafe, total]);

  const describedBy = problem ? errorId : hint ? hintId : undefined;

  return (
    <fieldset
      aria-describedby={describedBy}
      disabled={disabled}
      className={cn(
        "relative w-full min-w-0 rounded-3 border px-3 pt-2.5 pb-3",
        disabled && "opacity-60",
        className,
      )}
      style={{
        background: PAPER,
        borderColor: PAPER_EDGE,
        boxShadow: `0 1px 2px color-mix(in oklab, black 10%, transparent)`,
      }}
    >
      <legend
        className="float-left flex w-full items-baseline justify-between gap-3 text-sm leading-5 font-medium"
        style={{ color: TEXT }}
      >
        <span className="min-w-0">{label}</span>
        <span
          aria-hidden
          className="shrink-0 font-mono text-[11px] font-normal tabular-nums"
          style={{ color: TEXT_SOFT }}
        >
          {done} of {total}
        </span>
      </legend>

      {hint || problem ? (
        <div className="clear-left grid pt-0.5 text-xs leading-4">
          {hint ? (
            <p
              id={hintId}
              aria-hidden={problem ? true : undefined}
              className={cn(
                "col-start-1 row-start-1 transition-opacity",
                problem ? "opacity-0" : "opacity-100",
              )}
              style={{ color: TEXT_SOFT }}
            >
              {hint}
            </p>
          ) : null}
          <p
            id={errorId}
            className={cn(
              "col-start-1 row-start-1 transition-opacity",
              problem ? "opacity-100" : "opacity-0",
            )}
            style={{ color: ERROR_INK }}
          >
            {problem}
          </p>
        </div>
      ) : null}

      <ul role="list" className="relative clear-left mt-1.5 pl-6">
        <span
          aria-hidden
          className="absolute top-1.5 bottom-1.5 left-1 w-[3px] overflow-clip rounded-full"
          style={{ background: `color-mix(in oklab, ${pen} 14%, transparent)` }}
        >
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ scaleY: bar, originY: 0, background: pen }}
          />
        </span>
        <span
          aria-hidden
          className="absolute inset-y-0 left-[15px] w-px"
          style={{
            background: `color-mix(in oklab, ${MARGIN} 55%, transparent)`,
          }}
        />
        {items.map((item) => (
          <Row
            key={item.id}
            item={item}
            checked={has(item.id)}
            inputId={`${uid}-${item.id}`}
            ink={pen}
            strike={strike}
            wobble={wobble}
            name={name}
            required={required}
            invalid={Boolean(problem) && !has(item.id)}
            describedBy={describedBy}
            motionSafe={motionSafe}
            audio={audio}
            heard={heard}
            onToggle={toggle}
            onInvalid={onInvalid}
          />
        ))}
      </ul>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </fieldset>
  );
}
