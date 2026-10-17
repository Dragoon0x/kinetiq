"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  Check,
  CornerUpLeft,
  GitFork,
  RotateCcw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type CrossroadsStep = {
  id: string;
  title: string;
  /** Already finished. */
  done?: boolean;
  /** Who runs it, shown as meta. */
  owner?: string;
};

export type CrossroadsBranch = {
  id: string;
  title: string;
  /** One line on what taking it means. */
  summary?: string;
  steps: CrossroadsStep[];
};

export type CrossroadsDecision = {
  id: string;
  /** The open question the plan stops at. */
  question: string;
  branches: CrossroadsBranch[];
  /** The branch the agent recommends. */
  recommended?: string;
  /** The agent's reason, in one line. */
  rationale?: string;
};

export type CrossroadsSegment =
  | { kind: "steps"; id: string; steps: CrossroadsStep[] }
  | { kind: "decision"; decision: CrossroadsDecision };

export type CrossroadsBranchStyle = "rails" | "cards" | "lines";
export type CrossroadsStatus = "ready" | "loading" | "error";

export type CrossroadsPlanProps = {
  /** The plan: runs of steps and crossroads, in order. @default defaultCrossroadsPlan */
  plan?: CrossroadsSegment[];
  /** Controlled choices: decision id to branch id. */
  choices?: Record<string, string>;
  /** Initial choices when uncontrolled. @default {} */
  defaultChoices?: Record<string, string>;
  /** Fires from the key or press that chose a branch. */
  onChooseBranch?: (decisionId: string, branchId: string) => void;
  /** Fires from the key or press that reopened a crossroads. */
  onReopen?: (decisionId: string) => void;
  /** "Approve plan" was pressed with every crossroads decided. */
  onApprove?: (choices: Record<string, string>) => void;
  /** Steps of each branch shown before it is chosen. @default 3 */
  preview?: number;
  /** How branches are drawn: metro rails with a drawn fork, bordered cards, or quiet lists on hairlines. @default "rails" */
  branchStyle?: CrossroadsBranchStyle;
  /** How fast the branch not taken withers and the chosen one grows, 0.5× to 2×. @default 1 */
  witherSpeed?: number;
  /** The chosen path, the recommendation and Approve — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The plan's name. @default "Switch freight vendors" */
  title?: string;
  /** Who it is for, shown above the title. @default "Fieldline" */
  product?: string;
  /** Tallest the plan grows, in px, before it scrolls inside its own box. */
  maxHeight?: number;
  /** Whether the plan has arrived. @default "ready" */
  status?: CrossroadsStatus;
  /** "Try again" was pressed after the plan failed to load. */
  onRetry?: () => void;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Read only: nothing can be chosen, reopened or approved. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

/** Fieldline's freight-vendor switch, stopped at its two open questions. */
export const defaultCrossroadsPlan: CrossroadsSegment[] = [
  {
    kind: "steps",
    id: "start",
    steps: [
      {
        id: "export",
        title: "Export current lanes and rates",
        done: true,
        owner: "Agent",
      },
      {
        id: "score",
        title: "Score three carriers on cost and coverage",
        done: true,
        owner: "Agent",
      },
    ],
  },
  {
    kind: "decision",
    decision: {
      id: "cutover",
      question: "Switch every lane at once, or region by region?",
      recommended: "waves",
      rationale:
        "On-time rate is the contract’s risk; waves cap a bad week to one region.",
      branches: [
        {
          id: "weekend",
          title: "One cutover weekend",
          summary: "Fastest; one weekend of risk.",
          steps: [
            {
              id: "freeze",
              title: "Freeze bookings Friday 18:00",
              owner: "Ops",
            },
            { id: "move-all", title: "Move all 42 lanes", owner: "Agent" },
            {
              id: "parallel",
              title: "Track both carriers Saturday",
              owner: "Agent",
            },
            {
              id: "reopen-bookings",
              title: "Reopen bookings Sunday",
              owner: "Ops",
            },
          ],
        },
        {
          id: "waves",
          title: "Region by region",
          summary: "Slower; two carriers live for three weeks.",
          steps: [
            {
              id: "north",
              title: "Start with North’s 9 lanes",
              owner: "Agent",
            },
            {
              id: "watch",
              title: "Watch on-time rate for a week",
              owner: "Agent",
            },
            { id: "south-east", title: "Move South and East", owner: "Agent" },
            { id: "west", title: "Move West and close out", owner: "Ops" },
            {
              id: "compare",
              title: "Compare cost month on month",
              owner: "Finance",
            },
          ],
        },
      ],
    },
  },
  {
    kind: "steps",
    id: "middle",
    steps: [
      { id: "drivers", title: "Tell drivers and dispatch", owner: "Ops" },
      { id: "rates", title: "Update the rate cards", owner: "Finance" },
    ],
  },
  {
    kind: "decision",
    decision: {
      id: "backup",
      question: "Keep the old carrier as a backup?",
      recommended: "keep",
      rationale: "Peak season starts in five weeks.",
      branches: [
        {
          id: "keep",
          title: "Keep for 60 days",
          summary: "Overflow only, no minimum.",
          steps: [
            {
              id: "rider",
              title: "Negotiate a no-minimum rider",
              owner: "Finance",
            },
            { id: "overflow", title: "Route overflow only", owner: "Agent" },
            { id: "day-60", title: "Review at day 60", owner: "Ops" },
          ],
        },
        {
          id: "cancel",
          title: "Cancel at cutover",
          summary: "Cleaner books from day one.",
          steps: [
            {
              id: "notice",
              title: "Send the termination notice",
              owner: "Finance",
            },
            {
              id: "settle",
              title: "Settle the final invoice",
              owner: "Finance",
            },
          ],
        },
      ],
    },
  },
  {
    kind: "steps",
    id: "end",
    steps: [{ id: "review", title: "Review the first month", owner: "Ops" }],
  },
];

const NO_CHOICES: Record<string, string> = {};

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** A stub's width and the gap between branch columns, px. */
const STUB = 40;
const GAP = 12;
/** Where the rail runs, px from a column's left edge. */
const RAIL = 7;

/**
 * Glide, made faster or slower without changing its character: stiffness by
 * speed² and damping by speed keeps the damping ratio, so a quick wither is
 * the same motion, only sooner.
 */
const scaledGlide = (speed: number) => ({
  type: "spring" as const,
  stiffness: r2(springs.glide.stiffness * speed * speed),
  damping: r2(springs.glide.damping * speed),
  mass: springs.glide.mass,
});

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

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

/* ----------------------------------------------------------------------- */
/*                                Step rows                                 */
/* ----------------------------------------------------------------------- */

function StepRow({
  step,
  style,
  tone,
  as: Tag = "li",
}: {
  step: CrossroadsStep;
  style: CrossroadsBranchStyle;
  tone: "live" | "chosen" | "held";
  as?: "li" | "div";
}) {
  return (
    <Tag className="relative flex items-start gap-2 py-[5px] pl-[22px]">
      <span
        aria-hidden
        className={cn(
          "absolute top-[10px] size-2 rounded-full border-[1.5px] transition-colors duration-300",
          style === "rails" ? "left-[4px]" : "left-[3px]",
          step.done
            ? "border-transparent bg-(--cr-solid)"
            : tone === "chosen"
              ? "border-(--cr-accent) bg-card"
              : tone === "held"
                ? "border-dashed border-ink-3 bg-card"
                : "border-hairline-strong bg-card",
        )}
      />
      <span
        className={cn(
          "min-w-0 flex-1 text-[12.5px] leading-[18px]",
          step.done
            ? "text-ink-3"
            : tone === "held"
              ? "text-ink-3"
              : "text-foreground",
        )}
      >
        {step.title}
        {step.done ? <span className="sr-only"> (done)</span> : null}
      </span>
      {step.owner ? (
        <span className="mt-px hidden shrink-0 font-mono text-[10px] leading-4 text-ink-3 @min-[30rem]/crossroads-plan:inline">
          {step.owner}
        </span>
      ) : null}
    </Tag>
  );
}

/** The plan's own rail behind a run of steps. */
function Rail({ dashed = false }: { dashed?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-0 bottom-0 left-[7px] w-0 border-l-2",
        dashed
          ? "border-dashed border-hairline-strong"
          : "border-hairline-strong",
      )}
    />
  );
}

