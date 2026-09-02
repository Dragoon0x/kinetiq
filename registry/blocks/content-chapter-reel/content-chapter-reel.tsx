"use client";

import * as React from "react";

import { AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

export type ReelChapter = { id: string; title: string; note: string };

export type ContentChapterReelProps = {
  eyebrow?: string;
  headline?: string;
  deck?: string;
  chapters?: ReelChapter[];
  /** Milliseconds each chapter holds before advancing. @default 5000 */
  chapterMs?: number;
  className?: string;
};

const DEFAULT_CHAPTERS: ReelChapter[] = [
  {
    id: "seed",
    title: "Seed",
    note: "Every tray logged the moment it went in, not the moment someone remembered.",
  },
  {
    id: "signal",
    title: "Signal",
    note: "Soil and light read out live, so a dry tray gets caught before it wilts.",
  },
  {
    id: "route",
    title: "Route",
    note: "Deliveries move stop to stop with the whole run visible at once.",
  },
  {
    id: "harvest",
    title: "Harvest",
    note: "The count closes itself and the lot gets its seal the same afternoon.",
  },
];

const FALLBACK_CHAPTER: ReelChapter = { id: "chapter", title: "Chapter", note: "" };

/** Chapter clock resolution. Never Date.now — ticks are counted, not timed. */
const TICK_MS = 100;

/** The reel owns exactly four scenes; a fifth chapter would replay the last one. */
const SCENE_COUNT = 4;

type SceneProps = { duration: number; motionSafe: boolean };

const TRAY_FILL_KEYFRAMES = [0, 0, 1, 1] as const;

/** Each tray takes its own quarter-ish slice of the shared duration. */
function trayTimes(index: number): number[] {
  const start = index * 0.24;
  return [0, start, Math.min(1, start + 0.34), 1];
}

function SeedScene({ duration, motionSafe }: SceneProps) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex items-end justify-center gap-5">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex flex-col items-center gap-2">
            <div className="flex h-36 w-16 flex-col justify-end overflow-hidden rounded-2 border border-hairline bg-surface-0">
              <motion.div
                className="w-full rounded-t-1 bg-[var(--primary)]/70"
                style={{ height: "100%", transformOrigin: "bottom" }}
                initial={motionSafe ? { scaleY: 0 } : false}
                animate={
                  motionSafe
                    ? { scaleY: [...TRAY_FILL_KEYFRAMES] }
                    : { scaleY: 1 }
                }
                transition={
                  motionSafe
                    ? { duration, times: trayTimes(index), ease: easings.enter }
                    : { duration: 0 }
                }
              />
            </div>
            <span className="font-mono text-[9px] tracking-[0.06em] text-ink-3 uppercase">
              {`Tray ${index + 1}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const SPARK_PATH = "M4 34 L22 25 L40 29 L58 14 L76 19 L94 6 L112 11";

function SignalScene({ duration, motionSafe }: SceneProps) {
  const [rolled, setRolled] = React.useState(false);

  // Rolls the readout partway through the scene; the timeout callback is
  // the only thing that ever sets state here, never the effect body itself.
  React.useEffect(() => {
    if (!motionSafe) return;
    const id = window.setTimeout(
      () => setRolled(true),
      duration * 1000 * 0.55,
    );
    return () => window.clearTimeout(id);
  }, [duration, motionSafe]);

  const value = motionSafe ? (rolled ? 214 : 128) : 214;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-10">
      <svg
        viewBox="0 0 116 40"
        className="h-20 w-full max-w-[260px]"
        aria-hidden
      >
        <motion.path
          d={SPARK_PATH}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={motionSafe ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={
            motionSafe
              ? { duration: duration * 0.7, ease: easings.enter }
              : { duration: 0 }
          }
        />
      </svg>
      <p className="flex items-baseline gap-1.5">
        <Readout value={value} size="lg" />
        <span className="font-mono text-xs text-ink-3">moisture idx</span>
      </p>
    </div>
  );
}

const ROUTE_STOPS = [
  { id: "r1", left: "10%" },
  { id: "r2", left: "50%" },
  { id: "r3", left: "90%" },
] as const;

const STOP_ARRIVE_TIMES = [0, 0.42, 0.86] as const;
const STOP_OPACITY_KEYFRAMES = [0.35, 0.35, 1, 1] as const;
const DOT_LEFT_KEYFRAMES = ["10%", "10%", "50%", "50%", "90%", "90%"] as const;
const DOT_TIMES = [0, 0.12, 0.42, 0.54, 0.86, 1] as const;

/** A stop snaps lit shortly after the travelling dot arrives. */
function stopTimes(arrive: number): number[] {
  return [0, arrive, Math.min(1, arrive + 0.08), 1];
}

function RouteScene({ duration, motionSafe }: SceneProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-12">
      <div className="relative h-1 w-full max-w-[280px] rounded-full bg-hairline-strong/60">
        {ROUTE_STOPS.map((stop, index) => {
          const arrive = STOP_ARRIVE_TIMES[index] ?? 0;
          return (
            <motion.div
              key={stop.id}
              className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-hairline-strong bg-[var(--primary)]"
              style={{ left: stop.left }}
              initial={motionSafe ? { opacity: STOP_OPACITY_KEYFRAMES[0] } : false}
              animate={
                motionSafe
                  ? { opacity: [...STOP_OPACITY_KEYFRAMES] }
                  : { opacity: 1 }
              }
              transition={
                motionSafe
                  ? { duration, times: stopTimes(arrive), ease: easings.enter }
                  : { duration: 0 }
              }
            />
          );
        })}
        <motion.div
          aria-hidden
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--signal,var(--primary))] shadow-raised"
          initial={motionSafe ? { left: "10%" } : false}
          animate={
            motionSafe ? { left: [...DOT_LEFT_KEYFRAMES] } : { left: "90%" }
          }
          transition={
            motionSafe
              ? { duration, times: [...DOT_TIMES], ease: easings.move }
              : { duration: 0 }
          }
        />
      </div>
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Route · 3 stops today
      </p>
    </div>
  );
}

function HarvestScene({ duration, motionSafe }: SceneProps) {
  const [rolled, setRolled] = React.useState(false);

  React.useEffect(() => {
    if (!motionSafe) return;
    const id = window.setTimeout(
      () => setRolled(true),
      duration * 1000 * 0.62,
    );
    return () => window.clearTimeout(id);
  }, [duration, motionSafe]);

  const tally = motionSafe ? (rolled ? 1284 : 960) : 1284;
  const sealed = motionSafe ? rolled : true;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 px-10">
      <p className="flex items-baseline gap-1.5">
        <Readout value={tally} size="lg" />
        <span className="font-mono text-xs text-ink-3">units, lot 06</span>
      </p>
      <StatusSeal variant={sealed ? "success" : "info"} live={motionSafe && !sealed}>
        {sealed ? "Verified" : "Tallying"}
      </StatusSeal>
    </div>
  );
}

/** Scenes are chosen by index and returned directly — never assigned to a
 *  capitalized variable, so the choice never reads as a dynamic component. */
function renderScene(
  index: number,
  duration: number,
  motionSafe: boolean,
): React.ReactNode {
  switch (Math.min(index, SCENE_COUNT - 1)) {
    case 0:
      return <SeedScene duration={duration} motionSafe={motionSafe} />;
    case 1:
      return <SignalScene duration={duration} motionSafe={motionSafe} />;
    case 2:
      return <RouteScene duration={duration} motionSafe={motionSafe} />;
    default:
      return <HarvestScene duration={duration} motionSafe={motionSafe} />;
  }
}

/**
 * A customer story told in four timed chapters. The stage on the left plays
 * one small DOM-drawn scene per chapter while the list on the right names
 * each one and fills a progress rule as its clock runs; the chapters are
 * selectable, so clicking or arrowing through the list jumps straight there
 * and restarts the timer. The reel is viewport-aware — it pauses itself the
 * moment nobody is looking, whether the stage has scrolled off-screen or the
 * tab has gone to the back of the queue — and hovering the stage pauses it
 * as well.
 *
 * Reduced motion: playback never starts. The stage renders the active
 * chapter at its end frame, the chapter list still selects, and the
 * progress rule is hidden.
 */
export function ContentChapterReel({
  eyebrow = "Fernworks · the reel",
  headline = "One growing season, four chapters.",
  deck = "A nursery ran its year on paper trays and a wall calendar. Here is the same year on Fernworks, chapter by chapter.",
  chapters = DEFAULT_CHAPTERS,
  chapterMs = 5000,
  className,
}: ContentChapterReelProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();

  const [activeIndex, setActiveIndex] = React.useState(0);
  const [playCount, setPlayCount] = React.useState(0);
  const [hovered, setHovered] = React.useState(false);
  const [inView, setInView] = React.useState(false);

  const ticksRef = React.useRef(0);
  const timerRef = React.useRef<number | null>(null);
  const sectionRef = React.useRef<HTMLElement>(null);
  const intersectingRef = React.useRef(false);
  const buttonRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const progress = useMotionValue<number>(0);

  const total = Math.max(1, chapters.length);
  const activeChapter = chapters[activeIndex] ?? chapters[0] ?? FALLBACK_CHAPTER;
  const durationSeconds = Math.max(0.1, chapterMs / 1000);
  const playing = motionSafe && !hovered;

  // Viewport + tab visibility gate: pauses off-screen and when the tab is
  // hidden, resumes without restarting the chapter already in flight.
  React.useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    const sync = () => setInView(intersectingRef.current && !document.hidden);
    const observer = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) intersectingRef.current = last.isIntersecting;
      sync();
    });
    observer.observe(node);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  // The chapter clock: a 100ms tick counter, ref-held, driving the progress
  // motion value directly so a tick never triggers a React render. Keying
  // this on activeIndex means a select clears and restarts the interval,
  // not just the ref — matching the "clear on select" timer convention.
  React.useEffect(() => {
    if (!(playing && inView)) return;
    const totalTicks = Math.max(1, Math.round(chapterMs / TICK_MS));
    timerRef.current = window.setInterval(() => {
      ticksRef.current += 1;
      progress.set(Math.min(1, ticksRef.current / totalTicks));
      if (ticksRef.current >= totalTicks) {
        ticksRef.current = 0;
        progress.set(0);
        setActiveIndex((i) => (i + 1) % total);
        setPlayCount((c) => c + 1);
      }
    }, TICK_MS);
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [playing, inView, chapterMs, total, progress, activeIndex]);

  const selectChapter = React.useCallback(
    (index: number) => {
      const next = ((index % total) + total) % total;
      ticksRef.current = 0;
      progress.set(0);
      setActiveIndex(next);
      setPlayCount((c) => c + 1);
    },
    [total, progress],
  );

  const sceneKey = `${activeChapter.id}-${playCount}`;

  return (
    <section
      ref={sectionRef}
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="mt-4 leading-relaxed text-ink-2">{deck}</p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10">
          <div
            role="img"
            aria-label={`Now playing: ${activeChapter.title} — ${activeChapter.note}`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="relative h-[22rem] overflow-hidden rounded-4 border border-hairline bg-surface-1"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={sceneKey}
                aria-hidden
                initial={motionSafe ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={
                  motionSafe
                    ? { opacity: 0, transition: exitFor(durations.slow) }
                    : { opacity: 0, transition: { duration: 0 } }
                }
                transition={{ duration: durations.slow, ease: easings.enter }}
                className="absolute inset-0"
              >
                {renderScene(activeIndex, durationSeconds, motionSafe)}
              </motion.div>
            </AnimatePresence>
          </div>

          <div>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-label text-ink-3">Chapters</p>
              <p className="font-mono text-[11px] tracking-[0.08em] text-ink-3">
                {String(activeIndex + 1).padStart(2, "0")} /{" "}
                {String(chapters.length).padStart(2, "0")}
              </p>
            </div>

            <div className="flex flex-col gap-1">
              {chapters.map((chapter, index) => {
                const active = index === activeIndex;
                return (
                  <button
                    key={chapter.id}
                    ref={(el) => {
                      buttonRefs.current[index] = el;
                    }}
                    type="button"
                    aria-pressed={active}
                    onClick={() => selectChapter(index)}
                    onKeyDown={(event) => {
                      if (
                        event.key !== "ArrowDown" &&
                        event.key !== "ArrowUp"
                      ) {
                        return;
                      }
                      event.preventDefault();
                      const dir = event.key === "ArrowDown" ? 1 : -1;
                      const next = (index + dir + total) % total;
                      selectChapter(next);
                      buttonRefs.current[next]?.focus();
                    }}
                    className={cn(
                      "rounded-2 border px-4 py-3 text-left transition-colors",
                      active
                        ? "border-hairline-strong bg-surface-1"
                        : "border-transparent hover:bg-surface-1/60",
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span
                        className={cn(
                          "text-sm font-semibold tracking-tight",
                          active ? "text-ink" : "text-ink-2",
                        )}
                      >
                        {chapter.title}
                      </span>
                      <span className="font-mono text-[10px] text-ink-3">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm leading-snug text-ink-3">
                      {chapter.note}
                    </span>
                    {motionSafe && active && (
                      <span className="relative mt-3 block h-px w-full overflow-hidden bg-hairline-strong/60">
                        <motion.span
                          aria-hidden
                          className="absolute inset-y-0 left-0 block h-full origin-left bg-[var(--primary)]"
                          style={{ scaleX: progress }}
                        />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
