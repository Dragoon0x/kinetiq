"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CommuteLineColour = "red" | "green" | "blue";

export type CommuteLineStop = {
  id: string;
  name: string;
  /** Scheduled arrival, ms or Date. */
  time: number | Date;
};

export type CommuteLineProps = {
  /** Every stop on the run, in order, with its scheduled arrival. */
  timetable: CommuteLineStop[];
  /** The current moment, ms or Date. Each new value is a report. */
  now: number | Date;
  /** How late the train is running, in minutes. @default 0 */
  delay?: number;
  /** A reported position from a live feed, as a fractional stop index; overrides the timetable's. */
  position?: number;
  /** How many stops the line shows at once, 2 to 8. @default 6 */
  stops?: number;
  /** The line's colour. @default "blue" */
  line?: CommuteLineColour;
  /** The line's name: its pill and the widget's accessible name. @default "Blue line" */
  label?: string;
  /** Where the train is heading, e.g. "to Harbour". */
  direction?: string;
  /** Controlled: the chosen stop's id. */
  value?: string;
  /** The chosen stop when uncontrolled. @default the next stop ahead of the train */
  defaultValue?: string;
  /** Fires from a tap or a key that chose a stop. */
  onValueChange?: (id: string) => void;
  /** Minutes east of UTC for the clock times shown. @default 0 */
  utcOffset?: number;
  /** A chime when a stop is chosen, higher the sooner the train gets there. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const PIGMENT: Record<CommuteLineColour, string> = {
  red: "oklch(0.6 0.19 25)",
  green: "oklch(0.6 0.15 150)",
  blue: "oklch(0.56 0.16 255)",
};
const LINE_NAME: Record<CommuteLineColour, string> = {
  red: "Red line",
  green: "Green line",
  blue: "Blue line",
};

/** A train waits this long at a stop (or 40% of the gap, if shorter). */
const DWELL = 30_000;
/** The line runs this far from the diagram's edges, so end labels fit. */
const INSET = 34;
const LINE_Y = 32;

/**
 * Where labels need two rows, by stops shown: the container is narrower
 * than (stops - 1) × 62px + 2 × INSET. Static strings, so the stylesheet
 * has every one of them.
 */
const FIT: Record<number, { box: string; odd: string; span: string }> = {
  2: { box: "h-[62px]", odd: "", span: "[--span:1]" },
  3: { box: "h-[62px]", odd: "", span: "[--span:1]" },
  4: {
    box: "h-[62px] @max-[16rem]:h-[76px]",
    odd: "@max-[16rem]:top-[38px]",
    span: "[--span:1] @max-[16rem]:[--span:2]",
  },
  5: {
    box: "h-[62px] @max-[19.75rem]:h-[76px]",
    odd: "@max-[19.75rem]:top-[38px]",
    span: "[--span:1] @max-[19.75rem]:[--span:2]",
  },
  6: {
    box: "h-[62px] @max-[23.75rem]:h-[76px]",
    odd: "@max-[23.75rem]:top-[38px]",
    span: "[--span:1] @max-[23.75rem]:[--span:2]",
  },
  7: {
    box: "h-[62px] @max-[27.5rem]:h-[76px]",
    odd: "@max-[27.5rem]:top-[38px]",
    span: "[--span:1] @max-[27.5rem]:[--span:2]",
  },
  8: {
    box: "h-[62px] @max-[31.5rem]:h-[76px]",
    odd: "@max-[31.5rem]:top-[38px]",
    span: "[--span:1] @max-[31.5rem]:[--span:2]",
  },
};

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const toMs = (v: number | Date) => (typeof v === "number" ? v : v.getTime());
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Where the train is at time `t`, as a fractional stop index: it waits at
 * each stop, then pulls away and brakes into the next on a cosine, the way
 * a train does.
 */
function positionAt(times: readonly number[], t: number): number {
  const first = times[0];
  if (first === undefined || t <= first) return 0;
  for (let i = 0; i < times.length - 1; i += 1) {
    const a = times[i] as number;
    const b = times[i + 1] as number;
    if (t >= b) continue;
    const leave = a + Math.min(DWELL, (b - a) * 0.4);
    if (t < leave) return i;
    const u = (t - leave) / Math.max(1, b - leave);
    return i + (0.5 - 0.5 * Math.cos(Math.PI * u));
  }
  return times.length - 1;
}

/**
 * A stop's name under its dot. It fades out as its stop leaves the window,
 * so a name is never shown cut by the edge.
 */
function StopLabel({
  win,
  index,
  shown,
  maxWidth,
  className,
  children,
}: {
  win: MotionValue<number>;
  index: number;
  shown: number;
  maxWidth: string;
  className?: string;
  children: string;
}) {
  const opacity = useTransform(win, (w) =>
    r3(clamp(1 - 2.5 * Math.max(0, w - index, index - (w + shown - 1)), 0, 1)),
  );
  return (
    <motion.span
      aria-hidden
      title={children}
      className={cn(
        "absolute top-6 left-1/2 block -translate-x-1/2 truncate text-center text-[11px] leading-[14px] whitespace-nowrap",
        className,
      )}
      style={{ maxWidth, opacity }}
    >
      {children}
    </motion.span>
  );
}

type Eta =
  | { kind: "gone" }
  | { kind: "at" }
  | { kind: "due" }
  | { kind: "in"; minutes: number };

/**
 * A line diagram with the train on it, as it was last reported. Each new
 * report — a new `now`, a new delay, a live `position` — eases the shown
 * train there on the drift spring with the speed it already had, so reports
 * a second apart read as one continuous glide, slowing into stations because
 * the reports do; a train that jumps back more than a stop (the next run)
 * fades across instead of reversing. A window of `stops` stops follows the
 * train and the chosen stop on the glide spring, and can be dragged sideways
 * to look along the line. Every stop the train reaches pulses.
 *
 * The stops are a radio group: a tap or the arrow keys choose one, a flag
 * over it hops there on the snap spring with its ETA, and the footer says
 * when the train gets there. Under reduced motion the train, the window and
 * the flag jump to each report and the arrival pulse is a flash; every time
 * and fill still updates.
 */
export function CommuteLine({
  timetable,
  now,
  delay = 0,
  position,
  stops = 6,
  line = "blue",
  label,
  direction,
  value,
  defaultValue,
  onValueChange,
  utcOffset = 0,
  sound = false,
  disabled = false,
  className,
}: CommuteLineProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const nameId = `${uid}-name`;
  const whereId = `${uid}-where`;

  const colour: CommuteLineColour = line in PIGMENT ? line : "blue";
  const pigment = PIGMENT[colour];
  const title = label ?? LINE_NAME[colour];
  const total = timetable.length;
  const last = Math.max(1, total - 1);
  const shown = clamp(Math.round(stops), 2, Math.max(2, Math.min(8, total)));
  const gaps = Math.max(1, shown - 1);
  const fit = FIT[shown] ?? FIT[6] ?? { box: "", odd: "", span: "" };
  const lateMs = Math.round(delay) * 60_000;
  const nowMs = toMs(now);
  const times = timetable.map((s) => toMs(s.time));
  const reported = clamp(
    position ?? positionAt(times, nowMs - lateMs),
    0,
    Math.max(0, total - 1),
  );

  const ahead = timetable.findIndex((_, i) => i > reported + 1e-3);
  const [own, setOwn] = React.useState(
    () => defaultValue ?? timetable[ahead === -1 ? total - 1 : ahead]?.id,
  );
  const selectedId = value ?? own;
  const sel = timetable.findIndex((s) => s.id === selectedId);

  // The window: one stop of history behind the train, and the chosen stop
  // always in it. A drag can look elsewhere until the train reaches its next
  // stop or another stop is chosen.
  const maxStart = Math.max(0, total - shown);
  const trainStop = Math.floor(reported + 1e-6);
  let follow = clamp(trainStop - 1, 0, maxStart);
  if (sel >= 0) {
    if (sel < follow) follow = sel;
    else if (sel > follow + shown - 1) follow = sel - (shown - 1);
  }
  const [manual, setManual] = React.useState<{
    start: number;
    stop: number;
    sel: number;
  } | null>(null);
  const start =
    manual && manual.stop === trainStop && manual.sel === sel
      ? manual.start
      : follow;

  const pos = useMotionValue(reported);
  const win = useMotionValue(start);
  const flag = useMotionValue(Math.max(0, sel));
  const trainOn = useMotionValue(1);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const reachedStop = React.useRef(Math.floor(reported + 0.002));
  const lastReport = React.useRef(-Infinity);
  const viewport = React.useRef<HTMLDivElement | null>(null);
  const group = React.useRef<HTMLDivElement | null>(null);
  const dragFrom = React.useRef({ start: 0, spacing: 1 });
  const [ripple, setRipple] = React.useState<{ i: number; n: number } | null>(
    null,
  );

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  // Each report eases the train there with the speed it already has. Run
  // twice, it heads for the same place.
  React.useEffect(() => {
    if (!motionSafe) {
      anims.current.get("pos")?.stop();
      pos.set(reported);
      return;
    }
    if (reported < pos.get() - 1) {
      // The next run, not a reverse: the train fades across.
      anims.current.get("pos")?.stop();
      pos.set(reported);
      trainOn.set(0);
      run(
        "trainOn",
        animate(trainOn, 1, { duration: durations.base, ease: easings.enter }),
      );
      return;
    }
    const at = performance.now();
    const gap = (at - lastReport.current) / 1000;
    lastReport.current = at;
    // Reports at a steady pace already carry the train's own easing — the
    // pull away, the braking into a stop — so between them it travels at
    // the pace they set and arrives as the next one lands: one glide, no
    // surges. A first report, an irregular one or a step back (a delay
    // update) settles on the drift spring with the speed it had.
    if (gap >= 0.25 && gap <= 2.5 && reported >= pos.get() - 1e-3) {
      run(
        "pos",
        animate(pos, reported, { duration: gap, ease: easings.linear }),
      );
      return;
    }
    run(
      "pos",
      animate(pos, reported, { ...springs.drift, velocity: pos.getVelocity() }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reported, motionSafe]);

  React.useEffect(() => {
    if (!motionSafe) {
      anims.current.get("win")?.stop();
      win.set(start);
      return;
    }
    run(
      "win",
      animate(win, start, { ...springs.glide, velocity: win.getVelocity() }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, motionSafe]);

  React.useEffect(() => {
    if (sel < 0) return;
    if (!motionSafe) {
      anims.current.get("flag")?.stop();
      flag.set(sel);
      return;
    }
    run("flag", animate(flag, sel, springs.snap));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, motionSafe]);

  // A stop pulses when the shown train reaches it, not when the report
  // says so: the pulse lands with the train.
  React.useEffect(
    () =>
      pos.on("change", (v) => {
        const at = Math.floor(v + 0.002);
        if (at > reachedStop.current) {
          reachedStop.current = at;
          setRipple((r) => ({ i: at, n: (r?.n ?? 0) + 1 }));
        } else if (at < reachedStop.current) {
          reachedStop.current = at;
        }
      }),
    [pos],
  );

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  /* Times and words ---------------------------------------------------- */

  const clock = (ms: number) => {
    const d = new Date(ms + utcOffset * 60_000);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  };
  const expected = (i: number) => (times[i] ?? 0) + lateMs;
  const etaOf = (i: number): Eta => {
    if (reported > i + 1e-3) return { kind: "gone" };
    if (Math.abs(reported - i) <= 1e-3 && nowMs - lateMs >= (times[i] ?? 0)) {
      return { kind: "at" };
    }
    const minutes = Math.ceil((expected(i) - nowMs) / 60_000);
    return minutes <= 0 ? { kind: "due" } : { kind: "in", minutes };
  };
  const etaShort = (e: Eta) =>
    e.kind === "gone"
      ? "Gone"
      : e.kind === "at"
        ? "At stop"
        : e.kind === "due"
          ? "Due"
          : `${e.minutes} min`;
  const etaSpoken = (i: number) => {
    const e = etaOf(i);
    return e.kind === "gone"
      ? `departed ${clock(expected(i))}`
      : e.kind === "at"
        ? "train at the stop"
        : e.kind === "due"
          ? `due now, ${clock(expected(i))}`
          : `in ${e.minutes} minute${e.minutes === 1 ? "" : "s"}, ${clock(expected(i))}`;
  };

  const chosen = sel >= 0 ? timetable[sel] : undefined;
  const chosenEta = sel >= 0 ? etaOf(sel) : undefined;
  const late = Math.max(0, Math.round(delay));
  const badge = late === 0 ? "On time" : `+${late} min`;
  const tone = late === 0 ? "ok" : late < 6 ? "late" : "very";
  const from = timetable[trainStop];
  const to = timetable[Math.min(total - 1, trainStop + 1)];
  const whereSpoken = !from
    ? ""
    : reported - trainStop < 1e-3 || !to || to === from
      ? `The train is at ${from.name}.`
      : `The train is between ${from.name} and ${to.name}.`;

  // A sentence frozen at the change that caused it: a choice, a delay, the
  // train reaching the chosen stop.
  const arrivedAt = ripple && ripple.i === sel ? ripple.n : 0;
  const sayKey = `${selectedId}|${late}|${arrivedAt}`;
  const [said, setSaid] = React.useState({
    key: sayKey,
    sel: selectedId,
    late,
    arrived: arrivedAt,
    n: 0,
    text: "",
  });
  if (said.key !== sayKey) {
    const text =
      selectedId !== said.sel && chosen
        ? `${chosen.name}: ${etaSpoken(sel)}.`
        : late !== said.late
          ? late === 0
            ? "Back on time."
            : `Running ${late} minute${late === 1 ? "" : "s"} late.`
          : arrivedAt !== said.arrived && arrivedAt > 0 && chosen
            ? `Arriving at ${chosen.name}.`
            : "";
    setSaid({
      key: sayKey,
      sel: selectedId,
      late,
      arrived: arrivedAt,
      n: text ? said.n + 1 : said.n,
      text: text || said.text,
    });
  }

  /* Choosing ----------------------------------------------------------- */

  const choose = (i: number, focus: boolean) => {
    if (disabled) return;
    const stop = timetable[clamp(i, 0, total - 1)];
    if (!stop) return;
    const index = clamp(i, 0, total - 1);
    if (focus) {
      group.current
        ?.querySelector<HTMLElement>(`[data-stop="${CSS.escape(stop.id)}"]`)
        ?.focus({ preventScroll: true });
    }
    setManual(null);
    if (stop.id === selectedId) return;
    const e = etaOf(index);
    const node = group.current?.querySelector(
      `[data-stop="${CSS.escape(stop.id)}"]`,
    );
    const rect = node?.getBoundingClientRect();
    audio.play("chime", {
      pitch:
        e.kind === "gone"
          ? 0.75
          : Number(
              semitones(
                e.kind === "in" ? Math.max(0, 9 - Math.min(9, e.minutes)) : 9,
              ).toFixed(3),
            ),
      gain: 0.5,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
    if (value === undefined) setOwn(stop.id);
    onValueChange?.(stop.id);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 5,
    disabled: disabled || maxStart === 0,
    onStart: () => {
      const width = viewport.current?.getBoundingClientRect().width ?? 0;
      dragFrom.current = {
        start: win.get(),
        spacing: Math.max(1, (width - 2 * INSET) / gaps),
      };
      anims.current.get("win")?.stop();
    },
    onMove: ({ offset }) => {
      const d = dragFrom.current;
      win.set(r3(rubberClamp(d.start - offset.x / d.spacing, 0, maxStart, 2)));
    },
    onEnd: ({ velocity }) => {
      const d = dragFrom.current;
      const landing = clamp(
        Math.round(project(win.get(), -velocity.x / d.spacing, 0.99)),
        0,
        maxStart,
      );
      if (landing === start) {
        run(
          "win",
          animate(win, start, motionSafe ? springs.glide : { duration: 0 }),
        );
      } else {
        setManual({ start: landing, stop: trainStop, sel });
      }
    },
    onCancel: () => {
      run("win", animate(win, start, springs.glide));
    },
  });

  /* Drawing ------------------------------------------------------------ */

  const pct = (i: number) => `${r3((i / last) * 100)}%`;
  const stripWidth = `${r3((last / gaps) * 100)}%`;
  const stripX = useTransform(win, (w) => `${-r3((w / last) * 100)}%`);
  const trainLeft = useTransform(
    pos,
    (p) => `${r3((clamp(p, 0, last) / last) * 100)}%`,
  );
  const flagLeft = useTransform(flag, (f) => `${r3((f / last) * 100)}%`);
  const labelWidth = `calc((100cqw - ${2 * INSET}px) / ${gaps} * var(--span) - 6px)`;

  return (
    <div className={cn("w-full max-w-[40rem]", className)}>
      <div
        role="group"
        aria-labelledby={nameId}
        aria-describedby={whereSpoken ? whereId : undefined}
        className={cn(
          "flex flex-col gap-3 rounded-4 border border-hairline bg-card p-4",
          disabled && "opacity-50",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              id={nameId}
              className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-white"
              style={{ background: pigment }}
            >
              <span aria-hidden className="size-1.5 rounded-full bg-white/80" />
              {title}
            </span>
            {direction ? (
              <span className="truncate text-xs text-ink-3" title={direction}>
                {direction}
              </span>
            ) : null}
          </div>
          <span
            className={cn(
              "inline-grid h-6 shrink-0 items-center rounded-full px-2 font-mono text-[10px] tracking-[0.06em] uppercase",
              tone === "ok"
                ? "bg-success/12 text-success"
                : tone === "late"
                  ? "bg-warn/14 text-warn"
                  : "bg-danger/12 text-danger",
            )}
          >
            <AnimatePresence initial={false}>
              <motion.span
                key={badge}
                className="col-start-1 row-start-1 text-center"
                initial={
                  motionSafe
                    ? { opacity: 0, y: -distances.nudge }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  ...(motionSafe ? { y: distances.nudge } : {}),
                  transition: exitFor(durations.fast),
                }}
                transition={
                  motionSafe ? springs.snap : { duration: durations.fast }
                }
              >
                {badge}
              </motion.span>
            </AnimatePresence>
          </span>
        </div>

        <div className="@container">
          <div
            ref={viewport}
            {...drag}
            className={cn(
              "relative touch-pan-y overflow-clip [contain:paint] select-none",
              "[mask-image:linear-gradient(to_right,transparent,black_6px,black_calc(100%-6px),transparent)]",
              fit.box,
              maxStart > 0 && !disabled && "cursor-grab active:cursor-grabbing",
            )}
          >
            <div
              className="absolute inset-y-0"
              style={{ left: INSET, right: INSET }}
            >
              <motion.div
                ref={group}
                role="radiogroup"
                aria-label="Stops"
                aria-disabled={disabled || undefined}
                onKeyDown={(event) => {
                  const step: Record<string, number> = {
                    ArrowRight: sel + 1,
                    ArrowDown: sel + 1,
                    ArrowLeft: sel - 1,
                    ArrowUp: sel - 1,
                    Home: 0,
                    End: total - 1,
                  };
                  const to = step[event.key];
                  if (to === undefined) return;
                  event.preventDefault();
                  choose(to, true);
                }}
                className="absolute inset-y-0 left-0"
                style={{ width: stripWidth, x: stripX }}
              >
                <span
                  aria-hidden
                  className="absolute inset-x-0 h-[3px] -translate-y-1/2 rounded-full"
                  style={{
                    top: LINE_Y,
                    background: `color-mix(in oklab, ${pigment} 30%, transparent)`,
                  }}
                />
                <motion.span
                  aria-hidden
                  className="absolute left-0 h-[3px] -translate-y-1/2 rounded-full"
                  style={{ top: LINE_Y, width: trainLeft, background: pigment }}
                />

                {ripple && timetable[ripple.i] ? (
                  <motion.span
                    key={ripple.n}
                    aria-hidden
                    className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      left: pct(ripple.i),
                      top: LINE_Y,
                      background: `color-mix(in oklab, ${pigment} 60%, transparent)`,
                    }}
                    initial={
                      motionSafe ? { scale: 1, opacity: 0.7 } : { opacity: 0.8 }
                    }
                    animate={
                      motionSafe ? { scale: 3.2, opacity: 0 } : { opacity: 0 }
                    }
                    transition={{
                      duration: durations.page,
                      ease: easings.enter,
                    }}
                  />
                ) : null}

                {timetable.map((stop, i) => {
                  const passed = reported >= i - 1e-3;
                  const checked = i === sel;
                  const eta = etaOf(i);
                  return (
                    <button
                      key={stop.id}
                      type="button"
                      role="radio"
                      data-stop={stop.id}
                      aria-checked={checked}
                      aria-label={`${stop.name}, ${etaSpoken(i)}`}
                      tabIndex={checked || (sel < 0 && i === 0) ? 0 : -1}
                      disabled={disabled}
                      onClick={() => choose(i, false)}
                      onFocus={() => {
                        // A stop reached by Tab is brought into view.
                        if (i < start || i > start + shown - 1)
                          choose(i, false);
                      }}
                      className={cn(
                        "absolute h-6 w-7 -translate-x-1/2 rounded-2 outline-none",
                        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
                        "enabled:cursor-pointer disabled:cursor-not-allowed",
                      )}
                      style={{ left: pct(i), top: LINE_Y - 12 }}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-[background-color,box-shadow,width,height] duration-150",
                          checked ? "size-3" : "size-2.5",
                          passed ? "" : "bg-card",
                        )}
                        style={{
                          borderColor: pigment,
                          background: passed ? pigment : undefined,
                          boxShadow: checked
                            ? `0 0 0 3px color-mix(in oklab, ${pigment} 28%, transparent)`
                            : undefined,
                        }}
                      />
                      <StopLabel
                        win={win}
                        index={i}
                        shown={shown}
                        maxWidth={labelWidth}
                        className={cn(
                          fit.span,
                          i % 2 === 1 && fit.odd,
                          checked
                            ? "font-medium text-foreground"
                            : eta.kind === "gone"
                              ? "text-ink-3"
                              : "text-ink-2",
                        )}
                      >
                        {stop.name}
                      </StopLabel>
                    </button>
                  );
                })}

                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: trainLeft, top: LINE_Y, opacity: trainOn }}
                >
                  <svg
                    viewBox="0 0 26 13"
                    width={26}
                    height={13}
                    className="block overflow-visible"
                  >
                    <rect
                      x={-1}
                      y={-1}
                      width={28}
                      height={15}
                      rx={5.5}
                      className="fill-card"
                    />
                    <path
                      d="M1 3.5a3 3 0 0 1 3-3h15.5c3.4 0 6 2.6 6 6s-2.6 6-6 6H4a3 3 0 0 1-3-3Z"
                      fill={pigment}
                    />
                    <rect
                      x={4}
                      y={3}
                      width={4}
                      height={3.4}
                      rx={0.8}
                      fill="white"
                      opacity={0.85}
                    />
                    <rect
                      x={9.5}
                      y={3}
                      width={4}
                      height={3.4}
                      rx={0.8}
                      fill="white"
                      opacity={0.85}
                    />
                    <rect
                      x={15}
                      y={3}
                      width={4}
                      height={3.4}
                      rx={0.8}
                      fill="white"
                      opacity={0.85}
                    />
                    <circle
                      cx={22.6}
                      cy={8.6}
                      r={1.2}
                      fill="white"
                      opacity={0.9}
                    />
                  </svg>
                </motion.span>

                {chosen && chosenEta ? (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute top-0 -translate-x-1/2"
                    style={{ left: flagLeft }}
                  >
                    <span className="relative inline-grid h-[18px] items-center rounded-1 border border-hairline-strong bg-popover px-1.5 font-mono text-[10px] leading-none whitespace-nowrap text-foreground tabular-nums shadow-raised">
                      <AnimatePresence initial={false}>
                        <motion.span
                          key={etaShort(chosenEta)}
                          className="col-start-1 row-start-1 text-center"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{
                            opacity: 0,
                            transition: exitFor(durations.fast),
                          }}
                          transition={{ duration: durations.fast }}
                        >
                          {etaShort(chosenEta)}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                  </motion.span>
                ) : null}
              </motion.div>
            </div>
          </div>
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-sm text-foreground">
            {chosen ? (
              <>
                <span className="font-medium">{chosen.name}</span>
                <span className="text-ink-3">
                  {" "}
                  · {chosenEta?.kind === "gone" ? "left" : "due"}{" "}
                  <span className="font-mono text-xs tabular-nums">
                    {clock(expected(sel))}
                  </span>
                </span>
              </>
            ) : (
              <span className="text-ink-3">Choose a stop</span>
            )}
          </p>
          {chosenEta ? (
            <p className="shrink-0 font-mono text-sm text-foreground tabular-nums">
              {chosenEta.kind === "in"
                ? `in ${chosenEta.minutes} min`
                : etaShort(chosenEta)}
            </p>
          ) : null}
        </div>
      </div>
      <p id={whereId} className="sr-only">
        {whereSpoken}
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
