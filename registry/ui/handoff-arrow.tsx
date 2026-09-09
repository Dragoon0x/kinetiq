"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HandoffAgent = {
  id: string;
  name: string;
  /** The model behind the agent; the avatar's tooltip. */
  model?: string;
};

export type HandoffArrowProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The agents in row order, two to five. */
  agents: HandoffAgent[];
  /** What is being passed; printed on the chip. */
  baton: string;
  /** Controlled holder id. */
  value?: string;
  /** Initial holder for uncontrolled usage. Omitted, the first agent holds. */
  defaultValue?: string;
  /** Fires from an avatar press or a key with the new holder. */
  onValueChange?: (id: string) => void;
  /** Fires with both ends of a handoff. */
  onHandoff?: (from: string, to: string) => void;
  /** Names the group. */
  label: string;
  className?: string;
};

type Journey = { from: string; to: string };

/** The chip perches 32px above the avatar row; the row is 40px tall. */
const PERCH = 32;
const AVATAR = 40;
const HEAD = 8;
/** The chip leaves once the shaft is most of the way there, and lands a beat later. */
const DEPART_S = 0.28;
const ARRIVE_S = 0.72;

const round = (n: number) => Number(n.toFixed(3));

/**
 * A row of agents with the baton — a chip naming what is passed — perched
 * above whoever holds it. A handoff draws an arrow between the two avatar
 * centres: the shaft extends on `glide` from the sender and the head lands
 * on `flick` as it arrives; then the chip leaves its perch and travels the
 * shaft on `glide` with a small lift, the receiver's ring lands on `recoil`,
 * the sender's ring fades, and the arrow settles to a faint trace. Every
 * position is a rounded pixel from a ResizeObserver on the row, so the arrow
 * fits any width and nothing is drawn before the first measurement.
 *
 * Each avatar is a button that hands the baton to that agent, so the baton
 * can go backward; a roving tabindex lets Left and Right move between agents
 * and Enter or Space hand off. The holder is stated in text and each handoff
 * is announced once. Under reduced motion the arrow appears whole and the
 * chip fades out over the sender and in over the receiver, no travel.
 */
