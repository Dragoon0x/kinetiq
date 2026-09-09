"use client";

import * as React from "react";

import { AnimatePresence, animate, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type KycStep = {
  id: string;
  title: string;
  /** One line of guidance shown while the step is open. */
  description: string;
};

/** A step absent from the map is pending. */
export type KycStepStatus = "review" | "approved" | "rejected";

export type KycStepsProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** In order; later steps stay locked until every earlier one is approved. */
  steps: KycStep[];
  /** Controlled per-step status. */
  status?: Record<string, KycStepStatus>;
  /** Initial per-step status for uncontrolled usage. */
  defaultStatus?: Record<string, KycStepStatus>;
  /** Fires from the Submit press with the step moved to `"review"`. */
  onStatusChange?: (status: Record<string, KycStepStatus>) => void;
  /** Fires from the Submit or Resubmit press; the host does the work and sets status. */
  onSubmit?: (id: string) => void;
  /** Rejection reason per step id, shown under a rejected step. */
  reasons?: Record<string, string>;
  /** Visible heading. Omit it and pass `aria-label` to label invisibly. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

type StepState = "locked" | "open" | "review" | "rejected" | "approved";

const EMPTY: Record<string, never> = {};

/** The sideways shake of a rejection: symmetric, no spring, no bounce. */
const SHAKE = [0, -6, 6, -4, 4, 0];

/** Word, node ring and chip tone per state — one table so no state is half styled. */
const STATE_STYLE: Record<
  StepState,
  { word: string; node: string; chip: string }
> = {
  locked: {
    word: "Locked",
    node: "border-hairline text-ink-3",
    chip: "text-ink-3",
  },
  open: {
    word: "Open",
    node: "border-primary text-foreground",
    chip: "text-ink-3",
  },
  review: {
    word: "In review",
    node: "border-primary bg-cobalt-wash text-foreground",
    chip: "text-cobalt-bright",
  },
  rejected: {
    word: "Rejected",
    node: "border-danger text-danger",
    chip: "text-danger",
  },
  approved: { word: "Approved", node: "border-primary", chip: "text-success" },
};

const swap = { duration: durations.fast, ease: easings.enter } as const;

/** A wait turns at a constant rate; under reduced motion it holds still and
 *  the words beside it carry the state. */
function WaitRing({ motionSafe }: { motionSafe: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 shrink-0">
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <motion.circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="0.28 0.72"
        style={{ originX: 0.5, originY: 0.5 }}
        animate={{ rotate: motionSafe ? 360 : 0 }}
        transition={
          motionSafe
            ? { duration: 1, ease: easings.linear, repeat: Infinity }
            : { duration: 0 }
        }
      />
    </svg>
  );
}

/** The stamp: the disc lands from 1.5× on `recoil`, then the tick draws. */
function Stamp({ motionSafe }: { motionSafe: boolean }) {
  return (
    <motion.span
      className="absolute inset-0 flex items-center justify-center rounded-full bg-primary text-primary-foreground"
      initial={motionSafe ? { scale: 1.5, opacity: 0 } : { opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor() }}
      transition={
        motionSafe
          ? { ...springs.recoil, opacity: { duration: durations.blink } }
          : { duration: durations.fast }
      }
    >
      <svg
        viewBox="0 0 16 16"
        className="size-3.5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <motion.path
          d="M3.5 8.5 6.5 11.5 12.5 4.5"
          pathLength={1}
          initial={motionSafe ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={
            motionSafe ? { ...springs.flick, delay: 0.12 } : { duration: 0 }
          }
        />
      </svg>
    </motion.span>
  );
}

/**
 * The open body takes its height from the content it holds, so no room is
 * reserved for a closed state and a reason line can arrive without a jump.
 */
function Collapse({
  open,
  motionSafe,
  children,
}: {
  open: boolean;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  const inner = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);

  React.useEffect(() => {
    const node = inner.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      initial={false}
      animate={{ height: open ? (height ?? "auto") : 0, opacity: open ? 1 : 0 }}
      transition={
        motionSafe
          ? { ...springs.glide, opacity: { duration: durations.fast } }
          : { duration: durations.base, ease: easings.move }
      }
      aria-hidden={!open}
      inert={!open}
      className="overflow-hidden"
    >
      <div ref={inner}>{children}</div>
    </motion.div>
  );
}

/**
 * A verification stepper whose steps unlock in sequence. Only the current step
 * is open — its body glides open on `glide` from a measured height — and every
 * later one is locked until the step above it is approved. Approval stamps the
 * node on `recoil`, the two bounces of a stamp on paper, draws its tick on
 * `flick`, and fills the connector below it on `glide` as the next step
 * unlocks. Rejection is the opposite in every way: the card shakes on a
 * symmetric tween with no spring, turns danger, and reopens with the reason so
 * the step can be resubmitted.
 *
 * Nothing here invents time: every state arrives through `status`, and the
 * ring in a reviewing button turns at a constant rate because a wait is
 * information. The only interactive element is the open step's real button.
 * Under reduced motion heights still change on a tween, the check appears at
 * rest, the ring holds still beside the words, and nothing shakes.
 */
export function KycSteps({
  ref,
  steps,
  status,
  defaultStatus,
  onStatusChange,
  onSubmit,
  reasons = EMPTY,
  label,
  className,
  "aria-label": ariaLabel,
}: KycStepsProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<
    Record<string, KycStepStatus>
  >(defaultStatus ?? EMPTY);
  const isControlled = status !== undefined;
  const current = isControlled ? status : uncontrolled;

  const total = steps.length;
  const firstOpen = steps.findIndex((step) => current[step.id] !== "approved");
  const currentIndex = firstOpen === -1 ? total : firstOpen;
  const allApproved = total > 0 && firstOpen === -1;

  const stateOf = (index: number, id: string): StepState => {
    if (index < currentIndex) return "approved";
    if (index > currentIndex) return "locked";
    const own = current[id];
    return own === "review" || own === "rejected" ? own : "open";
  };

  // A rejection that arrives while the step is already open must still shake,
  // so the transition is detected against the last committed map rather than
  // against the step's state. Derived during render, never in an effect.
  const [seen, setSeen] = React.useState<{
    map: Record<string, KycStepStatus>;
    shakes: number;
    shakeId: string | null;
  }>({ map: current, shakes: 0, shakeId: null });
  if (seen.map !== current) {
    const newlyRejected = steps.find(
      (step) =>
        current[step.id] === "rejected" && seen.map[step.id] !== "rejected",
    );
    setSeen({
      map: current,
      shakes: newlyRejected ? seen.shakes + 1 : seen.shakes,
      shakeId: newlyRejected ? newlyRejected.id : seen.shakeId,
    });
  }

  const cardRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  React.useEffect(() => {
    if (!motionSafe || seen.shakes === 0 || !seen.shakeId) return;
    const node = cardRefs.current[seen.shakeId];
    if (!node) return;
    const controls = animate(
      node,
      { x: SHAKE },
      { duration: durations.slow, ease: easings.move },
    );
    return () => controls.stop();
  }, [motionSafe, seen.shakes, seen.shakeId]);

  // When approval unmounts the button that was focused, focus would fall to
  // the body; if it was inside the stepper, it is handed to the next step's
  // button instead. A blur never fires for a removed element, so the flag
  // survives the unmount — but not a Tab away.
  const buttonRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const focusWithin = React.useRef(false);
  const currentId = steps[currentIndex]?.id;
  React.useEffect(() => {
    if (!focusWithin.current || !currentId) return;
    buttonRefs.current[currentId]?.focus();
  }, [currentId]);

  const submit = (id: string) => {
    const next = { ...current, [id]: "review" as const };
    if (!isControlled) setUncontrolled(next);
    onStatusChange?.(next);
    onSubmit?.(id);
  };

  const currentStep = steps[currentIndex];
  const previousStep = steps[currentIndex - 1];
  const currentState = currentStep
    ? stateOf(currentIndex, currentStep.id)
    : null;
  const announcement = allApproved
    ? "All steps approved."
    : currentState === "review" && currentStep
      ? `${currentStep.title} in review.`
      : currentState === "open" && previousStep && currentStep
        ? `${previousStep.title} approved. ${currentStep.title} is next.`
        : "";

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      {label ? (
        <div className="flex items-center justify-between gap-3">
          <span id={labelId} className="text-sm font-semibold">
            {label}
          </span>
          <span className="font-mono text-[11px] text-ink-3 tabular-nums">
            {Math.min(currentIndex, total)}/{total}
          </span>
        </div>
      ) : null}

      <ol
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        className="flex flex-col"
      >
        {steps.map((step, index) => {
          const state = stateOf(index, step.id);
          const isLast = index === total - 1;
          const bodyOpen =
            state === "open" || state === "review" || state === "rejected";
          const busy = state === "review";
          const reason = reasons[step.id];
          const { word, node: nodeTone, chip: chipTone } = STATE_STYLE[state];

          return (
            <li
              key={step.id}
              aria-current={bodyOpen ? "step" : undefined}
              aria-label={`${step.title}, step ${index + 1} of ${total}, ${word.toLowerCase()}`}
              className={cn("relative flex gap-3", !isLast && "pb-4")}
            >
              <div className="relative flex w-7 shrink-0 flex-col items-center">
                <span
                  aria-hidden
                  className={cn(
                    "relative flex size-7 items-center justify-center rounded-full border font-mono text-[11px] tabular-nums transition-colors",
                    nodeTone,
                  )}
                >
                  {state === "rejected" ? "!" : index + 1}
                  <AnimatePresence>
                    {state === "approved" ? (
                      <Stamp key="stamp" motionSafe={motionSafe} />
                    ) : null}
                  </AnimatePresence>
                </span>

                {/* The rail runs through the li's bottom padding to meet the
                    next node, so the fill reads as one line, not segments. */}
                {!isLast ? (
                  <span
                    aria-hidden
                    className="absolute top-7 -bottom-4 w-px bg-hairline-strong"
                  >
                    <motion.span
                      className="absolute inset-0 origin-top bg-primary"
                      initial={false}
                      animate={
                        motionSafe
                          ? { scaleY: state === "approved" ? 1 : 0 }
                          : { opacity: state === "approved" ? 1 : 0 }
                      }
                      transition={
                        motionSafe
                          ? springs.glide
                          : { duration: durations.base, ease: easings.enter }
                      }
                    />
                  </span>
                ) : null}
              </div>

              <div
                ref={(node) => {
                  cardRefs.current[step.id] = node;
                }}
                className={cn(
                  "min-w-0 flex-1 rounded-2 border px-3 py-2 transition-colors",
                  state === "rejected"
                    ? "border-danger bg-surface-2"
                    : bodyOpen
                      ? "border-hairline-strong bg-surface-2"
                      : "border-hairline bg-transparent",
                )}
              >
                <div className="flex h-7 items-center justify-between gap-3">
                  <span
                    className={cn(
                      "min-w-0 truncate text-sm font-medium",
                      state === "locked" ? "text-ink-3" : "text-foreground",
                    )}
                  >
                    {step.title}
                  </span>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={word}
                      aria-hidden
                      className={cn(
                        "shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase",
                        chipTone,
                      )}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={swap}
                    >
                      {word}
                    </motion.span>
                  </AnimatePresence>
                </div>

                <Collapse open={bodyOpen} motionSafe={motionSafe}>
                  <div className="flex flex-col gap-2.5 pt-1 pb-1">
                    <p className="text-xs leading-relaxed text-ink-2">
                      {step.description}
                    </p>
                    <AnimatePresence initial={false}>
                      {state === "rejected" && reason ? (
                        <motion.p
                          key="reason"
                          role="alert"
                          className="text-xs leading-relaxed font-medium text-danger"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{
                            opacity: 0,
                            transition: exitFor(durations.fast),
                          }}
                          transition={swap}
                        >
                          {reason}
                        </motion.p>
                      ) : null}
                    </AnimatePresence>
                    {bodyOpen ? (
                      <button
                        ref={(node) => {
                          buttonRefs.current[step.id] = node;
                        }}
                        type="button"
                        onFocus={() => {
                          focusWithin.current = true;
                        }}
                        onBlur={() => {
                          focusWithin.current = false;
                        }}
                        aria-busy={busy || undefined}
                        aria-disabled={busy || undefined}
                        onClick={() => {
                          if (!busy) submit(step.id);
                        }}
                        className={cn(
                          "inline-flex h-8 w-fit items-center justify-center gap-2 rounded-2 px-3 text-xs font-medium transition-colors outline-none",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                          busy
                            ? "cursor-default bg-cobalt-wash text-foreground"
                            : "bg-primary text-primary-foreground hover:bg-primary/90",
                        )}
                      >
                        {busy ? <WaitRing motionSafe={motionSafe} /> : null}
                        {busy
                          ? "In review"
                          : state === "rejected"
                            ? "Resubmit"
                            : "Submit"}
                      </button>
                    ) : null}
                  </div>
                </Collapse>
              </div>
            </li>
          );
        })}
      </ol>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
