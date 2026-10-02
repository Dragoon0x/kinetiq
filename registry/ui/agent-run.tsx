"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  Ban,
  Check,
  ChevronDown,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type AgentStepKind =
  "plan" | "read" | "tool" | "write" | "send" | "check";

export type AgentGate = {
  /** What the step will do, in a line: "Send 2 payouts · 1,180.00". */
  title: string;
  /** Why it needs a person: what it touches and whether it can be undone. */
  detail: string;
  /** The approving verb. Hold mode prints "Hold to <verb>". @default "Approve" */
  approveLabel?: string;
  /** @default "Deny" */
  denyLabel?: string;
};

export type AgentStep = {
  id: string;
  title: string;
  kind?: AgentStepKind;
  /** The tool the step calls, printed in mono. */
  tool?: string;
  /** How long the step runs, ms. */
  ms: number;
  /** What the step costs, in cents, accrued evenly while it runs. */
  cost?: number;
  /** The call's arguments. */
  input?: string;
  /** What came back. */
  output?: string;
  /** The step fails with this message; the run carries on unless it was the last. */
  error?: string;
  /** A risky step: the run waits for a person before it starts. */
  gate?: AgentGate;
};

export type AgentRunData = {
  id: string;
  title: string;
  /** Who is running it. */
  agent: string;
  /** What it runs on. */
  model: string;
  /** The run's budget, in cents: the cost meter's full scale. */
  budget?: number;
  steps: AgentStep[];
};

export type AgentDecision = "approved" | "denied";
export type AgentRunState =
  "running" | "paused" | "waiting" | "finished" | "failed" | "stopped";
export type AgentDetail = "compact" | "standard" | "full";
export type AgentApproval = "hold" | "click" | "auto";

