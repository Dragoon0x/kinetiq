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

export type ToolCallArg = { key: string; value: string };

export type ToolCallStatus = "queued" | "running" | "done" | "error";

export type ToolCallProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The tool's name, printed in mono. */
  name: string;
  /** Key–value pairs, previewed on the row and listed when open. */
  args?: ToolCallArg[];
  /** Where the call is; drives the ring. @default "queued" */
  status?: ToolCallStatus;
  /** The result text arrived so far, one line per `\n`. Append-only. */
  result?: string;
  /** Why the call failed; printed in the result box. */
  error?: string;
  /** Milliseconds the call has taken, owned by the host. Shown once running. */
  elapsed?: number;
  /** Controlled expanded state. */
  open?: boolean;
  /** Initial expanded state for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

const NO_ARGS: ToolCallArg[] = [];

/** How long one turn of the running arc takes. */
const TURN_SECONDS = 0.9;

/**
 * One tool call as a row the reader can open. While the call runs the ring's
 * arc turns on a linear loop; when the host marks it done the arc fades on the
 * exit ease and a filled disc with a tick stamps in from 1.3× on `recoil` — a
 * stamp landing — while a failure stamps a danger disc on `snap`, one crisp
 * overshoot and no bounce, because a failure is not a landing to celebrate.
 *
 * Enter, Space or a click expands the row on `glide` to a height measured by
 * a ResizeObserver on the inner content: the arguments as a definition list,
 * then the result box with whatever lines the host has passed so far. The
 * observer reports every change, so a line landing while the row is open
 * grows the panel instead of jumping it. Wide lines scroll inside the result
 * box; the row itself never overflows.
 *
 * The row is a disclosure button and the panel a region that is inert while
 * folded; a polite live region says the status once per change, never per
 * line. Under reduced motion the arc holds at mid opacity, the stamp fades in
 * at full size, and the panel's height changes on a tween.
 */
