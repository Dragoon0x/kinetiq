"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ApprovalRisk = "low" | "medium" | "high";
export type ApprovalDecision = "approve" | "deny";

export type ApprovalItem = {
  id: string;
  /** The tool that wants to act, e.g. "shell". */
  tool: string;
  /** What it wants to do, one line. */
  summary: string;
  /** Anything the reader needs before deciding. */
  detail?: string;
  /** @default "low" */
  risk?: ApprovalRisk;
};

export type ApprovalQueueProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Pending actions, head first. The host removes an item once decided. */
  items: ApprovalItem[];
  /** Fires from Approve or Deny on the head. */
  onDecide?: (id: string, decision: ApprovalDecision) => void;
  /** Fires from Approve all. */
  onApproveAll?: () => void;
  /** Names the queue. */
  label: string;
  /** @default "Approve" */
  approveLabel?: string;
  /** @default "Deny" */
  denyLabel?: string;
  className?: string;
};

/** How each card leaves: the side carries the decision, the delay the cascade. */
type ExitPlan = { dir: 1 | -1; delays: Record<string, number> };

type Last =
  | { kind: "one"; decision: ApprovalDecision; summary: string }
  | { kind: "all"; count: number }
  | null;

const RISK_TONE: Record<ApprovalRisk, string> = {
  low: "text-ink-3",
  medium: "text-warn",
  high: "text-danger",
};

/** A card whose height is measured, so the next card expands to head on `glide` rather than jumping. */
function MeasuredCard({
  children,
  motionSafe,
}: {
  children: React.ReactNode;
  motionSafe: boolean;
}) {
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);

  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setHeight(node.getBoundingClientRect().height),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      className="overflow-hidden"
      initial={false}
      animate={height === null ? undefined : { height }}
      transition={motionSafe ? springs.glide : { duration: durations.fast }}
    >
      <div ref={innerRef} className="pb-2">
        {children}
      </div>
    </motion.div>
  );
}

/**
 * A queue of actions an agent wants to take. The head card is full — tool,
 * summary, risk in words, Approve and Deny — and the cards behind it are
 * compressed to a line each with their place in the queue. Approving slides
 * the head out to the right on the exit ease while its height folds, and the
 * next card rises into its place and expands to full on `glide`, its height
 * measured rather than guessed. Denying slides the head out to the left, so
 * direction carries the decision, and never bounces. Approve all runs the
 * exits in a `cascade()` stagger from the head down; each card's delay
 * travels through AnimatePresence's `custom`, because a removed card can no
 * longer receive props.
 *
 * Focus is kept on the new head's Approve control across a decision, so a run
 * of approvals never loses the keyboard; when the queue empties, focus rests
 * on the queue itself. The status region announces each decision once. Under
 * reduced motion cards fade and fold in place with no slide and no stagger.
 */
