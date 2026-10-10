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
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type StarPeekTone = "amber" | "rose" | "cobalt" | "mint";
export type StarPeekSize = "sm" | "md" | "lg";
export type StarPeekPhrases = "warm" | "plain" | "off";

export type StarPeekProps = {
  /** Controlled rating; 0 is unrated. */
  value?: number;
  /** Initial rating when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the press, tap or key that committed a rating. */
  onValueChange?: (value: number) => void;
  /** Fires as a preview starts, moves to another step, and ends (null). */
  onPreviewChange?: (value: number | null) => void;
  /** How many stars, 1 to 10. @default 5 */
  count?: number;
  /** Half-star steps. @default true */
  half?: boolean;
  /** The phrase that peeks above a previewed score: a built-in set, "off", or your own — one per star, or one per half step. @default "warm" */
  phrases?: StarPeekPhrases | readonly string[];
  /** The question over the stars, and the radio group's name. @default "Your rating" */
  label?: string;
  /** Keep the question for assistive technology only; the row stays, for the phrase to peek into. @default false */
  hideLabel?: boolean;
  /** Show the number beside the stars. @default true */
  showValue?: boolean;
  /** How a value is written beside the stars and spoken. @default "4.5", "4" */
  format?: (value: number, count: number) => string;
  /** Arrow keys select as they move instead of previewing until Enter or Space. @default false */
  commitOnArrow?: boolean;
  /** The stars' colour: a named pigment, or any CSS colour. @default "amber" */
  color?: StarPeekTone | (string & {});
  /** Stars 24, 32 or 40px; they shrink to fit a narrow row. @default "md" */
  size?: StarPeekSize;
  /** Form field name: the rating is submitted in a hidden input. */
  name?: string;
  /** Shows the rating; no preview, no commit. @default false */
  readOnly?: boolean;
  /** Play a tick per previewed step and a chime on commit. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Geometry = {
  star: number;
  gap: number;
  text: string;
  value: string;
  row: number;
};

const GEOMETRY: Record<StarPeekSize, Geometry> = {
  sm: {
    star: 24,
    gap: 3,
    text: "text-xs leading-5",
    value: "text-sm",
    row: 20,
  },
  md: {
    star: 32,
    gap: 5,
    text: "text-sm leading-6",
    value: "text-base",
    row: 24,
  },
  lg: {
    star: 40,
    gap: 6,
    text: "text-base leading-7",
    value: "text-lg",
    row: 28,
  },
};

/** Pigments, so a filled star reads the same in both themes. */
const TONES: Record<StarPeekTone, string> = {
  amber: "oklch(from var(--warn) 0.8 0.16 h)",
  rose: "oklch(from var(--danger) 0.68 0.19 h)",
  cobalt: "oklch(from var(--accent-bright) 0.64 0.18 h)",
  mint: "oklch(from var(--success) 0.76 0.14 h)",
};

const SETS: Record<Exclude<StarPeekPhrases, "off">, readonly string[]> = {
  warm: [
    "Not for me",
    "Could be better",
    "It was fine",
    "Really good",
    "Loved it",
  ],
  plain: ["Poor", "Fair", "Good", "Very good", "Excellent"],
};

type Pt = readonly [number, number];
const f3 = (v: number) => Number(v.toFixed(3));

/**
 * A five-point star in a 24-unit box with softened points: every vertex is
 * cut back along its two edges and turned with a quadratic, the outer points
 * more than the inner. Rounded to 3dp so the server and browser agree.
 */
const STAR = (() => {
  const cx = 12;
  const cy = 12.7;
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 11 : 4.9;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  const toward = (p: Pt, q: Pt, t: number): Pt => [
    p[0] + (q[0] - p[0]) * t,
    p[1] + (q[1] - p[1]) * t,
  ];
  const w = (p: Pt) => `${f3(p[0])} ${f3(p[1])}`;
  let d = "";
  for (let i = 0; i < 10; i += 1) {
    const p = pts[i] ?? [0, 0];
    const prev = pts[(i + 9) % 10] ?? p;
    const next = pts[(i + 1) % 10] ?? p;
    const t = i % 2 === 0 ? 0.17 : 0.09;
    d += `${i === 0 ? "M" : " L"} ${w(toward(p, prev, t))} Q ${w(p)} ${w(toward(p, next, t))}`;
  }
  return `${d} Z`;
})();
/** The star's own left and width inside its 24-unit box: fill maps onto these. */
const STAR_LEFT = f3(12 - 11 * Math.sin((2 * Math.PI) / 5));
const STAR_WIDTH = f3(2 * 11 * Math.sin((2 * Math.PI) / 5));

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * Sound waits for a real activation — a click, tap or key — never a hover or
 * a first touch-down. Browsers without the API are taken at their word.
 */
const activated = () => {
  if (typeof navigator === "undefined") return false;
  const ua = (navigator as Navigator & { userActivation?: UserActivation })
    .userActivation;
  return ua ? ua.hasBeenActive : true;
};

const defaultFormat = (v: number) =>
  v <= 0 ? "–" : Number.isInteger(v) ? String(v) : v.toFixed(1);

/** The phrase for a value, from a set of any length. */
function phraseFor(
  set: readonly string[] | null,
  v: number,
  count: number,
): string {
  if (!set || set.length === 0 || v <= 0) return "";
  let i: number;
  if (set.length === count) i = Math.ceil(v) - 1;
  else if (set.length === count * 2) i = Math.round(v * 2) - 1;
  else i = Math.ceil((v / count) * set.length - 1e-6) - 1;
  return set[clamp(i, 0, set.length - 1)] ?? "";
}

type StarProps = {
  index: number;
  level: MotionValue<number>;
  ghost: MotionValue<number>;
  pop: MotionValue<number>;
  sheen: MotionValue<number>;
  clip: string;
  size: number;
  children: React.ReactNode;
  cellRef: (node: HTMLSpanElement | null) => void;
};

/** One star: an empty star, the ghost of the value ahead, the fill, a sheen. */
function Star({
  index,
  level,
  ghost,
  pop,
  sheen,
  clip,
  size,
  children,
  cellRef,
}: StarProps) {
  const fillW = useTransform(level, (l) =>
    r2(clamp(l - index, 0, 1) * STAR_WIDTH),
  );
  const ghostW = useTransform(ghost, (g) =>
    r2(clamp(g - index, 0, 1) * STAR_WIDTH),
  );
  return (
    <span
      ref={cellRef}
      className="relative block min-w-0 shrink"
      style={{ width: size, aspectRatio: "1 / 1" }}
    >
      <motion.svg
        aria-hidden
        viewBox="0 0 24 24"
        className="pointer-events-none block size-full overflow-visible"
        style={{ scale: pop }}
      >
        <defs>
          <clipPath id={`${clip}-f${index}`}>
            <motion.rect x={STAR_LEFT} y={0} height={24} width={fillW} />
          </clipPath>
          <clipPath id={`${clip}-g${index}`}>
            <motion.rect x={STAR_LEFT} y={0} height={24} width={ghostW} />
          </clipPath>
        </defs>
        <path
          d={STAR}
          strokeWidth={1.1}
          strokeLinejoin="round"
          className="fill-surface-2 stroke-hairline-strong"
        />
        <path
          d={STAR}
          clipPath={`url(#${clip}-g${index})`}
          className="fill-[color-mix(in_oklab,var(--star-peek-color)_34%,transparent)]"
        />
        <path
          d={STAR}
          clipPath={`url(#${clip}-f${index})`}
          className="fill-[var(--star-peek-color)]"
        />
        <motion.path
          d={STAR}
          className="fill-white"
          style={{ opacity: sheen }}
        />
      </motion.svg>
      {children}
    </span>
  );
}

type Latest = {
  current: number;
  previewing: boolean;
};

/**
 * A star rating that tells you what you are about to say. Hovering,
 * scrubbing with a finger or arrowing fills the stars toward the pointer —
 * smoothly, so a star can stand a third full — while a soft ghost reaches
 * ahead to the value a press would commit, jumping a step at a time on the
 * snap spring; and a short phrase for that score peeks up from behind the
 * question, sliding sideways to sit over the ghost's edge. Committing settles
 * the fill on the value and pops the filled stars in sequence, each kicked on
 * the recoil spring, with a chime as the last one lands.
 *
 * It is a real `role="radiogroup"` with one radio per step (two per star with
 * half steps), each covering its half of a star. Arrows move and preview (or
 * select, with `commitOnArrow`), Home and End jump, Enter and Space commit,
 * and Escape ends a preview. Under reduced motion the fill and ghost jump to
 * place and the phrase fades in place; the commit is a brief highlight.
 */
export function StarPeek({
  value,
  defaultValue = 0,
  onValueChange,
  onPreviewChange,
  count = 5,
  half = true,
  phrases = "warm",
  label = "Your rating",
  hideLabel = false,
  showValue = true,
  format = defaultFormat,
  commitOnArrow = false,
  color = "amber",
  size = "md",
  name,
  readOnly = false,
  sound = false,
  disabled = false,
  className,
}: StarPeekProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const labelId = `star-peek-${uid}`;
  const clip = `star-peek-clip-${uid}`;
  const g = GEOMETRY[size] ?? GEOMETRY.md;
  const n = Math.round(clamp(count, 1, 10));
  const step = half ? 0.5 : 1;
  const tone = TONES[color as StarPeekTone] ?? color;
  const set =
    phrases === "off"
      ? null
      : typeof phrases === "string"
        ? (SETS[phrases] ?? SETS.warm)
        : phrases;
  const inert = disabled || readOnly;

  const snap = React.useCallback(
    (v: number) => clamp(Math.round(v / step) * step, 0, n),
    [n, step],
  );
  const [own, setOwn] = React.useState(() => snap(defaultValue));
  const current = snap(value ?? own);
  const [preview, setPreview] = React.useState<number | null>(null);
  const [said, setSaid] = React.useState("");
  const [check, setCheck] = React.useState(0);

  const level = useMotionValue(current);
  const ghost = useMotionValue(current);
  const peek = useMotionValue(0);
  const bubbleX = useMotionValue(0);
  const caretX = useMotionValue(0);
  // A fixed pool of ten, so the hooks never change with `count`.
  const p0 = useMotionValue(1);
  const p1 = useMotionValue(1);
  const p2 = useMotionValue(1);
  const p3 = useMotionValue(1);
  const p4 = useMotionValue(1);
  const p5 = useMotionValue(1);
  const p6 = useMotionValue(1);
  const p7 = useMotionValue(1);
  const p8 = useMotionValue(1);
  const p9 = useMotionValue(1);
  const s0 = useMotionValue(0);
  const s1 = useMotionValue(0);
  const s2 = useMotionValue(0);
  const s3 = useMotionValue(0);
  const s4 = useMotionValue(0);
  const s5 = useMotionValue(0);
  const s6 = useMotionValue(0);
  const s7 = useMotionValue(0);
  const s8 = useMotionValue(0);
  const s9 = useMotionValue(0);
  const pops = [p0, p1, p2, p3, p4, p5, p6, p7, p8, p9];
  const sheens = [s0, s1, s2, s3, s4, s5, s6, s7, s8, s9];

  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const headRef = React.useRef<HTMLDivElement | null>(null);
  const bubbleRef = React.useRef<HTMLDivElement | null>(null);
  const cells = React.useRef<(HTMLSpanElement | null)[]>([]);
  const radios = React.useRef(new Map<string, HTMLSpanElement>());
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef(new Set<number>());
  const shownPreview = React.useRef<number | null>(null);
  const latest = React.useRef<Latest>({ current, previewing: false });
  const previewRef = React.useRef(onPreviewChange);
  React.useEffect(() => {
    latest.current.current = current;
    previewRef.current = onPreviewChange;
  });

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const values = React.useMemo(() => {
    const out: number[] = [];
    for (let v = step; v <= n + 1e-9; v += step) out.push(Number(v.toFixed(1)));
    return out;
  }, [n, step]);

  /** Where a pointer is, in stars: the fill's edge sits right under it. */
  const levelAt = (clientX: number): number => {
    let level = 0;
    for (let i = 0; i < n; i += 1) {
      const cell = cells.current[i];
      if (!cell) continue;
      const r = cell.getBoundingClientRect();
      if (r.width <= 0) continue;
      if (clientX < r.left) break;
      const units = ((clientX - r.left) / r.width) * 24;
      const frac = clamp((units - STAR_LEFT) / STAR_WIDTH, 0, 1);
      level = i + frac;
      if (clientX <= r.right) break;
    }
    return clamp(level, 0, n);
  };

  /** The value a press at this level would commit: the step it reaches into. */
  const valueAt = (l: number) =>
    clamp(Math.ceil(l / step - 1e-6) * step, step, n);

  /** The ghost's edge, as an x inside the head row. */
  const edgeX = (v: number): number => {
    const head = headRef.current;
    if (!head) return 0;
    const i = Math.max(0, Math.ceil(v) - 1);
    const cell = cells.current[i];
    if (!cell) return 0;
    const r = cell.getBoundingClientRect();
    const frac = v - i;
    const x = r.left + (r.width * (STAR_LEFT + STAR_WIDTH * frac)) / 24;
    return x - head.getBoundingClientRect().left;
  };

  const placeBubble = (v: number, instant: boolean) => {
    const head = headRef.current;
    const bubble = bubbleRef.current;
    if (!head || !bubble) return;
    const x = edgeX(v);
    const bw = bubble.offsetWidth;
    const left = clamp(x - bw / 2, 0, Math.max(0, head.clientWidth - bw));
    const caret = clamp(x - left, 8, Math.max(8, bw - 8));
    if (instant || !motionSafe) {
      anims.current.get("bx")?.stop();
      anims.current.get("cx")?.stop();
      bubbleX.jump(r2(left));
      caretX.jump(r2(caret));
      return;
    }
    run("bx", animate(bubbleX, r2(left), springs.snap));
    run("cx", animate(caretX, r2(caret), springs.snap));
  };

  const pan = (v: number) => {
    const head = headRef.current;
    return head
      ? panFrom(head.getBoundingClientRect().left + edgeX(v), null)
      : 0;
  };

  /** Show `v` as the value about to be said, with the fill at `at`. */
  const showPreview = (v: number, at: number) => {
    const fresh = !latest.current.previewing;
    latest.current.previewing = true;
    if (!motionSafe) {
      anims.current.get("level")?.stop();
      level.jump(v);
    } else {
      run("level", animate(level, r2(at), springs.flick));
    }
    if (shownPreview.current !== v) {
      const was = shownPreview.current;
      shownPreview.current = v;
      if (!motionSafe) {
        anims.current.get("ghost")?.stop();
        ghost.jump(v);
      } else {
        run("ghost", animate(ghost, v, springs.snap));
      }
      if (was !== null && activated()) {
        audio.play("tick", {
          pitch: r2(0.85 + (v / n) * 0.6),
          gain: 0.4,
          pan: pan(v),
        });
      }
      setPreview(v);
      onPreviewChange?.(v);
    }
    if (set) placeBubble(v, fresh);
    if (fresh) {
      run(
        "peek",
        motionSafe
          ? animate(peek, 1, springs.snap)
          : animate(peek, 1, { duration: durations.fast }),
      );
    }
  };

  const endPreview = () => {
    if (!latest.current.previewing) return;
    latest.current.previewing = false;
    shownPreview.current = null;
    setPreview(null);
    onPreviewChange?.(null);
    const to = latest.current.current;
    run(
      "peek",
      animate(peek, 0, { duration: durations.fast, ease: easings.exit }),
    );
    if (!motionSafe) {
      level.jump(to);
      ghost.jump(to);
      return;
    }
    run("level", animate(level, to, springs.glide));
    run("ghost", animate(ghost, to, springs.glide));
  };

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, Math.round(ms));
    timers.current.add(id);
  };

  /** The filled stars pop in turn; the chime lands with the last. */
  const popTo = (v: number, all: boolean) => {
    const filled = Math.ceil(v);
    const gap = cascade(n);
    const first = all ? 0 : Math.max(0, filled - 1);
    for (let i = first; i < filled; i += 1) {
      const pop = pops[i];
      const sheen = sheens[i];
      if (!pop || !sheen) continue;
      const delay = (i - first) * gap;
      if (motionSafe) {
        pop.jump(1);
        run(
          `pop${i}`,
          animate(pop, 1, { ...springs.recoil, velocity: 5, delay }),
        );
      }
      run(
        `sheen${i}`,
        animate(sheen, [0, 0.5, 0], {
          duration: motionSafe ? 0.36 : durations.slow,
          ease: easings.move,
          delay: motionSafe ? delay : 0,
        }),
      );
    }
    const last = motionSafe ? (filled - 1 - first) * gap : 0;
    // A whole commit chimes; a step committed by an arrow only ticks.
    later(
      () =>
        all
          ? audio.play("chime", {
              pitch: r2(0.75 + (v / n) * 0.5),
              gain: 0.5,
              pan: pan(v),
            })
          : audio.play("tick", {
              pitch: r2(0.85 + (v / n) * 0.6),
              gain: 0.45,
              pan: pan(v),
            }),
      last * 1000 + 40,
    );
  };

  const commit = (v: number, all = true) => {
    if (inert) return;
    const next = snap(v);
    latest.current.previewing = false;
    shownPreview.current = null;
    setPreview(null);
    onPreviewChange?.(null);
    run(
      "peek",
      animate(peek, 0, { duration: durations.base, ease: easings.exit }),
    );
    if (!motionSafe) {
      level.jump(next);
      ghost.jump(next);
    } else {
      run("level", animate(level, next, springs.snap));
      run("ghost", animate(ghost, next, springs.snap));
    }
    const phrase = phraseFor(set, next, n);
    setSaid(`Rated ${format(next, n)} of ${n}${phrase ? `, ${phrase}` : ""}`);
    popTo(next, all);
    latest.current.current = next;
    if (value === undefined) setOwn(next);
    else React.startTransition(() => setCheck((c) => c + 1));
    onValueChange?.(next);
  };

  // The host's word: an outside change (or a refused commit) moves the
  // stars to the value the host holds, unless the visitor is mid-preview.
  React.useEffect(() => {
    latest.current.current = current;
    if (latest.current.previewing) return;
    if (Math.abs(level.get() - current) < 1e-3 && ghost.get() === current) {
      return;
    }
    run("level", animate(level, current, springs.glide));
    run("ghost", animate(ghost, current, springs.glide));
  }, [current, check, level, ghost]);

  // Disabled or read-only mid-preview: the preview ends.
  React.useEffect(() => {
    if (inert && latest.current.previewing) {
      latest.current.previewing = false;
      shownPreview.current = null;
      peek.jump(0);
      level.jump(latest.current.current);
      ghost.jump(latest.current.current);
      previewRef.current?.(null);
    }
  }, [inert, peek, level, ghost]);

  React.useEffect(() => {
    const running = anims.current;
    const pending = timers.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      for (const id of pending) window.clearTimeout(id);
      pending.clear();
    };
  }, []);

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled: inert,
    onStart: ({ point }) => {
      const l = levelAt(point.x);
      showPreview(valueAt(l), l);
    },
    onMove: ({ point }) => {
      const l = levelAt(point.x);
      showPreview(valueAt(l), l);
    },
    onEnd: ({ point }) => commit(valueAt(levelAt(point.x))),
    onCancel: () => endPreview(),
    onTap: (event) => commit(valueAt(levelAt(event.clientX))),
  });

  const keyFor = (v: number) => v.toFixed(1);
  const focusValue = (v: number) => radios.current.get(keyFor(v))?.focus();

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (inert) return;
    const base = preview ?? (current > 0 ? current : 0);
    let next: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = clamp(base + step, step, n);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = clamp(base - step, step, n);
        break;
      case "Home":
        next = step;
        break;
      case "End":
        next = n;
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        const target = event.target as HTMLElement;
        const v = Number(target.dataset.value ?? base);
        if (v > 0) commit(v);
        return;
      }
      case "Escape":
        if (latest.current.previewing) {
          event.preventDefault();
          endPreview();
        }
        return;
      default:
        return;
    }
    event.preventDefault();
    focusValue(next);
    if (commitOnArrow) commit(next, false);
    else showPreview(next, next);
  };

  // A preview left behind by a switch to disabled or read-only is not shown.
  const previewing = inert ? null : preview;
  const readout = previewing ?? current;
  const widest = React.useMemo(
    () =>
      Math.max(...values.map((v) => format(v, n).length), format(0, n).length),
    [values, format, n],
  );
  const phraseNow = phraseFor(set, previewing ?? current, n);
  const tabbable = current > 0 ? current : step;

  // The question steps back only when a phrase comes up over it.
  const headOpacity = useTransform(peek, (p) => (set ? r2(1 - 0.7 * p) : 1));
  const bubbleY = useTransform(peek, (p) => (motionSafe ? r2((1 - p) * 6) : 0));

  return (
    <div
      className={cn(
        "@container flex w-full min-w-0 flex-col gap-2",
        disabled && "opacity-50",
        className,
      )}
      style={
        {
          maxWidth: n * g.star + (n - 1) * g.gap + 72,
          "--star-peek-color": tone,
        } as React.CSSProperties
      }
    >
      <div
        ref={headRef}
        className={cn("relative", g.text)}
        style={{ height: g.row }}
      >
        <motion.p
          id={labelId}
          className={cn("truncate text-foreground", hideLabel && "sr-only")}
          style={{ opacity: headOpacity }}
        >
          {label}
        </motion.p>
        {set ? (
          <motion.div
            ref={bubbleRef}
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 rounded-2 border border-hairline-strong bg-popover px-2 py-0.5 text-xs font-medium whitespace-nowrap text-popover-foreground shadow-[0_2px_8px_-2px_color-mix(in_oklab,black_30%,transparent)]"
            style={{ x: bubbleX, y: bubbleY, opacity: peek }}
          >
            <span className="grid">
              {set.map((phrase, i) => (
                <motion.span
                  key={`${i}-${phrase}`}
                  className="col-start-1 row-start-1 text-center"
                  initial={false}
                  animate={{ opacity: phrase === phraseNow ? 1 : 0 }}
                  transition={{ duration: durations.fast }}
                >
                  {phrase}
                </motion.span>
              ))}
            </span>
            <motion.span
              className="absolute -bottom-1 size-2 -translate-x-1/2 rotate-45 border-r border-b border-hairline-strong bg-popover"
              style={{ left: caretX }}
            />
          </motion.div>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <div
          ref={rowRef}
          role="radiogroup"
          aria-labelledby={labelId}
          aria-readonly={readOnly || undefined}
          aria-disabled={disabled || undefined}
          className={cn(
            "flex min-w-0 touch-pan-y items-center select-none",
            inert ? "cursor-default" : "cursor-pointer",
          )}
          style={{ columnGap: g.gap }}
          onKeyDown={onKeyDown}
          onPointerDown={drag.onPointerDown}
          onPointerUp={drag.onPointerUp}
          onPointerCancel={drag.onPointerCancel}
          onLostPointerCapture={drag.onLostPointerCapture}
          onPointerMove={(event) => {
            drag.onPointerMove(event);
            if (inert || event.pointerType === "touch" || event.buttons !== 0) {
              return;
            }
            const l = levelAt(event.clientX);
            showPreview(valueAt(l), l);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "touch") return;
            if (event.buttons !== 0) return;
            const active = document.activeElement;
            if (active instanceof Node && rowRef.current?.contains(active)) {
              // Keyboard focus is still here: the preview follows it instead.
              const v = Number((active as HTMLElement).dataset.value ?? 0);
              if (v > 0 && active.matches(":focus-visible")) {
                showPreview(v, v);
                return;
              }
            }
            endPreview();
          }}
          onFocus={(event) => {
            const target = event.target as HTMLElement;
            if (inert || !target.matches(":focus-visible")) return;
            const v = Number(target.dataset.value ?? 0);
            if (v > 0 && !latest.current.previewing) showPreview(v, v);
          }}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && rowRef.current?.contains(next)) return;
            endPreview();
          }}
        >
          {Array.from({ length: n }, (_, i) => {
            const pop = pops[i] ?? p0;
            const sheen = sheens[i] ?? s0;
            const halves = half ? [i + 0.5, i + 1] : [i + 1];
            return (
              <Star
                key={i}
                index={i}
                level={level}
                ghost={ghost}
                pop={pop}
                sheen={sheen}
                clip={clip}
                size={g.star}
                cellRef={(node) => {
                  cells.current[i] = node;
                }}
              >
                {halves.map((v, h) => {
                  const phrase = phraseFor(set, v, n);
                  const spoken = `${format(v, n)} ${v === 1 ? "star" : "stars"}${phrase ? `, ${phrase}` : ""}`;
                  return (
                    <span
                      key={v}
                      ref={(node) => {
                        if (node) radios.current.set(keyFor(v), node);
                        else radios.current.delete(keyFor(v));
                      }}
                      role="radio"
                      aria-checked={current === v}
                      aria-label={spoken}
                      data-value={v}
                      tabIndex={!disabled && v === tabbable ? 0 : -1}
                      className={cn(
                        "absolute inset-y-0 outline-none",
                        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
                        half
                          ? h === 0
                            ? "left-0 w-1/2 rounded-l-2"
                            : "right-0 w-1/2 rounded-r-2"
                          : "inset-x-0 rounded-2",
                      )}
                    />
                  );
                })}
              </Star>
            );
          })}
        </div>
        {showValue ? (
          <span
            aria-hidden
            className={cn(
              "flex shrink-0 items-baseline gap-1 font-mono tabular-nums",
              g.value,
            )}
          >
            <span
              className={cn(
                "text-right transition-colors duration-150",
                previewing !== null ? "text-ink-2" : "text-foreground",
              )}
              style={{ minWidth: `${widest}ch` }}
            >
              {format(readout, n)}
            </span>
            <span className="text-xs text-ink-3 @max-[15rem]:hidden">
              / {n}
            </span>
          </span>
        ) : null}
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
      {name ? <input type="hidden" name={name} value={current} /> : null}
    </div>
  );
}
