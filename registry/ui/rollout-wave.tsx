"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RolloutPhase = "baseline" | "rolling" | "held" | "complete";

export type RolloutReading = {
  /** Index of the last landed wave; -1 while the fleet is still on the old build. */
  wave: number;
  /** Share of the fleet on the new build, 0–1 to six decimals. */
  share: number;
  machines: number;
  phase: RolloutPhase;
};

export type RolloutWaveProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Cumulative shares of the fleet each wave reaches, in order. */
  waves?: number[];
  /** Machines in the fleet; the grid draws one dot each. @default 24 */
  hosts?: number;
  /** Controlled index of the last landed wave. */
  wave?: number;
  /** Initial landed wave for uncontrolled usage. @default -1 */
  defaultWave?: number;
  /** Fires from the setter behind the roll-back press. */
  onWaveChange?: (wave: number) => void;
  /** Controlled held state. */
  paused?: boolean;
  /** Initial held state for uncontrolled usage. @default false */
  defaultPaused?: boolean;
  /** Fires from the press or key that held or resumed the rollout. */
  onPausedChange?: (paused: boolean) => void;
  /** The whole reading — a state, so it also fires on the first commit. */
  onRolloutChange?: (reading: RolloutReading) => void;
  /** The build being rolled out; printed in the header and spoken. */
  version?: string;
  /** Names each machine for its dot. @default "Machine 01" */
  hostName?: (index: number) => string;
  /** Names the rollout. @default "Rollout" */
  label?: string;
  className?: string;
};

const DEFAULT_WAVES = [0.1, 0.25, 0.5, 1];

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Three decimals before a share reaches a style: an unrounded ratio
 *  serialises differently in Node and the browser, which is a hydration error
 *  rather than a rounding one. */
const pct = (share: number): string =>
  `${Number((clamp01(share) * 100).toFixed(3))}%`;

const machinePhrase = (count: number): string =>
  `${count} ${count === 1 ? "machine" : "machines"}`;

const defaultHostName = (index: number): string =>
  `Machine ${String(index + 1).padStart(2, "0")}`;

/**
 * A release reaching a fleet, one wave at a time. The track carries the share
 * of machines on the new build and scales from its left origin on `glide` — a
 * quantity settling, never an overshoot — with a hairline tick standing at each
 * wave's boundary so the plan is visible before it happens. Under it the fleet
 * is a grid of dots: a landing wave lights its own dots in a `cascade()` on
 * `snap`, scale 0.6 → 1 and exactly two keyframes, and a rollback runs the same
 * dots dark in the reverse order, because a rollback is the wave run backwards
 * and should look like it.
 *
 * Direction is latched from the wave index during render, so the pass that
 * flips it already reads the new direction rather than the one it replaced.
 * Holding stops the track where it stands and prints `Held` beside a rule at
 * the current edge; nothing pulses while it is held, because a held rollout is
 * not making progress.
 *
 * The track is a real `role="meter"` whose `aria-valuetext` is a sentence, each
 * dot is a list item that names its own machine and state rather than leaving
 * it to colour, Hold is a `role="switch"` and Roll back a plain button that
 * never bounces on arrival — undoing a release is not a celebration. The wave
 * index comes from a prop, so a host's timer drives the advance and the
 * component never reads a clock. Under reduced motion the track still fills and
 * the dots still light — how far a release has reached is information — on
 * tweens, with no travel, no scale and no stagger.
 */
