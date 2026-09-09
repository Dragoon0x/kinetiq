"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type OrchestraStatus = "idle" | "active" | "done";

export type OrchestraAgent = {
  id: string;
  name: string;
  model?: string;
  status: OrchestraStatus;
  /** What the agent is doing now; read in the caption when selected. */
  doing?: string;
};

export type OrchestraContribution = {
  id: string;
  agentId: string;
  text: string;
};

export type OrchestraViewProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The central task's name. */
  task: string;
  /** Three to eight agents around the ring. */
  agents: OrchestraAgent[];
  /** Received so far, oldest first; append one to fly it in. */
  contributions: OrchestraContribution[];
  /** Controlled selected agent id. */
  value?: string;
  /** Initial selection; omitted means none. */
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Names the stage. */
  label: string;
  className?: string;
};

/** Ring radius and the chip's landing slot, as shares of the square stage. */
const RADIUS = 36;
const LANDING = { x: 50, y: 69 };
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const pct = (value: number) => `${Number(value.toFixed(3))}%`;

/** Polar layout from twelve o'clock, rounded so server and browser agree. */
const ringPoint = (index: number, count: number) => {
  const angle = -Math.PI / 2 + (index / Math.max(count, 1)) * Math.PI * 2;
  return {
    x: Number((50 + RADIUS * Math.cos(angle)).toFixed(3)),
    y: Number((50 + RADIUS * Math.sin(angle)).toFixed(3)),
    // The pulse travels inward along the same radius.
    dx: Number((-Math.cos(angle) * distances.step).toFixed(3)),
    dy: Number((-Math.sin(angle) * distances.step).toFixed(3)),
  };
};