export function HandoffArrow({
  ref,
  agents,
  baton,
  value,
  defaultValue,
  onValueChange,
  onHandoff,
  label,
  className,
}: HandoffArrowProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const buttons = React.useRef(new Map<string, HTMLButtonElement | null>());

  const first = agents[0];
  const [uncontrolled, setUncontrolled] = React.useState(
    defaultValue ?? first?.id ?? "",
  );
  const current = value ?? uncontrolled;
  const holderIndex = Math.max(
    0,
    agents.findIndex((agent) => agent.id === current),
  );
  const [focusIndex, setFocusIndex] = React.useState<number | null>(null);
  const tabIndexAt = focusIndex ?? holderIndex;

  // The journey is derived from the holder changing — whether an avatar was
  // pressed or the host moved `value` — so both paths draw the same arrow.
  const [seen, setSeen] = React.useState<{
    holder: string;
    journey: Journey | null;
    count: number;
  }>({ holder: current, journey: null, count: 0 });
  if (seen.holder !== current) {
    setSeen({
      holder: current,
      journey: { from: seen.holder, to: current },
      count: seen.count + 1,
    });
  }
  const journey = seen.journey;

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setWidth(Math.round(node.getBoundingClientRect().width)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const count = Math.max(1, agents.length);
  const centre = (index: number) => round(((index + 0.5) * width) / count);
  const indexOf = (id: string) => agents.findIndex((agent) => agent.id === id);
  const nameOf = (id: string) => agents.find((agent) => agent.id === id)?.name;

  const handOff = (to: string) => {
    if (to === current) return;
    if (value === undefined) setUncontrolled(to);
    onValueChange?.(to);
    onHandoff?.(current, to);
  };

  const focusAt = (index: number) => {
    const clamped = Math.min(agents.length - 1, Math.max(0, index));
    const agent = agents[clamped];
    if (!agent) return;
    setFocusIndex(clamped);
    buttons.current.get(agent.id)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: agents.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    focusAt(next);
  };

  // Arrow geometry, only once the row has a width to place it in.
  const fromIndex = journey ? indexOf(journey.from) : -1;
  const toIndex = journey ? indexOf(journey.to) : -1;
  const drawn = width > 0 && fromIndex >= 0 && toIndex >= 0;
  const dir = toIndex > fromIndex ? 1 : -1;
  const x1 = drawn ? round(centre(fromIndex) + dir * (AVATAR / 2 + 4)) : 0;
  const x2 = drawn ? round(centre(toIndex) - dir * (AVATAR / 2 + 4)) : 0;
  const tip = round(x2 + dir * HEAD);
  const mid = AVATAR / 2;
  const headPoints = `${tip},${mid} ${x2},${round(mid - HEAD / 2)} ${x2},${round(mid + HEAD / 2)}`;

  const chipX = width > 0 ? centre(holderIndex) : 0;
  const inFlight = drawn && motionSafe;
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const holderName = nameOf(current) ?? "";
  const announcement =
    journey && drawn
      ? `${baton} handed from ${nameOf(journey.from) ?? journey.from} to ${nameOf(journey.to) ?? journey.to}`
      : "";

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {seen.count} {seen.count === 1 ? "handoff" : "handoffs"}
        </span>
      </div>

      <div ref={stageRef} className="relative w-full">
        {/* The arrow layer is sized by the row and drawn in pixels, never a
            fixed width that could overhang a narrow column. */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-x-0 h-10 w-full overflow-visible text-cobalt-bright"
          style={{ top: PERCH }}
        >
          <AnimatePresence initial={false}>
            {drawn ? (
              <motion.g
                key={`${journey?.from}-${journey?.to}-${seen.count}`}
                initial={{ opacity: 1 }}
                // Once the baton has landed the arrow is history: it settles
                // to a trace on a tween and stays until the next handoff.
                animate={{ opacity: 0.3 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{
                  duration: durations.slow,
                  ease: easings.enter,
                  delay: motionSafe ? ARRIVE_S : 0,
                }}
              >
                <motion.line
                  x1={x1}
                  y1={mid}
                  x2={x2}
                  y2={mid}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  pathLength={1}
                  initial={motionSafe ? { pathLength: 0 } : { opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={
                    motionSafe
                      ? { ...springs.glide, opacity: { duration: 0 } }
                      : fade
                  }
                />
                <motion.polygon
                  points={headPoints}
                  fill="currentColor"
                  style={{ originX: 0.5, originY: 0.5 }}
                  initial={{ opacity: 0, scale: motionSafe ? 0.4 : 1 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.flick,
                          delay: DEPART_S,
                          opacity: {
                            duration: durations.blink,
                            delay: DEPART_S,
                          },
                        }
                      : fade
                  }
                />
              </motion.g>
            ) : null}
          </AnimatePresence>
        </svg>

        <div
          role="group"
          aria-labelledby={labelId}
          className="grid"
          style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
        >
          {agents.map((agent, index) => {
            const holds = agent.id === current;
            const receiving = holds && inFlight;
            return (
              <div
                key={agent.id}
                className="flex min-w-0 flex-col items-center gap-1.5"
                style={{ paddingTop: PERCH }}
              >
                <button
                  type="button"
                  ref={(node) => {
                    buttons.current.set(agent.id, node);
                  }}
                  title={agent.model}
                  aria-pressed={holds}
                  aria-label={
                    holds
                      ? `${agent.name} holds ${baton}`
                      : `Hand ${baton} to ${agent.name}`
                  }
                  tabIndex={tabIndexAt === index ? 0 : -1}
                  onFocus={() => setFocusIndex(index)}
                  onKeyDown={(event) => onKeyDown(event, index)}
                  onClick={() => handOff(agent.id)}
                  className={cn(
                    "relative grid size-10 shrink-0 place-items-center rounded-full border text-sm font-semibold transition-colors outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    holds
                      ? "border-cobalt-bright bg-cobalt-wash text-cobalt-bright"
                      : "border-hairline-strong bg-surface-2 text-ink-2 hover:bg-accent",
                  )}
                >
                  {/* The ring lands on `recoil` the moment the chip arrives;
                      it is the one bounce here, because a landing is the only
                      thing in a handoff that should. */}
                  <motion.span
                    aria-hidden
                    className="absolute -inset-1 rounded-full border-2 border-cobalt-bright"
                    initial={false}
                    animate={{
                      opacity: holds ? 1 : 0,
                      scale: holds || !motionSafe ? 1 : 0.75,
                    }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.recoil,
                            delay: receiving ? ARRIVE_S : 0,
                            opacity: {
                              duration: durations.fast,
                              delay: receiving ? ARRIVE_S : 0,
                            },
                          }
                        : fade
                    }
                  />
                  {agent.name.slice(0, 1).toUpperCase()}
                </button>
                <span
                  className={cn(
                    "max-w-full truncate text-[11px] transition-colors",
                    holds ? "font-medium text-foreground" : "text-ink-3",
                  )}
                  title={agent.name}
                >
                  {agent.name}
                </span>
              </div>
            );
          })}
        </div>

        {/* The chip rides `x` in pixels from the row's left edge; the inner
            span centres it on that point and is capped at a column's width,
            so the chip's own width never matters to the geometry and never
            overhangs the row. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            // Under reduced motion each holder gets its own rider, so the old
            // chip fades out over the sender while the new fades in over the
            // receiver; with motion on, one rider travels.
            key={motionSafe ? "rider" : current}
            aria-hidden
            className="pointer-events-none absolute top-0 left-0"
            initial={motionSafe ? false : { opacity: 0 }}
            animate={{ x: chipX, opacity: width > 0 ? 1 : 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              inFlight
                ? { x: { ...springs.glide, delay: DEPART_S }, opacity: fade }
                : { duration: 0, opacity: fade }
            }
          >
            {/* Keyed per journey so the lift replays on every handoff. */}
            <motion.div
              key={motionSafe ? seen.count : "still"}
              initial={false}
              animate={{ y: inFlight ? [0, -10, 0] : 0 }}
              transition={{
                duration: 0.45,
                ease: "easeInOut",
                delay: DEPART_S,
                times: [0, 0.5, 1],
              }}
            >
              <span
                className="block h-7 -translate-x-1/2 truncate rounded-full border border-hairline-strong bg-surface-0 px-2.5 font-mono text-[11px] leading-7 text-foreground shadow-raised"
                style={{ maxWidth: `${round(100 / count)}%` }}
                title={baton}
              >
                {baton}
              </span>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={current}
          className="h-5 truncate text-xs leading-5 text-ink-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={{ ...fade, delay: inFlight ? ARRIVE_S : 0 }}
        >
          <span className="font-medium text-foreground">{holderName}</span>
          {` holds ${baton}`}
        </motion.p>
      </AnimatePresence>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