export function RolloutWave({
  ref,
  waves = DEFAULT_WAVES,
  hosts = 24,
  wave,
  defaultWave = -1,
  onWaveChange,
  paused,
  defaultPaused = false,
  onPausedChange,
  onRolloutChange,
  version,
  hostName = defaultHostName,
  label = "Rollout",
  className,
}: RolloutWaveProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const [ownWave, setOwnWave] = React.useState(defaultWave);
  const [ownPaused, setOwnPaused] = React.useState(defaultPaused);
  const held = paused ?? ownPaused;

  const count = waves.length;
  const fleet = Math.max(0, Math.round(hosts));
  const landed = Math.min(count - 1, Math.max(-1, wave ?? ownWave));

  // Which dot belongs to which wave, and where each wave's run of dots begins:
  // the same arithmetic the grid and the reverse cascade both read from.
  const plan = React.useMemo(() => {
    const dotWave: number[] = new Array<number>(fleet).fill(-1);
    const bounds: number[] = [];
    let reached = 0;
    waves.forEach((edge, index) => {
      const upto = Math.min(
        fleet,
        Math.max(reached, Math.round(clamp01(edge) * fleet)),
      );
      for (let dot = reached; dot < upto; dot += 1) dotWave[dot] = index;
      bounds.push(upto);
      reached = upto;
    });
    return { dotWave, bounds };
  }, [waves, fleet]);

  const share = landed >= 0 ? clamp01(waves[landed] ?? 0) : 0;
  const machines = landed >= 0 ? (plan.bounds[landed] ?? 0) : 0;
  const percent = Math.round(share * 100);

  const phase: RolloutPhase =
    count > 0 && landed >= count - 1
      ? "complete"
      : held
        ? "held"
        : landed < 0
          ? "baseline"
          : "rolling";

  // The direction is latched as the wave index changes, during render, so this
  // pass already reads the NEW direction rather than the one it replaces.
  const [trail, setTrail] = React.useState({ wave: landed, back: false });
  let back = trail.back;
  if (trail.wave !== landed) {
    back = landed < trail.wave;
    setTrail({ wave: landed, back });
  }

  const build = version ?? "the new build";

  // A wave landing is a settled event, so the first commit speaks nothing.
  const spokenKey = `${landed}|${held ? 1 : 0}`;
  const [spoken, setSpoken] = React.useState({ key: spokenKey, sentence: "" });
  if (spoken.key !== spokenKey) {
    const parts = spoken.key.split("|");
    const wasWave = Number(parts[0] ?? landed);
    const wasHeld = (parts[1] ?? "0") === "1";
    const sentence =
      wasWave !== landed
        ? landed < 0
          ? `Rolled back to the previous build. No machines are on ${build}.`
          : back
            ? `Rolled back to wave ${landed + 1}, ${machinePhrase(machines)} on ${build}.`
            : phase === "complete"
              ? `Rollout complete, ${machinePhrase(machines)} on ${build}.`
              : `Wave ${landed + 1} landed on ${machinePhrase(machines)}, ${percent} percent of the fleet.`
        : wasHeld !== held
          ? held
            ? `Rollout held at ${percent} percent.`
            : `Rollout resumed at ${percent} percent.`
          : "";
    setSpoken({ key: spokenKey, sentence });
  }

  const rolloutRef = React.useRef(onRolloutChange);
  React.useEffect(() => {
    rolloutRef.current = onRolloutChange;
  });
  // The reading is a state, not an event: a host that mounts mid-rollout sees
  // the same fleet the component does, from the first commit.
  React.useEffect(() => {
    rolloutRef.current?.({
      wave: landed,
      share: Number(share.toFixed(6)),
      machines,
      phase,
    });
  }, [landed, share, machines, phase]);

  const setWave = (next: number) => {
    const clamped = Math.min(count - 1, Math.max(-1, next));
    if (clamped === landed) return;
    if (wave === undefined) setOwnWave(clamped);
    onWaveChange?.(clamped);
  };

  const setHeld = (next: boolean) => {
    if (next === held) return;
    if (paused === undefined) setOwnPaused(next);
    onPausedChange?.(next);
  };

  const settle = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };
  const stagger = cascade(Math.max(fleet, 1));

  const valueText =
    landed < 0
      ? `No machines on ${build}; the fleet is still on the previous build.`
      : `Wave ${landed + 1} of ${count} landed on ${machinePhrase(machines)} of ${fleet}, ${percent} percent of the fleet${held ? ", held" : ""}.`;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-2.5 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          id={labelId}
          className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {label}
          {version ? ` · ${version}` : ""}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink tabular-nums">
          {percent}%
        </span>
      </div>

      <div
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={fleet}
        aria-valuenow={machines}
        aria-valuetext={valueText}
        className="relative h-3 w-full overflow-clip rounded-full bg-hairline-strong [contain:paint]"
      >
        <motion.span
          className={cn(
            "absolute inset-y-0 left-0 w-full origin-left rounded-full transition-colors",
            held ? "bg-cobalt" : "bg-cobalt-bright",
          )}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: Number(share.toFixed(6)) }}
          transition={settle}
        />
        {waves.map((edge, index) =>
          clamp01(edge) < 1 ? (
            <span
              key={`tick-${index}`}
              aria-hidden
              className="absolute inset-y-0 w-px bg-surface-1"
              style={{ left: pct(edge) }}
            />
          ) : null,
        )}
        {/* Where the rollout stopped: a held edge is drawn, not merely tinted. */}
        {held && share > 0 ? (
          <motion.span
            aria-hidden
            className="absolute inset-y-0 w-px bg-ink"
            initial={false}
            animate={{ left: pct(share) }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          />
        ) : null}
      </div>

      <div
        aria-hidden
        className="flex items-baseline justify-between gap-2 font-mono text-[10px] text-ink-3 tabular-nums"
      >
        <span>
          {machines} of {fleet} machines
        </span>
        <span>
          {landed < 0
            ? "baseline"
            : `wave ${landed + 1} of ${count}${held ? " · held" : ""}`}
        </span>
      </div>

      <ul role="list" className="flex flex-wrap gap-1">
        {Array.from({ length: fleet }, (_, index) => {
          const owner = plan.dotWave[index] ?? -1;
          const lit = owner >= 0 && owner <= landed;
          const start = owner <= 0 ? 0 : (plan.bounds[owner - 1] ?? 0);
          const inWave = Math.max(1, (plan.bounds[owner] ?? 0) - start);
          const place = index - start;
          // Forward, a wave lights from its first machine; backwards, from its
          // last — the same run of dots, played in reverse.
          const delay =
            owner < 0 ? 0 : stagger * (back ? inWave - 1 - place : place);
          return (
            <li key={`host-${index}`} className="flex">
              {/* The name sits on a role="img" inside the item rather than on
                  the item itself: an img's children are presentational, so the
                  lit overlay is never announced as a second thing. */}
              <span
                role="img"
                aria-label={
                  lit
                    ? `${hostName(index)}, on ${build} from wave ${owner + 1}.`
                    : `${hostName(index)}, still on the previous build.`
                }
                className="relative block size-2 rounded-full bg-hairline-strong"
              >
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-cobalt-bright"
                  initial={false}
                  animate={{
                    opacity: lit ? 1 : 0,
                    scale: motionSafe ? (lit ? 1 : 0.6) : 1,
                  }}
                  transition={
                    motionSafe
                      ? { ...springs.snap, delay }
                      : { duration: durations.fast }
                  }
                />
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={held}
          aria-label="Hold the rollout"
          disabled={phase === "complete"}
          onClick={() => setHeld(!held)}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-hairline-strong pr-2.5 pl-1 transition-colors hover:bg-accent disabled:opacity-50",
            focusRing,
          )}
        >
          <span
            aria-hidden
            className={cn(
              "flex h-4 w-7 shrink-0 items-center rounded-full px-0.5 transition-colors",
              held ? "bg-warn" : "bg-hairline-strong",
            )}
          >
            <motion.span
              className="block size-3 rounded-full bg-surface-0"
              initial={false}
              animate={{ x: held ? 12 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
          </span>
          <span className="font-mono text-[10px] font-medium text-ink">
            Hold
          </span>
        </button>

        <button
          type="button"
          disabled={landed < 0}
          onClick={() => setWave(-1)}
          className={cn(
            "flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong px-2.5 font-mono text-[11px] font-medium text-ink transition-colors hover:bg-accent disabled:opacity-50",
            focusRing,
          )}
        >
          Roll back
        </button>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.sentence}
      </span>
    </div>
  );
}
