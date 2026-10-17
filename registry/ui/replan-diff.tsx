"use client";

import * as React from "react";

import { motion, useInView } from "motion/react";
import {
  Check,
  ChevronDown,
  CornerDownRight,
  History,
  MessageCircleQuestion,
  Pause,
  RotateCcw,
  TriangleAlert,
  Undo2,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type ReplanStep = {
  id: string;
  title: string;
  /** The agent's estimate, in minutes. Shown in the ledger style. */
  minutes?: number;
};

export type ReplanDiffStyle = "tint" | "gutter" | "ledger";
export type ReplanReasonPlacement = "below" | "side" | "toggle";
export type ReplanStatus = "ready" | "loading" | "error";
export type ReplanChangeKind = "kept" | "moved" | "added" | "dropped";

export type ReplanDiffProps = {
  /** The plan before the agent changed its mind. @default defaultReplanBefore */
  before?: ReplanStep[];
  /** The plan it wants to run now. @default defaultReplanAfter */
  after?: ReplanStep[];
  /** The agent's one-line reason for each changed step, by step id. @default defaultReplanReasons */
  reasons?: Record<string, string>;
  /** Steps already finished; they are locked at the top of both plans. @default ["profile", "find-dupes"] */
  completed?: string[];
  /** The step that was running when the agent replanned. @default "merge" */
  current?: string;
  /** Controlled: the run is paused until the new plan is accepted. */
  reviewing?: boolean;
  /** Initial review state when uncontrolled. @default true */
  defaultReviewing?: boolean;
  /** Controlled reverted change ids: a reverted change goes back to the old plan. */
  reverted?: string[];
  /** Initial reverted ids when uncontrolled. @default [] */
  defaultReverted?: string[];
  /** Fires from the key or button that reverted a change or put it back. */
  onRevertStep?: (id: string, reverted: boolean) => void;
  /** Accept was pressed: the plan that will run, with reverts applied. */
  onAcceptReplan?: (plan: ReplanStep[]) => void;
  /** "Ask why" was pressed on a change. */
  onAskWhy?: (id: string) => void;
  /** How changes are marked: washed rows, a symbol gutter, or a position ledger. @default "tint" */
  diffStyle?: ReplanDiffStyle;
  /** Where reasons sit: under each change, in a column beside the list (wide containers), or hidden until a change is opened. @default "below" */
  reasonPlacement?: ReplanReasonPlacement;
  /** New-step marks, the open change and Accept — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Show the old plan for a beat when first seen, then play the change. @default true */
  intro?: boolean;
  /** Who replanned, shown above the title. @default "Gaugeworks agent" */
  agent?: string;
  /** The run's name. @default "Vendor table cleanup" */
  title?: string;
  /** Whether the plans have arrived. @default "ready" */
  status?: ReplanStatus;
  /** "Try again" was pressed after the plans failed to load. */
  onRetry?: () => void;
  /** Read only: nothing can be reverted, asked or accepted. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

/** Gaugeworks' vendor-table cleanup, as first planned. */
export const defaultReplanBefore: ReplanStep[] = [
  { id: "profile", title: "Profile the vendor table", minutes: 6 },
  { id: "find-dupes", title: "Find duplicate vendor keys", minutes: 9 },
  { id: "merge", title: "Merge duplicates by tax ID", minutes: 14 },
  { id: "backfill", title: "Backfill missing countries", minutes: 11 },
  { id: "archive", title: "Archive idle vendors", minutes: 8 },
  { id: "report", title: "Send the cleanup report", minutes: 3 },
];

/** The same run, replanned while it was merging. */
export const defaultReplanAfter: ReplanStep[] = [
  { id: "profile", title: "Profile the vendor table", minutes: 6 },
  { id: "find-dupes", title: "Find duplicate vendor keys", minutes: 9 },
  { id: "snapshot", title: "Snapshot the table first", minutes: 4 },
  { id: "merge", title: "Merge duplicates by tax ID", minutes: 14 },
  { id: "report", title: "Send the cleanup report", minutes: 3 },
  { id: "backfill", title: "Backfill missing countries", minutes: 11 },
];

export const defaultReplanReasons: Record<string, string> = {
  snapshot: "Merges can’t be undone; a snapshot makes them reversible.",
  report: "Finance needs the merge counts today; backfill can wait.",
  archive: "41 idle vendors are on legal hold; this waits for sign-off.",
};

const DEFAULT_COMPLETED = ["profile", "find-dupes"];

/* ----------------------------------------------------------------------- */
/*                                 The diff                                 */
/* ----------------------------------------------------------------------- */

type Entry = {
  step: ReplanStep;
  kind: ReplanChangeKind;
  /** 1-based position in the old plan, or null for a new step. */
  oldPos: number | null;
  reason?: string;
};

/**
 * Which kept steps moved: the longest common subsequence of the kept steps
 * in both orders, weighted so a step without a reason would rather stay in
 * it — so when two steps swap, the one the agent explained is the one marked.
 */
function movedSteps(
  oldKept: string[],
  newKept: string[],
  weight: (id: string) => number,
): Set<string> {
  const n = oldKept.length;
  const m = newKept.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const row = dp[i] ?? [];
      const next = dp[i + 1] ?? [];
      row[j] =
        oldKept[i] === newKept[j]
          ? (next[j + 1] ?? 0) + weight(oldKept[i] ?? "")
          : Math.max(next[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const stay = new Set<string>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldKept[i] === newKept[j]) {
      stay.add(oldKept[i] ?? "");
      i += 1;
      j += 1;
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) i += 1;
    else j += 1;
  }
  return new Set(oldKept.filter((id) => !stay.has(id)));
}

type Diff = {
  entries: Map<string, Entry>;
  /** Display order after the change, dropped steps left where they were. */
  merged: string[];
  /** The plan that will run, with reverts applied. */
  plan: string[];
  changes: string[];
};

function diffPlans(
  before: ReplanStep[],
  after: ReplanStep[],
  reasons: Record<string, string>,
  reverted: ReadonlySet<string>,
): Diff {
  const inBefore = new Map(before.map((s, i) => [s.id, i]));
  const inAfter = new Set(after.map((s) => s.id));
  const oldKept = before.filter((s) => inAfter.has(s.id)).map((s) => s.id);
  const newKept = after.filter((s) => inBefore.has(s.id)).map((s) => s.id);
  const moved = movedSteps(oldKept, newKept, (id) => (reasons[id] ? 1 : 2));

  const entries = new Map<string, Entry>();
  for (const s of after) {
    const at = inBefore.get(s.id);
    entries.set(s.id, {
      step: s,
      kind: at === undefined ? "added" : moved.has(s.id) ? "moved" : "kept",
      oldPos: at === undefined ? null : at + 1,
      reason: reasons[s.id],
    });
  }
  for (const [i, s] of before.entries()) {
    if (inAfter.has(s.id)) continue;
    entries.set(s.id, {
      step: s,
      kind: "dropped",
      oldPos: i + 1,
      reason: reasons[s.id],
    });
  }

  // Start from the new order without the moves that were reverted, then put
  // every dropped step (and every reverted move) back after its nearest old
  // predecessor that is already placed.
  const merged = after
    .map((s) => s.id)
    .filter((id) => !(moved.has(id) && reverted.has(id)));
  for (const s of before) {
    const kind = entries.get(s.id)?.kind;
    const place =
      kind === "dropped" || (kind === "moved" && reverted.has(s.id));
    if (!place) continue;
    let at = -1;
    for (let k = (inBefore.get(s.id) ?? 0) - 1; k >= 0; k -= 1) {
      const prev = before[k]?.id;
      const found = prev ? merged.indexOf(prev) : -1;
      if (found >= 0) {
        at = found;
        break;
      }
    }
    merged.splice(at + 1, 0, s.id);
  }

  const plan = merged.filter((id) => {
    const e = entries.get(id);
    if (!e) return false;
    if (e.kind === "dropped") return reverted.has(id);
    if (e.kind === "added") return !reverted.has(id);
    return true;
  });
  const changes = merged.filter((id) => entries.get(id)?.kind !== "kept");
  return { entries, merged, plan, changes };
}

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

/** A node's height, measured when it arrives and whenever it changes. */
function useMeasured() {
  const [node, setNode] = React.useState<HTMLElement | null>(null);
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() =>
      setHeight(Math.round(node.getBoundingClientRect().height)),
    );
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return [setNode, height] as const;
}

/** What a change says in a badge, given whether it was reverted. */
function badgeOf(entry: Entry, newPos: number | null, isReverted: boolean) {
  if (isReverted) {
    if (entry.kind === "added") return "Removed";
    if (entry.kind === "dropped") return "Kept";
    return "Put back";
  }
  if (entry.kind === "added") return "New";
  if (entry.kind === "dropped") return "Dropped";
  if (entry.kind === "moved" && entry.oldPos !== null && newPos !== null) {
    const d = entry.oldPos - newPos;
    if (d === 0) return "Moved";
    return d > 0 ? `Up ${d}` : `Down ${-d}`;
  }
  return "";
}

/** Literal classes per change kind, so the stylesheet carries all of them. */
const TINT: Record<ReplanChangeKind, string> = {
  added: "bg-(--rd-wash)",
  dropped: "bg-[color-mix(in_oklab,var(--danger)_7%,transparent)]",
  moved: "bg-[color-mix(in_oklab,var(--warn)_10%,transparent)]",
  kept: "",
};

const INK: Record<ReplanChangeKind, string> = {
  added: "text-(--rd-accent)",
  dropped: "text-danger",
  moved: "text-warn",
  kept: "text-ink-3",
};

const BAR: Record<ReplanChangeKind, string> = {
  added: "bg-(--rd-accent)",
  dropped: "bg-danger",
  moved: "bg-warn",
  kept: "bg-transparent",
};

const SYMBOL: Record<ReplanChangeKind, string> = {
  added: "+",
  dropped: "−",
  moved: "↕",
  kept: "",
};

/* ----------------------------------------------------------------------- */
/*                                   Row                                    */
/* ----------------------------------------------------------------------- */

type RowProps = {
  entry: Entry;
  order: number;
  index: number;
  count: number;
  newPos: number | null;
  phase: "before" | "after";
  isReverted: boolean;
  isOpen: boolean;
  tabbable: boolean;
  done: boolean;
  running: boolean;
  reviewing: boolean;
  diffStyle: ReplanDiffStyle;
  reasonPlacement: ReplanReasonPlacement;
  motionSafe: boolean;
  disabled: boolean;
  uid: string;
  register: (id: string, node: HTMLButtonElement | null) => void;
  onToggle: () => void;
  onRevert: () => void;
  onAsk: () => void;
  onKey: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onFocus: () => void;
};

function Row({
  entry,
  order,
  index,
  count,
  newPos,
  phase,
  isReverted,
  isOpen,
  tabbable,
  done,
  running,
  reviewing,
  diffStyle,
  reasonPlacement,
  motionSafe,
  disabled,
  uid,
  register,
  onToggle,
  onRevert,
  onAsk,
  onKey,
  onFocus,
}: RowProps) {
  const { step, kind } = entry;
  const after = phase === "after";
  const isChange = kind !== "kept";
  const showsChange = after && isChange;
  // A ghost: a dropped step not kept, or a new step that was removed.
  const ghost =
    after &&
    ((kind === "dropped" && !isReverted) || (kind === "added" && isReverted));
  const hiddenNow = kind === "added" && !after;
  const delay = motionSafe ? Number((index * cascade(count)).toFixed(3)) : 0;
  const id = step.id;
  const headerRef = React.useCallback(
    (node: HTMLButtonElement | null) => register(id, node),
    [register, id],
  );
  const [bindDetail, detailHeight] = useMeasured();
  const detailId = `${uid}-detail-${id}`;
  const reasonId = `${uid}-reason-${id}`;
  const badge = showsChange ? badgeOf(entry, newPos, isReverted) : "";
  const tone = isReverted ? "kept" : kind;
  // What the row looked like when it mounted: anything already true then is
  // drawn finished (server markup included); only later changes animate in.
  const [mountBadge] = React.useState(badge);
  const [mountPhase] = React.useState(phase);
  const arrives = motionSafe && mountPhase === "before";

  const glyph = done ? (
    <span className="flex size-[18px] items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--success)_18%,transparent)] text-success">
      <Check aria-hidden className="size-3" strokeWidth={3} />
    </span>
  ) : running ? (
    <span
      className={cn(
        "flex size-[18px] items-center justify-center rounded-full",
        reviewing
          ? "bg-[color-mix(in_oklab,var(--warn)_18%,transparent)] text-warn"
          : "bg-(--rd-wash) text-(--rd-accent)",
      )}
    >
      {reviewing ? (
        <Pause aria-hidden className="size-2.5 fill-current" />
      ) : (
        <span className="size-1.5 rounded-full bg-current" />
      )}
    </span>
  ) : (
    <span className="flex size-[18px] items-center justify-center font-mono text-[10.5px] text-ink-3 tabular-nums">
      {after ? (newPos ?? "–") : (entry.oldPos ?? "")}
    </span>
  );

  const ledger =
    diffStyle === "ledger" && showsChange ? (
      <span
        aria-hidden
        className={cn(
          "shrink-0 font-mono text-[10.5px] leading-[18px] whitespace-nowrap tabular-nums transition-colors",
          INK[tone],
        )}
      >
        {`${entry.oldPos ?? "—"} → ${ghost ? "—" : (newPos ?? "—")}`}
      </span>
    ) : null;

  // The strike lives on an inline span inside the flex item, so a title
  // that wraps is struck line by line in one sweep.
  const titleNode = (
    <span className="min-w-0 text-[13px] leading-[18px]">
      <motion.span
        className={cn(
          "bg-no-repeat transition-colors duration-300",
          ghost ? "text-ink-3" : "text-foreground",
        )}
        style={{
          backgroundImage: "linear-gradient(var(--danger), var(--danger))",
          backgroundPosition: "0 58%",
        }}
        initial={false}
        animate={{
          backgroundSize: ghost ? "100% 1.5px" : "0% 1.5px",
          opacity: ghost ? 0.62 : 1,
        }}
        transition={
          motionSafe
            ? {
                backgroundSize: { ...springs.glide, delay },
                opacity: {
                  duration: durations.slow,
                  ease: easings.enter,
                  delay: delay + 0.2,
                },
              }
            : { duration: durations.fast }
        }
      >
        {step.title}
      </motion.span>
    </span>
  );

  const badgeNode = badge ? (
    <motion.span
      key={`${badge}-${phase}`}
      aria-hidden
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full px-1.5 font-mono text-[10px] font-medium tracking-[0.04em] whitespace-nowrap uppercase",
        INK[tone],
        diffStyle === "tint"
          ? "bg-[color-mix(in_oklab,currentColor_12%,transparent)]"
          : "border border-[color-mix(in_oklab,currentColor_35%,transparent)]",
        diffStyle === "ledger" && "hidden",
      )}
      initial={
        badge === mountBadge && phase === mountPhase
          ? false
          : motionSafe
            ? { scale: 0.6, opacity: 0 }
            : { scale: 1, opacity: 0 }
      }
      animate={{ scale: 1, opacity: 1 }}
      transition={
        motionSafe
          ? { ...springs.snap, delay: delay + 0.12 }
          : { duration: durations.fast }
      }
    >
      {badge}
    </motion.span>
  ) : null;

  const reasonText = entry.reason ?? "";
  const reasonVisible =
    showsChange && reasonText !== "" && reasonPlacement !== "toggle";

  const header = (
    <span className="flex min-w-0 flex-1 items-start gap-2.5">
      <span className="mt-px shrink-0">{glyph}</span>
      <span className="flex min-w-0 flex-1">{titleNode}</span>
      {badgeNode}
      {ledger}
    </span>
  );

  const name = `${step.title}${
    showsChange
      ? `, ${
          isReverted
            ? `${kind === "added" ? "new step removed" : kind === "dropped" ? "dropped step kept" : "move put back"}`
            : kind === "added"
              ? "new step"
              : kind === "dropped"
                ? "dropped"
                : `moved from step ${entry.oldPos} to ${newPos}`
        }`
      : ""
  }${newPos !== null && !ghost ? `, step ${newPos}` : ""}`;

  return (
    <motion.li
      layout="position"
      data-rd-row={id}
      className={cn("relative", hiddenNow && "hidden")}
      style={{ order }}
      initial={false}
      animate={{
        opacity: hiddenNow ? 0 : 1,
        x: hiddenNow && motionSafe ? distances.shift : 0,
      }}
      transition={{
        layout: motionSafe ? { ...springs.glide, delay } : { duration: 0 },
        opacity: { duration: durations.base, ease: easings.enter, delay },
        x: motionSafe ? { ...springs.glide, delay } : { duration: 0 },
      }}
    >
      <div
        className={cn(
          "relative grid gap-x-3",
          reasonPlacement === "side" &&
            isChange &&
            reasonText !== "" &&
            "@min-[34rem]/replan-diff:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]",
        )}
      >
        <div
          className={cn(
            "relative min-w-0 rounded-2 transition-colors duration-300",
            showsChange && diffStyle === "tint" && TINT[tone],
            diffStyle === "ledger" && "rounded-none border-b border-hairline",
            isOpen && "ring-1 ring-(--rd-line)",
          )}
        >
          {diffStyle === "gutter" ? (
            <span
              aria-hidden
              className={cn(
                "absolute inset-y-1 left-0 w-0.5 rounded-full transition-colors duration-300",
                showsChange ? BAR[tone] : "bg-transparent",
              )}
            />
          ) : null}
          {isChange ? (
            <button
              ref={headerRef}
              type="button"
              aria-expanded={isOpen}
              aria-controls={detailId}
              aria-label={name}
              aria-describedby={reasonVisible ? reasonId : undefined}
              tabIndex={tabbable ? 0 : -1}
              onClick={onToggle}
              onKeyDown={onKey}
              onFocus={onFocus}
              className={cn(
                "flex w-full items-start gap-2 rounded-2 py-[5px] text-left disabled:cursor-default",
                diffStyle === "gutter" ? "pr-2 pl-3" : "px-2.5",
                FOCUS_IN,
              )}
            >
              {diffStyle === "gutter" ? (
                <span
                  aria-hidden
                  className={cn(
                    "-ml-1 w-3 shrink-0 text-center font-mono text-[12px] leading-[18px] font-semibold transition-colors",
                    showsChange ? INK[tone] : "text-transparent",
                  )}
                >
                  {showsChange ? SYMBOL[tone] || "·" : "·"}
                </span>
              ) : null}
              {header}
              {after ? (
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "mt-0.5 hidden size-3.5 shrink-0 text-ink-3 transition-transform duration-200 @min-[22rem]/replan-diff:block",
                    isOpen && "rotate-180",
                  )}
                />
              ) : null}
            </button>
          ) : (
            <div
              className={cn(
                "flex items-start gap-2 py-[5px]",
                diffStyle === "gutter" ? "pr-2 pl-3" : "px-2.5",
              )}
            >
              {diffStyle === "gutter" ? (
                <span aria-hidden className="-ml-1 w-3 shrink-0" />
              ) : null}
              {header}
              <span
                aria-hidden
                className="hidden size-3.5 shrink-0 @min-[22rem]/replan-diff:block"
              />
            </div>
          )}

          {reasonVisible ? (
            <motion.p
              id={reasonId}
              className={cn(
                "flex items-start gap-1.5 pb-2 text-[12px] leading-4 text-ink-2",
                "pr-2.5 pl-[30px] @min-[22rem]/replan-diff:pl-[38px]",
                reasonPlacement === "side" && "@min-[34rem]/replan-diff:hidden",
              )}
              initial={arrives ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{
                duration: durations.slow,
                ease: easings.enter,
                delay: motionSafe ? delay + 0.3 : 0,
              }}
            >
              <CornerDownRight
                aria-hidden
                className="mt-px size-3 shrink-0 text-ink-3"
              />
              <span>{reasonText}</span>
            </motion.p>
          ) : null}

          {isChange ? (
            <motion.div
              id={detailId}
              className="overflow-hidden"
              initial={false}
              animate={{
                height: isOpen ? detailHeight : 0,
                opacity: isOpen ? 1 : 0,
              }}
              transition={
                motionSafe
                  ? {
                      height: springs.glide,
                      opacity: { duration: durations.base },
                    }
                  : { duration: durations.fast }
              }
              inert={!isOpen}
            >
              <div
                ref={bindDetail}
                className="flex flex-col gap-2 pr-2.5 pb-2.5 pl-[30px] @min-[22rem]/replan-diff:pl-[38px]"
              >
                {reasonPlacement === "toggle" && reasonText ? (
                  <p className="flex items-start gap-1.5 text-[12px] leading-4 text-ink-2">
                    <CornerDownRight
                      aria-hidden
                      className="mt-px size-3 shrink-0 text-ink-3"
                    />
                    <span>{reasonText}</span>
                  </p>
                ) : null}
                <span className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onRevert}
                    aria-disabled={disabled || undefined}
                    aria-keyshortcuts="R"
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline bg-card px-2.5 text-[12px] text-foreground transition-colors hover:bg-surface-2",
                      disabled && "opacity-60",
                      FOCUS,
                    )}
                  >
                    <Undo2 aria-hidden className="size-3.5" />
                    {isReverted ? "Use the new plan" : "Revert"}
                  </button>
                  <button
                    type="button"
                    onClick={onAsk}
                    aria-disabled={disabled || undefined}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-2 px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                      disabled && "opacity-60",
                      FOCUS,
                    )}
                  >
                    <MessageCircleQuestion aria-hidden className="size-3.5" />
                    Ask why
                  </button>
                </span>
              </div>
            </motion.div>
          ) : null}
        </div>

        {reasonPlacement === "side" ? (
          <motion.p
            aria-hidden
            className={cn(
              "hidden border-l border-hairline py-2 pl-3 text-[12px] leading-4 text-ink-2",
              reasonVisible && "@min-[34rem]/replan-diff:block",
            )}
            initial={arrives ? { opacity: 0 } : false}
            animate={{ opacity: reasonVisible ? 1 : 0 }}
            transition={{
              duration: durations.slow,
              ease: easings.enter,
              delay: motionSafe ? delay + 0.3 : 0,
            }}
          >
            {reasonText}
          </motion.p>
        ) : null}
      </div>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The surface                               */
