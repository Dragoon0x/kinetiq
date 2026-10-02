"use client";

import * as React from "react";

import { ArrowRight, Check, Flame, RotateCcw } from "lucide-react";
import {
  AnimatePresence,
  animate,
  motion,
  useIsPresent,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
  type Variants,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type LessonCardLesson = {
  id: string;
  title: string;
  /** How long it takes, in minutes. */
  minutes: number;
};

export type LessonCardRing = "thin" | "thick" | "segmented";
export type LessonCardSize = "sm" | "md" | "lg";

export type LessonCardProps = {
  /** The course: the card's heading. @default "Pricing for Product Teams" */
  course?: string;
  /** Who runs it, shown beside Continue. @default "Fieldline Academy" */
  provider?: string;
  /** The course's lessons, in order. @default defaultLessons */
  lessons?: LessonCardLesson[];
  /** Controlled: index of the current lesson. `lessons.length` means the course is complete. */
  lesson?: number;
  /** Initial lesson when uncontrolled. @default 6 */
  defaultLesson?: number;
  /** Fires from Continue (the next index) and Start again (0). */
  onLessonChange?: (index: number) => void;
  /** Fires from Continue with the lesson just finished. */
  onContinue?: (lesson: LessonCardLesson) => void;
  /** Days of activity, oldest first; the last is today. @default defaultActivity */
  activity?: boolean[];
  /** The ring: one thin arc, one thick arc, or one segment per lesson. @default "thick" */
  ring?: LessonCardRing;
  /** How far the next lesson's card rises from behind on hover, 0 to 1. @default 0.75 */
  peek?: number;
  /** How many days dot along the bottom edge; 0 hides the streak. @default 14 */
  streak?: number;
  /** The Continue button's text. @default "Continue" */
  continueLabel?: string;
  /** Continue's text on the last lesson. @default "Finish course" */
  finishLabel?: string;
  /** The button on the complete card. @default "Start again" */
  restartLabel?: string;
  /** Words on the card that peeks from behind. @default "Up next" */
  nextLabel?: string;
  /** Ring 48 / 60 / 72 px and the type beside it. @default "md" */
  size?: LessonCardSize;
  /** The ring, the active days and Continue. @default "var(--accent-bright)" */
  accent?: string;
  /** Play the flip-through and the ring landing. Off unless asked for. @default false */
  sound?: boolean;
  /** Nothing continues or peeks. @default false */
  disabled?: boolean;
  className?: string;
};

export const defaultLessons: LessonCardLesson[] = [
  { id: "why-price", title: "Why price is a product decision", minutes: 9 },
  { id: "value-metrics", title: "Value metrics that scale", minutes: 14 },
  { id: "willingness", title: "Reading willingness to pay", minutes: 12 },
  { id: "packaging", title: "Packaging and tiers", minutes: 16 },
  { id: "anchors", title: "Anchors and decoys", minutes: 11 },
  { id: "discounts", title: "Discounts without damage", minutes: 13 },
  { id: "price-test", title: "Running a price test", minutes: 18 },
  { id: "cohorts", title: "Reading a cohort chart", minutes: 12 },
  { id: "churned", title: "Talking to churned customers", minutes: 15 },
  { id: "grandfather", title: "Grandfathering old plans", minutes: 10 },
  { id: "announce", title: "Announcing a price change", minutes: 12 },
  { id: "review", title: "Your pricing review", minutes: 20 },
];

/** Three weeks, oldest first, ending today (not yet done): a 4-day streak. */
export const defaultActivity: boolean[] = [
  true,
  false,
  true,
  true,
  false,
  true,
  true,
  true,
  false,
  false,
  true,
  true,
  false,
  true,
  true,
  false,
  true,
  true,
  true,
  true,
  false,
];

const RING: Record<LessonCardSize, number> = { sm: 48, md: 60, lg: 72 };
const STROKE: Record<LessonCardRing, number> = {
  thin: 3,
  thick: 6,
  segmented: 5,
};
/** The next card's sliver at rest, and the one behind it, in px. */
const REST_1 = 10;
const REST_2 = 18;
/** A sound answers the visitor only this soon after their press, in ms. */
const BEAT = 1000;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** A point on a circle, clockwise from twelve o'clock, rounded for the markup. */
const polar = (c: number, r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${r3(c + r * Math.cos(a))} ${r3(c + r * Math.sin(a))}`;
};

function arc(c: number, r: number, from: number, to: number): string {
  const sweep = to - from;
  if (sweep <= 0.01) return "";
  if (sweep >= 359.99) {
    return `M${polar(c, r, 0)} A${r} ${r} 0 1 1 ${polar(c, r, 180)} A${r} ${r} 0 1 1 ${polar(c, r, 360)}`;
  }
  return `M${polar(c, r, from)} A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${polar(c, r, to)}`;
}

type RingGeometry = {
  px: number;
  stroke: number;
  c: number;
  r: number;
  style: LessonCardRing;
  count: number;
};

/** The filled part of the ring for a share, 0 to 1. */
function ringPath(g: RingGeometry, share: number): string {
  const f = clamp(share, 0, 1);
  if (g.style !== "segmented") return arc(g.c, g.r, 0, 360 * f);
  const n = Math.max(1, g.count);
  const each = 360 / n;
  const gap = Math.min(8, each * 0.28);
  let d = "";
  for (let i = 0; i < n; i += 1) {
    const part = clamp(f * n - i, 0, 1);
    if (part <= 0) break;
    const from = i * each + gap / 2;
    d += arc(g.c, g.r, from, from + (each - gap) * part);
  }
  return d;
}

function ringTrack(g: RingGeometry): string {
  return g.style === "segmented" ? ringPath(g, 1) : arc(g.c, g.r, 0, 360);
}

function Ring({
  g,
  shown,
  fill,
  share,
  done,
  total,
  accent,
  label,
  complete,
}: {
  g: RingGeometry;
  /** Only the front card shows its ring; one peeking from behind would be noise. */
  shown: boolean;
  /** The front card's live fill; the cards behind draw their own share. */
  fill: MotionValue<number> | null;
  share: number;
  done: number;
  total: number;
  accent: string;
  label: string;
  complete: boolean;
}) {
  const live = fill !== null;
  const fallback = useMotionValue(share);
  const source = fill ?? fallback;
  const d = useTransform(source, (f) => ringPath(g, f));
  const text = useTransform(source, (f) => `${Math.round(f * 100)}%`);
  const cap = g.style === "segmented" ? "butt" : "round";
  return (
    <div
      role={live ? "progressbar" : undefined}
      aria-label={live ? label : undefined}
      aria-valuemin={live ? 0 : undefined}
      aria-valuemax={live ? total : undefined}
      aria-valuenow={live ? done : undefined}
      aria-valuetext={
        live
          ? `${done} of ${total} ${total === 1 ? "lesson" : "lessons"} done`
          : undefined
      }
      className={cn(
        "relative shrink-0 transition-opacity duration-200",
        !shown && "opacity-0",
      )}
      style={{ width: g.px, height: g.px }}
    >
      <svg
        aria-hidden
        width={g.px}
        height={g.px}
        viewBox={`0 0 ${g.px} ${g.px}`}
        className="block"
      >
        <path
          d={ringTrack(g)}
          fill="none"
          strokeWidth={g.stroke}
          strokeLinecap={cap}
          className="stroke-ink-3/15"
        />
        <g style={{ stroke: accent }}>
          <motion.path
            d={d}
            fill="none"
            strokeWidth={g.stroke}
            strokeLinecap={cap}
          />
        </g>
      </svg>
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-medium text-foreground tabular-nums"
      >
        {complete ? (
          <Check className="size-4" style={{ color: accent }} />
        ) : (
          <motion.span>{text}</motion.span>
        )}
      </span>
    </div>
  );
}

type Layer = {
  key: string;
  /** The lesson's index, or `lessons.length` for the complete card. */
  index: number;
  slot: number;
};

type FaceProps = {
  layer: Layer;
  lessons: LessonCardLesson[];
  course: string;
  provider: string;
  headingId: string;
  g: RingGeometry;
  fill: MotionValue<number>;
  accent: string;
  days: boolean[];
  run: number;
  doneToday: boolean;
  continueLabel: string;
  finishLabel: string;
  restartLabel: string;
  nextLabel: string;
  disabled: boolean;
  motionSafe: boolean;
  buttonRef: (node: HTMLButtonElement | null) => void;
  onContinue: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onRestart: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

/** One card of the deck: the current lesson in front, the next ones behind. */
function Face({
  layer,
  lessons,
  course,
  provider,
  headingId,
  g,
  fill,
  accent,
  days,
  run,
  doneToday,
  continueLabel,
  finishLabel,
  restartLabel,
  nextLabel,
  disabled,
  motionSafe,
  buttonRef,
  onContinue,
  onRestart,
}: FaceProps) {
  // A card on its way out keeps its look but gives up the heading's id.
  const present = useIsPresent();
  const n = lessons.length;
  const front = layer.slot === 0;
  const complete = layer.index >= n;
  const item = lessons[layer.index];
  const next = lessons[layer.index + 1];
  const last = layer.index === n - 1;

  const button = cn(
    "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition-opacity outline-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
    "disabled:cursor-not-allowed disabled:opacity-50",
  );

  return (
    <div
      // A card behind, or one on its way out, is drawn but not reachable:
      // only the front card is ever in the tab order or the reading order.
      inert={!front || !present || undefined}
      aria-hidden={!front || !present || undefined}
      className="relative rounded-4 border border-hairline bg-card px-4 pt-3 pb-3 shadow-[0_10px_24px_-18px_color-mix(in_oklab,black_55%,transparent)]"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="grid h-4">
            <h3
              id={front && present ? headingId : undefined}
              title={course}
              className={cn(
                "truncate text-[11px] leading-4 font-medium text-ink-2 transition-opacity duration-200 [grid-area:1/1]",
                !front && "opacity-0",
              )}
            >
              {course}
            </h3>
            {!complete ? (
              <span
                className={cn(
                  "truncate font-mono text-[10px] leading-4 tracking-[0.08em] text-ink-3 uppercase transition-opacity duration-200 [grid-area:1/1]",
                  front && "opacity-0",
                )}
              >
                {nextLabel} · Lesson {layer.index + 1}
              </span>
            ) : null}
          </div>
          <p
            title={complete ? undefined : item?.title}
            className="mt-0.5 truncate text-[15px] leading-5 font-medium text-foreground"
          >
            {complete ? "Course complete" : item?.title}
          </p>
          <p className="mt-2 truncate font-mono text-[10px] leading-3 tracking-[0.08em] text-ink-3 uppercase">
            {complete
              ? `${n} of ${n} lessons`
              : `Lesson ${layer.index + 1} of ${n} · ${item?.minutes ?? 0} min`}
          </p>
        </div>
        <Ring
          g={g}
          shown={front}
          fill={front ? fill : null}
          share={n === 0 ? 0 : clamp(layer.index / n, 0, 1)}
          done={Math.min(layer.index, n)}
          total={n}
          accent={accent}
          label={`${course} progress`}
          complete={complete}
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        {complete ? (
          <button
            ref={buttonRef}
            type="button"
            disabled={disabled}
            onClick={onRestart}
            className={cn(
              button,
              "border border-hairline-strong text-foreground hover:bg-surface-2",
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            {restartLabel}
          </button>
        ) : (
          <motion.button
            ref={buttonRef}
            type="button"
            disabled={disabled}
            aria-label={
              last
                ? `${finishLabel}: ${course}`
                : `${continueLabel} to lesson ${layer.index + 2}, ${next?.title ?? ""}`
            }
            onClick={onContinue}
            whileTap={motionSafe ? { scale: 0.96 } : undefined}
            transition={springs.flick}
            className={cn(button, "text-primary-foreground hover:opacity-90")}
            style={{ backgroundColor: accent }}
          >
            {last ? finishLabel : continueLabel}
            <ArrowRight aria-hidden className="size-3.5" />
          </motion.button>
        )}
        <span
          title={provider}
          className="min-w-0 truncate text-[11px] text-ink-3"
        >
          {provider}
        </span>
      </div>

      {days.length > 0 ? (
        <div className="mt-3 flex items-center gap-3">
          <div
            role="img"
            aria-label={`${run === 0 ? "No streak yet" : `${run}-day streak`}. Active ${days.filter(Boolean).length} of the last ${days.length} days.`}
            className="flex min-w-0 flex-1 items-center justify-between"
            style={{ maxWidth: days.length * 14 }}
          >
            {days.map((on, i) => {
              const today = i === days.length - 1;
              const pop = today && on && doneToday && front && motionSafe;
              return (
                <motion.span
                  key={today ? `today-${on ? "on" : "off"}` : i}
                  aria-hidden
                  initial={pop ? { scale: 0.2 } : false}
                  animate={{ scale: 1 }}
                  transition={{ ...springs.recoil, delay: 0.3 }}
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    !on &&
                      (today
                        ? "shadow-[0_0_0_1px_var(--ink-3)]"
                        : "bg-ink-3/25"),
                  )}
                  style={
                    on
                      ? { backgroundColor: `oklch(from ${accent} 0.68 c h)` }
                      : undefined
                  }
                />
              );
            })}
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-ink-2">
            <Flame
              aria-hidden
              className={cn("size-3.5", run === 0 && "text-ink-3")}
              style={
                run > 0
                  ? { color: "oklch(from var(--warn) 0.72 c h)" }
                  : undefined
              }
            />
            {run === 0 ? "No streak" : `${run}-day streak`}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A course card made as a small deck. The front card is the current lesson:
 * a ring fills to the share of the course done on glide (the percentage
 * counting with it) when the card first comes into view, and the streak dots
 * along its bottom edge. The next lesson's card sits behind it as a sliver
 * and rises out on hover or keyboard focus. Continue flips through: the front
 * card tips back about its bottom edge and fades, the next comes forward on
 * snap, the one behind moves up a place, and then the ring fills to its new
 * share and today's dot pops in on recoil.
 *
 * The peeking card's strip is a real disclosure button that pins it up
 * (Escape lowers it), Continue is a button whose name says where it goes, and
 * focus follows the new front card. Under reduced motion the deck re-stacks
 * in place and the new card cross-fades in, while the ring still fills on a
 * short tween and every count still updates.
 */
export function LessonCard({
  course = "Pricing for Product Teams",
  provider = "Fieldline Academy",
  lessons = defaultLessons,
  lesson,
  defaultLesson = 6,
  onLessonChange,
  onContinue,
  activity = defaultActivity,
  ring = "thick",
  peek = 0.75,
  streak = 14,
  continueLabel = "Continue",
  finishLabel = "Finish course",
  restartLabel = "Start again",
  nextLabel = "Up next",
  size = "md",
  accent = "var(--accent-bright)",
  sound = false,
  disabled = false,
  className,
}: LessonCardProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const headingId = `${uid}-heading`;

  const n = lessons.length;
  const [own, setOwn] = React.useState(() => clamp(defaultLesson, 0, n));
  const current = clamp(Math.round(lesson ?? own), 0, n);
  const complete = current >= n;
  const share = n === 0 ? 0 : current / n;
  const ringStyle: LessonCardRing =
    ring === "thin" || ring === "segmented" ? ring : "thick";
  const px = RING[size] ?? RING.md;
  const stroke = STROKE[ringStyle];
  const g: RingGeometry = {
    px,
    stroke,
    c: px / 2,
    r: r2((px - stroke) / 2 - 0.5),
    style: ringStyle,
    count: n,
  };
  // Enough at the default to show the next title whole; never so much that
  // the line under it shows a cut-off sliver.
  const lift = r2(22 + 32 * clamp(peek, 0, 1));
  const reserve = Math.ceil(Math.max(REST_2, lift)) + 2;

  const [doneToday, setDoneToday] = React.useState(false);
  const [hovering, setHovering] = React.useState(false);
  const [focusVisible, setFocusVisible] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [seen, setSeen] = React.useState(false);
  const [said, setSaid] = React.useState<{ index: number } | null>(null);
  const [root, setRoot] = React.useState<HTMLElement | null>(null);

  const fill = useMotionValue(share);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const pressedAt = React.useRef(-Infinity);
  const focusFront = React.useRef<string | null>(null);
  // Every card's button, by card. Each card keeps one stable ref for its
  // whole life: a motion element binds its ref once, so a ref that only
  // appears when a card reaches the front would never be handed the node.
  const [buttons] = React.useState(() => new Map<string, HTMLButtonElement>());
  const [buttonRefs] = React.useState(
    () => new Map<string, (node: HTMLButtonElement | null) => void>(),
  );

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const panOf = (el: Element | null | undefined) => {
    const rect = el?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  // ---- the streak along the bottom edge -----------------------------------------
  const today =
    activity.length > 0 && (activity[activity.length - 1] || doneToday);
  const marked = activity.length > 0 ? [...activity.slice(0, -1), today] : [];
  let streakRun = 0;
  for (let i = marked.length - (today ? 1 : 2); i >= 0; i -= 1) {
    if (!marked[i]) break;
    streakRun += 1;
  }
  const shownDays = Math.round(clamp(streak, 0, 31));
  const days = shownDays > 0 ? marked.slice(-shownDays) : [];

  // ---- the ring fills the first time the card is seen, and after each lesson --
  React.useLayoutEffect(() => {
    // Before paint, so a card that will fill never flashes full first.
    if (motionSafe) fill.jump(0);
    // Mount only: later changes fill from where the ring already is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!root) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true);
        observer.disconnect();
      }
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [root]);

  React.useEffect(() => {
    if (!seen) return;
    if (Math.abs(fill.get() - share) < 1e-4) return;
    if (!motionSafe) {
      run(
        "fill",
        animate(fill, share, { duration: durations.base, ease: easings.enter }),
      );
      return;
    }
    const answering = performance.now() - pressedAt.current < BEAT;
    run(
      "fill",
      animate(fill, share, {
        ...springs.glide,
        // After a flip-through, the new card lands before its ring fills.
        delay: answering ? 0.26 : 0.1,
        onComplete: () => {
          if (performance.now() - pressedAt.current < BEAT) {
            audio.play("plip", {
              pitch: r2(0.85 + share * 0.7),
              gain: 0.5,
              pan: panOf(root),
            });
          }
        },
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, share, motionSafe]);

  // ---- focus moves to the new front card's button, which is no longer
  // inert by the time this runs, before the old card (and the focus it
  // held) leaves the page.
  React.useEffect(() => {
    const key = focusFront.current;
    const node = key ? buttons.get(key) : undefined;
    if (!node) return;
    focusFront.current = null;
    node.focus({ preventScroll: true });
  }, [current, buttons]);

  React.useEffect(() => {
    const live = anims.current;
    return () => {
      for (const c of live.values()) c.stop();
      live.clear();
    };
  }, []);

  const buttonRef = (key: string) => {
    let fn = buttonRefs.get(key);
    if (!fn) {
      fn = (node: HTMLButtonElement | null) => {
        if (node) buttons.set(key, node);
        else buttons.delete(key);
      };
      buttonRefs.set(key, fn);
    }
    return fn;
  };

  const setLessonTo = (next: number) => {
    if (lesson === undefined) setOwn(next);
    onLessonChange?.(next);
  };

  const focusInside = () =>
    !!root &&
    document.activeElement instanceof Node &&
    root.contains(document.activeElement);

  const advance = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || complete) return;
    pressedAt.current = performance.now();
    audio.play("swish", {
      pitch: 1,
      gain: 0.5,
      pan: panOf(event.currentTarget),
    });
    const next = current + 1;
    const finished = lessons[current];
    focusFront.current = focusInside()
      ? (lessons[next]?.id ?? "complete")
      : null;
    setPinned(false);
    setDoneToday(true);
    setSaid({ index: next });
    setLessonTo(next);
    if (finished) onContinue?.(finished);
  };

  const restart = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    pressedAt.current = performance.now();
    audio.play("swish", {
      pitch: 0.8,
      gain: 0.45,
      pan: panOf(event.currentTarget),
    });
    focusFront.current = focusInside() ? (lessons[0]?.id ?? null) : null;
    setSaid({ index: 0 });
    setLessonTo(0);
  };

  const togglePin = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const next = !pinned;
    pressedAt.current = performance.now();
    audio.play("plip", {
      pitch: next ? 0.8 : 0.7,
      gain: 0.3,
      pan: panOf(event.currentTarget),
    });
    setDismissed(false);
    setPinned(next);
  };

  const raised =
    !disabled &&
    !complete &&
    (pinned || ((hovering || focusVisible) && !dismissed));

  const layers: Layer[] = complete
    ? [{ key: "complete", index: n, slot: 0 }]
    : [0, 1, 2]
        .map((k) => current + k)
        .filter((i) => i < n)
        .map((i, k) => ({
          key: lessons[i]?.id ?? `lesson-${i}`,
          index: i,
          slot: k,
        }));

  const quick = { duration: durations.fast, ease: easings.enter };
  const still = { default: { duration: 0 }, opacity: quick };
  const variants: Variants = {
    enter: motionSafe
      ? { y: -REST_2 + 4, scale: 0.86, opacity: 0 }
      : { y: -REST_2, scale: 0.9, opacity: 0 },
    slot0: {
      y: 0,
      scale: 1,
      opacity: 1,
      transition: motionSafe ? { ...springs.snap, delay: 0.06 } : still,
    },
    slot1: {
      y: raised ? -lift : -REST_1,
      scale: 0.95,
      opacity: 1,
      transition: motionSafe ? springs.glide : still,
    },
    slot2: {
      y: -REST_2,
      scale: 0.9,
      opacity: 0.6,
      transition: motionSafe ? springs.glide : still,
    },
    // The leaving card stays on top while it goes: it is re-inserted where
    // it was, before the card now in front, so its order alone would bury it.
    gone: motionSafe
      ? {
          // Solid while it tips back, so it reads as a card and not a
          // double exposure; it fades only once it is nearly edge-on.
          opacity: [1, 1, 0],
          zIndex: 20,
          transition: {
            duration: 0.3,
            ease: easings.exit,
            opacity: { duration: 0.3, times: [0, 0.6, 1], ease: "linear" },
            zIndex: { duration: 0 },
          },
        }
      : {
          opacity: 0,
          zIndex: 20,
          transition: {
            duration: durations.fast,
            ease: easings.exit,
            zIndex: { duration: 0 },
          },
        },
  };
  // The leaving card tips back about its bottom edge, away from you, so it
  // shrinks into the deck rather than out of it.
  const tip: Variants = motionSafe
    ? {
        gone: {
          rotateX: 72,
          transition: { duration: 0.3, ease: easings.exit },
        },
      }
    : {};

  const sentence = (() => {
    if (!said || said.index !== current) return "";
    if (complete) return `Course complete. ${n} of ${n} lessons.`;
    const item = lessons[current];
    const before = lessons[current - 1];
    const pct = `${Math.round(share * 100)}% of the course.`;
    const now = `Lesson ${current + 1}, ${item?.title ?? ""}.`;
    return said.index === 0 || !before
      ? `${now} ${pct}`
      : `${before.title} done. ${now} ${pct}`;
  })();

  return (
    <article
      ref={setRoot}
      aria-labelledby={headingId}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setHovering(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        setHovering(false);
        setDismissed(false);
      }}
      onFocus={(event) => {
        if (
          event.target instanceof Element &&
          event.target.matches(":focus-visible")
        ) {
          setFocusVisible(true);
        }
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
          setFocusVisible(false);
          setDismissed(false);
        }
      }}
      onKeyDown={(event) => {
        // Caught wherever focus is in the card, and kept from the page.
        if (event.key === "Escape" && raised) {
          event.preventDefault();
          setPinned(false);
          setDismissed(true);
        }
      }}
      className={cn(
        "relative w-full max-w-sm",
        disabled && "opacity-60",
        className,
      )}
    >
      {/* One track as wide as the card: the cards' long lines truncate
          instead of widening the deck past its box. */}
      <div
        className="grid grid-cols-[minmax(0,1fr)]"
        style={{ paddingTop: reserve }}
      >
        <AnimatePresence initial={false}>
          {/* Front first, stacked by z-index: the deck's own order, so a
              flip-through never moves an existing node (React re-runs a
              moved node's effects in development, and motion would re-apply
              its state mid-move). */}
          {layers.map((layer) => (
            <motion.div
              key={layer.key}
              variants={variants}
              initial="enter"
              animate={`slot${layer.slot}`}
              exit="gone"
              className="relative [grid-area:1/1]"
              style={{ zIndex: 10 - layer.slot, originY: 0 }}
            >
              <motion.div
                variants={tip}
                style={{ originY: 1, transformPerspective: 700 }}
              >
                <Face
                  layer={layer}
                  lessons={lessons}
                  course={course}
                  provider={provider}
                  headingId={headingId}
                  g={g}
                  fill={fill}
                  accent={accent}
                  days={days}
                  run={streakRun}
                  doneToday={doneToday}
                  continueLabel={continueLabel}
                  finishLabel={finishLabel}
                  restartLabel={restartLabel}
                  nextLabel={nextLabel}
                  disabled={disabled}
                  motionSafe={motionSafe}
                  buttonRef={buttonRef(layer.key)}
                  onContinue={advance}
                  onRestart={restart}
                />
              </motion.div>
              {layer.slot === 1 ? (
                <button
                  type="button"
                  disabled={disabled}
                  aria-expanded={raised}
                  aria-label={`${nextLabel}: lesson ${layer.index + 1}, ${lessons[layer.index]?.title ?? ""}`}
                  onClick={togglePin}
                  className={cn(
                    "absolute inset-x-0 top-0 z-10 cursor-pointer rounded-t-4 outline-none",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    "disabled:cursor-not-allowed",
                  )}
                  style={{ height: lift }}
                />
              ) : null}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {sentence}
      </span>
    </article>
  );
}