export type AgentRunProps = {
  /** The run log. @default defaultRun */
  run?: AgentRunData;
  /** Controlled clock: ms since the run started. The host owns time. */
  now?: number;
  /** Where the console's own clock starts, ms. @default 0 */
  defaultNow?: number;
  /** A scrub, a seek or Replay asked for a new time. */
  onNowChange?: (ms: number) => void;
  /** Controlled play state of the console's own clock. */
  playing?: boolean;
  /** Plays as soon as it is on screen. @default true */
  defaultPlaying?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  /** How fast the console's clock runs, as a multiple of real time. @default 1 */
  speed?: number;
  /** Titles only, a one-line call under each, or every call opened. @default "standard" */
  detail?: AgentDetail;
  /** Approve a gated step with a press and hold, a plain click, or let policy approve it. @default "hold" */
  approval?: AgentApproval;
  /** How long the approve button has to be held, ms. @default 700 */
  holdMs?: number;
  /** A gated step was approved or denied. */
  onDecision?: (stepId: string, decision: AgentDecision) => void;
  /** The run moved on: from its own clock, a scrub, a decision, or play and pause. */
  onStateChange?: (state: AgentRunState, step: AgentStep | null) => void;
  /** Replay was pressed: decisions are cleared and the clock goes back to zero. */
  onReplay?: () => void;
  /** Whether the run log is there yet. @default "ready" */
  status?: "ready" | "loading" | "error";
  /** Retry on the error state. */
  onRetry?: () => void;
  /** How a cost in cents is shown. @default US dollars */
  formatCost?: (cents: number) => string;
  /** The console's accessible name. @default the run's title */
  label?: string;
  /** Play the approval, the scrub ticks and the controls. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

export const defaultRun: AgentRunData = {
  id: "run-0331",
  title: "Reconcile March payouts",
  agent: "Ledger agent",
  model: "Gaugeworks Reasoner",
  budget: 50,
  steps: [
    {
      id: "plan",
      kind: "plan",
      title: "Plan the reconciliation",
      ms: 900,
      cost: 2,
      output:
        "1. Read unsettled March payouts\n2. Match them against bank statements\n3. Draft a file for anything missing\n4. Send it, with approval\n5. Post a summary for finance",
    },
    {
      id: "read",
      kind: "read",
      title: "Read the March payout ledger",
      tool: "ledger.query",
      ms: 1600,
      cost: 4,
      input: '{ "month": "2026-03", "status": "unsettled" }',
      output: "14 rows · 18,240.00 total · 2 flagged",
    },
    {
      id: "match",
      kind: "tool",
      title: "Match against bank statements",
      tool: "bank.statements",
      ms: 2000,
      cost: 3,
      input: '{ "account": "••4417", "from": "03-01", "to": "03-31" }',
      error: "Statement export timed out after 30 s",
    },
    {
      id: "retry",
      kind: "tool",
      title: "Retry with a smaller window",
      tool: "bank.statements",
      ms: 1500,
      cost: 3,
      input: '{ "account": "••4417", "from": "03-15", "to": "03-31" }',
      output: "212 lines · 12 matched · 2 missing",
    },
    {
      id: "draft",
      kind: "write",
      title: "Draft the payout file",
      tool: "files.write",
      ms: 1200,
      cost: 5,
      input: '{ "path": "payouts/2026-03-late.csv", "rows": 2 }',
      output: "payouts/2026-03-late.csv · 2 rows · 1,180.00",
    },
    {
      id: "send",
      kind: "send",
      title: "Send 2 late payouts",
      tool: "pay.send",
      ms: 1400,
      cost: 2,
      input: '{ "file": "payouts/2026-03-late.csv", "from": "••4417" }',
      output: "2 payouts queued · settle 3 Apr",
      gate: {
        title: "Send 2 payouts · 1,180.00",
        detail:
          "Moves money from Coldbrook Bank ••4417 to two Waylight Pay accounts. A sent payout cannot be recalled.",
        approveLabel: "Send",
        denyLabel: "Don't send",
      },
    },
    {
      id: "summary",
      kind: "check",
      title: "Post the summary for finance",
      tool: "notes.post",
      ms: 1000,
      cost: 4,
      input: '{ "channel": "finance-ops" }',
      output: "Posted to finance-ops",
    },
  ],
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const usd = (cents: number) => USD.format(Math.round(cents) / 100);

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const pad = (n: number) => String(n).padStart(2, "0");
/** "01:07.2": minutes, seconds, tenths. */
const clockText = (ms: number) => {
  const tenths = Math.max(0, Math.round(ms / 100));
  const s = Math.floor(tenths / 10);
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}.${tenths % 10}`;
};
const secs = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(1)} s`;
/** The call on one line: whitespace folded, so it truncates cleanly. */
const oneLine = (text?: string) => (text ?? "").replace(/\s+/g, " ").trim();

const subscribeVisible = (cb: () => void) => {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
};
const visibleNow = () => document.visibilityState !== "hidden";
const visibleOnServer = () => true;
const noSubscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/* ------------------------------- the plan ------------------------------- */

type Decided = { decision: AgentDecision; at: number };
type GateState = "none" | "pending" | "approved" | "denied" | "auto";
type Seg = {
  step: AgentStep;
  index: number;
  start: number;
  end: number;
  /** Skipped and denied steps never run. */
  runs: boolean;
  gate: GateState;
  decidedAt?: number;
};
type Plan = {
  segs: Seg[];
  /** Where the run ends: the planned end, or where it was denied. */
  total: number;
  /** As far as the clock may go now: an undecided gate, or the end. */
  stop: number;
  waitingAt: number | null;
  gateIndex: number;
  deniedAt: number | null;
  boundaries: number[];
};
type StepState =
  "pending" | "running" | "done" | "failed" | "waiting" | "skipped" | "denied";

/**
 * Lays the run out in time. Steps run back to back; a gated step starts when
 * it is approved (never before the step ahead of it ends), and an undecided
 * gate is where the clock has to stop. Steps after it keep their planned
 * places so the timeline can still show the whole run.
 */
function planRun(
  steps: AgentStep[],
  decisions: Record<string, Decided>,
  approval: AgentApproval,
): Plan {
  const segs: Seg[] = [];
  let t = 0;
  let waitingAt: number | null = null;
  let deniedAt: number | null = null;
  let gateIndex = -1;
  steps.forEach((step, index) => {
    let gate: GateState = "none";
    let decidedAt: number | undefined;
    if (step.gate) {
      if (approval === "auto") gate = "auto";
      else if (waitingAt !== null || deniedAt !== null) gate = "pending";
      else {
        const d = decisions[step.id];
        if (!d) {
          gate = "pending";
          waitingAt = t;
          gateIndex = index;
        } else if (d.decision === "denied") {
          gate = "denied";
          deniedAt = Math.max(t, d.at);
          decidedAt = deniedAt;
          gateIndex = index;
        } else {
          gate = "approved";
          decidedAt = Math.max(t, d.at);
          t = decidedAt;
        }
      }
    }
    const runs = deniedAt === null;
    segs.push({
      step,
      index,
      start: t,
      end: t + step.ms,
      runs,
      gate,
      decidedAt,
    });
    if (runs) t += step.ms;
  });
  const total = deniedAt ?? t;
  const stop = waitingAt ?? total;
  const marks = new Set<number>([total]);
  for (const s of segs) {
    if (!s.runs) continue;
    if (waitingAt !== null && s.index >= gateIndex) continue;
    marks.add(s.start);
    marks.add(s.end);
  }
  if (waitingAt !== null) marks.add(waitingAt);
  if (deniedAt !== null) marks.add(deniedAt);
  const boundaries = [...marks].sort((a, b) => a - b);
  return { segs, total, stop, waitingAt, gateIndex, deniedAt, boundaries };
}

function stateOf(seg: Seg, plan: Plan, c: number): StepState {
  if (!seg.runs) {
    const at = plan.deniedAt ?? Infinity;
    if (c < at)
      return c >= seg.start && seg.index === plan.gateIndex
        ? "waiting"
        : "pending";
    return seg.index === plan.gateIndex ? "denied" : "skipped";
  }
  if (plan.waitingAt !== null && seg.index >= plan.gateIndex) {
    return seg.index === plan.gateIndex && c >= plan.waitingAt
      ? "waiting"
      : "pending";
  }
  if (c < seg.start) return "pending";
  if (c < seg.end) return "running";
  return seg.step.error ? "failed" : "done";
}

function runStateOf(plan: Plan, c: number, playing: boolean): AgentRunState {
  if (plan.deniedAt !== null && c >= plan.deniedAt) return "stopped";
  if (plan.waitingAt !== null && c >= plan.waitingAt) return "waiting";
  if (c >= plan.total) {
    const last = [...plan.segs].reverse().find((s) => s.runs);
    return last?.step.error ? "failed" : "finished";
  }
  return playing ? "running" : "paused";
}

/** The step the run is on at `c`: the one running, waiting, or the last one reached. */
function currentOf(plan: Plan, c: number): Seg | null {
  let cur: Seg | null = null;
  for (const s of plan.segs) {
    const st = stateOf(s, plan, c);
    if (st === "running" || st === "waiting") return s;
    if (st !== "pending") cur = s;
  }
  return cur ?? plan.segs[0] ?? null;
}

const keyOf = (plan: Plan, c: number) => {
  let n = 0;
  for (const b of plan.boundaries) if (b <= c) n += 1;
  return n;
};

const costAt = (plan: Plan, c: number) => {
  let sum = 0;
  for (const s of plan.segs) {
    if (!s.runs || !s.step.cost) continue;
    if (plan.waitingAt !== null && s.index >= plan.gateIndex) continue;
    sum += s.step.cost * clamp01((c - s.start) / Math.max(1, s.step.ms));
  }
  return sum;
};

/* ------------------------------ small parts ----------------------------- */

/** Opens to its content's measured height on glide; stays mounted, inert while shut. */
function Fold({
  open,
  motionSafe,
  id,
  className,
  children,
}: {
  open: boolean;
  motionSafe: boolean;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [height, setHeight] = React.useState<number | null>(null);
  const measure = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => {
      const h = entry?.borderBoxSize?.[0]?.blockSize ?? node.offsetHeight;
      setHeight(r2(h));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div
      id={id}
      inert={!open}
      initial={false}
      animate={{
        height: open ? (height ?? "auto") : 0,
        opacity: open ? 1 : 0,
      }}
      transition={{
        height: motionSafe ? springs.glide : { duration: 0 },
        opacity: open
          ? { duration: durations.base, ease: easings.enter }
          : exitFor(durations.fast),
      }}
      className="overflow-hidden"
    >
      <div ref={measure} className={className}>
        {children}
      </div>
    </motion.div>
  );
}

function Node({
  state,
  spin,
  fresh,
  motionSafe,
}: {
  state: StepState;
  spin: boolean;
  fresh: boolean;
  motionSafe: boolean;
}) {
  const filled =
    state === "done" ||
    state === "failed" ||
    state === "waiting" ||
    state === "denied";
  return (
    <span
      aria-hidden
      className="relative flex size-5 shrink-0 items-center justify-center"
    >
      <span
        className={cn(
          "absolute inset-0 rounded-full border transition-colors duration-200",
          state === "pending" && "border-hairline-strong",
          state === "skipped" && "border-dashed border-hairline-strong",
          state === "running" && "border-cobalt-bright/30",
          filled && "border-transparent",
        )}
      />
      {state === "running" ? (
        <span
          className={cn(
            "absolute inset-0 rounded-full border-2 border-transparent border-t-cobalt-bright",
            spin && "animate-spin",
          )}
        />
      ) : null}
      <AnimatePresence initial={false}>
        {filled ? (
          <motion.span
            key={state}
            initial={fresh && motionSafe ? { scale: 0.4, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe ? springs.flick : { duration: durations.fast }
            }
            className={cn(
              "absolute inset-0 flex items-center justify-center rounded-full text-primary-foreground",
              state === "done" && "bg-[oklch(from_var(--success)_0.62_c_h)]",
              state === "failed" && "bg-[oklch(from_var(--danger)_0.6_c_h)]",
              state === "denied" && "bg-surface-2 text-ink-2",
              state === "waiting" &&
                "bg-[oklch(from_var(--warn)_0.78_c_h)] text-[oklch(from_var(--warn)_0.3_c_h)]",
            )}
          >
            {state === "done" ? (
              <svg viewBox="0 0 16 16" className="size-3">
                <motion.path
                  d="M3.5 8.4 6.6 11.2 12.5 4.9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={fresh && motionSafe ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={springs.flick}
                />
              </svg>
            ) : state === "failed" ? (
              <X className="size-3" strokeWidth={2.6} />
            ) : state === "denied" ? (
              <Ban className="size-3" strokeWidth={2.4} />
            ) : (
              <span className="text-[11px] leading-none font-bold">!</span>
            )}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

function CallBlock({
  label,
  text,
  tone = "plain",
}: {
  label: string;
  text: string;
  tone?: "plain" | "quiet" | "danger";
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-2 border bg-surface-1",
        tone === "danger" ? "border-danger/30" : "border-hairline",
      )}
    >
      <p className="px-2.5 pt-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        {label}
      </p>
      <pre
        className={cn(
          "px-2.5 pt-1 pb-2 font-mono text-[11px] leading-4 break-words whitespace-pre-wrap",
          tone === "danger"
            ? "text-danger"
            : tone === "quiet"
              ? "text-ink-3"
              : "text-ink-2",
        )}
      >
        {text}
      </pre>
    </div>
  );
}

/**
 * Approve by holding: a fill sweeps across in exactly `holdMs` (linear, since
 * it is a clock), drains on the exit ease if let go early, and latches once
 * full so a stray leave cannot undo it. Space or Enter held does the same; an
 * activation with no key or pointer behind it asks to be pressed again.
 */
function HoldButton({
  label,
  confirmLabel,
  doneLabel,
  holdMs,
  done,
  disabled,
  describedBy,
  onDone,
}: {
  label: string;
  confirmLabel: string;
  doneLabel: string;
  holdMs: number;
  done: boolean;
  disabled: boolean;
  describedBy: string;
  onDone: (el: HTMLButtonElement | null) => void;
}) {
  const charge = useMotionValue(done ? 1 : 0);
  const ref = React.useRef<HTMLButtonElement | null>(null);
  const fill = React.useRef<AnimationPlaybackControls | null>(null);
  const holding = React.useRef<"pointer" | "key" | null>(null);
  const startedAt = React.useRef(0);
  const keyUpAt = React.useRef(-1e9);
  const latched = React.useRef(done);
  const detach = React.useRef<(() => void) | null>(null);
  const hintTimer = React.useRef(0);
  const [hint, setHint] = React.useState<"hold" | "confirm" | null>(null);
  const [held, setHeld] = React.useState(false);

  const flash = (kind: "hold" | "confirm") => {
    setHint(kind);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(
      () => setHint(null),
      kind === "confirm" ? 4000 : 1600,
    );
  };

  const finish = () => {
    if (latched.current) return;
    latched.current = true;
    holding.current = null;
    detach.current?.();
    detach.current = null;
    setHeld(false);
    charge.set(1);
    onDone(ref.current);
  };

  const start = (source: "pointer" | "key") => {
    if (disabled || latched.current || holding.current) return;
    holding.current = source;
    startedAt.current = performance.now();
    setHeld(true);
    setHint(null);
    fill.current?.stop();
    fill.current = animate(charge, 1, {
      duration: ((1 - charge.get()) * holdMs) / 1000,
      ease: "linear",
      onComplete: finish,
    });
  };

  const release = (source: "pointer" | "key") => {
    if (holding.current !== source) return;
    holding.current = null;
    detach.current?.();
    detach.current = null;
    setHeld(false);
    if (latched.current) return;
    fill.current?.stop();
    if (performance.now() - startedAt.current < 220) flash("hold");
    fill.current = animate(charge, 0, {
      duration: durations.base,
      ease: easings.exit,
    });
  };

  React.useEffect(() => {
    const timer = hintTimer;
    return () => {
      fill.current?.stop();
      detach.current?.();
      window.clearTimeout(timer.current);
    };
  }, []);

  const scaleX = useTransform(charge, (v) => r3(v));
  const text = done
    ? doneLabel
    : hint === "confirm"
      ? confirmLabel
      : hint === "hold"
        ? "Press and hold"
        : held
          ? "Keep holding"
          : label;

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      aria-describedby={describedBy}
      aria-label={done ? doneLabel : hint === "confirm" ? confirmLabel : label}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        const id = event.pointerId;
        const up = (e: PointerEvent) => {
          if (e.pointerId === id) release("pointer");
        };
        detach.current?.();
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
        detach.current = () => {
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
        };
        start("pointer");
      }}
      onPointerLeave={() => release("pointer")}
      onKeyDown={(event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        if (!event.repeat) start("key");
      }}
      onKeyUp={(event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        keyUpAt.current = performance.now();
        release("key");
      }}
      onBlur={() => release("key")}
      onClick={(event) => {
        // Pointer and key presses are holds. A click from neither (assistive
        // technology) arms a second press instead.
        if (event.detail !== 0 || done) return;
        if (performance.now() - keyUpAt.current < 400) return;
        if (hint === "confirm") finish();
        else flash("confirm");
      }}
      onContextMenu={(event) => event.preventDefault()}
      className={cn(
        "relative inline-flex h-9 items-center justify-center gap-2 overflow-hidden rounded-2 border px-4 text-[13px] font-medium select-none [-webkit-touch-callout:none]",
        done
          ? "border-transparent bg-[oklch(from_var(--success)_0.58_c_h)] text-primary-foreground"
          : "border-hairline-strong bg-surface-2 text-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
        FOCUS,
      )}
    >
      {done ? null : (
        <motion.span
          aria-hidden
          className="absolute inset-0 origin-left bg-[color-mix(in_oklab,var(--success)_30%,transparent)]"
          style={{ scaleX }}
        />
      )}
      {/* Every label in one cell, only one shown: the button keeps the
          width of the longest, so its edge never slides out from under a
          finger that is holding it. */}
      <span className="relative grid">
        {[label, confirmLabel, "Press and hold", "Keep holding", doneLabel].map(
          (t) => (
            <span
              key={t}
              aria-hidden
              className={cn(
                "col-start-1 row-start-1 flex items-center justify-center gap-2 whitespace-nowrap",
                t !== text && "invisible",
              )}
            >
              {t === doneLabel ? (
                done ? (
                  <motion.span
                    initial={{ scale: 0.5 }}
                    animate={{ scale: 1 }}
                    transition={springs.recoil}
                    className="flex"
                  >
                    <Check className="size-4" strokeWidth={2.4} />
                  </motion.span>
                ) : (
                  <Check className="size-4" strokeWidth={2.4} />
                )
              ) : null}
              {t}
            </span>
          ),
        )}
      </span>
    </button>
  );
}

type RowProps = {
  seg: Seg;
  state: StepState;
  total: number;
  clock: MotionValue<number>;
  open: boolean;
  focusable: boolean;
  detail: AgentDetail;
  approval: AgentApproval;
  holdMs: number;
  landing: boolean;
  fresh: boolean;
  spin: boolean;
  motionSafe: boolean;
  disabled: boolean;
  uid: string;
  epoch: number;
  bind: (node: HTMLButtonElement | null) => void;
  onToggle: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onFocus: () => void;
  onApprove: (el: HTMLButtonElement | null) => void;
  onDeny: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

function StepRow({
  seg,
  state,
  total,
  clock,
  open,
  focusable,
  detail,
  approval,
  holdMs,
  landing,
  fresh,
  spin,
  motionSafe,
  disabled,
  uid,
  epoch,
  bind,
  onToggle,
  onKeyDown,
  onFocus,
  onApprove,
  onDeny,
}: RowProps) {
  const { step } = seg;
  const callId = `${uid}-call-${step.id}`;
  const gateText = `${uid}-gate-${step.id}`;
  const holdHint = `${uid}-hold-${step.id}`;
  const live = useTransform(clock, (c) =>
    secs(Math.min(step.ms, Math.max(0, c - seg.start))),
  );
  const gate = step.gate;
  const verb = gate?.approveLabel ?? "Approve";
  const gateOpen =
    !!gate && approval !== "auto" && (state === "waiting" || landing);
  // Approved stays drawn as approved while the gate folds away.
  const approved = landing || seg.gate === "approved";
  const stamp =
    gate && !gateOpen
      ? seg.gate === "approved" && state !== "pending"
        ? {
            tone: "ok" as const,
            text: `Approved by you · ${clockText(seg.decidedAt ?? seg.start)}`,
          }
        : seg.gate === "denied" && state === "denied"
          ? { tone: "no" as const, text: "Denied · nothing was sent" }
          : seg.gate === "auto" && state !== "pending"
            ? { tone: "auto" as const, text: "Auto-approved by policy" }
            : null
      : null;
  const hasCall = !!(step.input || step.output || step.error);
  const name = `${step.title}, ${
    state === "running"
      ? "running"
      : state === "done"
        ? `done in ${secs(step.ms)}`
        : state === "failed"
          ? "failed"
          : state === "waiting"
            ? "waiting for approval"
            : state === "denied"
              ? "denied"
              : state === "skipped"
                ? "skipped"
                : "not started"
  }`;

  return (
    <li className="relative flex gap-3">
      <div className="flex flex-col items-center">
        <span className="flex h-7 items-center">
          <Node
            state={state}
            spin={spin}
            fresh={fresh}
            motionSafe={motionSafe}
          />
        </span>
        {seg.index < total - 1 ? (
          <span aria-hidden className="w-px flex-1 bg-hairline" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1 pb-3">
        <button
          ref={bind}
          type="button"
          tabIndex={focusable ? 0 : -1}
          aria-expanded={hasCall ? open : undefined}
          aria-controls={hasCall ? callId : undefined}
          aria-label={name}
          aria-describedby={gateOpen ? gateText : undefined}
          onClick={onToggle}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          className={cn(
            "-mx-1.5 flex h-7 w-[calc(100%+0.75rem)] items-center gap-2 rounded-2 px-1.5 text-left text-[13px] transition-colors hover:bg-surface-2",
            FOCUS_IN,
          )}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate transition-colors duration-200",
              state === "running" || state === "waiting"
                ? "font-medium text-foreground"
                : state === "pending" || state === "skipped"
                  ? "text-ink-3"
                  : state === "denied"
                    ? "text-ink-3 line-through decoration-ink-3/60"
                    : "text-ink-2",
            )}
          >
            {step.title}
          </span>
          <span
            className={cn(
              "shrink-0 font-mono text-[11px] tabular-nums",
              state === "running"
                ? "text-cobalt-bright"
                : state === "failed"
                  ? "text-danger"
                  : state === "waiting"
                    ? "text-warn"
                    : "text-ink-3",
            )}
          >
            {state === "running" ? (
              <motion.span>{live}</motion.span>
            ) : state === "done" || state === "failed" ? (
              secs(step.ms)
            ) : state === "waiting" ? (
              "needs you"
            ) : null}
          </span>
          {hasCall ? (
            <motion.span
              aria-hidden
              initial={false}
              animate={{ rotate: open ? 180 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
              className="flex shrink-0 text-ink-3"
            >
              <ChevronDown className="size-3.5" />
            </motion.span>
          ) : null}
        </button>
        {detail !== "compact" && step.tool ? (
          <p
            title={`${step.tool} ${oneLine(step.input)}`}
            className="truncate font-mono text-[11px] leading-4 text-ink-3"
          >
            <span
              className={
                state === "running" ? "text-cobalt-bright" : "text-ink-2"
              }
            >
              {step.tool}
            </span>{" "}
            {oneLine(step.input)}
          </p>
        ) : null}
        {state === "failed" && step.error ? (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-danger">
            <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate" title={step.error}>
              {step.error}
            </span>
          </p>
        ) : null}
        {stamp ? (
          <p
            className={cn(
              "mt-1 flex items-center gap-1.5 text-xs",
              stamp.tone === "ok"
                ? "text-success"
                : stamp.tone === "no"
                  ? "text-ink-2"
                  : "text-ink-3",
            )}
          >
            <motion.span
              initial={fresh && motionSafe ? { scale: 0.5 } : false}
              animate={{ scale: 1 }}
              transition={springs.recoil}
              className="flex"
            >
              {stamp.tone === "no" ? (
                <Ban aria-hidden className="size-3.5" />
              ) : (
                <ShieldCheck aria-hidden className="size-3.5" />
              )}
            </motion.span>
            {stamp.text}
          </p>
        ) : null}

        {hasCall ? (
          <Fold open={open} motionSafe={motionSafe} id={callId}>
            <div className="grid gap-2 pt-2 @min-[40rem]:grid-cols-2">
              {step.input ? (
                <CallBlock label="Input" text={step.input} />
              ) : null}
              {state === "failed" && step.error ? (
                <CallBlock label="Error" text={step.error} tone="danger" />
              ) : state === "done" && step.output ? (
                <CallBlock label="Output" text={step.output} />
              ) : step.output || step.error ? (
                <CallBlock
                  label="Output"
                  tone="quiet"
                  text={state === "running" ? "Running…" : "Not run yet"}
                />
              ) : null}
            </div>
          </Fold>
        ) : null}

        {gate && approval !== "auto" ? (
          <Fold open={gateOpen} motionSafe={motionSafe}>
            <div className="pt-2">
              <div className="rounded-3 border border-warn/40 bg-warn/8 p-3">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-warn"
                  />
                  <div id={gateText} className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-foreground">
                      {gate.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-[18px] text-ink-2">
                      {gate.detail}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-col-reverse gap-2 @min-[30rem]:flex-row @min-[30rem]:justify-end">
                  <button
                    type="button"
                    disabled={disabled || approved}
                    onClick={onDeny}
                    className={cn(
                      "inline-flex h-9 items-center justify-center rounded-2 border border-hairline px-4 text-[13px] text-ink-2 transition-colors hover:border-hairline-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
                      FOCUS,
                    )}
                  >
                    {gate.denyLabel ?? "Deny"}
                  </button>
                  {approval === "hold" ? (
                    <HoldButton
                      key={epoch}
                      label={`Hold to ${verb.toLowerCase()}`}
                      confirmLabel={`Press again to ${verb.toLowerCase()}`}
                      doneLabel="Approved"
                      holdMs={holdMs}
                      done={approved}
                      disabled={disabled}
                      describedBy={holdHint}
                      onDone={onApprove}
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={disabled || approved}
                      onClick={(event) => onApprove(event.currentTarget)}
                      className={cn(
                        "inline-flex h-9 items-center justify-center gap-2 rounded-2 px-4 text-[13px] font-medium transition-colors disabled:cursor-not-allowed",
                        approved
                          ? "bg-[oklch(from_var(--success)_0.58_c_h)] text-primary-foreground"
                          : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
                        FOCUS,
                      )}
                    >
                      {approved ? (
                        <>
                          <Check
                            aria-hidden
                            className="size-4"
                            strokeWidth={2.4}
                          />
                          Approved
                        </>
                      ) : (
                        verb
                      )}
                    </button>
                  )}
                </div>
                <p id={holdHint} className="sr-only">
                  Press and hold, or press twice, to approve.
                </p>
              </div>
            </div>
          </Fold>
        ) : null}
      </div>
    </li>
  );
}

/* ------------------------------- the console ------------------------------ */

type Said = { n: number; text: string };
type LogEntry = {
  id: string;
  at: number;
  text: string;
  tone: "info" | "ok" | "fail" | "warn";
};

/**
 * An agent's run, watched as it happens. The header carries the run's state
 * and a time and cost meter whose digits run with the clock; the plan lists
 * every step moving from pending to running to done or failed, each with its
 * live duration, and a step's title opens its tool call — input and output —
 * to a measured height on glide. A risky step stops the run before it starts:
 * the clock halts, the step's node turns warn, and an approval gate glides
 * open under it. Approving is a press and hold — a fill sweeps the button in
 * `holdMs`, drains on the exit ease if let go early, and on landing the button
 * turns success with a check on recoil and the gate folds into a one-line
 * stamp while the run carries on. Denying stops the run there.
 *
 * Along the bottom the run is a timeline you can scrub: the playhead follows
 * the finger 1:1, rubber-bands against the ends and against an undecided gate
 * (the run cannot be scrubbed past a decision not yet made) and springs back
 * on glide with the release velocity. Replay rewinds the clock on the move
 * ease, so the meters roll back and the steps un-finish in reverse.
 *
 * The clock is a motion value, so only step boundaries re-render; it runs on
 * rAF only while playing, on screen and visible. Under reduced motion the
 * clock still runs and every state still changes, without spins, rises or the
 * rewind; the hold still fills because it is the feedback.
 */
export function AgentRun({
  run = defaultRun,
  now,
  defaultNow = 0,
  onNowChange,
  playing: playingProp,
  defaultPlaying = true,
  onPlayingChange,
  speed = 1,
  detail = "standard",
  approval = "hold",
  holdMs = 700,
  onDecision,
  onStateChange,
  onReplay,
  status = "ready",
  onRetry,
  formatCost = usd,
  label,
  sound = false,
  disabled = false,
  className,
}: AgentRunProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const rate = Math.min(10, Math.max(0.1, speed));
  const hold = Math.max(200, holdMs);
  const steps = run.steps;

  const rootRef = React.useRef<HTMLElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const logRef = React.useRef<HTMLDivElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(rootRef, { amount: 0 });
  const visible = React.useSyncExternalStore(
    subscribeVisible,
    visibleNow,
    visibleOnServer,
  );
  const hydrated = React.useSyncExternalStore(noSubscribe, onClient, onServer);
  const active = inView && visible;

  const controlled = now !== undefined;
  const [ownT, setOwnT] = React.useState(Math.max(0, defaultNow));
  const [ownPlaying, setOwnPlaying] = React.useState(defaultPlaying);
  const playing = playingProp ?? ownPlaying;
  const [decisions, setDecisions] = React.useState<Record<string, Decided>>({});
  const [landing, setLanding] = React.useState<string | null>(null);
  const [scrubbing, setScrubbing] = React.useState(false);
  // An animated seek (a tap on the timeline, Replay's rewind) owns the clock
  // while it runs; the loop waits for it.
  const [seeking, setSeeking] = React.useState(false);
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const [focusId, setFocusId] = React.useState<string | null>(null);
  // Bumped by Replay, so a hold button that latched starts fresh.
  const [epoch, setEpoch] = React.useState(0);

  const plan = React.useMemo(
    () => planRun(steps, decisions, approval),
    [steps, decisions, approval],
  );
  const tView = Math.max(0, controlled ? now : ownT);
  const clock = useMotionValue(tView);
  const over = useMotionValue(0);

  // Which calls are open: every one with `full`, none otherwise. A new
  // `detail` resets them, here in render rather than in an effect.
  const [openCalls, setOpenCalls] = React.useState<Record<string, boolean>>(
    () => Object.fromEntries(steps.map((s) => [s.id, detail === "full"])),
  );
  const [seenDetail, setSeenDetail] = React.useState(detail);
  if (seenDetail !== detail) {
    setSeenDetail(detail);
    setOpenCalls(
      Object.fromEntries(steps.map((s) => [s.id, detail === "full"])),
    );
  }

  const rows = React.useRef(new Map<string, HTMLButtonElement>());
  const keyRef = React.useRef(keyOf(plan, tView));
  const reported = React.useRef("");
  const seekAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const overAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const landTimer = React.useRef(0);
  const drag = React.useRef({ width: 1, left: 0 });

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // The host's clock is the clock. Before paint, so text never lags a frame.
  React.useLayoutEffect(() => {
    if (controlled) clock.set(tView);
  }, [controlled, tView, clock]);

  const setPlaying = (next: boolean) => {
    if (next === playing) return;
    if (playingProp === undefined) setOwnPlaying(next);
    onPlayingChange?.(next);
  };

  const sentence = (st: AgentRunState, cur: Seg | null, c: number) => {
    const n = steps.length;
    if (st === "waiting" && cur?.step.gate)
      return `Waiting for your approval: ${cur.step.gate.title}.`;
    if (st === "finished")
      return `Run finished in ${secs(plan.total)}, ${formatCost(costAt(plan, c))}.`;
    if (st === "failed") {
      const last = [...plan.segs].reverse().find((s) => s.runs);
      return `Run failed: ${last?.step.error ?? "the last step failed"}.`;
    }
    if (st === "stopped")
      return "Run stopped. Nothing after the denied step ran.";
    if (st === "paused") return `Paused at ${clockText(c)}.`;
    if (!cur) return "Running.";
    const prev = plan.segs[cur.index - 1];
    const failed =
      prev && prev.step.error && stateOf(prev, plan, c) === "failed"
        ? `${prev.step.title} failed. `
        : "";
    return `${failed}Step ${cur.index + 1} of ${n}: ${cur.step.title}.`;
  };

  /** Speaks and reports a change of state or step, once. */
  const report = (c: number, playingNow = playing, quiet = false) => {
    const st = runStateOf(plan, c, playingNow);
    const cur = currentOf(plan, c);
    const key = `${st}|${cur?.index ?? -1}`;
    if (key === reported.current) return;
    reported.current = key;
    onStateChange?.(st, cur?.step ?? null);
    if (!quiet) say(sentence(st, cur, c));
  };

  /**
   * The clock moved to `c`: re-render only when it crossed a boundary. An
   * animated seek passes `silent` and reports once, where it lands.
   */
  const crossed = (c: number, tick = false, silent = false) => {
    const k = keyOf(plan, c);
    if (k === keyRef.current) return;
    keyRef.current = k;
    if (tick) {
      const rect = trackRef.current?.getBoundingClientRect();
      audio.play("tick", {
        pitch: r2(0.85 + 0.5 * clamp01(c / Math.max(1, plan.total))),
        gain: 0.4,
        pan: rect
          ? panFrom(
              rect.left + (c / Math.max(1, plan.total)) * rect.width,
              null,
            )
          : 0,
      });
    }
    if (!controlled) setOwnT(c);
    if (!silent) report(c);
  };

  const api = React.useRef({ crossed, report, setPlaying, plan });
  React.useEffect(() => {
    api.current = { crossed, report, setPlaying, plan };
  });

  // The console's own clock: rAF while playing, on screen, visible and short
  // of the next stop. At an undecided gate it simply halts; at the end the
  // run stops playing.
  React.useEffect(() => {
    if (
      controlled ||
      !playing ||
      !active ||
      scrubbing ||
      seeking ||
      status !== "ready"
    )
      return;
    const stop = plan.stop;
    if (clock.get() >= stop) return;
    let raf = 0;
    let last = -1;
    const frame = (ts: number) => {
      if (last < 0) last = ts;
      const dt = Math.min(64, ts - last);
      last = ts;
      const c = Math.min(stop, clock.get() + dt * rate);
      clock.set(c);
      api.current.crossed(c);
      if (c >= stop) {
        if (stop >= api.current.plan.total) api.current.setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // `ownT` moves on every seek and boundary, so a clock sent back from a
    // stop (Replay, a scrub, a key) starts the loop again.
  }, [
    controlled,
    playing,
    active,
    scrubbing,
    seeking,
    status,
    plan.stop,
    rate,
    clock,
    ownT,
  ]);

  React.useEffect(() => {
    const timer = landTimer;
    return () => {
      seekAnim.current?.stop();
      overAnim.current?.stop();
      window.clearTimeout(timer.current);
    };
  }, []);

  /* ------------------------------ actions ------------------------------ */

  /** Stops an animated seek, and hands the clock back to the loop. */
  const haltSeek = () => {
    seekAnim.current?.stop();
    seekAnim.current = null;
    setSeeking(false);
  };

  const seek = (target: number, how: "jump" | "glide" | "drag") => {
    const c = Math.min(plan.stop, Math.max(0, target));
    haltSeek();
    if (controlled) {
      onNowChange?.(Math.round(c));
      return;
    }
    if (how === "glide" && motionSafe) {
      setSeeking(true);
      seekAnim.current = animate(clock, c, {
        duration: durations.base,
        ease: easings.move,
        onUpdate: (v) => api.current.crossed(v, true, true),
        onComplete: () => {
          setOwnT(c);
          setSeeking(false);
          api.current.report(c);
        },
      });
    } else {
      clock.set(c);
      crossed(c, how !== "glide");
      // The slider's reading is exact after a seek, not only at boundaries.
      setOwnT(c);
    }
    onNowChange?.(Math.round(c));
  };

  const click = (el: Element | null, pitch = 1) => {
    const rect = el?.getBoundingClientRect();
    audio.play("click", {
      pitch,
      gain: 0.5,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
  };

  const replay = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    click(event.currentTarget, 0.9);
    onReplay?.();
    window.clearTimeout(landTimer.current);
    setLanding(null);
    const restart = () => {
      setDecisions({});
      setEpoch((e) => e + 1);
      keyRef.current = 0;
      reported.current = "";
      if (!controlled) setOwnT(0);
      setPlaying(true);
      say("Replaying the run.");
    };
    haltSeek();
    if (controlled) {
      onNowChange?.(0);
      restart();
      return;
    }
    onNowChange?.(0);
    if (!motionSafe || clock.get() === 0) {
      clock.set(0);
      restart();
      return;
    }
    // The tape goes back before it plays again: meters roll down and the
    // steps un-finish in reverse.
    setSeeking(true);
    seekAnim.current = animate(clock, 0, {
      duration: 0.45,
      ease: easings.move,
      onUpdate: (v) => api.current.crossed(v, false, true),
      onComplete: () => {
        setSeeking(false);
        restart();
      },
    });
  };

  const togglePlay = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const finished = clock.get() >= plan.total;
    if (finished) {
      replay(event);
      return;
    }
    click(event.currentTarget, playing ? 0.85 : 1.1);
    const next = !playing;
    setPlaying(next);
    report(clock.get(), next);
  };

  const decide = (seg: Seg, decision: AgentDecision, el: Element | null) => {
    if (disabled) return;
    const at = controlled ? tView : clock.get();
    const next = { ...decisions, [seg.step.id]: { decision, at } };
    setDecisions(next);
    onDecision?.(seg.step.id, decision);
    const nextPlan = planRun(steps, next, approval);
    const rect = el?.getBoundingClientRect();
    const pan = rect ? panFrom(rect.left + rect.width / 2, null) : 0;
    if (decision === "approved") {
      audio.play("chime", { pitch: 1, gain: 0.45, pan });
      setLanding(seg.step.id);
      window.clearTimeout(landTimer.current);
      landTimer.current = window.setTimeout(() => setLanding(null), 450);
      say(`Approved. ${seg.step.title}.`);
    } else {
      audio.play("click", { pitch: 0.75, gain: 0.5, pan });
      say("Denied. The run stopped.");
    }
    const st = runStateOf(nextPlan, at, playing);
    const cur = currentOf(nextPlan, at);
    reported.current = `${st}|${cur?.index ?? -1}`;
    onStateChange?.(st, cur?.step ?? null);
  };

  const toggleCall = (id: string, el: Element | null) => {
    click(el, openCalls[id] ? 0.9 : 1.15);
    setOpenCalls((o) => ({ ...o, [id]: !o[id] }));
  };

  const focusRow = (index: number) => {
    const s = steps[Math.min(steps.length - 1, Math.max(0, index))];
    if (s) rows.current.get(s.id)?.focus();
  };

  const onRowKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const to =
      event.key === "ArrowDown"
        ? index + 1
        : event.key === "ArrowUp"
          ? index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? steps.length - 1
              : null;
    if (to === null) return;
    event.preventDefault();
    focusRow(to);
  };

  /* ------------------------------ scrubber ------------------------------ */

  const timeAt = (clientX: number) => {
    const d = drag.current;
    return ((clientX - d.left) / Math.max(1, d.width)) * plan.total;
  };

  const gesture = useDrag({
    axis: "x",
    threshold: 2,
    disabled: disabled || status !== "ready",
    onStart: () => {
      const rect = trackRef.current?.getBoundingClientRect();
      drag.current = { width: rect?.width ?? 1, left: rect?.left ?? 0 };
      overAnim.current?.stop();
      haltSeek();
      setScrubbing(true);
    },
    onMove: ({ point }) => {
      const d = drag.current;
      const raw = timeAt(point.x);
      const px = (t: number) => (t / Math.max(1, plan.total)) * d.width;
      // Past either end, or past a gate nobody has decided, the playhead
      // gives a little and pulls back.
      if (raw > plan.stop)
        over.set(r2(rubberband(px(raw) - px(plan.stop), 48)));
      else if (raw < 0) over.set(r2(rubberband(px(raw), 48)));
      else over.set(0);
      seek(raw, "drag");
    },
    onEnd: ({ velocity }) => {
      setScrubbing(false);
      overAnim.current = animate(
        over,
        0,
        motionSafe
          ? { ...springs.glide, velocity: velocity.x }
          : { duration: 0 },
      );
    },
    onCancel: () => {
      setScrubbing(false);
      over.set(0);
    },
    onTap: (event) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      drag.current = { ...drag.current, width: rect.width, left: rect.left };
      seek(timeAt(event.clientX), "glide");
    },
  });

  const onScrubKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const c = clock.get();
    const marks = plan.boundaries;
    let to: number | null = null;
    if (
      event.shiftKey &&
      (event.key === "ArrowRight" || event.key === "ArrowUp")
    )
      to = marks.find((b) => b > c + 1) ?? plan.stop;
    else if (
      event.shiftKey &&
      (event.key === "ArrowLeft" || event.key === "ArrowDown")
    )
      to = [...marks].reverse().find((b) => b < c - 1) ?? 0;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp")
      to = c + 1000;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
      to = c - 1000;
    else if (event.key === "PageUp") to = c + 5000;
    else if (event.key === "PageDown") to = c - 5000;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = plan.stop;
    if (to === null) return;
    event.preventDefault();
    seek(to, "jump");
  };

  /* ------------------------------ derived ------------------------------ */

  const states = plan.segs.map((s) => stateOf(s, plan, tView));
  const runState = runStateOf(plan, tView, playing);
  const cur = currentOf(plan, tView);
  const curIndex = cur?.index ?? 0;
  const tabStop =
    steps.find((s) => s.id === focusId)?.id ??
    steps[curIndex]?.id ??
    steps[0]?.id;
  const finishedRun = tView >= plan.total;

  // The plan scrolls its own box (never the page) to keep the step that is
  // running in view, and keeps following it while it grows (a gate opening
  // under it, a call unfolding).
  React.useEffect(() => {
    const box = listRef.current;
    const id = steps[curIndex]?.id;
    const row = id ? rows.current.get(id)?.closest("li") : null;
    if (!box || !row) return;
    const reveal = (smooth: boolean) => {
      const top = row.offsetTop;
      const bottom = top + row.offsetHeight;
      const view = box.clientHeight;
      let to: number | null = null;
      if (bottom > box.scrollTop + view) to = Math.min(top, bottom - view + 8);
      else if (top < box.scrollTop) to = top;
      if (to === null) return;
      box.scrollTo({
        top: Math.max(0, to),
        behavior: smooth ? "smooth" : "auto",
      });
    };
    reveal(motionSafe);
    // Only a change of size from here on: the observer's first report may
    // already carry a growth that happened in the same frame.
    let seen = row.offsetHeight;
    const ro = new ResizeObserver(() => {
      if (row.offsetHeight === seen) return;
      seen = row.offsetHeight;
      reveal(false);
    });
    ro.observe(row);
    return () => ro.disconnect();
  }, [curIndex, steps, motionSafe]);

  const timeText = useTransform(clock, (c) => clockText(c));
  const costText = useTransform(clock, (c) => formatCost(costAt(plan, c)));
  const budget = Math.max(1, run.budget ?? 0);
  const share = useTransform(clock, (c) =>
    run.budget ? r3(clamp01(costAt(plan, c) / budget)) : 0,
  );
  const shareTint = useTransform(share, (s) =>
    s <= 0.8
      ? "var(--accent-bright)"
      : `color-mix(in oklab, var(--warn) ${Math.round(clamp01((s - 0.8) / 0.2) * 100)}%, var(--accent-bright))`,
  );
  const head = useTransform(
    clock,
    (c) => `${r3(clamp01(c / Math.max(1, plan.total)) * 100)}%`,
  );

  const badge: Record<AgentRunState, { text: string; tone: string }> = {
    running: { text: "Running", tone: "text-cobalt-bright bg-cobalt-wash" },
    paused: { text: "Paused", tone: "text-ink-2 bg-surface-2" },
    waiting: { text: "Needs approval", tone: "text-warn bg-warn/12" },
    finished: { text: "Finished", tone: "text-success bg-success/12" },
    failed: { text: "Failed", tone: "text-danger bg-danger/12" },
    stopped: { text: "Stopped", tone: "text-ink-2 bg-surface-2" },
  };

  const log: LogEntry[] = [];
  for (const s of plan.segs) {
    const st = states[s.index];
    if (s.gate === "auto" && st !== "pending")
      log.push({
        id: `${s.step.id}-auto`,
        at: s.start,
        text: `Auto-approved by policy: ${s.step.gate?.title ?? s.step.title}`,
        tone: "ok",
      });
    if (
      st === "waiting" ||
      (s.gate !== "none" &&
        s.gate !== "auto" &&
        s.gate !== "pending" &&
        tView >= s.start)
    ) {
      log.push({
        id: `${s.step.id}-wait`,
        at: plan.waitingAt ?? s.decidedAt ?? s.start,
        text: `Waiting for approval: ${s.step.gate?.title ?? s.step.title}`,
        tone: "warn",
      });
    }
    if (s.gate === "approved" && tView >= (s.decidedAt ?? s.start))
      log.push({
        id: `${s.step.id}-yes`,
        at: s.decidedAt ?? s.start,
        text: "Approved by you",
        tone: "ok",
      });
    if (s.gate === "denied" && st === "denied")
      log.push({
        id: `${s.step.id}-no`,
        at: s.decidedAt ?? s.start,
        text: "Denied. Nothing was sent.",
        tone: "fail",
      });
    if (st === "running" || st === "done" || st === "failed")
      log.push({
        id: `${s.step.id}-start`,
        at: s.start,
        text: s.step.tool
          ? `Called ${s.step.tool}`
          : `Started: ${s.step.title}`,
        tone: "info",
      });
    if (st === "done")
      log.push({
        id: `${s.step.id}-end`,
        at: s.end,
        // A tool's result in its first two figures; a step without a tool
        // just finished.
        text:
          s.step.tool && s.step.output
            ? `${s.step.tool} returned ${oneLine(s.step.output).split(" · ").slice(0, 2).join(" · ")}`
            : `Done: ${s.step.title}`,
        tone: "ok",
      });
    if (st === "failed")
      log.push({
        id: `${s.step.id}-fail`,
        at: s.end,
        text: `Failed: ${s.step.error ?? "error"}`,
        tone: "fail",
      });
  }
  if (finishedRun && plan.deniedAt === null && plan.waitingAt === null)
    log.push({
      id: "end",
      at: plan.total,
      text: `Finished in ${secs(plan.total)} · ${formatCost(costAt(plan, plan.total))}`,
      tone: "ok",
    });
  log.sort((a, b) => a.at - b.at);

  // The log keeps its newest line in view, inside its own box.
  const logCount = log.length;
  React.useEffect(() => {
    const box = logRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [logCount]);

  const control = cn(
    "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
    FOCUS,
  );

  if (status !== "ready" || steps.length === 0) {
    return (
      <section
        ref={rootRef}
        role="region"
        aria-label={label ?? run.title}
        aria-busy={status === "loading" || undefined}
        className={cn(
          "@container relative flex flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
          className,
        )}
      >
        <header className="flex shrink-0 flex-col gap-1 border-b border-hairline px-4 py-3">
          {status === "loading" ? (
            <>
              <span
                className={cn(
                  "h-4 w-48 max-w-full rounded-1 bg-surface-2",
                  motionSafe && active && "animate-pulse",
                )}
              />
              <span
                className={cn(
                  "h-3 w-32 rounded-1 bg-surface-2",
                  motionSafe && active && "animate-pulse",
                )}
              />
            </>
          ) : (
            <>
              <p className="truncate text-sm font-medium">{run.title}</p>
              <p className="truncate text-xs text-ink-3">
                {run.agent} · {run.model}
              </p>
            </>
          )}
        </header>
        <div className="flex flex-1 flex-col gap-3 overflow-hidden px-4 py-4">
          {status === "loading" ? (
            Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="size-5 shrink-0 rounded-full border border-hairline-strong" />
                <span
                  className={cn(
                    "h-3 rounded-1 bg-surface-2",
                    motionSafe && active && "animate-pulse",
                  )}
                  style={{ width: `${[64, 48, 72, 40, 56][i] ?? 50}%` }}
                />
              </div>
            ))
          ) : status === "error" ? (
            <div className="flex flex-col items-start gap-3 py-6">
              <p className="flex items-center gap-2 text-sm text-foreground">
                <TriangleAlert aria-hidden className="size-4 text-danger" />
                This run could not be loaded.
              </p>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRetry?.()}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-2 border border-hairline-strong px-3 text-[13px] text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50",
                  FOCUS,
                )}
              >
                <RotateCcw aria-hidden className="size-4" />
                Retry
              </button>
            </div>
          ) : (
            <p className="py-6 text-sm text-ink-2">
              No steps yet. The agent has not planned this run.
            </p>
          )}
        </div>
        <p role="status" className="sr-only">
          {status === "loading"
            ? "Loading the run."
            : status === "error"
              ? "This run could not be loaded."
              : ""}
        </p>
      </section>
    );
  }

  return (
    <section
      ref={rootRef}
      role="region"
      aria-label={label ?? run.title}
      className={cn(
        "@container relative isolate flex flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
    >
      <header className="flex shrink-0 flex-col gap-2 border-b border-hairline px-4 py-3 @min-[40rem]:flex-row @min-[40rem]:items-center @min-[40rem]:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p
              className="min-w-0 truncate text-sm font-medium"
              title={run.title}
            >
              {run.title}
            </p>
            <span
              className={cn(
                "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium transition-colors",
                badge[runState].tone,
              )}
            >
              <span aria-hidden className="size-1.5 rounded-full bg-current" />
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={runState}
                  initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe ? springs.snap : { duration: durations.fast }
                  }
                >
                  {badge[runState].text}
                </motion.span>
              </AnimatePresence>
            </span>
          </div>
          <p className="truncate text-xs text-ink-3">
            {run.agent} · {run.model}
          </p>
        </div>
        <dl className="flex shrink-0 items-end gap-5">
          <div className="flex flex-col">
            <dt className="text-[11px] text-ink-3">Time</dt>
            <dd className="font-mono text-[13px] text-foreground tabular-nums">
              <motion.span>{timeText}</motion.span>
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-[11px] text-ink-3">
              Cost{run.budget ? ` of ${formatCost(run.budget)}` : ""}
            </dt>
            <dd className="flex flex-col font-mono text-[13px] text-foreground tabular-nums">
              <motion.span>{costText}</motion.span>
              {run.budget ? (
                <span
                  aria-hidden
                  className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-hairline"
                >
                  <motion.span
                    className="block h-full origin-left rounded-full"
                    style={{ scaleX: share, backgroundColor: shareTint }}
                  />
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div
          ref={listRef}
          className="relative flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-4 pt-3 pb-1"
        >
          <ol aria-label="Plan">
            {plan.segs.map((s) => {
              const st = states[s.index] ?? "pending";
              return (
                <StepRow
                  key={s.step.id}
                  seg={s}
                  state={st}
                  total={steps.length}
                  clock={clock}
                  open={!!openCalls[s.step.id]}
                  focusable={s.step.id === tabStop}
                  detail={detail}
                  approval={approval}
                  holdMs={hold}
                  landing={landing === s.step.id}
                  fresh={hydrated}
                  spin={motionSafe && active}
                  motionSafe={motionSafe}
                  disabled={disabled}
                  uid={uid}
                  epoch={epoch}
                  bind={(node) => {
                    if (node) rows.current.set(s.step.id, node);
                    else rows.current.delete(s.step.id);
                  }}
                  onToggle={(event) =>
                    toggleCall(s.step.id, event.currentTarget)
                  }
                  onKeyDown={(event) => onRowKey(event, s.index)}
                  onFocus={() => setFocusId(s.step.id)}
                  onApprove={(el) => decide(s, "approved", el)}
                  onDeny={(event) => decide(s, "denied", event.currentTarget)}
                />
              );
            })}
          </ol>
        </div>

        <aside
          aria-label="Activity"
          className="hidden w-[22rem] shrink-0 flex-col border-l border-hairline @min-[64rem]:flex"
        >
          <p className="shrink-0 px-4 pt-3 pb-2 text-[11px] text-ink-3">
            Activity
          </p>
          <div
            ref={logRef}
            className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-4 pb-3"
          >
            {log.length === 0 ? (
              <p className="text-xs text-ink-3">Nothing has happened yet.</p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {log.map((e) => (
                  <motion.li
                    key={e.id}
                    initial={
                      hydrated && motionSafe
                        ? { opacity: 0, y: distances.nudge }
                        : false
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={springs.snap}
                    className="flex gap-3 text-xs leading-[18px]"
                  >
                    <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                      {clockText(e.at)}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1",
                        e.tone === "fail"
                          ? "text-danger"
                          : e.tone === "warn"
                            ? "text-warn"
                            : e.tone === "ok"
                              ? "text-foreground"
                              : "text-ink-2",
                      )}
                    >
                      {e.text}
                    </span>
                  </motion.li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-x-1 gap-y-1.5 border-t border-hairline px-3 py-2 @min-[30rem]:flex-nowrap">
        <button
          type="button"
          aria-label="Replay"
          disabled={disabled}
          onClick={replay}
          className={control}
        >
          <RotateCcw aria-hidden className="size-4" />
        </button>
        <button
          type="button"
          aria-label={
            playing && !finishedRun
              ? "Pause"
              : finishedRun
                ? "Replay from the start"
                : "Play"
          }
          disabled={disabled}
          onClick={togglePlay}
          className={control}
        >
          {playing && !finishedRun ? (
            <Pause aria-hidden className="size-4" />
          ) : (
            <Play aria-hidden className="size-4" />
          )}
        </button>
        <div
          ref={trackRef}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label="Run timeline"
          aria-valuemin={0}
          aria-valuemax={Math.round(plan.total)}
          aria-valuenow={Math.round(Math.min(tView, plan.total))}
          aria-valuetext={`${clockText(tView)} of ${clockText(plan.total)}, step ${curIndex + 1} of ${steps.length}, ${cur?.step.title ?? ""}`}
          aria-disabled={disabled || undefined}
          onKeyDown={onScrubKey}
          {...gesture}
          className={cn(
            "relative order-first h-8 basis-full cursor-pointer touch-pan-y rounded-2 select-none @min-[30rem]:order-none @min-[30rem]:mx-2 @min-[30rem]:flex-1 @min-[30rem]:basis-auto",
            FOCUS,
          )}
        >
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-hairline">
            {plan.segs.map((s) => {
              if (!s.runs) return null;
              const st = states[s.index] ?? "pending";
              const left = (s.start / Math.max(1, plan.total)) * 100;
              const width = (s.step.ms / Math.max(1, plan.total)) * 100;
              if (left >= 100) return null;
              return (
                <span
                  key={s.step.id}
                  className={cn(
                    "absolute inset-y-0 rounded-full transition-colors duration-200",
                    st === "done"
                      ? "bg-cobalt-bright/80"
                      : st === "running"
                        ? "bg-cobalt-bright/45"
                        : st === "failed"
                          ? "bg-danger/80"
                          : st === "waiting"
                            ? "bg-warn/70"
                            : "bg-hairline-strong",
                  )}
                  style={{
                    left: `calc(${r3(left)}% + 1px)`,
                    width: `calc(${r3(Math.min(width, 100 - left))}% - 2px)`,
                  }}
                />
              );
            })}
            {plan.waitingAt !== null ? (
              <span
                aria-hidden
                className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border border-card bg-warn"
                style={{
                  left: `${r3((plan.waitingAt / Math.max(1, plan.total)) * 100)}%`,
                }}
              />
            ) : null}
          </div>
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-0"
            style={{ left: head, x: over }}
          >
            <span className="absolute inset-y-1.5 left-0 w-px -translate-x-1/2 bg-foreground/70" />
            <span className="absolute top-1/2 left-0 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-foreground shadow-[0_1px_3px_color-mix(in_oklab,black_30%,transparent)]" />
          </motion.div>
        </div>
        <span className="ml-auto shrink-0 pl-1 font-mono text-[11px] text-ink-3 tabular-nums @min-[30rem]:ml-0">
          <motion.span>{timeText}</motion.span> / {clockText(plan.total)}
        </span>
      </footer>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </section>
  );
}
