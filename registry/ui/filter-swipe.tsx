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
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FilterSwipeLook = {
  /** What the look is called: it rides the boundary and names the dot. */
  name: string;
  /** A CSS `filter` value: "none", "sepia(0.4) saturate(1.3)", … */
  filter: string;
};

export type FilterSwipePreset = "film" | "mono" | "tone";
export type FilterSwipeEdge = "hard" | "soft";

export const FILTER_SWIPE_PRESETS: Record<
  FilterSwipePreset,
  readonly FilterSwipeLook[]
> = {
  film: [
    { name: "Original", filter: "none" },
    {
      name: "Harvest",
      filter: "sepia(0.35) saturate(1.35) hue-rotate(-10deg) brightness(1.04)",
    },
    { name: "Faded", filter: "contrast(0.78) brightness(1.12) saturate(0.7)" },
    { name: "Punch", filter: "contrast(1.25) saturate(1.5)" },
    { name: "Noir", filter: "grayscale(1) contrast(1.35) brightness(0.92)" },
  ],
  mono: [
    { name: "Original", filter: "none" },
    { name: "Silver", filter: "grayscale(1) contrast(1.08) brightness(1.04)" },
    { name: "Ink", filter: "grayscale(1) contrast(1.6) brightness(0.88)" },
    { name: "Umber", filter: "grayscale(1) sepia(0.55) contrast(1.05)" },
    { name: "Paper", filter: "grayscale(1) contrast(0.8) brightness(1.18)" },
  ],
  tone: [
    { name: "Original", filter: "none" },
    {
      name: "Dusk",
      filter: "hue-rotate(-18deg) saturate(1.25) brightness(0.92)",
    },
    { name: "Tide", filter: "hue-rotate(28deg) saturate(1.1) contrast(1.05)" },
    {
      name: "Ember",
      filter: "sepia(0.25) hue-rotate(-24deg) saturate(1.6) contrast(1.08)",
    },
    {
      name: "Frost",
      filter: "saturate(0.6) hue-rotate(12deg) brightness(1.1) contrast(0.92)",
    },
  ],
};