/* ----------------------------------------------------------------------- */

/**
 * The moment an agent changes its mind mid-run, as a diff between the old
 * plan and the new. Kept steps stay; a weighted longest common subsequence
 * picks out the ones that moved; dropped steps stay where they were as struck
 * ghosts; new steps are marked; each change carries the agent's one-line
 * reason. Completed steps are locked at the top and the step that was
 * running shows paused while the new plan waits for review.
 *
 * When it is first seen it shows the old plan for a beat, then plays the
 * change: kept steps glide to their new places (motion layout on
 * `springs.glide`, the DOM order stable and CSS `order` carrying the
 * sequence), a strike sweeps across each dropped title on glide before it
 * fades to a ghost, new steps slide in from `distances.shift` with their
 * badges landing on `springs.snap`, all on one `cascade`. A revert replays
 * the same physics for that one step.
 *
 * Up and Down walk the changes, Enter opens one (its reason in toggle mode,
 * Revert and Ask why), R reverts or restores, Escape closes. Under 34rem the
 * old plan hides behind a toggle. Under reduced motion the change appears in
 * its final order with a short fade.
 */
export function ReplanDiff({
  before = defaultReplanBefore,
  after = defaultReplanAfter,
  reasons = defaultReplanReasons,
  completed = DEFAULT_COMPLETED,
  current = "merge",
  reviewing: reviewingProp,
  defaultReviewing = true,
  reverted: revertedProp,
  defaultReverted,
  onRevertStep,
  onAcceptReplan,
  onAskWhy,
  diffStyle = "tint",
  reasonPlacement = "below",
  accent = "var(--accent-bright)",
  intro = true,
  agent = "Gaugeworks agent",
  title = "Vendor table cleanup",
  status = "ready",
  onRetry,
  disabled = false,
  className,
}: ReplanDiffProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const oldId = `${uid}-old`;
  const hintId = `${uid}-hint`;

  /* ------------------------------- values ------------------------------- */

  const [ownReviewing, setOwnReviewing] = React.useState(defaultReviewing);
  const reviewing = reviewingProp ?? ownReviewing;
  const [ownReverted, setOwnReverted] = React.useState<string[]>(
    () => defaultReverted ?? [],
  );
  const revertedList = revertedProp ?? ownReverted;
  const revertedSet = React.useMemo(
    () => new Set(revertedList),
    [revertedList],
  );
  const diff = React.useMemo(
    () => diffPlans(before, after, reasons, revertedSet),
    [before, after, reasons, revertedSet],
  );
  const completedSet = React.useMemo(() => new Set(completed), [completed]);
  const noChange = diff.changes.length === 0;
  const counts = {
    added: diff.changes.filter((id) => diff.entries.get(id)?.kind === "added")
      .length,
    moved: diff.changes.filter((id) => diff.entries.get(id)?.kind === "moved")
      .length,
    dropped: diff.changes.filter(
      (id) => diff.entries.get(id)?.kind === "dropped",
    ).length,
  };
  const revertedCount = diff.changes.filter((id) => revertedSet.has(id)).length;
  const currentPos = before.findIndex((s) => s.id === current) + 1;

  /* ------------------------------- intro -------------------------------- */

  const rootRef = React.useRef<HTMLElement | null>(null);
  const seen = useInView(rootRef, { once: true, amount: 0.35 });
  const [played, setPlayed] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const summary = noChange
    ? "The agent reviewed the plan and kept every step."
    : `Plan revised: ${[
        counts.added ? plural(counts.added, "new step", "new steps") : "",
        counts.moved ? `${counts.moved} moved` : "",
        counts.dropped ? `${counts.dropped} dropped` : "",
      ]
        .filter(Boolean)
        .join(", ")}.${reviewing ? " Run paused for review." : ""}`;

  React.useEffect(() => {
    if (played || !seen || status !== "ready") return;
    const t = window.setTimeout(
      () => {
        setPlayed(true);
        setAnnouncement(summary);
      },
      motionSafe && intro ? 900 : 0,
    );
    return () => window.clearTimeout(t);
  }, [played, seen, status, motionSafe, intro, summary]);

  const skipIntro = () => {
    if (played || status !== "ready") return;
    setPlayed(true);
    setAnnouncement(summary);
  };

  const phase: "before" | "after" =
    intro && motionSafe && !played && !noChange ? "before" : "after";

  /* ------------------------------ actions ------------------------------- */

  const [openId, setOpenId] = React.useState<string | null>(null);

  const titleOf = (id: string) => diff.entries.get(id)?.step.title ?? "Step";

  const revert = (id: string) => {
    if (disabled || phase !== "after") return;
    const entry = diff.entries.get(id);
    if (!entry || entry.kind === "kept") return;
    const next = !revertedSet.has(id);
    const list = next
      ? [...revertedList, id]
      : revertedList.filter((r) => r !== id);
    if (revertedProp === undefined) setOwnReverted(list);
    onRevertStep?.(id, next);
    const what = next
      ? entry.kind === "added"
        ? "removed from the plan"
        : entry.kind === "dropped"
          ? "kept in the plan"
          : "put back where it was"
      : "back to the new plan";
    setAnnouncement(`${titleOf(id)} ${what}.`);
  };

  const ask = (id: string) => {
    if (disabled) return;
    onAskWhy?.(id);
    setAnnouncement(`Asked the agent why it changed ${titleOf(id)}.`);
  };

  const accept = () => {
    if (disabled) return;
    const byId = new Map([...before, ...after].map((s) => [s.id, s] as const));
    const plan = diff.plan
      .map((id) => byId.get(id))
      .filter((s): s is ReplanStep => Boolean(s));
    onAcceptReplan?.(plan);
    if (reviewingProp === undefined) setOwnReviewing(false);
    setOpenId(null);
    setAnnouncement(
      noChange
        ? "Run resumed."
        : `Revision accepted. Running ${plural(plan.length, "step", "steps")}.`,
    );
  };

  /* ------------------------------ keyboard ------------------------------ */

  const [active, setActive] = React.useState<string | null>(null);
  const headerRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const register = React.useCallback(
    (id: string, node: HTMLButtonElement | null) => {
      headerRefs.current.set(id, node);
    },
    [],
  );
  const changeOrder = diff.changes;
  // Before the change plays, new steps are not drawn yet: the tab stop sits
  // on the first change that is on screen.
  const activeId =
    active && changeOrder.includes(active)
      ? active
      : ((phase === "before"
          ? changeOrder.find((id) => diff.entries.get(id)?.kind !== "added")
          : changeOrder[0]) ?? null);

  const focusChange = (index: number) => {
    const id =
      changeOrder[Math.min(changeOrder.length - 1, Math.max(0, index))];
    if (!id) return;
    setActive(id);
    headerRefs.current.get(id)?.focus();
  };

  const onRowKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => {
    const at = changeOrder.indexOf(id);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusChange(at + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusChange(at - 1);
        break;
      case "Home":
        event.preventDefault();
        focusChange(0);
        break;
      case "End":
        event.preventDefault();
        focusChange(changeOrder.length - 1);
        break;
      case "r":
      case "R":
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        event.preventDefault();
        revert(id);
        break;
      case "Escape":
        if (openId === id) {
          event.preventDefault();
          setOpenId(null);
        }
        break;
      default:
        break;
    }
  };

  /* ------------------------------ old plan ------------------------------ */

  const [oldOpen, setOldOpen] = React.useState(false);
  const [bindOld, oldHeight] = useMeasured();
  const newPosOf = new Map(diff.plan.map((id, i) => [id, i + 1]));

  const oldList = (
    <ol className="flex flex-col gap-1">
      {before.map((s, i) => {
        const entry = diff.entries.get(s.id);
        const kind = entry?.kind ?? "kept";
        const gone = kind === "dropped" && !revertedSet.has(s.id);
        const to = newPosOf.get(s.id);
        return (
          <li
            key={s.id}
            className="flex items-baseline gap-2 text-[12px] leading-4"
          >
            <span className="w-4 shrink-0 text-right font-mono text-[10.5px] text-ink-3 tabular-nums">
              {i + 1}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1",
                gone
                  ? "text-ink-3 line-through decoration-[color-mix(in_oklab,var(--danger)_70%,transparent)]"
                  : completedSet.has(s.id)
                    ? "text-ink-3"
                    : "text-ink-2",
              )}
            >
              {s.title}
            </span>
            {!gone && to !== undefined && to !== i + 1 ? (
              <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                {`→ ${to}`}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );

  /* ------------------------------- styles ------------------------------- */

  const vars = {
    "--rd-accent": accent,
    "--rd-wash": `color-mix(in oklab, ${accent} 11%, transparent)`,
    "--rd-line": `color-mix(in oklab, ${accent} 45%, transparent)`,
    "--rd-solid": `oklch(from ${accent} 0.55 c h)`,
    "--rd-on": "oklch(0.99 0.004 262)",
  } as React.CSSProperties;

  const chip = reviewing
    ? { text: "Paused for review", tone: "text-warn", dot: "bg-warn" }
    : noChange
      ? { text: "No change", tone: "text-ink-2", dot: "bg-ink-3" }
      : { text: "Running", tone: "text-success", dot: "bg-success" };

  /* -------------------------------- body -------------------------------- */

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div aria-busy className="flex flex-col gap-2.5 px-4 py-4">
        <span className="sr-only">Loading the plans</span>
        {[0.7, 0.5, 0.78, 0.6, 0.66].map((w, i) => (
          <span key={i} aria-hidden className="flex h-7 items-center gap-3">
            <span className="size-[18px] rounded-full bg-surface-2" />
            <span
              className="h-2.5 rounded-full bg-surface-2"
              style={{ width: `${Math.round(w * 100)}%` }}
            />
          </span>
        ))}
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">The plans did not load.</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    );
  } else {
    const count = diff.merged.length;
    body = (
      <div className="flex flex-col px-2 pt-2.5 pb-2.5 @min-[22rem]/replan-diff:px-3 @min-[34rem]/replan-diff:flex-row @min-[34rem]/replan-diff:gap-4">
        {!noChange ? (
          <div className="@min-[34rem]/replan-diff:w-[34%] @min-[34rem]/replan-diff:shrink-0">
            <motion.div
              id={oldId}
              className="overflow-hidden @min-[34rem]/replan-diff:hidden"
              initial={false}
              animate={{
                height: oldOpen ? oldHeight : 0,
                opacity: oldOpen ? 1 : 0,
              }}
              transition={
                motionSafe
                  ? {
                      height: springs.glide,
                      opacity: { duration: durations.base },
                    }
                  : { duration: durations.fast }
              }
              inert={!oldOpen}
            >
              <div ref={bindOld} className="pb-3">
                <div className="rounded-3 border border-hairline bg-surface-1 px-3 py-2.5">
                  {oldList}
                </div>
              </div>
            </motion.div>
            <div className="hidden flex-col gap-2 rounded-3 border border-hairline bg-surface-1 px-3 py-2.5 @min-[34rem]/replan-diff:flex">
              <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                Old plan
              </p>
              {oldList}
            </div>
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <p id={hintId} className="sr-only">
            Up and Down walk the changes. Enter opens a change, R reverts it.
          </p>
          {noChange ? (
            <p className="mb-2 flex items-center gap-2 rounded-2 bg-surface-1 px-3 py-2 text-[12px] text-ink-2">
              <Check aria-hidden className="size-3.5 shrink-0 text-success" />
              {summary}
            </p>
          ) : null}
          <ol
            aria-labelledby={titleId}
            aria-describedby={hintId}
            className={cn(
              "flex flex-col",
              diffStyle === "ledger" ? "gap-0" : "gap-0.5",
            )}
          >
            {diff.merged.map((id) => {
              const entry = diff.entries.get(id);
              if (!entry) return null;
              const shownOrder =
                phase === "before"
                  ? before.findIndex((s) => s.id === id)
                  : diff.merged.indexOf(id);
              return (
                <Row
                  key={id}
                  entry={entry}
                  order={shownOrder < 0 ? 999 : shownOrder}
                  index={Math.max(0, diff.merged.indexOf(id))}
                  count={count}
                  newPos={newPosOf.get(id) ?? null}
                  phase={phase}
                  isReverted={revertedSet.has(id)}
                  isOpen={openId === id}
                  tabbable={id === activeId}
                  done={completedSet.has(id)}
                  running={id === current}
                  reviewing={reviewing}
                  diffStyle={diffStyle}
                  reasonPlacement={reasonPlacement}
                  motionSafe={motionSafe}
                  disabled={disabled}
                  uid={uid}
                  register={register}
                  onToggle={() => {
                    setActive(id);
                    setOpenId((o) => (o === id ? null : id));
                  }}
                  onRevert={() => revert(id)}
                  onAsk={() => ask(id)}
                  onKey={(event) => onRowKey(event, id)}
                  onFocus={() => setActive(id)}
                />
              );
            })}
          </ol>
        </div>
      </div>
    );
  }

  return (
    <section
      ref={rootRef}
      aria-labelledby={titleId}
      // Reaching into the surface — a key or a press — skips the intro, so
      // nothing is ever disabled under someone's hand.
      onFocusCapture={skipIntro}
      onPointerDownCapture={skipIntro}
      className={cn(
        "@container/replan-diff w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={vars}
    >
      <header className="flex flex-col gap-1.5 border-b border-hairline px-4 pt-3.5 pb-3">
        <p className="font-mono text-[10.5px] tracking-[0.08em] text-ink-3 uppercase">
          {`${agent} · ${noChange ? "plan reviewed" : "revision 2"}`}
        </p>
        <div className="flex items-center justify-between gap-3">
          <p
            id={titleId}
            className="min-w-0 text-[15px] leading-tight font-semibold"
          >
            {title}
          </p>
          {!noChange ? (
            <button
              type="button"
              aria-expanded={oldOpen}
              aria-controls={oldId}
              onClick={() => setOldOpen((o) => !o)}
              className={cn(
                "inline-flex h-6 shrink-0 items-center gap-1 rounded-2 border border-hairline px-2 text-[11.5px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground @min-[34rem]/replan-diff:hidden",
                FOCUS,
              )}
            >
              <History aria-hidden className="size-3.5" />
              Old plan
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-3 transition-transform duration-200",
                  oldOpen && "rotate-180",
                )}
              />
            </button>
          ) : null}
        </div>
        {status === "ready" ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span
              className={cn(
                "inline-flex h-6 items-center gap-1.5 rounded-full border border-hairline px-2 text-[11px] font-medium transition-colors",
                chip.tone,
              )}
            >
              <span
                aria-hidden
                className={cn("size-1.5 rounded-full", chip.dot)}
              />
              {chip.text}
            </span>
            <span className="font-mono text-[11px] whitespace-nowrap text-ink-3 tabular-nums">
              {noChange
                ? `Step ${Math.max(1, currentPos)} · no changes`
                : `Step ${Math.max(1, currentPos)} · ${plural(diff.changes.length, "change", "changes")}`}
            </span>
          </div>
        ) : null}
      </header>

      {body}

      {status === "ready" ? (
        <motion.div
          className="overflow-hidden"
          initial={false}
          animate={{
            height: reviewing ? "auto" : 0,
            opacity: reviewing ? 1 : 0,
          }}
          transition={
            motionSafe
              ? { height: springs.glide, opacity: { duration: durations.base } }
              : { duration: durations.fast }
          }
          inert={!reviewing}
        >
          <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline px-4 py-3">
            <span className="hidden font-mono text-[11px] text-ink-3 tabular-nums @min-[22rem]/replan-diff:inline">
              {noChange
                ? "Nothing to review"
                : `${plural(diff.changes.length, "change", "changes")} · ${revertedCount} reverted`}
            </span>
            <button
              type="button"
              onClick={accept}
              aria-disabled={disabled || undefined}
              className={cn(
                "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-2 bg-(--rd-solid) px-3 text-[12.5px] font-medium text-(--rd-on) transition-[background-color,opacity] hover:bg-[color-mix(in_oklab,var(--rd-solid)_88%,black)] @min-[22rem]/replan-diff:w-auto",
                disabled && "opacity-60",
                FOCUS,
              )}
            >
              <Check aria-hidden className="size-3.5" />
              {noChange ? "Resume run" : "Accept plan"}
            </button>
          </footer>
        </motion.div>
      ) : null}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