/* ----------------------------------------------------------------------- */
/*                              Branch column                               */
/* ----------------------------------------------------------------------- */

type ColumnProps = {
  branch: CrossroadsBranch;
  n: number;
  grow: MotionValue<number>;
  /** The chosen branch, or the one that was chosen while it un-grows. */
  isGrower: boolean;
  isChosen: boolean;
  decided: boolean;
  picked: boolean;
  recommended: boolean;
  preview: number;
  style: CrossroadsBranchStyle;
  speed: number;
  motionSafe: boolean;
  disabled: boolean;
  radioKey: string;
  register: (key: string, node: HTMLElement | null) => void;
  onRadioKey: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onPick: () => void;
  onReopen: () => void;
};

function BranchColumn({
  branch,
  n,
  grow,
  isGrower,
  isChosen,
  decided,
  picked,
  recommended,
  preview,
  style,
  speed,
  motionSafe,
  disabled,
  radioKey,
  register,
  onRadioKey,
  onPick,
  onReopen,
}: ColumnProps) {
  const radioRef = React.useCallback(
    (node: HTMLDivElement | null) => register(radioKey, node),
    [register, radioKey],
  );
  const gaps = (n - 1) * GAP;
  const width = useTransform(grow, (v) => {
    const share = 1 / n;
    const f = isGrower ? share + (1 - share) * v : share * (1 - v);
    const fixed = isGrower ? -(n - 1) * STUB * v : STUB * v;
    return `calc(${r4(f)} * (100% - ${gaps}px) + ${r2(fixed)}px)`;
  });
  // One value drives the whole wither: as the column narrows its content
  // fades with it, and the stub only arrives once there is room for it.
  const fade = useTransform(grow, (v) =>
    isGrower ? 1 : r4(1 - clamp(v * 1.7, 0, 1)),
  );
  const stub = useTransform(grow, (v) =>
    isGrower ? 0 : r4(clamp((v - 0.45) / 0.55, 0, 1)),
  );
  const withered = decided && !isChosen;
  const [bindExtra, extraHeight] = useMeasured();
  const shown = branch.steps.slice(0, preview);
  const extra = branch.steps.slice(preview);
  const step = cascade(extra.length || 1);

  const header = (
    <span className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-1.5">
        {!decided ? (
          <span
            aria-hidden
            className={cn(
              "flex size-3.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-200",
              picked ? "border-(--cr-accent)" : "border-hairline-strong",
            )}
          >
            <motion.span
              className="size-1.5 rounded-full bg-(--cr-accent)"
              initial={false}
              animate={{ scale: picked ? 1 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
          </span>
        ) : null}
        <span className="text-[13px] leading-[18px] font-semibold text-foreground">
          {branch.title}
        </span>
        {recommended ? (
          <span className="inline-flex h-[18px] items-center gap-1 rounded-full bg-(--cr-wash) px-1.5 font-mono text-[9.5px] font-medium tracking-[0.04em] text-(--cr-ink) uppercase">
            <Sparkles aria-hidden className="size-2.5" />
            Recommended
          </span>
        ) : null}
        {isChosen ? (
          <span className="inline-flex h-[18px] items-center gap-1 rounded-full bg-(--cr-solid) px-1.5 font-mono text-[9.5px] font-medium tracking-[0.04em] text-(--cr-on) uppercase">
            <Check aria-hidden className="size-2.5" strokeWidth={3} />
            Chosen
          </span>
        ) : null}
      </span>
      {branch.summary ? (
        <span className="text-[12px] leading-4 text-ink-2">
          {branch.summary}
        </span>
      ) : null}
    </span>
  );

  const ring = isChosen || (!decided && picked);

  return (
    <motion.div
      className="relative shrink-0 overflow-hidden"
      style={{ width }}
      data-cr-branch={branch.id}
    >
      <motion.div
        className={cn(
          "relative flex h-full w-full flex-col",
          style === "cards" &&
            "rounded-3 border bg-surface-1 p-2.5 transition-colors duration-300",
          style === "cards" &&
            (ring ? "border-(--cr-line)" : "border-hairline"),
          style === "lines" &&
            "border-l-2 pl-2.5 transition-colors duration-300",
          style === "lines" &&
            (ring ? "border-(--cr-accent)" : "border-hairline"),
        )}
        style={{
          opacity: fade,
          minWidth: `calc((100cqw - ${gaps}px) / ${n})`,
        }}
        aria-hidden={withered || undefined}
        inert={withered}
      >
        {style === "rails" ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-0 bottom-2 left-[7px] w-0 border-l-2 transition-colors duration-300",
              ring ? "border-(--cr-accent)" : "border-hairline-strong",
            )}
          />
        ) : null}
        {decided ? (
          <div
            className={cn(
              "relative pb-1",
              style === "rails" && "pt-2 pl-[22px]",
            )}
          >
            {header}
          </div>
        ) : (
          <div
            ref={radioRef}
            role="radio"
            aria-checked={picked}
            aria-label={`${branch.title}${recommended ? ", recommended" : ""}${
              branch.summary ? `. ${branch.summary}` : ""
            } ${plural(branch.steps.length, "step", "steps")}.`}
            aria-disabled={disabled || undefined}
            tabIndex={picked ? 0 : -1}
            onKeyDown={onRadioKey}
            onClick={onPick}
            className={cn(
              "relative cursor-pointer rounded-2 pb-1 transition-colors",
              style === "rails" && "pt-2 pl-[22px]",
              style !== "cards" && "hover:bg-surface-2/60",
              FOCUS_IN,
            )}
          >
            {header}
          </div>
        )}
        <ol className="relative">
          {shown.map((s) => (
            <StepRow
              key={s.id}
              step={s}
              style={style}
              tone={isChosen ? "chosen" : "live"}
            />
          ))}
        </ol>
        {extra.length ? (
          <>
            <motion.div
              className="overflow-hidden"
              initial={false}
              animate={{ height: isChosen ? extraHeight : 0 }}
              transition={motionSafe ? scaledGlide(speed) : { duration: 0 }}
            >
              <ol ref={bindExtra} className="relative">
                {extra.map((s, i) => (
                  <motion.li
                    key={s.id}
                    initial={false}
                    animate={{
                      opacity: isChosen ? 1 : 0,
                      y: isChosen || !motionSafe ? 0 : -6,
                    }}
                    transition={{
                      duration: durations.base / speed,
                      ease: easings.enter,
                      delay:
                        isChosen && motionSafe ? (0.08 + i * step) / speed : 0,
                    }}
                  >
                    <StepRow as="div" step={s} style={style} tone="chosen" />
                  </motion.li>
                ))}
              </ol>
            </motion.div>
            <motion.p
              aria-hidden={isChosen || undefined}
              className="pl-[22px] font-mono text-[10.5px] leading-5 text-ink-3"
              initial={false}
              animate={{ opacity: isChosen ? 0 : 1, height: isChosen ? 0 : 20 }}
              transition={{
                duration: durations.base / speed,
                ease: easings.enter,
              }}
            >
              {`+ ${plural(extra.length, "more step", "more steps")}`}
            </motion.p>
          </>
        ) : null}
      </motion.div>

      {/* The stub: a short rail, a hollow node, the title turned on its side. */}
      <motion.div
        className={cn(
          "absolute inset-y-0 left-0 flex w-10 flex-col items-start",
          !withered && "pointer-events-none",
        )}
        style={{ opacity: stub }}
        aria-hidden={!withered || undefined}
        inert={!withered}
      >
        <span
          aria-hidden
          className="ml-[7px] h-5 w-0 border-l-2 border-dashed border-hairline-strong"
        />
        <span
          aria-hidden
          className="ml-[4px] size-2 rounded-full border-[1.5px] border-ink-3 bg-card"
        />
        <button
          type="button"
          onClick={onReopen}
          aria-label={`Reopen this crossroads: ${branch.title} was not taken`}
          aria-disabled={disabled || undefined}
          className={cn(
            "mt-1.5 flex size-7 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <CornerUpLeft aria-hidden className="size-3.5" />
        </button>
        <span
          aria-hidden
          className="mt-1.5 ml-[2px] max-h-[150px] truncate font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase [writing-mode:vertical-rl]"
        >
          {branch.title}
        </span>
      </motion.div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Decision                                 */
/* ----------------------------------------------------------------------- */

type DecisionProps = {
  decision: CrossroadsDecision;
  choice: string | undefined;
  pick: string;
  preview: number;
  style: CrossroadsBranchStyle;
  speed: number;
  motionSafe: boolean;
  disabled: boolean;
  uid: string;
  register: (key: string, node: HTMLElement | null) => void;
  onPick: (branchId: string, focus: boolean) => void;
  onChoose: (branchId: string) => void;
  onReopen: () => void;
};

function DecisionView({
  decision,
  choice,
  pick,
  preview,
  style,
  speed,
  motionSafe,
  disabled,
  uid,
  register,
  onPick,
  onChoose,
  onReopen,
}: DecisionProps) {
  const branches = decision.branches;
  const n = Math.max(1, branches.length);
  const grow = useMotionValue(choice ? 1 : 0);
  const [grower, setGrower] = React.useState(choice);
  if (choice && choice !== grower) setGrower(choice);
  const growerId = choice ?? grower;
  const questionId = `${uid}-${decision.id}-q`;

  React.useEffect(() => {
    if (!motionSafe) {
      grow.jump(choice ? 1 : 0);
      return;
    }
    const run = animate(grow, choice ? 1 : 0, scaledGlide(speed));
    return () => run.stop();
  }, [choice, motionSafe, speed, grow]);

  const order = branches.map((b) => b.id);
  const onRadioKey = (event: React.KeyboardEvent<HTMLElement>, id: string) => {
    const at = order.indexOf(id);
    const move = (to: number) => {
      const next = order[(to + order.length) % order.length];
      if (!next) return;
      event.preventDefault();
      onPick(next, true);
    };
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        return move(at + 1);
      case "ArrowLeft":
      case "ArrowUp":
        return move(at - 1);
      case "Home":
        return move(0);
      case "End":
        return move(order.length - 1);
      case "Enter":
      case " ":
        event.preventDefault();
        onChoose(id);
        return;
      default:
        return;
    }
  };

  const recommended = branches.find((b) => b.id === decision.recommended);
  const viewing = branches.find((b) => b.id === pick) ?? branches[0];
  const [firstView] = React.useState(viewing?.id);

  return (
    <div className="relative flex flex-col gap-2 py-1">
      <div
        className={cn(
          "relative flex items-start gap-2",
          style === "rails" ? "pl-[22px]" : "pl-0",
        )}
      >
        {style === "rails" ? (
          <span
            aria-hidden
            className={cn(
              "absolute top-0.5 left-0 flex size-4 items-center justify-center rounded-1 border-2 bg-card transition-colors duration-300",
              choice
                ? "border-(--cr-accent) text-(--cr-accent)"
                : "border-warn text-warn",
            )}
          >
            <GitFork className="size-2.5" strokeWidth={2.5} />
          </span>
        ) : null}
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {choice ? "Crossroads · decided" : "Crossroads · run held here"}
          </p>
          <p
            id={questionId}
            className="text-[13.5px] leading-snug font-semibold text-foreground"
          >
            {decision.question}
          </p>
          {recommended && decision.rationale ? (
            <p className="text-[12px] leading-4 text-ink-2">
              <span className="text-(--cr-ink)">{`Agent recommends ${recommended.title.toLowerCase()}: `}</span>
              {decision.rationale}
            </p>
          ) : null}
        </div>
      </div>

      {/* Wide: branch columns side by side. */}
      <div className="hidden @min-[36rem]/crossroads-plan:block">
        <div
          role={choice ? "group" : "radiogroup"}
          aria-labelledby={questionId}
          className="@container relative flex items-stretch"
          style={{ gap: GAP }}
        >
          {style === "rails" && n > 1 ? (
            <ForkLine
              grow={grow}
              n={n}
              growerIndex={order.indexOf(growerId ?? "")}
            />
          ) : null}
          {branches.map((b) => (
            <BranchColumn
              key={b.id}
              branch={b}
              n={n}
              grow={grow}
              isGrower={b.id === growerId}
              isChosen={b.id === choice}
              decided={Boolean(choice)}
              picked={b.id === pick}
              recommended={b.id === decision.recommended}
              preview={preview}
              style={style}
              speed={speed}
              motionSafe={motionSafe}
              disabled={disabled}
              radioKey={`radio:${decision.id}:${b.id}`}
              register={register}
              onRadioKey={(event) => onRadioKey(event, b.id)}
              onPick={() => onChoose(b.id)}
              onReopen={onReopen}
            />
          ))}
        </div>
      </div>

      {/* Narrow: the branches as tabs. */}
      <div className="flex flex-col gap-2 @min-[36rem]/crossroads-plan:hidden">
        <div
          role="tablist"
          aria-labelledby={questionId}
          className="flex flex-wrap gap-1"
        >
          {branches.map((b) => {
            const selected = b.id === (viewing?.id ?? "");
            const stubbed = Boolean(choice) && b.id !== choice;
            return (
              <TabButton
                key={b.id}
                id={`${uid}-${decision.id}-tab-${b.id}`}
                panelId={`${uid}-${decision.id}-panel`}
                registerKey={`tab:${decision.id}:${b.id}`}
                register={register}
                title={b.title}
                selected={selected}
                stubbed={stubbed}
                chosen={b.id === choice}
                recommended={b.id === decision.recommended}
                speed={speed}
                motionSafe={motionSafe}
                onSelect={() => onPick(b.id, false)}
                onKey={(event) => onRadioKey(event, b.id)}
              />
            );
          })}
        </div>
        {viewing ? (
          <TabPanel
            key={viewing.id}
            id={`${uid}-${decision.id}-panel`}
            labelledBy={`${uid}-${decision.id}-tab-${viewing.id}`}
            branch={viewing}
            chosen={viewing.id === choice}
            decided={Boolean(choice)}
            recommended={viewing.id === decision.recommended}
            preview={preview}
            style={style}
            speed={speed}
            motionSafe={motionSafe}
            fresh={viewing.id !== firstView}
            disabled={disabled}
            onChoose={() => onChoose(viewing.id)}
            onReopen={onReopen}
          />
        ) : null}
      </div>
    </div>
  );
}

function TabButton({
  id,
  panelId,
  registerKey,
  register,
  title,
  selected,
  stubbed,
  chosen,
  recommended,
  speed,
  motionSafe,
  onSelect,
  onKey,
}: {
  id: string;
  panelId: string;
  registerKey: string;
  register: (key: string, node: HTMLElement | null) => void;
  title: string;
  selected: boolean;
  stubbed: boolean;
  chosen: boolean;
  recommended: boolean;
  speed: number;
  motionSafe: boolean;
  onSelect: () => void;
  onKey: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const ref = React.useCallback(
    (node: HTMLButtonElement | null) => register(registerKey, node),
    [register, registerKey],
  );
  return (
    <motion.button
      ref={ref}
      type="button"
      role="tab"
      id={id}
      aria-selected={selected}
      aria-controls={panelId}
      aria-label={`${title}${chosen ? ", chosen" : stubbed ? ", not taken" : recommended ? ", recommended" : ""}`}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKey}
      className={cn(
        "relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-2 border px-2.5 text-[12px] whitespace-nowrap transition-colors",
        selected
          ? "border-(--cr-line) bg-(--cr-wash) text-foreground"
          : "border-hairline text-ink-2 hover:bg-surface-2",
        stubbed && !selected && "text-ink-3",
        FOCUS,
      )}
      initial={false}
      animate={{ maxWidth: stubbed && !selected ? 112 : 260 }}
      transition={motionSafe ? scaledGlide(speed) : { duration: 0 }}
    >
      {chosen ? (
        <Check
          aria-hidden
          className="size-3.5 shrink-0 text-(--cr-accent)"
          strokeWidth={3}
        />
      ) : stubbed ? (
        <CornerUpLeft aria-hidden className="size-3 shrink-0" />
      ) : recommended ? (
        <Sparkles aria-hidden className="size-3 shrink-0 text-(--cr-ink)" />
      ) : null}
      <span className="truncate">{title}</span>
    </motion.button>
  );
}

/** The horizontal stroke of the fork, from the plan's rail to the last branch's rail. */
function ForkLine({
  grow,
  n,
  growerIndex,
}: {
  grow: MotionValue<number>;
  n: number;
  growerIndex: number;
}) {
  const gaps = (n - 1) * GAP;
  const right = useTransform(grow, (v) => {
    const share = 1 / n;
    const last = n - 1;
    const isGrower = growerIndex === last;
    const f = isGrower ? share + (1 - share) * v : share * (1 - v);
    const fixed = isGrower ? -(n - 1) * STUB * v : STUB * v;
    return `calc(${r4(f)} * (100% - ${gaps}px) + ${r2(fixed - RAIL - 1)}px)`;
  });
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute top-0 left-[7px] h-0 border-t-2 border-hairline-strong"
      style={{ right }}
    />
  );
}

function TabPanel({
  id,
  labelledBy,
  branch,
  chosen,
  decided,
  recommended,
  preview,
  style,
  speed,
  motionSafe,
  fresh,
  disabled,
  onChoose,
  onReopen,
}: {
  id: string;
  fresh: boolean;
  labelledBy: string;
  branch: CrossroadsBranch;
  chosen: boolean;
  decided: boolean;
  recommended: boolean;
  preview: number;
  style: CrossroadsBranchStyle;
  speed: number;
  motionSafe: boolean;
  disabled: boolean;
  onChoose: () => void;
  onReopen: () => void;
}) {
  const steps = chosen ? branch.steps : branch.steps.slice(0, preview);
  const more = branch.steps.length - steps.length;
  const [mountChosen] = React.useState(chosen);
  return (
    <motion.div
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className={cn(
        "relative flex flex-col gap-1 rounded-3 p-2.5",
        style === "cards"
          ? cn(
              "border bg-surface-1",
              chosen ? "border-(--cr-line)" : "border-hairline",
            )
          : style === "lines"
            ? cn(
                "rounded-none border-l-2 py-1 pr-0 pl-2.5",
                chosen ? "border-(--cr-accent)" : "border-hairline",
              )
            : "border border-hairline",
        decided && !chosen && "opacity-70",
      )}
      initial={
        !fresh ? false : motionSafe ? { opacity: 0, y: 4 } : { opacity: 0 }
      }
      animate={{ opacity: decided && !chosen ? 0.7 : 1, y: 0 }}
      transition={{ duration: durations.base / speed, ease: easings.enter }}
    >
      {branch.summary ? (
        <p className="text-[12px] leading-4 text-ink-2">
          {recommended ? (
            <span className="text-(--cr-ink)">Recommended · </span>
          ) : null}
          {branch.summary}
        </p>
      ) : null}
      <div className="relative">
        {style === "rails" ? <Rail /> : null}
        <ol className="relative">
          {steps.map((s, i) => (
            <motion.li
              key={s.id}
              initial={
                chosen && !mountChosen && i >= preview && motionSafe
                  ? { opacity: 0, y: -6 }
                  : false
              }
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: durations.base / speed,
                ease: easings.enter,
                delay:
                  (Math.max(0, i - preview) * cascade(branch.steps.length)) /
                  speed,
              }}
            >
              <StepRow
                as="div"
                step={s}
                style={style}
                tone={chosen ? "chosen" : "live"}
              />
            </motion.li>
          ))}
        </ol>
      </div>
      {more > 0 ? (
        <p className="pl-[22px] font-mono text-[10.5px] text-ink-3">
          {`+ ${plural(more, "more step", "more steps")}`}
        </p>
      ) : null}
      {!decided ? (
        <button
          type="button"
          onClick={onChoose}
          aria-disabled={disabled || undefined}
          className={cn(
            "mt-1 inline-flex h-8 items-center justify-center gap-1.5 rounded-2 bg-(--cr-solid) px-3 text-[12px] font-medium text-(--cr-on) transition-colors hover:bg-[color-mix(in_oklab,var(--cr-solid)_88%,black)]",
            disabled && "opacity-60",
            FOCUS,
          )}
        >
          Take this path
        </button>
      ) : !chosen ? (
        <button
          type="button"
          onClick={onReopen}
          aria-disabled={disabled || undefined}
          className={cn(
            "mt-1 inline-flex h-8 items-center justify-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
            FOCUS,
          )}
        >
          <CornerUpLeft aria-hidden className="size-3.5" />
          Reopen this crossroads
        </button>
      ) : null}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The surface                               */
/* ----------------------------------------------------------------------- */

/**
 * A plan that stops at its open questions. It runs on a rail until it meets
 * a crossroads; there the rail forks into the branches on offer, each
 * previewed a few steps deep, with the agent's recommendation marked and
 * its reason in one line. The run holds at the first undecided crossroads
 * and everything after it folds into one faded line.
 *
 * Choosing drives one value per crossroads on `springs.glide`: the chosen
 * column widens to the full width while its remaining steps grow downward
 * on a cascade, and the branch not taken withers — its content fades as its
 * column narrows to a 40px stub that keeps a short dashed rail, a hollow node,
 * a Reopen button and its title turned on its side. `witherSpeed` scales
 * that spring (stiffness by speed², damping by speed, so its character never
 * changes). The next crossroads then unfolds below.
 *
 * Left and Right pick a branch, Enter chooses, Backspace reopens the last
 * crossroads; under 36rem the branches become tabs with the same keys. Under
 * reduced motion the columns jump to their widths and the stub cross-fades.
 */
export function CrossroadsPlan({
  plan = defaultCrossroadsPlan,
  choices: choicesProp,
  defaultChoices = NO_CHOICES,
  onChooseBranch,
  onReopen,
  onApprove,
  preview = 3,
  branchStyle = "rails",
  witherSpeed = 1,
  accent = "var(--accent-bright)",
  title = "Switch freight vendors",
  product = "Fieldline",
  maxHeight,
  status = "ready",
  onRetry,
  label,
  disabled = false,
  className,
}: CrossroadsPlanProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const approveHintId = `${uid}-approve-hint`;
  const speed = clamp(witherSpeed, 0.25, 4);
  const shownPreview = Math.max(1, Math.round(preview));

  /* ------------------------------- values ------------------------------- */

  const [ownChoices, setOwnChoices] =
    React.useState<Record<string, string>>(defaultChoices);
  const choices = choicesProp ?? ownChoices;
  const decisions = plan.flatMap((s) =>
    s.kind === "decision" ? [s.decision] : [],
  );
  const valid = (d: CrossroadsDecision) => {
    const c = choices[d.id];
    return c && d.branches.some((b) => b.id === c) ? c : undefined;
  };
  const decided = decisions.filter((d) => valid(d));
  const firstOpen = decisions.find((d) => !valid(d));
  const allDecided = decisions.length > 0 && !firstOpen;

  const [picks, setPicks] = React.useState<Record<string, string>>({});
  const pickOf = (d: CrossroadsDecision) =>
    valid(d) ??
    (picks[d.id] && d.branches.some((b) => b.id === picks[d.id])
      ? (picks[d.id] as string)
      : (d.recommended ?? d.branches[0]?.id ?? ""));

  const [announcement, setAnnouncement] = React.useState("");
  const [approved, setApproved] = React.useState<string | null>(null);
  const choiceKey = decisions.map((d) => `${d.id}:${valid(d) ?? ""}`).join("|");

  /* ------------------------------- focus -------------------------------- */

  const nodes = React.useRef(new Map<string, HTMLElement | null>());
  const register = React.useCallback(
    (key: string, node: HTMLElement | null) => {
      nodes.current.set(key, node);
    },
    [],
  );
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  // A plan that scrolls inside itself says so with a soft fade at the
  // bottom edge, gone once the last line is in view.
  const [more, setMore] = React.useState(false);
  const [scroller, setScroller] = React.useState<HTMLDivElement | null>(null);
  const bindScroller = React.useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    setScroller(node);
  }, []);
  const checkMore = React.useCallback((node: HTMLElement) => {
    setMore(node.scrollHeight - node.scrollTop - node.clientHeight > 4);
  }, []);
  React.useEffect(() => {
    if (!scroller || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => checkMore(scroller));
    ro.observe(scroller);
    for (const child of Array.from(scroller.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [scroller, checkMore]);
  const approveRef = React.useRef<HTMLButtonElement | null>(null);
  const [focusAsk, setFocusAsk] = React.useState<{
    keys: string[];
    n: number;
  } | null>(null);
  const askFocus = (keys: string[]) =>
    setFocusAsk((f) => ({ keys, n: (f?.n ?? 0) + 1 }));

  // Focus moves after the commit that drew its target, onto whichever of the
  // two forms is on screen, and the plan scrolls inside itself — never the page.
  React.useEffect(() => {
    if (!focusAsk) return;
    const target = focusAsk.keys
      .map((k) => (k === "approve" ? approveRef.current : nodes.current.get(k)))
      .find((el) => el && el.isConnected && el.getClientRects().length > 0);
    if (!target) return;
    target.focus({ preventScroll: true });
    const box = scrollRef.current;
    if (!box || box.scrollHeight <= box.clientHeight) return;
    const b = box.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    if (r.top < b.top + 8 || r.bottom > b.bottom - 8) {
      box.scrollTo({
        top: box.scrollTop + (r.top - b.top) - 48,
        behavior: motionSafe ? "smooth" : "auto",
      });
    }
  }, [focusAsk, motionSafe]);

  const keysFor = (d: CrossroadsDecision, branch: string) => [
    `radio:${d.id}:${branch}`,
    `tab:${d.id}:${branch}`,
  ];

  /* ------------------------------ actions ------------------------------- */

  const setChoice = (next: Record<string, string>) => {
    if (choicesProp === undefined) setOwnChoices(next);
  };

  const choose = (d: CrossroadsDecision, branchId: string) => {
    if (disabled || valid(d) === branchId) return;
    const branch = d.branches.find((b) => b.id === branchId);
    if (!branch) return;
    const next = { ...choices, [d.id]: branchId };
    setChoice(next);
    onChooseBranch?.(d.id, branchId);
    setApproved(null);
    const after = decisions.find((x) => x.id !== d.id && !next[x.id]);
    setAnnouncement(
      `Chose ${branch.title}. ${
        after
          ? `Next crossroads: ${after.question}`
          : "Every crossroads is decided."
      }`,
    );
    askFocus(after ? keysFor(after, pickOf(after)) : ["approve"]);
  };

  const reopen = (d: CrossroadsDecision) => {
    if (disabled || !valid(d)) return;
    const was = valid(d) ?? "";
    const next = { ...choices };
    delete next[d.id];
    setChoice(next);
    onReopen?.(d.id);
    setApproved(null);
    setPicks((p) => ({ ...p, [d.id]: was }));
    setAnnouncement(`Reopened: ${d.question}`);
    askFocus(keysFor(d, was));
  };

  const pick = (d: CrossroadsDecision, branchId: string, focus: boolean) => {
    setPicks((p) => ({ ...p, [d.id]: branchId }));
    if (focus) askFocus(keysFor(d, branchId));
  };

  const onRootKey = (event: React.KeyboardEvent<HTMLElement>) => {
    if (
      event.key !== "Backspace" ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    )
      return;
    const t = event.target as HTMLElement;
    if (t.closest("input, textarea, [contenteditable='true']")) return;
    const last = [...decided].pop();
    if (!last) return;
    event.preventDefault();
    reopen(last);
  };

  const approve = () => {
    if (disabled || !allDecided) {
      setAnnouncement(
        firstOpen
          ? `Choose at the crossroads first: ${firstOpen.question}`
          : "",
      );
      return;
    }
    const picked: Record<string, string> = {};
    for (const d of decisions) picked[d.id] = valid(d) ?? "";
    onApprove?.(picked);
    setApproved(choiceKey);
    setAnnouncement("Plan approved; the run continues.");
  };

  /* ------------------------------- styles ------------------------------- */

  const vars = {
    "--cr-accent": accent,
    "--cr-ink": `color-mix(in oklab, ${accent} 85%, var(--foreground))`,
    "--cr-wash": `color-mix(in oklab, ${accent} 12%, transparent)`,
    "--cr-line": `color-mix(in oklab, ${accent} 50%, transparent)`,
    "--cr-solid": `oklch(from ${accent} 0.56 c h)`,
    "--cr-on": "oklch(0.99 0.004 262)",
  } as React.CSSProperties;

  const isApproved = approved === choiceKey && allDecided;
  const chip = isApproved
    ? { text: "Approved", ink: "text-success", dot: "bg-success" }
    : allDecided
      ? { text: "Ready to run", ink: "text-success", dot: "bg-success" }
      : {
          text: "Run held at a crossroads",
          ink: "text-warn",
          dot: "bg-warn",
          short: "Run held",
        };

  /* -------------------------------- body -------------------------------- */

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div aria-busy className="flex flex-col gap-3 px-4 py-5">
        <span className="sr-only">Loading the plan</span>
        {[0.6, 0.72, 0.5, 0.8].map((w, i) => (
          <span key={i} aria-hidden className="flex items-center gap-3">
            <span className="size-2 rounded-full bg-surface-2" />
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
        <p className="text-sm text-foreground">The plan did not load.</p>
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
  } else if (plan.length === 0) {
    body = (
      <p className="px-4 py-8 text-center text-sm text-ink-2">No plan yet.</p>
    );
  } else {
    let held = false;
    const parts: React.ReactNode[] = [];
    const after: CrossroadsSegment[] = [];
    for (const seg of plan) {
      if (held) {
        after.push(seg);
        continue;
      }
      if (seg.kind === "steps") {
        parts.push(
          <div key={seg.id} className="relative">
            {branchStyle === "rails" ? <Rail /> : null}
            <ol className="relative">
              {seg.steps.map((s) => (
                <StepRow key={s.id} step={s} style={branchStyle} tone="live" />
              ))}
            </ol>
          </div>,
        );
        continue;
      }
      const d = seg.decision;
      const choice = valid(d);
      parts.push(
        <DecisionView
          key={d.id}
          decision={d}
          choice={choice}
          pick={pickOf(d)}
          preview={shownPreview}
          style={branchStyle}
          speed={speed}
          motionSafe={motionSafe}
          disabled={disabled}
          uid={uid}
          register={register}
          onPick={(b, focus) => pick(d, b, focus)}
          onChoose={(b) => choose(d, b)}
          onReopen={() => reopen(d)}
        />,
      );
      if (!choice) held = true;
    }
    if (after.length) {
      const stepsAfter = after.flatMap((s) =>
        s.kind === "steps" ? s.steps : [],
      );
      const moreForks = after.filter((s) => s.kind === "decision").length;
      parts.push(
        <div key="__then" className="relative py-1.5 pl-[22px]">
          {branchStyle === "rails" ? <Rail dashed /> : null}
          <p className="text-[12px] leading-4 text-ink-3">
            {`Then ${stepsAfter[0]?.title.toLowerCase() ?? "the rest"}${
              stepsAfter.length > 1
                ? ` and ${plural(stepsAfter.length - 1, "more step", "more steps")}`
                : ""
            }${moreForks ? `, and ${plural(moreForks, "more crossroads", "more crossroads")}` : ""} — held until you choose.`}
          </p>
        </div>,
      );
    } else if (allDecided) {
      parts.push(
        <div
          key="__end"
          className="relative flex items-center gap-2 py-1.5 pl-[22px]"
        >
          <span
            aria-hidden
            className={cn(
              "absolute top-[9px] left-[3px] size-2.5 rounded-full bg-(--cr-solid)",
              branchStyle !== "rails" && "left-[2px]",
            )}
          />
          <p className="font-mono text-[10.5px] tracking-[0.06em] text-ink-3 uppercase">
            End of plan
          </p>
        </div>,
      );
    }
    body = (
      <div
        ref={bindScroller}
        onScroll={(event) => checkMore(event.currentTarget)}
        className={cn(
          "flex flex-col gap-1.5 px-4 py-3",
          maxHeight !== undefined &&
            "[scrollbar-width:thin] overflow-y-auto overscroll-contain",
          maxHeight !== undefined &&
            more &&
            "[mask-image:linear-gradient(to_bottom,black_calc(100%-28px),transparent)]",
        )}
        style={maxHeight !== undefined ? { maxHeight } : undefined}
      >
        {parts}
      </div>
    );
  }

  return (
    <section
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      onKeyDown={onRootKey}
      className={cn(
        "@container/crossroads-plan w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={vars}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-mono text-[10.5px] tracking-[0.08em] text-ink-3 uppercase">
            {`${product} · ${decided.length} of ${decisions.length} decided`}
          </p>
          <p id={titleId} className="text-[15px] leading-tight font-semibold">
            {title}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-full border border-hairline px-2 text-[11px] font-medium transition-colors",
              chip.ink,
            )}
          >
            <span
              aria-hidden
              className={cn("size-1.5 rounded-full", chip.dot)}
            />
            {"short" in chip ? (
              <>
                <span className="@min-[30rem]/crossroads-plan:hidden">
                  {chip.short}
                </span>
                <span className="hidden @min-[30rem]/crossroads-plan:inline">
                  {chip.text}
                </span>
              </>
            ) : (
              chip.text
            )}
          </span>
          <button
            ref={approveRef}
            type="button"
            onClick={approve}
            aria-disabled={!allDecided || disabled || undefined}
            aria-describedby={!allDecided ? approveHintId : undefined}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-2 px-2.5 text-[12px] font-medium transition-[background-color,color]",
              allDecided
                ? "bg-(--cr-solid) text-(--cr-on) hover:bg-[color-mix(in_oklab,var(--cr-solid)_88%,black)]"
                : "bg-surface-2 text-ink-3",
              FOCUS,
            )}
          >
            {isApproved ? <Check aria-hidden className="size-3.5" /> : null}
            {isApproved ? "Approved" : "Approve plan"}
          </button>
          {!allDecided ? (
            <span id={approveHintId} className="sr-only">
              {firstOpen
                ? `Choose at the crossroads first: ${firstOpen.question}`
                : ""}
            </span>
          ) : null}
        </div>
      </header>
      <p className="sr-only">
        At a crossroads, Left and Right pick a branch and Enter chooses it.
        Backspace reopens the last crossroads.
      </p>
      {body}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