export function ApprovalQueue({
  ref,
  items,
  onDecide,
  onApproveAll,
  label,
  approveLabel = "Approve",
  denyLabel = "Deny",
  className,
}: ApprovalQueueProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const approveRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const wantsFocus = React.useRef(false);

  const [plan, setPlan] = React.useState<ExitPlan>({ dir: 1, delays: {} });
  const [last, setLast] = React.useState<Last>(null);

  // The new head's control mounts in the same commit that removes the old
  // one, so the effect after that commit is where focus can land on it.
  React.useEffect(() => {
    if (!wantsFocus.current) return;
    wantsFocus.current = false;
    const head = items[0];
    const target = head ? approveRefs.current.get(head.id) : null;
    if (target) target.focus();
    else rootRef.current?.focus();
  }, [items]);

  const decide = (item: ApprovalItem, decision: ApprovalDecision) => {
    setPlan({ dir: decision === "approve" ? 1 : -1, delays: {} });
    setLast({ kind: "one", decision, summary: item.summary });
    wantsFocus.current = true;
    onDecide?.(item.id, decision);
  };

  const approveAll = () => {
    const gap = motionSafe ? cascade(items.length) : 0;
    const delays: Record<string, number> = {};
    items.forEach((item, index) => {
      delays[item.id] = Number((index * gap).toFixed(3));
    });
    setPlan({ dir: 1, delays });
    setLast({ kind: "all", count: items.length });
    wantsFocus.current = true;
    onApproveAll?.();
  };

  const announcement =
    last === null
      ? ""
      : last.kind === "all"
        ? `Approved all ${last.count}. Queue clear.`
        : `${last.decision === "approve" ? "Approved" : "Denied"} ${last.summary}. ${
            items.length === 0 ? "Queue clear." : `${items.length} waiting.`
          }`;

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const control =
    "flex h-8 items-center justify-center rounded-2 px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <div
      ref={(node) => {
        rootRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      tabIndex={-1}
      className={cn("flex w-full flex-col outline-none", className)}
    >
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {items.length} waiting
        </span>
      </div>

      <ol aria-labelledby={labelId} className="mt-2 flex flex-col">
        <AnimatePresence initial={false} custom={plan}>
          {items.map((item, index) => {
            const risk = item.risk ?? "low";
            const isHead = index === 0;
            return (
              <motion.li
                key={item.id}
                className="overflow-hidden"
                aria-label={
                  isHead
                    ? undefined
                    : `Queued ${index + 1} of ${items.length}: ${item.summary}`
                }
                initial={false}
                animate={{ x: 0, opacity: 1, height: "auto" }}
                variants={{
                  // Read at exit time from AnimatePresence's custom, so the
                  // side and the stagger are the ones the decision chose.
                  exit: (current: ExitPlan) => ({
                    x: motionSafe ? current.dir * distances.shift : 0,
                    opacity: 0,
                    height: 0,
                    transition: {
                      ...exitFor(durations.slow),
                      delay: current.delays[item.id] ?? 0,
                    },
                  }),
                }}
                exit="exit"
                transition={
                  motionSafe
                    ? springs.glide
                    : { duration: durations.fast, ease: easings.move }
                }
              >
                <MeasuredCard motionSafe={motionSafe}>
                  {isHead ? (
                    <div className="rounded-3 border border-hairline-strong bg-surface-0 p-3">
                      <div className="flex h-5 items-center gap-2">
                        <span className="inline-flex h-5 items-center rounded-full border border-hairline-strong bg-surface-2 px-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
                          {item.tool}
                        </span>
                        <span
                          className={cn(
                            "ml-auto font-mono text-[10px] tracking-[0.08em] uppercase",
                            RISK_TONE[risk],
                          )}
                        >
                          {risk} risk
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {item.summary}
                      </p>
                      {item.detail ? (
                        <p className="mt-1 text-xs text-ink-3">{item.detail}</p>
                      ) : null}
                      {/* The controls arrive a beat after the card rises, so
                          the reader sees what they are deciding before the
                          buttons ask. */}
                      <motion.div
                        className="mt-3 flex items-center gap-2"
                        initial={
                          motionSafe
                            ? { opacity: 0, y: distances.nudge }
                            : { opacity: 0 }
                        }
                        animate={{ opacity: 1, y: 0 }}
                        transition={
                          motionSafe
                            ? { ...springs.flick, opacity: fade }
                            : fade
                        }
                      >
                        <button
                          type="button"
                          ref={(node) => {
                            approveRefs.current.set(item.id, node);
                          }}
                          onClick={() => decide(item, "approve")}
                          className={cn(
                            control,
                            "bg-primary text-primary-foreground hover:bg-primary/90",
                          )}
                        >
                          {approveLabel}
                        </button>
                        <button
                          type="button"
                          onClick={() => decide(item, "deny")}
                          className={cn(
                            control,
                            "border border-hairline-strong text-foreground hover:bg-accent",
                          )}
                        >
                          {denyLabel}
                        </button>
                      </motion.div>
                    </div>
                  ) : (
                    <div className="flex h-9 items-center gap-2 rounded-2 border border-hairline bg-surface-1 px-3 text-xs text-ink-3">
                      <span className="w-4 shrink-0 font-mono text-[10px] tabular-nums">
                        {index + 1}
                      </span>
                      <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-hairline px-1.5 font-mono text-[10px] tracking-[0.08em] uppercase">
                        {item.tool}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate"
                        title={item.summary}
                      >
                        {item.summary}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase",
                          RISK_TONE[risk],
                        )}
                      >
                        {risk}
                      </span>
                    </div>
                  )}
                </MeasuredCard>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>

      <div className="flex h-10 items-center justify-between gap-3 border-t border-hairline pt-2">
        {items.length === 0 ? (
          <span className="text-xs text-ink-3">Nothing waiting.</span>
        ) : (
          <>
            <span className="text-xs text-ink-3">
              {items.length === 1 ? "Last one." : `${items.length} to decide.`}
            </span>
            {items.length > 1 ? (
              <button
                type="button"
                onClick={approveAll}
                className={cn(
                  control,
                  "h-7 border border-hairline-strong text-foreground hover:bg-accent",
                )}
              >
                Approve all
              </button>
            ) : null}
          </>
        )}
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
