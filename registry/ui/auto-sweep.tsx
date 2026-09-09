"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type AutoSweepProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The spending balance. Rolls down when a sweep leaves. */
  balance: number;
  /** The savings balance. An increase mounts a flight; the figure rolls when it lands. */
  savings: number;
  /** The floor left in spending; the leftover is `balance - keep`, never below zero. @default 0 */
  keep?: number;
  /** The sweep's occasion, printed under the heading ("Month end · 30 Sep"). */
  period?: string;
  /** Fires from the Sweep press with the leftover; move the money here. */
  onSweep?: (amount: number) => void;
  /** Fires when the pill lands in savings. */
  onSettle?: (amount: number) => void;
  /** Formats every amount. */
  format?: (value: number) => string;
  /** Names the control; heading and group label. */
  label: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and a
 * client in another produce different text for the same number, and that is a
 * hydration mismatch on the figures the card exists to show.
 */
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const defaultFormat = (value: number): string => MONEY.format(value);

/** The lane above the tiles where the arc's apex sits, in px. */
const LANE = 32;

/** Rounded before it reaches an attribute, so server and client agree. */
const r3 = (value: number) => Number(value.toFixed(3));

/** 0 at `from`, 1 at `to`, clamped — the ends may run either way. */
const ramp = (t: number, from: number, to: number) =>
  Math.min(1, Math.max(0, (t - from) / (to - from)));

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * Digits that roll to their new value on `snap`. Hidden from assistive
 * technology: the definition list carries each figure as plain text.
 */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when the
        // figure gains or loses a digit, and only the new column mounts.
        const key = value.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative inline-block h-[1.2em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.2em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/** Where the two figures sit, as percentages of the stage, plus the arc's control. */
type Geometry = { x0: number; y0: number; x1: number; y1: number; cy: number };

type Flight = { seq: number; amount: number; to: number };

/**
 * A month-end sweep. Two tiles, Spending and Savings, and above them a lane
 * where a dashed arc runs from one figure to the other. Pressing Sweep lifts
 * the leftover out of the spending tile as a pill that travels the arc on
 * `glide`: the arc is a quadratic curve in closed form, so the pill's position
 * is a pure function of one progress value and the trail draws itself just
 * ahead of it. The spending figure rolls down on `snap` as the pill leaves —
 * the money has gone — and the savings figure rolls up only when the pill
 * lands, dropping the last `distances.nudge` on `recoil` as the tile's wash
 * flashes once, so the number moves because the money arrived.
 *
 * Any increase in `savings` mounts a flight carrying the difference, so a
 * parent that sweeps on its own schedule gets the same animation as the
 * button. The figures are a definition list, the button's name says what it
 * sweeps, and a status line announces the landing. Under reduced motion the
 * pill fades in over one figure and out over the other with no travel, the
 * trail is skipped, and the digits swap in place.
 */
export function AutoSweep({
  ref,
  balance,
  savings,
  keep = 0,
  period,
  onSweep,
  onSettle,
  format = defaultFormat,
  label,
  className,
}: AutoSweepProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const leftover = Math.max(0, balance - keep);
  const canSweep = leftover > 0;

  // The committed savings and the pill in the air live in state rather than a
  // ref: a ref read during render is banned here, and the render is exactly
  // where an incoming value has to be compared with the last one.
  const [track, setTrack] = React.useState<{
    savings: number;
    seq: number;
    flight: Flight | null;
  }>({ savings, seq: 0, flight: null });
  let flight = track.flight;
  if (track.savings !== savings) {
    const seq = track.seq + 1;
    flight =
      savings > track.savings
        ? { seq, amount: savings - track.savings, to: savings }
        : track.flight;
    setTrack({ savings, seq, flight });
  }

  // What the savings tile shows: it waits for the pill. With nothing in the
  // air — a withdrawal, or a host that changed both figures at once — it
  // follows the prop directly.
  const [landed, setLanded] = React.useState({ value: savings, seq: 0 });
  if (!flight && landed.value !== savings) {
    setLanded({ value: savings, seq: landed.seq });
  }
  const [announcement, setAnnouncement] = React.useState("");

  // The arc has to start and end on the figures themselves, wherever the text
  // put them — so both are measured, never assumed, and the measurement is
  // taken in the observer's callback rather than the effect body.
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const fromRef = React.useRef<HTMLSpanElement | null>(null);
  const toRef = React.useRef<HTMLSpanElement | null>(null);
  const [geometry, setGeometry] = React.useState<Geometry | null>(null);

  React.useEffect(() => {
    const stage = stageRef.current;
    const from = fromRef.current;
    const to = toRef.current;
    if (!stage || !from || !to || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const box = stage.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const px = (x: number) => r3(((x - box.left) / box.width) * 100);
      const py = (y: number) => r3(((y - box.top) / box.height) * 100);
      const y0 = py(a.top + a.height / 2);
      const y1 = py(b.top + b.height / 2);
      // A quadratic's midpoint is (P0 + 2C + P1) / 4; solving for the control
      // puts the apex in the middle of the lane at any tile height.
      const apex = py(box.top + LANE / 2);
      setGeometry({
        x0: px(a.left + a.width / 2),
        y0,
        x1: px(b.left + b.width / 2),
        y1,
        cy: r3((4 * apex - y0 - y1) / 2),
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    observer.observe(from);
    observer.observe(to);
    return () => observer.disconnect();
  }, []);

  // One progress value drives the pill, its opacity and the trail: the curve is
  // closed-form, so nothing here reads the DOM per frame.
  const progress = useMotionValue(0);
  const point = (t: number, axis: "x" | "y") => {
    if (!geometry) return "50%";
    const p0 = axis === "x" ? geometry.x0 : geometry.y0;
    const p1 = axis === "x" ? geometry.x1 : geometry.y1;
    if (!motionSafe) return `${t < 0.5 ? p0 : p1}%`;
    const c = axis === "x" ? (geometry.x0 + geometry.x1) / 2 : geometry.cy;
    const u = 1 - t;
    return `${u * u * p0 + 2 * u * t * c + t * t * p1}%`;
  };
  const pillLeft = useTransform(progress, (t) => point(t, "x"));
  const pillTop = useTransform(progress, (t) => point(t, "y"));
  // With travel, the pill is solid for the whole arc and only feathers at the
  // ends. Without it, the pill fades in over the spending figure and out again
  // over the savings figure — two fades, never an opaque jump between tiles.
  const pillOpacity = useTransform(progress, (t) =>
    motionSafe
      ? Math.min(ramp(t, 0, 0.15), ramp(t, 1, 0.85))
      : t < 0.5
        ? Math.min(ramp(t, 0, 0.3), ramp(t, 0.5, 0.35))
        : Math.min(ramp(t, 0.5, 0.65), ramp(t, 1, 0.7)),
  );
  const trailOffset = useTransform(progress, (t) => 1 - Math.min(1, t + 0.06));

  const settleRef = React.useRef(onSettle);
  React.useEffect(() => {
    settleRef.current = onSettle;
  }, [onSettle]);
  const formatRef = React.useRef(format);
  React.useEffect(() => {
    formatRef.current = format;
  }, [format]);

  const flightSeq = flight?.seq ?? 0;
  const flightAmount = flight?.amount ?? 0;
  const flightTo = flight?.to ?? 0;
  React.useEffect(() => {
    if (flightSeq === 0) return;
    progress.set(0);
    const controls = animate(
      progress,
      1,
      motionSafe
        ? springs.glide
        : { duration: durations.slow, ease: easings.linear },
      // A parent may have withdrawn while the pill was in the air; the figure
      // never lands above what savings actually holds.
    );
    controls.then(() => {
      setTrack((prev) =>
        prev.flight?.seq === flightSeq ? { ...prev, flight: null } : prev,
      );
      setLanded((prev) =>
        prev.seq >= flightSeq
          ? prev
          : {
              value: Math.min(flightTo, prev.value + flightAmount),
              seq: flightSeq,
            },
      );
      const fmt = formatRef.current;
      setAnnouncement(
        `Swept ${fmt(flightAmount)} into savings. Savings ${fmt(flightTo)}.`,
      );
      settleRef.current?.(flightAmount);
    });
    return () => controls.stop();
  }, [flightSeq, flightAmount, flightTo, motionSafe, progress]);

  const sweep = () => {
    if (!canSweep) return;
    onSweep?.(leftover);
    setAnnouncement(`Sweeping ${format(leftover)}`);
  };

  const arc = geometry
    ? `M ${geometry.x0} ${geometry.y0} Q ${r3((geometry.x0 + geometry.x1) / 2)} ${geometry.cy} ${geometry.x1} ${geometry.y1}`
    : "";
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={labelId}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        {period ? (
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {period}
          </span>
        ) : null}
      </div>

      <div ref={stageRef} className="relative" style={{ paddingTop: LANE }}>
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          {/* Normalised path lengths and a non-scaling stroke keep the dashes
              and the hairline honest while the viewBox stretches to the stage. */}
          <path
            d={arc}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeDasharray="0.012 0.02"
            pathLength={1}
            vectorEffect="non-scaling-stroke"
            className="text-hairline-strong"
          />
          <motion.path
            d={arc}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="1 1"
            pathLength={1}
            vectorEffect="non-scaling-stroke"
            className="text-cobalt-bright"
            style={{ strokeDashoffset: trailOffset }}
            // The trail is there the instant the pill leaves and fades only
            // after the landing; an eased fade-in would hide the first stretch.
            animate={{ opacity: flight && motionSafe ? 1 : 0 }}
            transition={
              flight
                ? { duration: durations.blink }
                : { duration: durations.slow, ease: easings.exit }
            }
          />
        </svg>

        <dl className="grid grid-cols-2 gap-3">
          <div className="flex min-w-0 flex-col gap-1 rounded-2 border border-hairline bg-surface-2 p-2.5">
            <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Spending
            </dt>
            <dd className="font-mono text-lg leading-none font-medium text-ink">
              <span className="sr-only">{format(balance)}</span>
              <span ref={fromRef} className="inline-flex">
                <RollingNumber
                  value={format(balance)}
                  motionSafe={motionSafe}
                />
              </span>
            </dd>
            <dd className="text-[11px] text-ink-3 tabular-nums">
              Keep {format(keep)}
            </dd>
          </div>

          <div className="relative flex min-w-0 flex-col gap-1 overflow-hidden rounded-2 border border-hairline bg-surface-2 p-2.5">
            {/* The wash marks the landing, not the press: it flashes once when
                the pill arrives and fades on the exit ease. */}
            {landed.seq > 0 ? (
              <motion.span
                key={landed.seq}
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-cobalt-wash"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ duration: durations.slow, ease: easings.exit }}
              />
            ) : null}
            <dt className="relative font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Savings
            </dt>
            <dd className="relative font-mono text-lg leading-none font-medium text-ink">
              <span className="sr-only">{format(savings)}</span>
              <motion.span
                key={landed.seq}
                ref={toRef}
                className="inline-flex"
                initial={
                  landed.seq > 0 && motionSafe ? { y: -distances.nudge } : false
                }
                animate={{ y: 0 }}
                transition={springs.recoil}
              >
                <RollingNumber
                  value={format(landed.value)}
                  motionSafe={motionSafe}
                />
              </motion.span>
            </dd>
            <dd className="relative text-[11px] text-ink-3 tabular-nums">
              {flight
                ? `Receiving ${format(flight.amount)}`
                : canSweep
                  ? `Leftover ${format(leftover)}`
                  : "Nothing left over"}
            </dd>
          </div>
        </dl>

        <AnimatePresence>
          {flight ? (
            <motion.div
              key={flight.seq}
              aria-hidden
              style={{ left: pillLeft, top: pillTop, opacity: pillOpacity }}
              className="pointer-events-none absolute z-10 size-0"
              exit={{ opacity: 0, transition: { duration: 0 } }}
            >
              {/* The centring lives one level down: motion owns this node's
                  transform, so a translate here would be overwritten. */}
              <span className="flex h-6 -translate-x-1/2 -translate-y-1/2 items-center rounded-full bg-primary px-2 font-mono text-[11px] font-medium whitespace-nowrap text-primary-foreground tabular-nums shadow-raised">
                {format(flight.amount)}
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
        <button
          type="button"
          aria-label={
            canSweep
              ? `Sweep ${format(leftover)} into savings`
              : "Nothing to sweep"
          }
          aria-disabled={!canSweep || undefined}
          onClick={sweep}
          className={cn(
            "flex h-9 items-center justify-center gap-2 rounded-2 px-3 text-sm font-medium transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            canSweep
              ? "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95"
              : "cursor-default border border-hairline-strong bg-surface-2 text-ink-2",
          )}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 shrink-0"
          >
            <path d="M2.5 8h9M8.5 4.5 12 8l-3.5 3.5" />
          </svg>
          <span>
            {canSweep ? `Sweep ${format(leftover)}` : "Nothing to sweep"}
          </span>
        </button>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={flight ? "flying" : canSweep ? "ready" : "clear"}
            className="text-[11px] text-ink-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: durations.blink } }}
            transition={fade}
          >
            {flight
              ? "On its way"
              : canSweep
                ? "Above the floor, ready to go"
                : "Spending sits at the floor"}
          </motion.span>
        </AnimatePresence>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
