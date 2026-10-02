"use client";

import * as React from "react";

import {
  Check,
  ChevronDown,
  LoaderCircle,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { semitones, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SetupStepState = "done" | "skipped";
/** Which steps are finished, by step id. A step missing from it is still to do. */
export type SetupProgress = Readonly<Record<string, SetupStepState>>;
export type SetupRing = "arc" | "segments" | "ticks";
export type SetupExpand = "lift" | "inline";
export type SetupCelebrate = "burst" | "stamp" | "quiet";
export type SetupStatus = "ready" | "loading" | "error";

export type SetupChoiceOption = { id: string; label: string };

/** The control a step opens into. */
export type SetupAction =
  | {
      kind: "button";
      /** The button's text, e.g. "Connect Coldbrook Bank". */
      label: string;
      /** Shown while the action's promise is pending. @default "Working…" */
      pendingLabel?: string;
    }
  | {
      kind: "field";
      /** The field's visible label. */
      label: string;
      /** The submit button's text. */
      submit: string;
      placeholder?: string;
      /** An email field is checked before it is sent. @default "text" */
      type?: "text" | "email" | "url";
      pendingLabel?: string;
    }
  | {
      kind: "choice";
      /** Names the radiogroup. */
      label: string;
      submit: string;
      options: SetupChoiceOption[];
      /** Selected when the step opens. @default the first option */
      defaultOption?: string;
      pendingLabel?: string;
    };

export type SetupStep = {
  id: string;
  title: string;
  /** One or two lines under the title when the step is open. */
  description: string;
  action: SetupAction;
  /** Roughly how long it takes, for the time-left line. */
  minutes?: number;
  /** Offers Skip; a skipped step counts as finished. */
  optional?: boolean;
  /** What an open finished step says instead of its action. @default "Done" */
  doneLabel?: string;
};

export type SetupChecklistProps = {
  /** The steps, in order. @default defaultSetupSteps */
  steps?: SetupStep[];
  /** Controlled progress: which steps are done or skipped. */
  value?: SetupProgress;
  /** Initial progress when uncontrolled. @default {} */
  defaultValue?: SetupProgress;
  /** Fires from the action, Skip or key that finished a step, with the whole new progress. */
  onValueChange?: (value: SetupProgress) => void;
  /** Controlled open step, or null for none. */
  open?: string | null;
  /** Initial open step when uncontrolled. @default the first unfinished step */
  defaultOpen?: string | null;
  /** Fires when a header press, a key or the advance after a finished step opens another. */
  onOpenChange?: (id: string | null) => void;
  /** Controlled: the checklist is folded away into its one-line bar. */
  dismissed?: boolean;
  /** @default false */
  defaultDismissed?: boolean;
  /** Fires from Dismiss, Skip setup, and the bar's Show. */
  onDismissedChange?: (dismissed: boolean) => void;
  /** Runs a step's action with the field's text or the chosen option's id. Return a promise to hold the button pending; a rejection's message is shown on the step. Without it, actions finish at once. */
  onAction?: (stepId: string, input?: string) => void | Promise<void>;
  /** An optional step was skipped. */
  onSkip?: (stepId: string) => void;
  /** How progress is drawn: one round stroke, one arc per step, or a dial of ticks. @default "arc" */
  ring?: SetupRing;
  /** The open step as a raised card that travels between steps, or flush in the list with an accent bar. @default "lift" */
  expand?: SetupExpand;
  /** The all-set moment: sparks and a stamped check, the whole ring landing, or colour alone. @default "burst" */
  celebrate?: SetupCelebrate;
  /** Finishing a step opens the next unfinished one and moves focus to it. @default true */
  advance?: boolean;
  /** The heading and accessible name. @default "Get started" */
  title?: string;
  /** The line under the heading. */
  subtitle?: string;
  /** The heading once every step is finished. @default "You're all set" */
  doneTitle?: string;
  /** The line under it. */
  doneBody?: string;
  /** Loading draws placeholder rows; error offers Retry. @default "ready" */
  status?: SetupStatus;
  /** The Retry button of the error state. */
  onRetry?: () => void;
  /** The region's accessible name, when it should differ from the title. */
  label?: string;
  /** Play a plip as a step you finished checks off and a chime when you finish the list. Off unless asked for. @default false */
  sound?: boolean;
  /** Shows the checklist but takes no presses or keys. */
  disabled?: boolean;
  className?: string;
};

export const defaultSetupSteps: SetupStep[] = [
  {
    id: "business",
    title: "Name your business",
    description:
      "This is the name customers see on receipts and card statements.",
    minutes: 1,
    doneLabel: "Saved",
    action: {
      kind: "field",
      label: "Business name",
      placeholder: "Fieldline Studio",
      submit: "Save",
    },
  },
  {
    id: "currency",
    title: "Choose a payout currency",
    description:
      "Payments in other currencies are converted before they reach you.",
    minutes: 1,
    doneLabel: "Currency set",
    action: {
      kind: "choice",
      label: "Payout currency",
      options: [
        { id: "eur", label: "EUR" },
        { id: "gbp", label: "GBP" },
        { id: "usd", label: "USD" },
      ],
      defaultOption: "eur",
      submit: "Confirm",
    },
  },
  {
    id: "bank",
    title: "Connect a bank account",
    description: "Payouts land here two working days after each payment.",
    minutes: 3,
    doneLabel: "Connected",
    action: {
      kind: "button",
      label: "Connect Coldbrook Bank",
      pendingLabel: "Connecting…",
    },
  },
  {
    id: "team",
    title: "Invite a teammate",
    description:
      "They can refund payments and see payouts, but not change bank details.",
    minutes: 1,
    optional: true,
    doneLabel: "Invite sent",
    action: {
      kind: "field",
      type: "email",
      label: "Teammate's email",
      placeholder: "name@company.com",
      submit: "Send invite",
      pendingLabel: "Sending…",
    },
  },
  {
    id: "test",
    title: "Take a test payment",
    description:
      "We charge a test card €1.00 and refund it at once, so you can follow a payment end to end.",
    minutes: 2,
    doneLabel: "Test payment refunded",
    action: {
      kind: "button",
      label: "Send a €1 test",
      pendingLabel: "Charging…",
    },
  },
];

/** The demo account has already named its business. */
export const defaultSetupProgress: SetupProgress = { business: "done" };

const EMPTY: SetupProgress = {};
/** Room between rows and inside the list, px: the travelling lift reads them. */
const GAP = 4;
const PAD = 6;
/** How long a finished step shows its result before the next one opens, s. */
const BEAT = 0.26;
const TICKS = 40;
const RING_R = 28;
const C = 40;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const isFinished = (p: SetupProgress, id: string) => p[id] !== undefined;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
/** The success disc is pigment: the same green on a light page as a dark one. */
const PIGMENT = "oklch(from var(--success) 0.62 0.15 h)";

function hash(n: number): number {
  let h = Math.imul(n + 0x9e37, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

const polar = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [r3(C + r * Math.cos(a)), r3(C + r * Math.sin(a))] as const;
};

/** An arc of the ring between two angles (0 at the top, clockwise). */
function arcPath(from: number, to: number, r = RING_R): string {
  const [x1, y1] = polar(from, r);
  const [x2, y2] = polar(to, r);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

const TICK_SEGMENTS = Array.from({ length: TICKS }, (_, i) => {
  const deg = (i * 360) / TICKS;
  const [x1, y1] = polar(deg, RING_R - 3.5);
  const [x2, y2] = polar(deg, RING_R + 3.5);
  return `M ${x1} ${y1} L ${x2} ${y2}`;
});

/** Twelve sparks round the ring, seeded so the server draws the same ones. */
const SPARKS = Array.from({ length: 12 }, (_, i) => ({
  deg: i * 30 + ((hash(i) % 13) - 6),
  len: 3 + (hash(i + 40) % 4),
}));

function sparkPath(b: number): string {
  if (b <= 0 || b >= 1) return "";
  return SPARKS.map((s) => {
    // From just outside the stroke to just inside the viewBox: a spark
    // never reaches the edge of the ring's own box.
    const inner = RING_R + 4 + 4 * b;
    const outer = inner + s.len * (1 - 0.5 * b);
    const [x1, y1] = polar(s.deg, inner);
    const [x2, y2] = polar(s.deg, outer);
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }).join(" ");
}

/** A height that glides to its content's measured height. */
function Measured({
  children,
  motionSafe,
  className,
}: {
  children: React.ReactNode;
  motionSafe: boolean;
  className?: string;
}) {
  const height = useMotionValue(-1);
  const style = useTransform(height, (h) => (h < 0 ? "auto" : h));
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!node) return;
    let running: AnimationPlaybackControls | null = null;
    const ro = new ResizeObserver(() => {
      const h = node.offsetHeight;
      const now = height.get();
      if (now < 0 || !motionSafe) {
        running?.stop();
        height.set(h);
        return;
      }
      if (Math.abs(now - h) < 0.5) return;
      running?.stop();
      running = animate(height, h, springs.glide);
    });
    ro.observe(node);
    return () => {
      ro.disconnect();
      // A re-run finishes the glide rather than freezing it part-way.
      running?.stop();
      if (height.get() >= 0) height.set(node.offsetHeight);
    };
  }, [node, motionSafe, height]);

  return (
    <motion.div
      style={{ height: style }}
      className={cn(
        "relative overflow-clip [overflow-clip-margin:6px]",
        className,
      )}
    >
      <div ref={setNode}>{children}</div>
    </motion.div>
  );
}

function Segment({
  index,
  count,
  share,
  complete,
}: {
  index: number;
  count: number;
  share: MotionValue<number>;
  complete: boolean;
}) {
  const span = 360 / count;
  const gap = count > 1 ? Math.min(14, span * 0.22) : 0;
  const d = arcPath(index * span + gap / 2, (index + 1) * span - gap / 2);
  const dash = useTransform(
    share,
    (p) => `${r2(clamp01(p * count - index) * 100)} 100`,
  );
  const opacity = useTransform(share, (p) =>
    p * count - index > 0.01 ? 1 : 0,
  );
  return (
    <>
      <path d={d} pathLength={100} className="stroke-hairline-strong" />
      <motion.path
        d={d}
        pathLength={100}
        className={cn(
          "transition-[stroke] duration-300",
          complete ? "stroke-success" : "stroke-cobalt-bright",
        )}
        style={{ strokeDasharray: dash, opacity }}
      />
    </>
  );
}

function Ring({
  kind,
  count,
  done,
  share,
  burst,
  scale,
  complete,
  motionSafe,
}: {
  kind: SetupRing;
  count: number;
  done: number;
  share: MotionValue<number>;
  burst: MotionValue<number>;
  scale: MotionValue<number>;
  complete: boolean;
  motionSafe: boolean;
}) {
  const dash = useTransform(share, (p) => `${r2(clamp01(p) * 100)} 100`);
  const arcOpacity = useTransform(share, (p) => (p > 0.005 ? 1 : 0));
  const lit = useTransform(share, (p) =>
    TICK_SEGMENTS.slice(0, Math.round(clamp01(p) * TICKS)).join(" "),
  );
  const sparks = useTransform(burst, sparkPath);
  const sparkOpacity = useTransform(burst, (b) => r2(1 - b));
  const stroke = complete ? "stroke-success" : "stroke-cobalt-bright";

  return (
    <motion.div
      className="relative size-13 shrink-0 @min-[40rem]:size-28"
      style={{ scale }}
    >
      <svg
        aria-hidden
        viewBox="0 0 80 80"
        fill="none"
        strokeLinecap="round"
        className="absolute inset-0 size-full"
      >
        {kind === "arc" ? (
          <>
            <circle
              cx={C}
              cy={C}
              r={RING_R}
              strokeWidth={5}
              className="stroke-hairline-strong"
            />
            <g transform={`rotate(-90 ${C} ${C})`}>
              <motion.circle
                cx={C}
                cy={C}
                r={RING_R}
                strokeWidth={5}
                pathLength={100}
                className={cn("transition-[stroke] duration-300", stroke)}
                style={{ strokeDasharray: dash, opacity: arcOpacity }}
              />
            </g>
          </>
        ) : kind === "segments" ? (
          <g strokeWidth={5}>
            {Array.from({ length: Math.max(1, count) }, (_, i) => (
              <Segment
                key={i}
                index={i}
                count={Math.max(1, count)}
                share={share}
                complete={complete}
              />
            ))}
          </g>
        ) : (
          <g strokeWidth={2}>
            <path
              d={TICK_SEGMENTS.join(" ")}
              className="stroke-hairline-strong"
            />
            <motion.path
              d={lit}
              className={cn("transition-[stroke] duration-300", stroke)}
            />
          </g>
        )}
        {motionSafe ? (
          <motion.path
            d={sparks}
            strokeWidth={1.6}
            className="stroke-success"
            style={{ opacity: sparkOpacity }}
          />
        ) : null}
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        <AnimatePresence initial={false}>
          {complete ? (
            <motion.span
              key="check"
              className="col-start-1 row-start-1 grid size-6 place-items-center rounded-full text-primary-foreground @min-[40rem]:size-10"
              style={{ background: PIGMENT }}
              initial={motionSafe ? { scale: 0.5, opacity: 0 } : { opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? {
                      scale: { ...springs.recoil, delay: 0.08 },
                      opacity: { duration: durations.fast, delay: 0.08 },
                    }
                  : { duration: durations.base }
              }
            >
              <Check
                aria-hidden
                strokeWidth={3}
                className="size-3.5 @min-[40rem]:size-5"
              />
            </motion.span>
          ) : (
            <motion.span
              key="count"
              className="col-start-1 row-start-1 flex items-baseline font-mono tabular-nums @min-[40rem]:flex-col @min-[40rem]:items-center"
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            >
              <span className="relative grid overflow-clip text-[12px] leading-5 font-medium text-foreground @min-[40rem]:text-[24px] @min-[40rem]:leading-8">
                <AnimatePresence initial={false}>
                  <motion.span
                    key={done}
                    className="col-start-1 row-start-1 text-center"
                    initial={{ opacity: 0, y: motionSafe ? "70%" : 0 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{
                      opacity: 0,
                      y: motionSafe ? "-70%" : 0,
                      transition: exitFor(durations.fast),
                    }}
                    transition={{
                      y: motionSafe ? springs.snap : { duration: 0 },
                      opacity: { duration: durations.fast },
                    }}
                  >
                    {done}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span className="text-[10px] text-ink-3 @min-[40rem]:hidden">
                /{count}
              </span>
              <span className="hidden text-[10px] tracking-[0.06em] text-ink-3 uppercase @min-[40rem]:inline">
                of {count}
              </span>
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </motion.div>
  );
}

function Mark({
  index,
  state,
  open,
  pending,
  motionSafe,
}: {
  index: number;
  state: SetupStepState | undefined;
  open: boolean;
  pending: boolean;
  motionSafe: boolean;
}) {
  const done = state === "done";
  const skipped = state === "skipped";
  return (
    <span
      aria-hidden
      className="relative grid size-5.5 shrink-0 place-items-center"
    >
      <span
        className={cn(
          "absolute inset-0 rounded-full border transition-colors",
          skipped && "border-dashed",
          open && !state ? "border-cobalt-bright" : "border-hairline-strong",
        )}
      />
      <span
        className={cn(
          "col-start-1 row-start-1 font-mono text-[10px] tabular-nums transition-opacity",
          open && !state ? "text-cobalt-bright" : "text-ink-3",
          state || pending ? "opacity-0" : "opacity-100",
        )}
      >
        {index + 1}
      </span>
      {skipped ? (
        <span className="col-start-1 row-start-1 h-px w-2 rounded-full bg-ink-3" />
      ) : null}
      <motion.span
        className="absolute inset-0 rounded-full"
        style={{ background: PIGMENT }}
        initial={false}
        animate={{
          scale: done ? 1 : motionSafe ? 0.4 : 1,
          opacity: done ? 1 : 0,
        }}
        transition={
          motionSafe
            ? { scale: springs.snap, opacity: { duration: durations.blink } }
            : { duration: durations.fast }
        }
      />
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className="relative col-start-1 row-start-1 size-3 text-primary-foreground"
      >
        <motion.path
          d="M3.5 8.4 6.6 11.4 12.5 4.8"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
          transition={
            motionSafe
              ? {
                  pathLength: { ...springs.flick, delay: done ? 0.06 : 0 },
                  opacity: { duration: durations.blink },
                }
              : { duration: durations.fast }
          }
        />
      </svg>
      {pending ? (
        <LoaderCircle
          className={cn(
            "absolute size-5.5 text-cobalt-bright",
            motionSafe && "animate-spin",
          )}
          strokeWidth={1.6}
        />
      ) : null}
    </span>
  );
}

type Geometry = {
  head: MotionValue<number>;
  body: MotionValue<number>;
  natural: () => number;
};

type RowProps = {
  step: SetupStep;
  index: number;
  state: SetupStepState | undefined;
  open: boolean;
  pending: boolean;
  busy: boolean;
  error: string | undefined;
  motionSafe: boolean;
  disabled: boolean;
  headId: string;
  bodyId: string;
  bindHeader: (node: HTMLButtonElement | null) => void;
  register: (id: string, g: Geometry) => () => void;
  onToggle: () => void;
  onHeaderKey: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onEscape: () => void;
  onRun: (input?: string) => void;
  onSkip: () => void;
  onClearError: () => void;
};

function Row({
  step,
  index,
  state,
  open,
  pending,
  busy,
  error,
  motionSafe,
  disabled,
  headId,
  bodyId,
  bindHeader,
  register,
  onToggle,
  onHeaderKey,
  onEscape,
  onRun,
  onSkip,
  onClearError,
}: RowProps) {
  const head = useMotionValue(0);
  const body = useMotionValue(open ? -1 : 0);
  const natural = React.useRef(0);
  const shown = React.useRef(open);
  const running = React.useRef<AnimationPlaybackControls | null>(null);
  const [headNode, setHeadNode] = React.useState<HTMLButtonElement | null>(
    null,
  );
  const [inner, setInner] = React.useState<HTMLDivElement | null>(null);
  const height = useTransform(body, (h) => (h < 0 ? "auto" : h));
  const visibility = useTransform(body, (h) =>
    h === 0 ? "hidden" : "visible",
  );

  React.useEffect(
    () => register(step.id, { head, body, natural: () => natural.current }),
    [register, step.id, head, body],
  );

  React.useEffect(() => {
    if (!headNode) return;
    const ro = new ResizeObserver(() => head.set(headNode.offsetHeight));
    ro.observe(headNode);
    return () => ro.disconnect();
  }, [headNode, head]);

  // The body glides to its measured height while open, so a validation line
  // or an error arriving inside it opens the room it needs.
  React.useEffect(() => {
    if (!inner) return;
    const ro = new ResizeObserver(() => {
      natural.current = inner.offsetHeight;
      if (!shown.current) return;
      const now = body.get();
      if (now < 0 || !motionSafe) {
        running.current?.stop();
        body.set(natural.current);
        return;
      }
      if (Math.abs(now - natural.current) < 0.5) return;
      running.current?.stop();
      running.current = animate(body, natural.current, springs.glide);
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, [inner, body, motionSafe]);

  React.useEffect(() => {
    if (shown.current === open) return;
    shown.current = open;
    const target = open ? natural.current : 0;
    running.current?.stop();
    if (body.get() < 0) body.jump(natural.current);
    if (!motionSafe) {
      body.set(target);
      return;
    }
    running.current = animate(body, target, springs.glide);
  }, [open, motionSafe, body]);

  // A re-run (StrictMode, a moved row) carries a stopped glide on to rest.
  React.useEffect(() => {
    const target = shown.current ? natural.current : 0;
    const now = body.get();
    if (now >= 0 && Math.abs(now - target) > 0.5 && natural.current > 0) {
      running.current = animate(
        body,
        target,
        motionSafe ? springs.glide : { duration: 0 },
      );
    }
    return () => running.current?.stop();
  }, [body, motionSafe]);

  const done = state === "done";
  const skipped = state === "skipped";
  const stateText = done
    ? "done"
    : skipped
      ? "skipped"
      : pending
        ? "in progress"
        : step.minutes
          ? `to do, about ${step.minutes} ${step.minutes === 1 ? "minute" : "minutes"}`
          : "to do";

  return (
    <li className="relative z-10">
      <h3 className="m-0">
        <button
          ref={(node) => {
            bindHeader(node);
            setHeadNode(node);
          }}
          id={headId}
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={`${step.title}, ${stateText}`}
          disabled={disabled}
          onClick={onToggle}
          onKeyDown={onHeaderKey}
          className={cn(
            "group/setup-checklist-step flex w-full items-center gap-2.5 rounded-2 px-3 py-3 text-left transition-colors",
            FOCUS,
            !open && "enabled:hover:bg-surface-2/70",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
        >
          <Mark
            index={index}
            state={state}
            open={open}
            pending={pending}
            motionSafe={motionSafe}
          />
          <span
            title={step.title}
            className={cn(
              "min-w-0 flex-1 truncate text-[13px] leading-5 transition-colors",
              state
                ? "text-ink-3 decoration-ink-3/50"
                : open
                  ? "font-medium text-foreground"
                  : "text-foreground",
              done && "line-through",
            )}
          >
            {step.title}
          </span>
          {skipped ? (
            <span className="shrink-0 rounded-full border border-hairline px-1.5 text-[11px] leading-4 text-ink-3">
              Skipped
            </span>
          ) : !state && step.optional ? (
            <span className="shrink-0 rounded-full border border-hairline px-1.5 text-[11px] leading-4 text-ink-3">
              Optional
            </span>
          ) : null}
          {!state && step.minutes ? (
            <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
              {step.minutes} min
            </span>
          ) : null}
          <motion.span
            aria-hidden
            className="flex shrink-0 text-ink-3 transition-colors group-hover/setup-checklist-step:text-ink-2"
            initial={false}
            animate={{ rotate: open ? 180 : 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            <ChevronDown className="size-4" />
          </motion.span>
        </button>
      </h3>
      <motion.div
        id={bodyId}
        role="region"
        aria-labelledby={headId}
        inert={!open}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          // Handled here, where focus is; the page must not also see it.
          event.preventDefault();
          event.stopPropagation();
          onEscape();
        }}
        className="overflow-clip"
        style={{ height, visibility }}
      >
        <motion.div
          ref={setInner}
          initial={false}
          animate={{ opacity: open ? 1 : 0 }}
          transition={{
            duration: open ? durations.base : durations.fast,
            ease: open ? easings.enter : easings.exit,
          }}
          className="grid gap-3 pr-3 pb-3.5 pl-11 @min-[60rem]:grid-cols-[minmax(0,1fr)_auto] @min-[60rem]:items-start @min-[60rem]:gap-6"
        >
          <p className="text-[13px] leading-5 text-ink-2">{step.description}</p>
          {state === "done" ? (
            <p className="flex items-center gap-1.5 text-[13px] leading-5 text-success">
              <Check aria-hidden className="size-4 shrink-0" />
              {step.doneLabel ?? "Done"}
            </p>
          ) : (
            <StepAction
              key={step.id}
              step={step}
              skipped={skipped}
              pending={pending}
              busy={busy}
              error={error}
              disabled={disabled}
              motionSafe={motionSafe}
              onRun={onRun}
              onSkip={onSkip}
              onClearError={onClearError}
            />
          )}
        </motion.div>
      </motion.div>
    </li>
  );
}

function PendingLabel({
  pending,
  label,
  pendingLabel,
  motionSafe,
}: {
  pending: boolean;
  label: string;
  pendingLabel: string;
  motionSafe: boolean;
}) {
  // Both labels share one grid cell, so the button keeps the wider width.
  return (
    <span className="inline-grid items-center">
      <span
        aria-hidden={pending || undefined}
        className={cn(
          "col-start-1 row-start-1 text-center transition-opacity",
          pending ? "opacity-0" : "opacity-100",
        )}
      >
        {label}
      </span>
      <span
        aria-hidden={!pending || undefined}
        className={cn(
          "col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 transition-opacity",
          pending ? "opacity-100" : "opacity-0",
        )}
      >
        <LoaderCircle
          aria-hidden
          className={cn("size-3.5 shrink-0", motionSafe && "animate-spin")}
        />
        {pendingLabel}
      </span>
    </span>
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function StepAction({
  step,
  skipped,
  pending,
  busy,
  error,
  disabled,
  motionSafe,
  onRun,
  onSkip,
  onClearError,
}: {
  step: SetupStep;
  skipped: boolean;
  pending: boolean;
  busy: boolean;
  error: string | undefined;
  disabled: boolean;
  motionSafe: boolean;
  onRun: (input?: string) => void;
  onSkip: () => void;
  onClearError: () => void;
}) {
  const action = step.action;
  const uid = React.useId();
  const fieldId = `${uid}-field`;
  const errorId = `${uid}-error`;
  const groupId = `${uid}-group`;
  const [text, setText] = React.useState("");
  const [local, setLocal] = React.useState<string | null>(null);
  const [choice, setChoice] = React.useState(
    action.kind === "choice"
      ? (action.defaultOption ?? action.options[0]?.id ?? "")
      : "",
  );
  const options = React.useRef(new Map<string, HTMLButtonElement>());
  const shownError = local ?? error;
  const pendingLabel = action.pendingLabel ?? "Working…";
  const locked = disabled || busy;

  const primary = cn(
    "inline-flex h-8 shrink-0 items-center justify-center rounded-2 bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-[filter,opacity]",
    "enabled:not-aria-disabled:hover:brightness-110 disabled:opacity-50 aria-disabled:cursor-default",
    FOCUS,
  );

  const submit = () => {
    if (locked) return;
    if (action.kind === "field") {
      const value = text.trim();
      if (!value) {
        setLocal("Fill this in first.");
        return;
      }
      if (action.type === "email" && !EMAIL.test(value)) {
        setLocal("That doesn't look like an email address.");
        return;
      }
      setLocal(null);
      onRun(value);
      return;
    }
    if (action.kind === "choice") {
      onRun(choice);
      return;
    }
    onRun();
  };

  const skip =
    step.optional && !skipped ? (
      <button
        type="button"
        disabled={disabled}
        aria-disabled={busy || undefined}
        onClick={() => {
          if (!busy) onSkip();
        }}
        className={cn(
          "inline-flex h-8 shrink-0 items-center rounded-2 px-2.5 text-[13px] text-ink-2 transition-colors enabled:not-aria-disabled:hover:bg-surface-2 enabled:not-aria-disabled:hover:text-foreground disabled:opacity-50",
          FOCUS,
        )}
      >
        Skip
      </button>
    ) : null;

  let control: React.ReactNode;
  if (action.kind === "field") {
    control = (
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="grid gap-1.5"
      >
        <label htmlFor={fieldId} className="text-[12px] text-ink-2">
          {action.label}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={fieldId}
            type={action.type ?? "text"}
            value={text}
            placeholder={action.placeholder}
            disabled={disabled}
            readOnly={busy}
            autoComplete={action.type === "email" ? "email" : "off"}
            spellCheck={false}
            aria-invalid={shownError ? true : undefined}
            aria-describedby={shownError ? errorId : undefined}
            onChange={(event) => {
              setText(event.currentTarget.value);
              if (local) setLocal(null);
              if (error) onClearError();
            }}
            className={cn(
              "h-8 w-48 max-w-full min-w-0 flex-1 rounded-2 border bg-background px-2.5 text-[13px] text-foreground transition-colors placeholder:text-ink-3 disabled:opacity-50",
              FOCUS,
              shownError ? "border-danger" : "border-input",
            )}
          />
          <button
            type="submit"
            disabled={disabled}
            aria-disabled={busy || undefined}
            className={primary}
          >
            <PendingLabel
              pending={pending}
              label={action.submit}
              pendingLabel={pendingLabel}
              motionSafe={motionSafe}
            />
          </button>
          {skip}
        </div>
      </form>
    );
  } else if (action.kind === "choice") {
    const list = action.options;
    const at = Math.max(
      0,
      list.findIndex((o) => o.id === choice),
    );
    const pick = (i: number) => {
      const o = list[(i + list.length) % list.length];
      if (!o || locked) return;
      setChoice(o.id);
      options.current.get(o.id)?.focus();
    };
    control = (
      <div className="grid gap-1.5">
        <span id={groupId} className="text-[12px] text-ink-2">
          {action.label}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="radiogroup"
            aria-labelledby={groupId}
            className="flex flex-wrap gap-1.5"
          >
            {list.map((o) => {
              const on = o.id === choice;
              return (
                <button
                  key={o.id}
                  ref={(node) => {
                    if (node) options.current.set(o.id, node);
                    else options.current.delete(o.id);
                  }}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  disabled={disabled}
                  onClick={() => {
                    if (!locked) setChoice(o.id);
                  }}
                  onKeyDown={(event) => {
                    const k = event.key;
                    if (k === "ArrowRight" || k === "ArrowDown") {
                      event.preventDefault();
                      pick(at + 1);
                    } else if (k === "ArrowLeft" || k === "ArrowUp") {
                      event.preventDefault();
                      pick(at - 1);
                    } else if (k === "Home") {
                      event.preventDefault();
                      pick(0);
                    } else if (k === "End") {
                      event.preventDefault();
                      pick(list.length - 1);
                    }
                  }}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 font-mono text-[12px] transition-colors disabled:opacity-50",
                    FOCUS,
                    on
                      ? "border-cobalt-bright bg-cobalt-wash text-cobalt-bright"
                      : "border-hairline text-ink-2 enabled:hover:text-foreground",
                  )}
                >
                  {on ? (
                    <Check aria-hidden className="size-3.5 shrink-0" />
                  ) : null}
                  {o.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={disabled}
            aria-disabled={busy || undefined}
            onClick={submit}
            className={primary}
          >
            <PendingLabel
              pending={pending}
              label={action.submit}
              pendingLabel={pendingLabel}
              motionSafe={motionSafe}
            />
          </button>
          {skip}
        </div>
      </div>
    );
  } else {
    control = (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          aria-disabled={busy || undefined}
          onClick={submit}
          className={primary}
        >
          <PendingLabel
            pending={pending}
            label={action.label}
            pendingLabel={pendingLabel}
            motionSafe={motionSafe}
          />
        </button>
        {skip}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-2">
      {control}
      <AnimatePresence initial={false}>
        {shownError ? (
          <motion.p
            key={shownError}
            id={errorId}
            role="alert"
            className="flex items-start gap-1.5 text-[12px] leading-4 text-danger"
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              y: motionSafe ? springs.snap : { duration: 0 },
              opacity: { duration: durations.fast },
            }}
          >
            <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
            {shownError}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * An onboarding checklist. Each step is a header that opens into its own
 * inline action — a field, a choice or one button — on the glide spring, to
 * its measured height. The open step is lifted out of the list as a raised
 * card (or marked by an accent bar), and that one surface travels: it is
 * placed from motion values, each row's header and body height, so it tracks
 * the rows exactly while they open and close, and when the open step changes
 * it glides from where it was to the new row.
 *
 * Finishing a step fills its disc on snap and draws its check on flick, rolls
 * the count and fills the ring's share on glide; a beat later the next
 * unfinished step slides into focus — its body opens, the lift arrives, and
 * keyboard focus moves to it. The last step lands the all-set state: sparks,
 * a stamped check or just colour, by `celebrate`, and a Dismiss that folds
 * the checklist into one line.
 *
 * Headers are an accordion: Up and Down move between them, Enter and Space
 * open, Escape inside a step closes it. Under reduced motion nothing glides
 * or bounces: bodies open at once, the lift moves at once, the ring takes its
 * share on a short tween and the check appears whole — progress still shows,
 * because progress is the point.
 */
export function SetupChecklist({
  steps = defaultSetupSteps,
  value,
  defaultValue = EMPTY,
  onValueChange,
  open,
  defaultOpen,
  onOpenChange,
  dismissed,
  defaultDismissed = false,
  onDismissedChange,
  onAction,
  onSkip,
  ring = "arc",
  expand = "lift",
  celebrate = "burst",
  advance = true,
  title = "Get started",
  subtitle = "Finish setting up your account to start taking payments.",
  doneTitle = "You're all set",
  doneBody = "Everything is ready. These steps stay in Settings if you need them again.",
  status = "ready",
  onRetry,
  label,
  sound = false,
  disabled = false,
  className,
}: SetupChecklistProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const barId = `${uid}-bar`;

  const [ownValue, setOwnValue] = React.useState<SetupProgress>(defaultValue);
  const progress = value ?? ownValue;
  const finishedCount = steps.filter((s) => isFinished(progress, s.id)).length;
  const total = steps.length;
  const allDone = total > 0 && finishedCount === total;
  const minutesLeft = steps.reduce(
    (sum, s) => sum + (isFinished(progress, s.id) ? 0 : (s.minutes ?? 0)),
    0,
  );

  const [ownOpen, setOwnOpen] = React.useState<string | null>(() =>
    defaultOpen !== undefined
      ? defaultOpen
      : (steps.find((s) => !isFinished(progress, s.id))?.id ?? null),
  );
  const openId = open !== undefined ? open : ownOpen;

  const [ownDismissed, setOwnDismissed] = React.useState(defaultDismissed);
  const isDismissed = dismissed ?? ownDismissed;

  const [pending, setPending] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Readonly<Record<string, string>>>(
    {},
  );

  // What a screen reader hears is frozen in the render that flips the
  // progress, from the new value — so a host that refuses is never announced.
  const signature = steps.map((s) => progress[s.id] ?? "-").join(",");
  const [seen, setSeen] = React.useState({ signature, progress });
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  if (seen.signature !== signature) {
    const before = seen.progress;
    setSeen({ signature, progress });
    const fresh = steps.filter(
      (s) => isFinished(progress, s.id) && !isFinished(before, s.id),
    );
    const last = fresh[fresh.length - 1];
    if (last) {
      const next = steps.find((s) => !isFinished(progress, s.id));
      const verb = progress[last.id] === "skipped" ? "skipped" : "done";
      setSaid((s) => ({
        n: s.n + 1,
        text:
          finishedCount === total
            ? `All ${total} steps done. ${doneTitle}.`
            : `${last.title} ${verb}. ${finishedCount} of ${total}.${next ? ` Next: ${next.title}.` : ""}`,
      }));
    }
  }

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const headers = React.useRef(new Map<string, HTMLButtonElement>());
  const timers = React.useRef(new Set<number>());
  const requested = React.useRef(new Set<string>());
  const alive = React.useRef(true);
  const wantDismissFocus = React.useRef(false);
  const [dismissNode, setDismissNode] =
    React.useState<HTMLButtonElement | null>(null);

  const share = useMotionValue(total > 0 ? finishedCount / total : 0);
  const burst = useMotionValue(0);
  const ringScale = useMotionValue(1);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const play = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  const setOpenTo = (id: string | null) => {
    if (open === undefined) setOwnOpen(id);
    onOpenChange?.(id);
  };

  const setDismissed = (next: boolean) => {
    if (dismissed === undefined) setOwnDismissed(next);
    onDismissedChange?.(next);
  };

  const nextAfter = (from: string, p: SetupProgress) => {
    const i = steps.findIndex((s) => s.id === from);
    for (let k = 1; k <= steps.length; k += 1) {
      const s = steps[(i + k) % steps.length];
      if (s && !isFinished(p, s.id)) return s;
    }
    return undefined;
  };

  const focusWithin = () => !!rootRef.current?.contains(document.activeElement);

  const finish = (step: SetupStep, as: SetupStepState) => {
    const next = { ...progress, [step.id]: as };
    const hadFocus = focusWithin();
    if (value === undefined) setOwnValue(next);
    onValueChange?.(next);
    requested.current.add(step.id);
    const nextStep = nextAfter(step.id, next);
    const all = steps.every((s) => isFinished(next, s.id));
    // The pressed control leaves with the action: focus waits on the step's
    // own header, then follows the advance.
    if (hadFocus) headers.current.get(step.id)?.focus({ preventScroll: true });
    if (all) {
      wantDismissFocus.current = hadFocus;
      later(() => setOpenTo(null), motionSafe ? BEAT * 1000 : 0);
      return;
    }
    if (!advance || !nextStep) return;
    later(
      () => {
        setOpenTo(nextStep.id);
        if (hadFocus && focusWithin()) {
          headers.current.get(nextStep.id)?.focus({ preventScroll: true });
        }
        later(() => reveal(nextStep.id), motionSafe ? 380 : 0);
      },
      motionSafe ? BEAT * 1000 : 0,
    );
  };

  /** In a height-limited panel, the opened step scrolls into view inside it. */
  const reveal = (id: string) => {
    const box = rootRef.current;
    const head = headers.current.get(id);
    if (!box || !head || box.scrollHeight <= box.clientHeight + 1) return;
    const top =
      head.getBoundingClientRect().top - box.getBoundingClientRect().top;
    if (top >= 0 && top + 140 <= box.clientHeight) return;
    box.scrollTo({
      top: box.scrollTop + top - 16,
      behavior: motionSafe ? "smooth" : "auto",
    });
  };

  const run = (step: SetupStep, input?: string) => {
    if (disabled || pending) return;
    setErrors((e) => {
      if (!(step.id in e)) return e;
      const rest = { ...e };
      delete rest[step.id];
      return rest;
    });
    let result: void | Promise<void>;
    try {
      result = onAction?.(step.id, input);
    } catch (error) {
      setErrors((e) => ({ ...e, [step.id]: messageOf(error) }));
      return;
    }
    if (!result || typeof result.then !== "function") {
      finish(step, "done");
      return;
    }
    setPending(step.id);
    result.then(
      () => {
        if (!alive.current) return;
        setPending(null);
        finish(step, "done");
      },
      (error: unknown) => {
        if (!alive.current) return;
        setPending(null);
        setErrors((e) => ({ ...e, [step.id]: messageOf(error) }));
      },
    );
  };

  const skip = (step: SetupStep) => {
    if (disabled || pending) return;
    onSkip?.(step.id);
    finish(step, "skipped");
  };

  const onHeaderKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const go = (i: number) => {
      const s = steps[(i + steps.length) % steps.length];
      if (s) headers.current.get(s.id)?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        go(index + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        go(index - 1);
        return;
      case "Home":
        event.preventDefault();
        go(0);
        return;
      case "End":
        event.preventDefault();
        go(steps.length - 1);
        return;
    }
  };

  /* ---------------------------- the moving lift ---------------------------- */

  const registry = React.useRef(new Map<string, Geometry>());
  const order = React.useRef(steps.map((s) => s.id));
  const liftTo = React.useRef<string | null>(null);
  const liftFrom = React.useRef<{ y: number; h: number } | null>(null);
  const liftShown = React.useRef(false);
  const travel = useMotionValue(1);
  const liftY = useMotionValue(0);
  const liftH = useMotionValue(0);
  const liftOpacity = useMotionValue(0);
  const fadeRef = React.useRef<AnimationPlaybackControls | null>(null);

  const relayout = React.useCallback(() => {
    const target = liftTo.current;
    if (!target) return;
    let y = PAD;
    let box: { y: number; h: number } | null = null;
    for (const id of order.current) {
      const g = registry.current.get(id);
      if (!g) return;
      const head = g.head.get();
      if (head <= 0) return;
      const b = g.body.get();
      const h = head + (b < 0 ? g.natural() : b);
      if (id === target) box = { y, h };
      y += h + GAP;
    }
    if (!box) return;
    const from = liftFrom.current;
    const t = travel.get();
    liftY.set(r2(from ? lerp(from.y, box.y, t) : box.y));
    liftH.set(r2(from ? lerp(from.h, box.h, t) : box.h));
    if (!liftShown.current) {
      liftShown.current = true;
      fadeRef.current?.stop();
      fadeRef.current = animate(liftOpacity, 1, {
        duration: durations.fast,
        ease: easings.enter,
      });
    }
  }, [travel, liftY, liftH, liftOpacity]);

  const register = React.useCallback(
    (id: string, g: Geometry) => {
      registry.current.set(id, g);
      const offs = [
        g.head.on("change", relayout),
        g.body.on("change", relayout),
      ];
      relayout();
      return () => {
        for (const off of offs) off();
        if (registry.current.get(id) === g) registry.current.delete(id);
      };
    },
    [relayout],
  );

  const ids = steps.map((s) => s.id).join("|");
  React.useEffect(() => {
    order.current = ids.split("|");
    relayout();
  }, [ids, relayout]);

  React.useEffect(() => travel.on("change", relayout), [travel, relayout]);

  const target =
    status === "ready" &&
    !isDismissed &&
    openId &&
    steps.some((s) => s.id === openId)
      ? openId
      : null;
  React.useEffect(() => {
    const prev = liftTo.current;
    if (prev === target) {
      relayout();
      return;
    }
    liftTo.current = target;
    if (!target) {
      liftShown.current = false;
      liftFrom.current = null;
      fadeRef.current?.stop();
      fadeRef.current = animate(liftOpacity, 0, {
        duration: durations.fast,
        ease: easings.exit,
      });
      return;
    }
    if (!prev || !liftShown.current || !motionSafe) {
      // Nothing to travel from: it appears where it belongs.
      liftFrom.current = null;
      liftShown.current = false;
      travel.jump(1);
      relayout();
      return;
    }
    liftFrom.current = { y: liftY.get(), h: liftH.get() };
    travel.jump(0);
    play("travel", animate(travel, 1, springs.glide));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, motionSafe, relayout]);

  /* -------------------- progress: ring, sound, celebration ------------------- */

  const prevSignature = React.useRef<string | null>(null);
  const prevProgress = React.useRef<SetupProgress>(progress);
  React.useEffect(() => {
    const before = prevSignature.current;
    const was = prevProgress.current;
    prevSignature.current = signature;
    prevProgress.current = progress;
    const to = total > 0 ? finishedCount / total : 0;
    if (before === null) {
      share.set(to);
      return;
    }
    if (before === signature) return;
    play(
      "share",
      animate(
        share,
        to,
        motionSafe
          ? springs.glide
          : { duration: durations.fast, ease: easings.enter },
      ),
    );
    const fresh = steps.filter(
      (s) => isFinished(progress, s.id) && !isFinished(was, s.id),
    );
    const mine = fresh.filter((s) => requested.current.has(s.id));
    for (const s of fresh) requested.current.delete(s.id);
    if (mine.length > 0) {
      audio.play("plip", {
        pitch: r2(semitones(Math.min(12, 2 * finishedCount)) * 0.9),
        gain: 0.55,
      });
    }
    const wasAll = steps.every((s) => isFinished(was, s.id));
    if (!allDone || wasAll) return;
    if (mine.length > 0) {
      later(() => audio.play("chime", { pitch: 1, gain: 0.5 }), 200);
    }
    if (!motionSafe || celebrate === "quiet") return;
    if (celebrate === "burst") {
      burst.jump(0);
      play(
        "burst",
        animate(burst, 1, { duration: 0.52, ease: easings.enter, delay: 0.1 }),
      );
    } else {
      ringScale.jump(0.9);
      play("ring", animate(ringScale, 1, springs.recoil));
    }
    // Progress is watched through its signature; the rest is read fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // The Dismiss button arrives with the all-set state: focus that was in the
  // checklist moves to it once it exists.
  React.useEffect(() => {
    if (!dismissNode || !wantDismissFocus.current) return;
    wantDismissFocus.current = false;
    dismissNode.focus({ preventScroll: true });
  }, [dismissNode]);

  React.useEffect(() => {
    alive.current = true;
    const waiting = timers.current;
    const running = anims.current;
    return () => {
      alive.current = false;
      for (const t of waiting) window.clearTimeout(t);
      waiting.clear();
      for (const c of running.values()) c.stop();
      running.clear();
      fadeRef.current?.stop();
    };
  }, []);

  /* --------------------------------- render -------------------------------- */

  const panel = (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4 @min-[40rem]:grid-cols-[13rem_minmax(0,1fr)] @min-[40rem]:gap-6 @min-[40rem]:p-5 @min-[60rem]:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="flex items-center gap-3.5 @min-[40rem]:flex-col @min-[40rem]:items-start @min-[40rem]:gap-4">
        <div
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={finishedCount}
          aria-valuetext={`${finishedCount} of ${total} ${total === 1 ? "step" : "steps"} done`}
        >
          <Ring
            kind={ring}
            count={total}
            done={finishedCount}
            share={share}
            burst={burst}
            scale={ringScale}
            complete={allDone}
            motionSafe={motionSafe}
          />
        </div>
        <Measured
          motionSafe={motionSafe}
          className="min-w-0 flex-1 @min-[40rem]:w-full @min-[40rem]:flex-none"
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={allDone ? "done" : "todo"}
              className="grid gap-1"
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                y: motionSafe ? springs.snap : { duration: 0 },
                opacity: { duration: durations.base, ease: easings.enter },
              }}
            >
              <h2
                id={titleId}
                className="text-[15px] leading-5 font-semibold text-foreground"
              >
                {allDone ? doneTitle : title}
              </h2>
              <p className="text-[13px] leading-5 text-ink-2">
                {allDone ? doneBody : subtitle}
              </p>
              {allDone ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    ref={setDismissNode}
                    type="button"
                    disabled={disabled}
                    onClick={() => setDismissed(true)}
                    className={cn(
                      "inline-flex h-8 items-center rounded-2 bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-[filter] enabled:hover:brightness-110 disabled:opacity-50",
                      FOCUS,
                    )}
                  >
                    Dismiss
                  </button>
                </div>
              ) : minutesLeft > 0 ? (
                <p className="font-mono text-[11px] text-ink-3 tabular-nums">
                  About {minutesLeft} min left
                </p>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </Measured>
        {!allDone ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setDismissed(true)}
            className={cn(
              "-ml-2 hidden h-8 items-center rounded-2 px-2 text-[12px] text-ink-3 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:opacity-50 @min-[40rem]:inline-flex",
              FOCUS,
            )}
          >
            Skip setup for now
          </button>
        ) : null}
      </div>

      <ol
        role="list"
        aria-label="Setup steps"
        className="relative isolate flex flex-col rounded-3 border border-hairline bg-surface-1"
        style={{ gap: GAP, padding: PAD }}
      >
        <motion.div
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0 z-0",
            expand === "lift"
              ? "rounded-3 border border-hairline-strong bg-popover shadow-[0_6px_18px_-6px_color-mix(in_oklab,black_22%,transparent)]"
              : "rounded-r-2 border-l-2 border-cobalt-bright bg-cobalt-wash",
          )}
          style={{
            left: expand === "lift" ? PAD - 4 : PAD,
            right: expand === "lift" ? PAD - 4 : PAD,
            y: liftY,
            height: liftH,
            opacity: liftOpacity,
          }}
        />
        {steps.map((step, i) => (
          <Row
            key={step.id}
            step={step}
            index={i}
            state={progress[step.id]}
            open={openId === step.id}
            pending={pending === step.id}
            busy={pending !== null}
            error={errors[step.id]}
            motionSafe={motionSafe}
            disabled={disabled}
            headId={`${uid}-head-${step.id}`}
            bodyId={`${uid}-body-${step.id}`}
            bindHeader={(node) => {
              if (node) headers.current.set(step.id, node);
              else headers.current.delete(step.id);
            }}
            register={register}
            onToggle={() => setOpenTo(openId === step.id ? null : step.id)}
            onHeaderKey={(event) => onHeaderKey(event, i)}
            onEscape={() => {
              setOpenTo(null);
              headers.current.get(step.id)?.focus();
            }}
            onRun={(input) => run(step, input)}
            onSkip={() => skip(step)}
            onClearError={() =>
              setErrors((e) => {
                if (!(step.id in e)) return e;
                const rest = { ...e };
                delete rest[step.id];
                return rest;
              })
            }
          />
        ))}
      </ol>
    </div>
  );

  const bar = (
    <div className="flex items-center gap-3 px-4 py-3">
      <span
        aria-hidden
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full",
          allDone
            ? "text-primary-foreground"
            : "border border-hairline-strong text-ink-3",
        )}
        style={allDone ? { background: PIGMENT } : undefined}
      >
        {allDone ? (
          <Check className="size-3.5" strokeWidth={3} />
        ) : (
          <span className="font-mono text-[10px]">{finishedCount}</span>
        )}
      </span>
      <p
        id={barId}
        className="min-w-0 flex-1 truncate text-[13px] text-foreground"
      >
        {allDone ? "Setup complete" : "Setup hidden"}
        <span className="text-ink-3">
          {" "}
          · {finishedCount} of {total}
        </span>
      </p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setDismissed(false)}
        className={cn(
          "inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-[12px] text-ink-2 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:opacity-50",
          FOCUS,
        )}
      >
        {allDone ? "Show steps" : "Resume setup"}
      </button>
    </div>
  );

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div className="grid gap-4 p-4" aria-busy>
        <div className="flex items-center gap-3.5">
          <span className="size-13 shrink-0 animate-pulse rounded-full bg-surface-2" />
          <div className="grid flex-1 gap-2">
            <span className="h-3.5 w-32 animate-pulse rounded-1 bg-surface-2" />
            <span className="h-3 w-48 max-w-full animate-pulse rounded-1 bg-surface-2" />
          </div>
        </div>
        <div className="grid gap-2 rounded-3 border border-hairline p-3">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="h-5 animate-pulse rounded-1 bg-surface-2"
            />
          ))}
        </div>
        <p id={titleId} className="sr-only">
          Loading {title}
        </p>
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p id={titleId} className="text-[13px] text-foreground">
          Couldn&apos;t load your setup steps.
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={onRetry}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-foreground transition-colors enabled:hover:bg-surface-2",
            FOCUS,
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Retry
        </button>
      </div>
    );
  } else {
    body = (
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={isDismissed ? "bar" : "panel"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={{ duration: durations.base, ease: easings.enter }}
        >
          {isDismissed ? bar : panel}
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={
        label ? undefined : status === "ready" && isDismissed ? barId : titleId
      }
      aria-label={label}
      className={cn(
        "@container w-full [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      <Measured motionSafe={motionSafe}>{body}</Measured>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "That didn't work. Try again.";
}