export type FilterSwipeProps = {
  /** The picture. It is drawn twice — the look underneath and the one coming in — so keep ids out of it. */
  children: React.ReactNode;
  /** What the picture shows: its accessible name, with the look after it. */
  alt: string;
  /** A built-in set of five looks, or your own. @default "film" */
  filters?: FilterSwipePreset | readonly FilterSwipeLook[];
  /** Controlled look, by index. */
  value?: number;
  /** Starting look when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the release, key or dot that chose it, with the new index and look. */
  onValueChange?: (index: number, look: FilterSwipeLook) => void;
  /** How far across the boundary must be carried or thrown to commit, 0.2 to 0.8. @default 0.5 */
  threshold?: number;
  /** The incoming look's name rides the boundary; the current one sits in the corner. @default true */
  label?: boolean;
  /** A crisp boundary with a rule, or a feathered blend. @default "hard" */
  edge?: FilterSwipeEdge;
  /** A swish as a slide sets off and a click when a look lands. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Side = "start" | "end";
type Slide = { to: number; side: Side };
type Launch = { velocity: number; pan: number };

/** Half the soft edge's width, as a share of the frame, in percent. */
const FEATHER = 14;
/** The pill is kept this far inside the frame. */
const INSET = 8;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Where the boundary sits, in percent of the width, for a coverage `p`. The
 * travel is stretched by the feather so the blend is wholly off the picture
 * at both ends: nothing of the incoming look at 0, nothing of the old at 1.
 */
const boundary = (p: number, side: Side, feather: number) =>
  side === "end"
    ? 100 + feather - p * (100 + 2 * feather)
    : -feather + p * (100 + 2 * feather);

/**
 * A motion value derived from others and read again after every commit, so
 * a closure that changed in the render (the side, the edge) is never left
 * behind by an update StrictMode's second effect pass cancelled.
 */
function useSynced<T>(
  sources: MotionValue<number>[],
  read: (values: number[]) => T,
): MotionValue<T> {
  const out = useTransform(sources, (values: number[]) => read(values));
  React.useEffect(() => {
    out.set(read(sources.map((s) => s.get())));
  });
  return out;
}

const DARK_PILL = "color-mix(in oklab, black 58%, transparent)";
const LIGHT_PILL = "color-mix(in oklab, white 94%, transparent)";

/**
 * A photo whose look changes as you swipe across it. Swipe left and the next
 * look comes in from the right edge, swipe right and the previous one comes
 * in from the left: the boundary between the two sits under the finger 1:1,
 * and the incoming look's name rides it. Carry it — or throw it, the release
 * is projected — past `threshold` of the width and the look commits, the
 * boundary running on to the far edge on `springs.glide` with the release
 * velocity; short of it, the boundary slides back where it came from. A
 * slide in flight can be caught by the finger. Past the first or last look
 * the picture itself rubber-bands.
 *
 * The two looks are the same picture under two CSS filters; the incoming one
 * is revealed by a mask whose stops are one motion value, hard or feathered.
 * The looks are also a radio group of dots inside the frame: arrow keys,
 * Home and End slide the look in from the side a swipe would, with the same
 * swish and click. Under reduced motion the boundary never travels: the
 * incoming look fades over the whole picture with the drag and on release.
 */
export function FilterSwipe({
  children,
  alt,
  filters = "film",
  value,
  defaultValue = 0,
  onValueChange,
  threshold = 0.5,
  label = true,
  edge = "hard",
  sound = false,
  disabled = false,
  className,
}: FilterSwipeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const looks =
    typeof filters === "string"
      ? (FILTER_SWIPE_PRESETS[filters] ?? FILTER_SWIPE_PRESETS.film)
      : filters.length > 0
        ? filters
        : FILTER_SWIPE_PRESETS.film;
  const n = looks.length;
  const last = n - 1;
  const commitAt = clamp(threshold, 0.05, 0.95);
  const feather = edge === "soft" ? FEATHER : 0;

  const [own, setOwn] = React.useState(defaultValue);
  const current = clamp(Math.round(value ?? own) || 0, 0, last);
  // The look underneath, and the one coming in over it. They differ from
  // the value only while a slide is on screen.
  const [underneath, setUnderneath] = React.useState(current);
  const base = clamp(underneath, 0, last);
  const [incoming, setIncoming] = React.useState<Slide | null>(null);
  const [dragging, setDragging] = React.useState(false);
  // A set of looks too short for the slide on screen drops it.
  if (incoming && incoming.to > last) setIncoming(null);
  // A value that moved with nothing on screen yet slides in from its side.
  else if (!dragging && !incoming && current !== base) {
    setIncoming({ to: current, side: current > base ? "end" : "start" });
  }
  const slide = incoming && incoming.to <= last ? incoming : null;
  const [said, setSaid] = React.useState<{ text: string; at: number } | null>(
    null,
  );

  const [frame, setFrame] = React.useState<HTMLDivElement | null>(null);
  const [pill, setPill] = React.useState<HTMLSpanElement | null>(null);
  const dots = React.useRef(new Map<string, HTMLButtonElement>());
  const focusNext = React.useRef(false);

  const p = useMotionValue(0);
  const shift = useMotionValue(0);
  const boxW = useMotionValue(0);
  const pillW = useMotionValue(0);

  const run = React.useRef<AnimationPlaybackControls | null>(null);
  const goal = React.useRef<0 | 1 | null>(null);
  const started = React.useRef<Slide | null>(null);
  const launch = React.useRef<Launch | null>(null);
  const clickOnLand = React.useRef(false);
  const gesture = React.useRef({
    active: false,
    w: 1,
    /** Signed coverage at the start: + reveals the next look, − the previous. */
    from: 0,
    /** A slide caught in flight, which keeps its target. */
    caught: null as Slide | null,
    slide: null as Slide | null,
  });

  const side = slide?.side ?? "end";
  const mask = useSynced([p], ([v = 0]) => {
    if (!motionSafe) return "none";
    const b = boundary(clamp01(v), side, feather);
    const a = r3(b - feather);
    const z = r3(b + feather);
    return side === "end"
      ? `linear-gradient(to right, transparent ${a}%, black ${z}%)`
      : `linear-gradient(to right, black ${a}%, transparent ${z}%)`;
  });
  const overlayOpacity = useSynced([p], ([v = 0]) =>
    motionSafe ? 1 : r3(clamp01(v)),
  );
  const ruleLeft = useSynced(
    [p],
    ([v = 0]) => `${r3(clamp(boundary(clamp01(v), side, feather), 0, 100))}%`,
  );
  // Centred on the boundary, held inside the frame; centred on the picture
  // when nothing travels.
  const pillX = useSynced([p, boxW, pillW], ([v = 0, w = 0, pw = 0]) => {
    if (!motionSafe) return r2((w - pw) / 2);
    const at = (boundary(clamp01(v), side, feather) / 100) * w;
    return r2(clamp(at - pw / 2, INSET, Math.max(INSET, w - pw - INSET)));
  });
  // Past the threshold the pill turns light: let go now and it commits.
  const pillBg = useSynced([p], ([v = 0]) =>
    v >= commitAt ? LIGHT_PILL : DARK_PILL,
  );
  const pillInk = useSynced([p], ([v = 0]) =>
    v >= commitAt ? "black" : "white",
  );
  const notchLeft = `${r3(clamp(boundary(commitAt, side, feather), 0, 100))}%`;

  const halt = () => {
    run.current?.stop();
    run.current = null;
    goal.current = null;
  };

  const report = (index: number) => {
    const look = looks[index];
    if (!look || index === current) return;
    if (value === undefined) setOwn(index);
    onValueChange?.(index, look);
    setSaid({ text: `${look.name} look.`, at: index });
  };

  // The slide on screen runs toward whichever look the value now holds: on
  // to the far edge if it is the incoming one, back if it is not. A release
  // or a key leaves its velocity and pan behind; a host change has none, so
  // it slides silently.
  React.useLayoutEffect(() => {
    if (!slide) return;
    if (started.current !== slide) {
      started.current = slide;
      if (!gesture.current.active) p.set(0);
    }
    if (dragging) return;
    const want: 0 | 1 = slide.to === current ? 1 : 0;
    if (goal.current === want) return;
    const l = launch.current;
    launch.current = null;
    run.current?.stop();
    goal.current = want;
    clickOnLand.current = want === 1 && l !== null;
    if (l) {
      const speed = clamp01(Math.abs(l.velocity) / 6);
      audio.play("swish", {
        pitch: r2(want === 1 ? 1.1 + speed * 0.3 : 0.8),
        gain: r2(want === 1 ? 0.35 + speed * 0.3 : 0.22),
        pan: l.pan,
      });
    }
    const done = () => {
      run.current = null;
      goal.current = null;
      if (want === 1) {
        if (clickOnLand.current) {
          audio.play("click", { pitch: 1.05, gain: 0.5, pan: l?.pan ?? 0 });
        }
        setUnderneath(slide.to);
      }
      setIncoming(null);
    };
    run.current = motionSafe
      ? animate(p, want, {
          ...springs.glide,
          velocity: l?.velocity ?? p.getVelocity(),
          restDelta: 0.001,
          restSpeed: 0.01,
          onComplete: done,
        })
      : animate(p, want, {
          duration: durations.base,
          ease: want === 1 ? easings.enter : easings.exit,
          onComplete: done,
        });
  });

  // Nothing coming in: the next slide starts from nothing revealed.
  React.useLayoutEffect(() => {
    if (!incoming) p.set(0);
  }, [incoming, p]);

  React.useEffect(() => {
    if (!frame) return;
    const measure = () => boxW.set(frame.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [frame, boxW]);

  React.useEffect(() => {
    if (!pill) return;
    const measure = () => pillW.set(pill.offsetWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(pill);
    return () => observer.disconnect();
  }, [pill, pillW]);

  // Focus follows the chosen dot, bound once the render has it checked.
  React.useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    dots.current.get(looks[current]?.name ?? "")?.focus();
  });

  React.useEffect(
    () => () => {
      // A slide stopped here is started again by the next commit, not frozen.
      run.current?.stop();
      run.current = null;
      goal.current = null;
    },
    [],
  );

  /** A key or a dot: the chosen look slides in from the side a swipe would bring it. */
  const select = (index: number, pan = 0) => {
    if (disabled || index === current || index < 0 || index > last) return;
    if (slide) {
      // A slide still on screen settles where it was heading at once, so the
      // next one starts from a whole look.
      halt();
      setUnderneath(p.get() >= 0.5 ? slide.to : base);
      setIncoming(null);
    }
    launch.current = { velocity: 0, pan };
    report(index);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => {
      const w = Math.max(1, frame?.offsetWidth ?? 1);
      halt();
      launch.current = null;
      const g = gesture.current;
      g.active = true;
      g.w = w;
      g.caught = slide;
      g.slide = slide;
      g.from = slide ? (slide.side === "end" ? p.get() : -p.get()) : 0;
      setDragging(true);
    },
    onMove: ({ offset }) => {
      const g = gesture.current;
      if (!g.active) return;
      const s = g.from - offset.x / g.w;
      const wantSide: Side | null = s > 0 ? "end" : s < 0 ? "start" : null;
      if (!wantSide) {
        p.set(0);
        shift.set(0);
        return;
      }
      const caught = g.caught?.side === wantSide ? g.caught : null;
      const to = caught ? caught.to : wantSide === "end" ? base + 1 : base - 1;
      if (to < 0 || to > last) {
        // Nothing that way: the picture leans and gives.
        p.set(0);
        if (motionSafe) {
          shift.set(
            r2(-Math.sign(s) * rubberband(Math.abs(s) * g.w, g.w) * 0.5),
          );
        }
        return;
      }
      shift.set(0);
      if (!g.slide || g.slide.to !== to || g.slide.side !== wantSide) {
        const next: Slide = caught ?? { to, side: wantSide };
        g.slide = next;
        started.current = next;
        setIncoming(next);
      }
      p.set(Number(clamp01(Math.abs(s)).toFixed(4)));
    },
    onEnd: ({ velocity, point }) => {
      const g = gesture.current;
      if (!g.active) return;
      g.active = false;
      setDragging(false);
      if (shift.get() !== 0) {
        animate(shift, 0, { ...springs.snap, velocity: velocity.x });
      }
      const s = g.slide;
      if (!s) return;
      // Every release decides, even one carried back to nothing: a slide
      // caught after it committed and dragged home un-commits.
      const covered = p.get();
      const toward = (s.side === "end" ? -velocity.x : velocity.x) / g.w;
      const landing = project(covered, toward, 0.99);
      const target = landing >= commitAt ? s.to : base;
      launch.current =
        covered > 0.001 || target === s.to
          ? { velocity: toward, pan: panFrom(point.x, frame) }
          : null;
      if (target !== current) report(target);
    },
    onCancel: () => {
      const g = gesture.current;
      if (!g.active) return;
      g.active = false;
      setDragging(false);
      animate(shift, 0, springs.snap);
      if (!g.slide) return;
      // Put back to what the value holds, silently.
      launch.current = null;
    },
  });

  const onDotsKey = (event: React.KeyboardEvent) => {
    const k = event.key;
    const to =
      k === "ArrowRight" || k === "ArrowDown"
        ? current + 1
        : k === "ArrowLeft" || k === "ArrowUp"
          ? current - 1
          : k === "Home"
            ? 0
            : k === "End"
              ? last
              : null;
    if (to === null) return;
    event.preventDefault();
    if (to < 0 || to > last || to === current) return;
    focusNext.current = true;
    select(to, to > current ? 0.4 : -0.4);
  };

  const shown = looks[current] ?? looks[0];
  const coming = slide ? looks[slide.to] : undefined;

  return (
    <div
      ref={setFrame}
      {...drag}
      className={cn(
        "relative aspect-[4/3] w-full touch-pan-y overflow-clip rounded-3 border border-hairline bg-surface-2 [contain:paint] select-none",
        disabled ? "opacity-60" : "cursor-grab active:cursor-grabbing",
        className,
      )}
    >
      <motion.div className="absolute inset-0" style={{ x: shift }}>
        <div
          role="img"
          aria-label={`${alt}, ${shown?.name ?? ""} look`}
          className="absolute inset-0"
        >
          <div
            className="absolute inset-0"
            style={{ filter: looks[base]?.filter ?? "none" }}
          >
            {children}
          </div>
          {slide ? (
            <motion.div
              className="absolute inset-0"
              style={{
                filter: coming?.filter ?? "none",
                maskImage: mask,
                WebkitMaskImage: mask,
                opacity: overlayOpacity,
              }}
            >
              {children}
            </motion.div>
          ) : null}
        </div>
      </motion.div>

      {slide && motionSafe && edge === "hard" ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_6px_color-mix(in_oklab,black_45%,transparent)]"
          style={{ left: ruleLeft }}
        />
      ) : null}

      {slide && dragging && motionSafe ? (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 h-2.5 w-0.5 -translate-x-1/2 rounded-b-full bg-white/85"
            style={{ left: notchLeft }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 h-2.5 w-0.5 -translate-x-1/2 rounded-t-full bg-white/85"
            style={{ left: notchLeft }}
          />
        </>
      ) : null}

      {label && coming ? (
        <motion.span
          ref={setPill}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-0 inline-flex -translate-y-1/2 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap shadow-sm"
          style={{ x: pillX, backgroundColor: pillBg, color: pillInk }}
        >
          {slide?.side === "start" ? (
            <svg
              aria-hidden
              viewBox="0 0 8 8"
              className="size-2 fill-none stroke-current"
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 1.5 2.5 4 5 6.5" />
            </svg>
          ) : null}
          {coming.name}
          {slide?.side === "end" ? (
            <svg
              aria-hidden
              viewBox="0 0 8 8"
              className="size-2 fill-none stroke-current"
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 1.5 5.5 4 3 6.5" />
            </svg>
          ) : null}
        </motion.span>
      ) : null}

      {label && !slide ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-2.5 left-2.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white"
        >
          {looks[base]?.name}
        </span>
      ) : null}

      <div className="absolute inset-x-0 bottom-2.5 flex justify-center">
        <div
          role="radiogroup"
          aria-label="Look"
          aria-describedby={hintId}
          onKeyDown={onDotsKey}
          className="flex items-center rounded-full bg-black/40 px-1"
        >
          {looks.map((look, i) => {
            const on = i === current;
            return (
              <button
                key={look.name}
                ref={(node) => {
                  if (node) dots.current.set(look.name, node);
                  else dots.current.delete(look.name);
                }}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={look.name}
                tabIndex={on ? 0 : -1}
                disabled={disabled}
                onClick={(event) => select(i, panFrom(event.clientX, frame))}
                className={cn(
                  "flex h-6 w-4 cursor-pointer items-center justify-center rounded-full outline-none",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  "disabled:cursor-not-allowed",
                )}
              >
                <motion.span
                  className={cn(
                    "block h-1.5 rounded-full",
                    on ? "bg-white" : "bg-white/55",
                  )}
                  initial={false}
                  animate={{ width: on ? 12 : 6 }}
                  transition={
                    motionSafe ? springs.snap : { duration: durations.fast }
                  }
                />
              </button>
            );
          })}
        </div>
      </div>

      <p id={hintId} className="sr-only">
        Swipe across the picture for the next or previous look. Arrow keys
        choose a look, Home and End the first and last.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {said && said.at === current ? said.text : ""}
      </p>
    </div>
  );
}
