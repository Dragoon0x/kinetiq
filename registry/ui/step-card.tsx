"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type StepCardStatus = "queued" | "running" | "done" | "failed";
export type StepCardCallStatus = "pending" | "running" | "done" | "failed";

export type StepCardInput = { name: string; value: string };

export type StepCardCall = {
  id: string;
  /** The tool's name, printed in mono. */
  name: string;
  /** What the call acts on, printed after the name. */
  detail?: string;
  status: StepCardCallStatus;
};

export type StepCardStep = {
  id: string;
  title: string;
  /** The agent running the step. */
  agent: string;
  model?: string;
  inputs?: StepCardInput[];
  calls?: StepCardCall[];
  /** The step's result, shown once it lands. */
  output?: string;
  /** Why the step failed; read by the live region. */
  error?: string;
};

export type StepCardProps = {
  ref?: React.Ref<HTMLElement>;
  step: StepCardStep;
  /** The step's number in its run, printed before the title. */
  index?: number;
  status: StepCardStatus;
  /** 0..1, the rail's fill. */
  progress: number;
  /** Controlled open state. */
  expanded?: boolean;
  /** @default false */
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Offers Retry on a failed step and fires from it. */
  onRetry?: (id: string) => void;
  className?: string;
};

const word = (status: string) =>
  status.charAt(0).toUpperCase() + status.slice(1);

/** Measures a block's border box so its container can open to the true height. */
function useMeasured<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Fires once on observe, so the height is known before it is asked for.
    const observer = new ResizeObserver(() =>
      setHeight(Math.ceil(node.getBoundingClientRect().height)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, height] as const;
}

/** The node beside a name: pending ring, breathing dot, drawn tick or cross. */
function StatusNode({
  status,
  motionSafe,
  className,
}: {
  status: StepCardStatus | StepCardCallStatus;
  motionSafe: boolean;
  className?: string;
}) {
  const done = status === "done";
  const failed = status === "failed";
  const running = status === "running";
  const draw = motionSafe ? springs.flick : { duration: 0 };
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full border bg-surface-1 transition-colors duration-300",
        running
          ? "border-cobalt-bright"
          : done
            ? "border-success"
            : failed
              ? "border-danger"
              : "border-hairline-strong",
        className,
      )}
    >
      <motion.span
        className={cn(
          "absolute inset-0 rounded-full",
          failed ? "bg-danger" : "bg-success",
        )}
        initial={false}
        animate={{ scale: done || failed ? 1 : 0 }}
        transition={draw}
      />
      <motion.span
        className="absolute size-[38%] rounded-full bg-cobalt-bright"
        initial={false}
        animate={{
          opacity: running ? (motionSafe ? [1, 0.3] : 0.7) : 0,
          scale: running && motionSafe ? [1, 1.5] : 1,
        }}
        transition={
          running && motionSafe
            ? {
                duration: 0.8,
                ease: "easeInOut",
                repeat: Infinity,
                repeatType: "reverse",
              }
            : { duration: durations.fast }
        }
      />
      <svg
        viewBox="0 0 16 16"
        className="relative size-[62%] text-background"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <motion.path
          d="M3.5 8.5 6.5 11.5 12.5 4.5"
          pathLength={1}
          initial={false}
          animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
          transition={draw}
        />
        <motion.path
          d="m4.5 4.5 7 7M11.5 4.5l-7 7"
          pathLength={1}
          initial={false}
          animate={{ pathLength: failed ? 1 : 0, opacity: failed ? 1 : 0 }}
          transition={draw}
        />
      </svg>
    </span>
  );
}

/**
 * One agent step as a card. The header carries the number, title, agent and
 * status; pressing it opens a body — inputs, tool calls, output — whose
 * height is measured by a ResizeObserver and animated on `glide`, so the
 * card opens by its true height and reserves nothing. The chevron turns on
 * `snap` and the three sections arrive in a `cascade()` from `distances.nudge`.
 * A rail on the card's left edge fills from the top on `glide` as the host
 * reports progress — a quantity settling, no overshoot — and reads cobalt,
 * success or danger by status; a failure holds the fill where it stopped,
 * opens an error line to a measured height and brings a Retry control in on
 * `snap`. A landed output settles under a wash that fades on a tween.
 *
 * The header is a real disclosure button, the rail a progressbar with its
 * value in words, and the live region says running, failed and done once
 * each — never a percentage per tick. Under reduced motion the rail fills on
 * a tween, heights change on a tween, the chevron swaps and sections fade in
 * place.
 */