export function ToolCall({
  ref,
  name,
  args = NO_ARGS,
  status = "queued",
  result = "",
  error,
  elapsed,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  className,
}: ToolCallProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const panelId = `${baseId}-panel`;
  const nameId = `${baseId}-name`;

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const open = openProp ?? ownOpen;
  const toggle = () => {
    const next = !open;
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = React.useState(0);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    // Fires once on observe, so the first height lands without reading layout
    // during render, and again for every line that lands in the result box.
    const observer = new ResizeObserver(() => setMeasured(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const lines = result === "" ? [] : result.split("\n");
  const preview = args.map((arg) => `${arg.key}: ${arg.value}`).join(", ");
  const seconds =
    elapsed === undefined || status === "queued"
      ? null
      : `${(Math.max(0, elapsed) / 1000).toFixed(1)}s`;
  const lineWord = lines.length === 1 ? "line" : "lines";

  const announcement =
    status === "running"
      ? `${name} running`
      : status === "done"
        ? `${name} done${seconds ? ` in ${seconds}` : ""}, ${lines.length} ${lineWord}`
        : status === "error"
          ? `${name} failed${error ? `: ${error}` : ""}`
          : "";

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const stamped = status === "done" || status === "error";

  return (
    <div ref={ref} className={cn("flex w-full flex-col", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className={cn(
          "flex h-9 w-full items-center gap-2.5 rounded-2 border border-hairline bg-surface-1 px-3 text-left transition-colors outline-none hover:border-hairline-strong",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <span
          aria-hidden
          className="relative grid size-4 shrink-0 place-items-center"
        >
          <svg
            viewBox="0 0 16 16"
            className="col-start-1 row-start-1 size-4 text-ink-3"
          >
            <circle
              cx="8"
              cy="8"
              r="6"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.35"
              strokeWidth="1.75"
            />
            <AnimatePresence initial={false}>
              {status === "running" ? (
                <motion.g
                  key="arc"
                  style={{ originX: 0.5, originY: 0.5 }}
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: motionSafe ? 1 : 0.6,
                    rotate: motionSafe ? 360 : 0,
                  }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{
                    opacity: fade,
                    rotate: motionSafe
                      ? {
                          duration: TURN_SECONDS,
                          ease: "linear",
                          repeat: Infinity,
                        }
                      : { duration: 0 },
                  }}
                  className="text-cobalt-bright"
                >
                  <circle
                    cx="8"
                    cy="8"
                    r="6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray="0.3 0.7"
                  />
                </motion.g>
              ) : null}
            </AnimatePresence>
          </svg>

          {/* Keyed by status so a call that fails after finishing swaps
              discs rather than recolouring one. */}
          <AnimatePresence initial={false}>
            {stamped ? (
              <motion.span
                key={status}
                className={cn(
                  "col-start-1 row-start-1 grid size-4 place-items-center rounded-full text-background",
                  status === "done" ? "bg-success" : "bg-danger",
                )}
                initial={
                  motionSafe
                    ? { scale: status === "done" ? 1.3 : 0.85, opacity: 0 }
                    : { opacity: 0 }
                }
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        ...(status === "done" ? springs.recoil : springs.snap),
                        opacity: { duration: durations.blink },
                      }
                    : { duration: durations.fast }
                }
              >
                <svg
                  viewBox="0 0 16 16"
                  className="size-2.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {status === "done" ? (
                    <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                  ) : (
                    <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
                  )}
                </svg>
              </motion.span>
            ) : null}
          </AnimatePresence>
        </span>

        <span className="flex min-w-0 flex-1 items-center gap-1.5 font-mono text-xs">
          <span id={nameId} className="shrink-0 font-medium text-foreground">
            {name}
          </span>
          {preview ? (
            <span className="min-w-0 truncate text-ink-3" title={preview}>
              ({preview})
            </span>
          ) : null}
        </span>

        {seconds ? (
          <motion.span
            key="seconds"
            className={cn(
              "shrink-0 font-mono text-[11px] tabular-nums transition-colors",
              status === "running" ? "text-ink-3" : "text-foreground",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={fade}
          >
            {seconds}
          </motion.span>
        ) : null}

        <motion.span
          aria-hidden
          className="flex size-4 shrink-0 items-center justify-center text-ink-3"
          initial={false}
          animate={{ rotate: open ? 180 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        >
          <svg
            viewBox="0 0 16 16"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m4 6 4 4 4-4" />
          </svg>
        </motion.span>
      </button>

      <motion.div
        id={panelId}
        role="region"
        aria-labelledby={nameId}
        aria-hidden={!open}
        inert={!open}
        initial={false}
        animate={{ height: open ? measured : 0 }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div ref={innerRef} className="flex flex-col gap-2 pt-2">
          <div className="rounded-2 border border-hairline bg-surface-1">
            <div className="flex h-7 items-center border-b border-hairline px-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Arguments
            </div>
            {args.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-ink-3">No arguments.</p>
            ) : (
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 px-3 py-2 font-mono text-[11px] leading-relaxed">
                {args.map((arg) => (
                  <React.Fragment key={arg.key}>
                    <dt className="text-ink-3">{arg.key}</dt>
                    <dd className="min-w-0 break-all text-foreground">
                      {arg.value}
                    </dd>
                  </React.Fragment>
                ))}
              </dl>
            )}
          </div>

          <div className="rounded-2 border border-hairline bg-surface-1">
            <div className="flex h-7 items-center justify-between gap-2 border-b border-hairline px-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              <span>Result</span>
              {lines.length > 0 ? (
                <span className="tabular-nums">
                  {lines.length} {lineWord}
                </span>
              ) : null}
            </div>
            {status === "error" ? (
              <p className="px-3 py-2 text-[11px] leading-relaxed text-danger">
                Error{error ? `: ${error}` : ""}
              </p>
            ) : lines.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-ink-3">
                {status === "running"
                  ? "Waiting for the result."
                  : status === "done"
                    ? "Nothing returned."
                    : "Not started."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <pre className="px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre text-foreground">
                  {lines.map((line, index) => (
                    <motion.span
                      key={index}
                      className="block"
                      initial={{
                        opacity: 0,
                        y: motionSafe ? distances.nudge : 0,
                      }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={fade}
                    >
                      {line === "" ? " " : line}
                    </motion.span>
                  ))}
                </pre>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