/** A count whose digits roll to their new value on `snap`. */
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
        const key = value.length - index;
        if (digit < 0) return <span key={key}>{char}</span>;
        return (
          <span
            key={key}
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
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
                  className="flex h-[1.25em] items-center justify-center"
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

/**
 * A ring of agents around one task. Each avatar sits at a polar position on
 * the ring; an active agent pulses toward the centre — its avatar rides its
 * own radius inward by `distances.step` and back on an ambient tween loop
 * under a cobalt halo — so who is working now reads at a glance, while idle
 * agents sit dim and done agents hold a success ring. When the host appends
 * a contribution, a chip carrying its text flies from the agent along the
 * radius to a landing slot under the task disc on `glide`, the disc's count
 * rolls on `snap` as it lands, and the previous chip fades on the exit ease.
 * Pressing an avatar selects it; the selection ring lands on `snap` and the
 * caption under the stage reads what that agent is doing.
 *
 * It is a radiogroup with a roving tabindex — Right and Down move
 * clockwise, Left and Up anticlockwise, Home and End jump, Space selects —
 * and the live region speaks when an agent starts, when a contribution
 * lands and when the last one arrives, never per tick. Under reduced motion
 * nothing pulses: an active avatar holds its halo, a chip fades in at the
 * landing slot, the count swaps and the selection ring swaps colour.
 */
export function OrchestraView({
  ref,
  task,
  agents,
  contributions,
  value,
  defaultValue,
  onValueChange,
  label,
  className,
}: OrchestraViewProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const buttonRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? "");
  const isControlled = value !== undefined;
  const selected = isControlled ? value : uncontrolled;
  const selectedIndex = agents.findIndex((agent) => agent.id === selected);
  const tabIndexAt = selectedIndex >= 0 ? selectedIndex : 0;

  const select = (id: string) => {
    if (id === selected) return;
    if (!isControlled) setUncontrolled(id);
    onValueChange?.(id);
  };

  const focusAt = (index: number) => {
    const clamped = Math.min(agents.length - 1, Math.max(0, index));
    const agent = agents[clamped];
    if (!agent) return;
    buttonRefs.current[clamped]?.focus();
    select(agent.id);
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(agents.length - 1);
        break;
      case " ":
        event.preventDefault();
        select(agents[index]?.id ?? "");
        break;
      default:
        break;
    }
  };

  const count = agents.length;
  const received = contributions.length;
  const latest = contributions[received - 1];
  const nameOf = (id: string) =>
    agents.find((agent) => agent.id === id)?.name ?? id;

  // The announcement is minted when the run changes and held until the next
  // change, so a re-render never re-reads it and a tick never speaks.
  const signature = `${agents.map((agent) => `${agent.id}:${agent.status}`).join("|")}#${received}`;
  const [seen, setSeen] = React.useState({ signature, text: "" });
  if (seen.signature !== signature) {
    const [before = "", beforeCount = "0"] = seen.signature.split("#");
    const was = new Map(
      before.split("|").map((pair) => pair.split(":") as [string, string]),
    );
    const started = agents.find(
      (agent) => agent.status === "active" && was.get(agent.id) !== "active",
    );
    const allDone = agents.every((agent) => agent.status === "done");
    const text =
      received > Number(beforeCount) && latest
        ? allDone && received >= count
          ? `All ${received} contributions received`
          : `${nameOf(latest.agentId)} contributed ${latest.text}, ${received} received`
        : started
          ? `${started.name} active`
          : seen.text;
    setSeen({ signature, text });
  }

  const chosen = agents.find((agent) => agent.id === selected);
  const caption = chosen
    ? `${chosen.name} · ${
        chosen.doing ??
        (chosen.status === "done"
          ? "done"
          : chosen.status === "active"
            ? "working"
            : "idle")
      }`
    : "Select an agent to read what it is doing";

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const from = latest
    ? ringPoint(
        agents.findIndex((a) => a.id === latest.agentId),
        count,
      )
    : LANDING;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {agents.filter((agent) => agent.status === "active").length} active ·{" "}
          {received} received
        </span>
      </div>

      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="relative mx-auto aspect-square w-full max-w-[280px]"
      >
        <span
          aria-hidden
          className="absolute rounded-full border border-dashed border-hairline-strong"
          style={{
            left: pct(50 - RADIUS),
            top: pct(50 - RADIUS),
            width: pct(RADIUS * 2),
            height: pct(RADIUS * 2),
          }}
        />

        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-full border border-hairline-strong bg-surface-2 px-2 text-center"
        >
          <span className="w-full truncate text-[10px] leading-tight font-medium text-foreground">
            {task}
          </span>
          <span className="font-mono text-lg leading-none font-semibold text-foreground">
            <RollingNumber value={String(received)} motionSafe={motionSafe} />
          </span>
          <span className="font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase">
            received
          </span>
        </span>

        {agents.map((agent, index) => {
          const point = ringPoint(index, count);
          const active = agent.status === "active";
          const done = agent.status === "done";
          const isSelected = agent.id === selected;
          const words = [
            agent.name,
            agent.model,
            agent.status,
            active ? agent.doing : undefined,
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <button
              key={agent.id}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={words}
              tabIndex={index === tabIndexAt ? 0 : -1}
              onClick={() => select(agent.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              style={{ left: pct(point.x), top: pct(point.y) }}
              className={cn(
                "absolute flex w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-2 outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              <motion.span
                aria-hidden
                className="relative grid size-11 place-items-center"
                initial={false}
                // The pulse is a tween loop on x and y — two keyframes each — so
                // the avatar leans toward the task and settles back, never bounces.
                animate={
                  active && motionSafe
                    ? { x: [0, point.dx], y: [0, point.dy] }
                    : { x: 0, y: 0 }
                }
                transition={
                  active && motionSafe
                    ? {
                        duration: 1.2,
                        ease: "easeInOut",
                        repeat: Infinity,
                        repeatType: "reverse",
                      }
                    : { duration: durations.fast }
                }
              >
                <motion.span
                  className="absolute -inset-1.5 rounded-full bg-cobalt-bright/20"
                  initial={false}
                  animate={{
                    opacity: active ? (motionSafe ? [0.35, 0.9] : 0.6) : 0,
                  }}
                  transition={
                    active && motionSafe
                      ? {
                          duration: 1.2,
                          ease: "easeInOut",
                          repeat: Infinity,
                          repeatType: "reverse",
                        }
                      : { duration: durations.fast }
                  }
                />
                <motion.span
                  className="absolute -inset-1 rounded-full border-2 border-ring"
                  initial={false}
                  animate={{
                    opacity: isSelected ? 1 : 0,
                    scale: isSelected || !motionSafe ? 1 : 0.85,
                  }}
                  transition={
                    motionSafe ? springs.snap : { duration: durations.fast }
                  }
                />
                <span
                  className={cn(
                    "relative grid size-11 place-items-center rounded-full border-2 text-sm font-semibold transition-colors duration-300",
                    active
                      ? "border-cobalt-bright bg-cobalt-wash text-cobalt-bright"
                      : done
                        ? "border-success bg-surface-1 text-foreground"
                        : "border-hairline-strong bg-surface-1 text-ink-3",
                  )}
                >
                  {agent.name.slice(0, 1)}
                </span>
              </motion.span>
              <span
                aria-hidden
                title={agent.name}
                className={cn(
                  "max-w-full truncate text-[10px] leading-none font-medium",
                  active || isSelected ? "text-foreground" : "text-ink-3",
                )}
              >
                {agent.name}
              </span>
            </button>
          );
        })}

        <AnimatePresence initial={false}>
          {latest ? (
            <motion.span
              key={latest.id}
              aria-hidden
              className="pointer-events-none absolute flex h-6 max-w-[60%] -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-cobalt-bright/50 bg-surface-0 px-2 font-mono text-[10px] whitespace-nowrap text-foreground shadow-sm"
              initial={
                motionSafe
                  ? {
                      left: pct(from.x),
                      top: pct(from.y),
                      opacity: 0,
                      scale: 0.8,
                    }
                  : { left: pct(LANDING.x), top: pct(LANDING.y), opacity: 0 }
              }
              animate={{
                left: pct(LANDING.x),
                top: pct(LANDING.y),
                opacity: 1,
                scale: 1,
              }}
              exit={{ opacity: 0, transition: exitFor() }}
              transition={
                motionSafe
                  ? { ...springs.glide, opacity: fade }
                  : { duration: durations.fast }
              }
            >
              <span className="shrink-0 text-cobalt-bright">
                {nameOf(latest.agentId)}
              </span>
              <span className="min-w-0 truncate">{latest.text}</span>
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <p className="h-5 truncate text-xs leading-5 text-ink-2">{caption}</p>

      {received > 0 ? (
        <ol
          aria-label="Contributions received"
          className="flex flex-col gap-1 border-t border-hairline pt-2"
        >
          {contributions.slice(-3).map((contribution) => (
            <li
              key={contribution.id}
              className="flex h-5 items-center gap-2 text-xs"
            >
              <span className="w-14 shrink-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                {nameOf(contribution.agentId)}
              </span>
              <span className="min-w-0 truncate text-foreground">
                {contribution.text}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <span role="status" className="sr-only">
        {seen.text}
      </span>
    </div>
  );
}