export function StepCard({
  ref,
  step,
  index,
  status,
  progress,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  onRetry,
  className,
}: StepCardProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const titleId = `${baseId}-title`;
  const bodyId = `${baseId}-body`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultExpanded);
  const isControlled = expanded !== undefined;
  const open = isControlled ? expanded : uncontrolled;

  const [bodyRef, bodyHeight] = useMeasured<HTMLDivElement>();
  const [errorRef, errorHeight] = useMeasured<HTMLDivElement>();

  const toggle = () => {
    const next = !open;
    if (!isControlled) setUncontrolled(next);
    onExpandedChange?.(next);
  };

  const inputs = step.inputs ?? [];
  const calls = step.calls ?? [];
  const failed = status === "failed";
  const done = status === "done";
  const running = status === "running";

  // Rounded before it reaches the transform, so server and client agree.
  const fill = Number(Math.min(1, Math.max(0, progress)).toFixed(3));
  const percent = Math.round(fill * 100);

  const heightMove = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };
  const gap = cascade(3);

  const announcement = failed
    ? `Step failed: ${step.error ?? "the step failed"}`
    : done
      ? "Step done"
      : running
        ? "Step running"
        : "";

  const sections: {
    id: string;
    name: string;
    body: React.ReactNode;
  }[] = [
    {
      id: "inputs",
      name: "Inputs",
      body:
        inputs.length === 0 ? (
          <p className="text-xs text-ink-3">No inputs.</p>
        ) : (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
            {inputs.map((input) => (
              <React.Fragment key={input.name}>
                <dt className="text-ink-3">{input.name}</dt>
                <dd
                  className="truncate font-mono text-foreground"
                  title={input.value}
                >
                  {input.value}
                </dd>
              </React.Fragment>
            ))}
          </dl>
        ),
    },
    {
      id: "calls",
      name: "Tool calls",
      body:
        calls.length === 0 ? (
          <p className="text-xs text-ink-3">No calls yet.</p>
        ) : (
          <ol className="flex flex-col gap-1">
            {calls.map((call) => {
              const visibleWord =
                call.status === "running" || call.status === "failed";
              return (
                <li
                  key={call.id}
                  className="flex h-5 items-center gap-2 font-mono text-xs"
                >
                  <StatusNode
                    status={call.status}
                    motionSafe={motionSafe}
                    className="size-3.5"
                  />
                  <span className="shrink-0 font-medium text-foreground">
                    {call.name}
                  </span>
                  {call.detail ? (
                    <span
                      className="min-w-0 truncate text-ink-3"
                      title={call.detail}
                    >
                      {call.detail}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "ml-auto shrink-0 text-[10px] tracking-[0.08em] uppercase",
                      !visibleWord && "sr-only",
                      call.status === "failed"
                        ? "text-danger"
                        : "text-cobalt-bright",
                    )}
                  >
                    {word(call.status)}
                  </span>
                </li>
              );
            })}
          </ol>
        ),
    },
    {
      id: "output",
      name: "Output",
      body: step.output ? (
        <p className="relative text-xs leading-relaxed text-foreground">
          {/* The wash is the landing: it fades on a tween the moment the
              output arrives, keyed so a new output washes again. */}
          <motion.span
            key={step.output}
            aria-hidden
            className="absolute -inset-x-1.5 -inset-y-0.5 rounded-1 bg-cobalt-wash"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: durations.page, ease: easings.exit }}
          />
          <span className="relative font-mono">{step.output}</span>
        </p>
      ) : (
        <p className="text-xs text-ink-3">
          {failed ? "No output." : "Not yet."}
        </p>
      ),
    },
  ];

  return (
    <article
      ref={ref}
      aria-labelledby={titleId}
      className={cn(
        "relative flex w-full overflow-hidden rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div
        role="progressbar"
        aria-label="Step progress"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${word(status)}, ${percent} percent`}
        className="relative w-1 shrink-0 self-stretch bg-hairline"
      >
        <motion.span
          aria-hidden
          className={cn(
            "absolute inset-0 origin-top transition-colors duration-300",
            failed
              ? "bg-danger"
              : done
                ? "bg-success"
                : running
                  ? "bg-cobalt-bright"
                  : "bg-hairline-strong",
          )}
          initial={false}
          animate={{ scaleY: fill }}
          transition={
            motionSafe
              ? springs.glide
              : { duration: durations.base, ease: easings.enter }
          }
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
          className={cn(
            "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors outline-none hover:bg-accent/60",
            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <StatusNode
            status={status}
            motionSafe={motionSafe}
            className="size-4"
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              id={titleId}
              className="truncate text-sm font-medium text-foreground"
            >
              {index !== undefined ? (
                <span className="font-mono text-ink-3 tabular-nums">
                  {index}.{" "}
                </span>
              ) : null}
              {step.title}
            </span>
            <span className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {step.agent}
              {step.model ? ` · ${step.model}` : ""}
            </span>
          </span>
          <span
            className={cn(
              "shrink-0 text-[11px] font-medium",
              failed
                ? "text-danger"
                : running
                  ? "text-cobalt-bright"
                  : done
                    ? "text-success"
                    : "text-ink-3",
            )}
          >
            {word(status)}
          </span>
          <motion.svg
            aria-hidden
            viewBox="0 0 16 16"
            className="size-4 shrink-0 text-ink-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ rotate: open ? 180 : 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            <path d="m4 6 4 4 4-4" />
          </motion.svg>
        </button>

        <motion.div
          initial={false}
          animate={{ height: failed ? errorHeight : 0 }}
          transition={heightMove}
          className="overflow-hidden"
          aria-hidden={!failed}
          inert={!failed}
        >
          <div
            ref={errorRef}
            className="flex flex-wrap items-center gap-2 px-3 pt-1.5 pb-3"
          >
            <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-danger">
              {step.error ?? "The step failed."}
            </p>
            {onRetry ? (
              <motion.button
                type="button"
                aria-label={`Retry ${step.title}`}
                onClick={() => onRetry(step.id)}
                initial={false}
                animate={{
                  opacity: failed ? 1 : 0,
                  y: failed || !motionSafe ? 0 : distances.nudge,
                }}
                transition={
                  motionSafe
                    ? { ...springs.snap, opacity: { duration: durations.fast } }
                    : { duration: durations.fast }
                }
                className={cn(
                  "flex h-7 shrink-0 items-center rounded-2 border border-hairline-strong px-2.5 text-xs font-medium transition-colors outline-none hover:bg-accent",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                Retry
              </motion.button>
            ) : null}
          </div>
        </motion.div>

        <motion.div
          id={bodyId}
          initial={false}
          animate={{ height: open ? bodyHeight : 0 }}
          transition={heightMove}
          className="overflow-hidden"
          aria-hidden={!open}
          inert={!open}
        >
          <div
            ref={bodyRef}
            className="flex flex-col gap-3 border-t border-hairline px-3 py-3"
          >
            {sections.map((section, position) => (
              <motion.div
                key={section.id}
                role="group"
                aria-labelledby={`${baseId}-${section.id}`}
                className="flex flex-col gap-1.5"
                initial={false}
                animate={{
                  opacity: open ? 1 : 0,
                  y: open || !motionSafe ? 0 : distances.nudge,
                }}
                transition={
                  open
                    ? {
                        duration: durations.base,
                        ease: easings.enter,
                        delay: motionSafe
                          ? Number((position * gap).toFixed(3))
                          : 0,
                      }
                    : { duration: durations.fast }
                }
              >
                <span
                  id={`${baseId}-${section.id}`}
                  className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                >
                  {section.name}
                </span>
                {section.body}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </article>
  );
}
