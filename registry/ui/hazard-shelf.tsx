"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";
import {
  Archive,
  ArrowRightLeft,
  Check,
  ChevronUp,
  KeyRound,
  LoaderCircle,
  RotateCcw,
  ShieldOff,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";

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

export type HazardIcon = "transfer" | "archive" | "trash" | "key" | "alert";

/** How an action's button arms: by typing the workspace name, or by acknowledging each consequence. */
export type HazardGate = "match" | "acknowledge";

export type HazardAction = {
  id: string;
  /** E.g. "Delete all data". */
  title: string;
  /** One line under the title: what it does and what it costs. */
  summary: string;
  /** The button's verb, e.g. "Delete". */
  verb: string;
  /** Shown and announced while it runs, e.g. "Deleting all data". */
  busyText: string;
  /** Shown and announced once it has, e.g. "All data deleted". */
  doneText: string;
  /** @default "alert" */
  icon?: HazardIcon;
  /** @default "match" */
  gate?: HazardGate;
  /** For an "acknowledge" gate: what must be accepted, one check each. */
  consequences?: string[];
  /** A reversible action waits out an undo window before it runs. @default false */
  reversible?: boolean;
};

/** Where one action is: `undo` is the window before a reversible one runs. */
export type HazardPhase = "idle" | "undo" | "working" | "done" | "failed";
export type HazardCoverStyle = "hinge" | "slide" | "fade";
export type HazardTone = "danger" | "warn";
export type HazardStatus = "ready" | "loading" | "error";

export type HazardShelfProps = {
  /** The hazardous actions, in shelf order. @default defaultHazardActions */
  actions?: HazardAction[];
  /** The name a "match" gate must be typed letter by letter. @default defaultHazardWorkspace */
  workspaceName?: string;
  /** Controlled: the id of the action whose cover is lifted, or null. */
  value?: string | null;
  /** Initial lifted cover when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires with the id whose cover was lifted, or null when one closed. */
  onChange?: (openId: string | null) => void;
  /** Runs the action once its hold completes (and any undo window has passed). Resolve when done; reject to show a failure. @default a simulator that resolves after 900ms */
  onConfirm?: (action: HazardAction) => Promise<void> | void;
  /** Cancel was pressed inside a reversible action's undo window. */
  onCancel?: (action: HazardAction) => void;
  /** An action completed. */
  onDone?: (action: HazardAction) => void;
  /** How a cover gets out of the way: a lid on a top hinge, a sleeve sliding aside, or a cross-fade. @default "hinge" */
  coverStyle?: HazardCoverStyle;
  /** How long the button must be held, in seconds. @default 1.2 */
  holdSeconds?: number;
  /** How long a reversible action waits for Cancel before it runs, in seconds. @default 8 */
  undoSeconds?: number;
  /** The colour the hazards are drawn in. @default "danger" */
  tone?: HazardTone;
  /** Whether the actions have arrived. @default "ready" */
  status?: HazardStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Danger zone" */
  title?: string;
  /** Shown when there are no actions. @default "No hazards are available for your role." */
  emptyText?: string;
  /** Under it. @default "Ask an owner to make these changes." */
  emptyHint?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the shelf scrolls inside it. @default 520 */
  height?: number;
  /** Read only: no cover lifts. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultHazardWorkspace = "Basinworks";

/** The danger zone of a Basinworks workspace: two reversible moves, two not. */
export const defaultHazardActions: HazardAction[] = [
  {
    id: "transfer",
    title: "Transfer ownership",
    summary:
      "Hand the workspace to Coldbrook Ltd. You keep an admin seat; billing moves with it.",
    verb: "Transfer",
    busyText: "Transferring ownership",
    doneText: "Ownership transferred",
    icon: "transfer",
    reversible: true,
  },
  {
    id: "archive",
    title: "Archive workspace",
    summary:
      "Members lose access today. Boards and files are kept for 30 days, then purged.",
    verb: "Archive",
    busyText: "Archiving the workspace",
    doneText: "Workspace archived",
    icon: "archive",
    reversible: true,
  },
  {
    id: "delete",
    title: "Delete all data",
    summary:
      "Every board, file, comment and audit entry, gone for good. Exports stop working.",
    verb: "Delete",
    busyText: "Deleting all data",
    doneText: "All data deleted",
    icon: "trash",
  },
  {
    id: "rotate",
    title: "Rotate every key",
    summary:
      "API keys, webhook secrets and personal tokens are reissued at once.",
    verb: "Rotate",
    busyText: "Rotating every key",
    doneText: "Every key rotated",
    icon: "key",
    gate: "acknowledge",
    consequences: [
      "Every integration on a current key stops until it is updated.",
      "Jobs running on a key fail the moment it expires.",
      "Members with personal tokens have to sign in again.",
    ],
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const TONES: Record<HazardTone, string> = {
  danger: "var(--danger)",
  warn: "var(--warn)",
};

const ICONS: Record<HazardIcon, LucideIcon> = {
  transfer: ArrowRightLeft,
  archive: Archive,
  trash: Trash2,
  key: KeyRound,
  alert: TriangleAlert,
};

/** How far a hinged lid swings back: past upright, so it reads as open. */
const HINGE_DEG = -104;
/** How much of a sliding sleeve stays in the slot as a tab to pull it back. */
const SLEEVE_X = "82%";
/** A finished action keeps its cover up this long before it closes itself. */
const DONE_CLOSE_MS = 1400;
const RING_R = 7;
const RING_C = 2 * Math.PI * RING_R;

const noopSubscribe = () => () => {};
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Number(v.toFixed(3));

/** The default `onConfirm`: the action takes about a second and succeeds. */
export const simulateHazard = (): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, 900);
  });

const isArmed = (
  action: HazardAction,
  workspaceName: string,
  typed: string,
  acks: boolean[],
) => {
  if ((action.gate ?? "match") === "acknowledge") {
    const n = action.consequences?.length ?? 0;
    return n > 0 && acks.length >= n && acks.slice(0, n).every(Boolean);
  }
  return workspaceName.length > 0 && typed === workspaceName;
};

/* ----------------------------------------------------------------------- */
/*                               Letter ticks                               */
/* ----------------------------------------------------------------------- */

type LetterState = "pending" | "hit" | "miss";

/**
 * The workspace name as a row of letters the field is matched against: a
 * letter ticks solid, with a bar drawing under it on flick, the moment the
 * same letter is typed at its place; a wrong one goes the hazard's colour.
 */
function Letters({
  name,
  typed,
  motionSafe,
}: {
  name: string;
  typed: string;
  motionSafe: boolean;
}) {
  const extra = Math.max(0, typed.length - name.length);
  return (
    <span
      aria-hidden
      className="flex flex-wrap items-end gap-x-[3px] gap-y-1 font-mono text-[13px] leading-none"
    >
      {Array.from(name).map((ch, i) => {
        const t = typed[i];
        const state: LetterState =
          t === undefined ? "pending" : t === ch ? "hit" : "miss";
        return (
          <span
            key={i}
            className={cn(
              "relative inline-flex h-5 min-w-[0.7ch] flex-col items-center justify-end pb-1 transition-colors duration-200",
              state === "hit"
                ? "text-foreground"
                : state === "miss"
                  ? "text-(--hs-tone)"
                  : "text-ink-3",
            )}
          >
            <span className={cn(state === "miss" && "line-through")}>
              {ch === " " ? " " : ch}
            </span>
            {/* A faint rule under every letter still to come... */}
            <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-hairline-strong" />
            {/* ...and over it the tick that draws in when it is typed. */}
            <motion.span
              className={cn(
                "absolute inset-x-0 bottom-0 h-[2px] rounded-full",
                state === "miss" ? "bg-(--hs-tone)" : "bg-foreground",
              )}
              style={{ originX: 0 }}
              initial={false}
              animate={{ scaleX: state === "pending" ? 0 : 1 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
          </span>
        );
      })}
      {extra > 0 ? (
        <span className="pb-1 text-[11px] text-(--hs-tone)">+{extra}</span>
      ) : null}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                            Acknowledge check                             */
/* ----------------------------------------------------------------------- */

function AckCheck({
  id,
  text,
  checked,
  index,
  disabled,
  motionSafe,
  live,
  nodeRef,
  onToggle,
}: {
  id: string;
  text: string;
  checked: boolean;
  index: number;
  disabled: boolean;
  motionSafe: boolean;
  live: boolean;
  nodeRef?: (node: HTMLButtonElement | null) => void;
  onToggle: () => void;
}) {
  return (
    <motion.button
      ref={nodeRef}
      id={id}
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onToggle();
      }}
      initial={
        live ? { opacity: 0, y: motionSafe ? distances.nudge : 0 } : false
      }
      animate={{ opacity: 1, y: 0 }}
      transition={{
        y: motionSafe
          ? { ...springs.glide, delay: r3(index * cascade(3)) }
          : { duration: 0 },
        opacity: {
          duration: durations.base,
          ease: easings.enter,
          delay: motionSafe ? r3(index * cascade(3)) : 0,
        },
      }}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-2 px-2 py-1.5 text-left text-[13px] leading-snug transition-colors",
        disabled ? "cursor-default" : "cursor-pointer hover:bg-surface-2",
        checked ? "text-foreground" : "text-ink-2",
        FOCUS_RING,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-[1px] flex size-4 shrink-0 items-center justify-center rounded-1 border transition-colors duration-200",
          checked
            ? "border-(--hs-tone) bg-(--hs-tone) text-(--hs-ink)"
            : "border-hairline-strong bg-surface-1",
        )}
      >
        {checked ? (
          <svg viewBox="0 0 14 14" className="size-3">
            <motion.path
              d="M3 7.4 5.8 10 11 4.2"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={motionSafe ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
          </svg>
        ) : null}
      </span>
      <span className="min-w-0">{text}</span>
    </motion.button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Hold button                               */
/* ----------------------------------------------------------------------- */

type HoldButtonProps = {
  action: HazardAction;
  open: boolean;
  armed: boolean;
  phase: HazardPhase;
  holdSeconds: number;
  motionSafe: boolean;
  inert: boolean;
  hintId: string;
  nodeRef: (node: HTMLButtonElement | null) => void;
  onComplete: () => void;
  onRelease: () => void;
};

/**
 * The red button under the cover. Armed, it is held: a ring fills over
 * `holdSeconds` on a linear tween, drains on release before it is full, and
 * fires the action when it closes. Pointer and Space hold alike.
 */
function HoldButton({
  action,
  open,
  armed,
  phase,
  holdSeconds,
  motionSafe,
  inert,
  hintId,
  nodeRef,
  onComplete,
  onRelease,
}: HoldButtonProps) {
  const progress = useMotionValue(0);
  const dash = useTransform(progress, (p) => RING_C * (1 - p));
  const controls = React.useRef<ReturnType<typeof animate> | null>(null);
  const [holding, setHolding] = React.useState(false);
  const handlers = React.useRef({ onComplete, onRelease });
  React.useEffect(() => {
    handlers.current = { onComplete, onRelease };
  });

  const canHold =
    open && armed && !inert && (phase === "idle" || phase === "failed");

  const stop = React.useCallback(
    (drain: boolean) => {
      controls.current?.stop();
      controls.current = null;
      if (drain) {
        controls.current = animate(progress, 0, exitFor(durations.base));
      } else {
        progress.set(0);
      }
    },
    [progress],
  );

  const start = () => {
    if (!canHold || holding) return;
    controls.current?.stop();
    setHolding(true);
    const remaining = Math.max(0.05, holdSeconds * (1 - progress.get()));
    controls.current = animate(progress, 1, {
      duration: remaining,
      ease: "linear",
      onComplete: () => {
        controls.current = null;
        setHolding(false);
        handlers.current.onComplete();
      },
    });
  };

  const release = React.useCallback(() => {
    setHolding(false);
    if (progress.get() >= 1) return;
    stop(true);
    handlers.current.onRelease();
  }, [progress, stop]);

  // A hidden tab cannot keep a hold honest: let go of it.
  React.useEffect(() => {
    if (!holding) return;
    const onVisibility = () => {
      if (document.hidden) release();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [holding, release]);

  // The ring starts empty whenever the button is covered again or re-armed.
  React.useEffect(() => {
    if (!open || phase === "idle") {
      controls.current?.stop();
      controls.current = null;
      progress.set(0);
    }
  }, [open, phase, progress]);

  React.useEffect(
    () => () => {
      controls.current?.stop();
    },
    [],
  );

  const Icon = ICONS[action.icon ?? "alert"];
  const busy = phase === "working";
  const done = phase === "done";
  const waiting = phase === "undo";
  const enabled = canHold;

  const text = done
    ? "Done"
    : busy
      ? "Working"
      : waiting
        ? "Scheduled"
        : !open
          ? "Covered"
          : !armed
            ? (action.gate ?? "match") === "acknowledge"
              ? "Acknowledge all"
              : "Type the name"
            : holding
              ? "Keep holding"
              : phase === "failed"
                ? "Hold to retry"
                : `Hold to ${action.verb.toLowerCase()}`;

  return (
    <motion.button
      ref={nodeRef}
      type="button"
      disabled={!enabled}
      aria-hidden={!open || undefined}
      tabIndex={open ? undefined : -1}
      aria-describedby={open ? hintId : undefined}
      aria-label={
        enabled
          ? `${action.verb}. Hold for ${holdSeconds.toFixed(1)} seconds.`
          : undefined
      }
      onPointerDown={(event) => {
        if (event.button !== 0 || !enabled) return;
        event.preventDefault();
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // capture is an optimisation; the hold works without it
        }
        event.currentTarget.focus({ preventScroll: true });
        start();
      }}
      onPointerUp={() => {
        if (holding) release();
      }}
      onPointerCancel={() => {
        if (holding) release();
      }}
      onLostPointerCapture={() => {
        if (holding) release();
      }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === " ") {
          event.preventDefault();
          if (!event.repeat) start();
        } else if (event.key === "Enter") {
          // Enter would click; a hazard is held, never clicked.
          event.preventDefault();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === " " && holding) {
          event.preventDefault();
          release();
        }
      }}
      onBlur={() => {
        if (holding) release();
      }}
      initial={false}
      animate={{ scale: holding ? 0.97 : 1 }}
      transition={motionSafe ? springs.flick : { duration: 0 }}
      className={cn(
        "absolute inset-0 flex items-center justify-center gap-2 rounded-2 border px-3 text-[12px] font-medium whitespace-nowrap transition-colors duration-200 select-none [-webkit-touch-callout:none]",
        enabled
          ? "cursor-pointer border-transparent bg-(--hs-tone) text-(--hs-ink)"
          : done
            ? "border-(--hs-edge) bg-(--hs-wash) text-foreground"
            : "border-hairline bg-surface-1 text-ink-3",
        FOCUS_RING,
      )}
    >
      {done ? (
        <motion.span
          aria-hidden
          className="flex size-4 items-center justify-center rounded-full bg-(--hs-tone) text-(--hs-ink)"
          initial={motionSafe ? { scale: 0.3, opacity: 0 } : { opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={
            motionSafe
              ? { ...springs.recoil, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          <Check className="size-3" strokeWidth={2.4} />
        </motion.span>
      ) : busy ? (
        <LoaderCircle
          aria-hidden
          className="size-4 text-ink-2 motion-safe:animate-spin"
        />
      ) : enabled ? (
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="size-4 shrink-0 -rotate-90"
        >
          <circle
            cx={10}
            cy={10}
            r={RING_R}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            opacity={0.3}
          />
          <motion.circle
            cx={10}
            cy={10}
            r={RING_R}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={RING_C}
            style={{ strokeDashoffset: dash }}
          />
        </svg>
      ) : (
        <Icon aria-hidden className="size-3.5 shrink-0" />
      )}
      <span className="truncate">{text}</span>
    </motion.button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Undo bar                                 */
/* ----------------------------------------------------------------------- */

function UndoBar({
  action,
  undoSeconds,
  awake,
  motionSafe,
  inert,
  onCancel,
  onElapsed,
}: {
  action: HazardAction;
  undoSeconds: number;
  awake: boolean;
  motionSafe: boolean;
  inert: boolean;
  onCancel: () => void;
  onElapsed: () => void;
}) {
  const left = useMotionValue(1);
  const seconds = useTransform(left, (v) =>
    String(Math.max(0, Math.ceil(v * undoSeconds))),
  );
  const controls = React.useRef<ReturnType<typeof animate> | null>(null);
  const elapsed = React.useRef(onElapsed);
  React.useEffect(() => {
    elapsed.current = onElapsed;
  });

  // One linear tween is the whole clock; it pauses while nobody can see it.
  React.useEffect(() => {
    const c = animate(left, 0, {
      duration: Math.max(0.5, undoSeconds),
      ease: "linear",
      onComplete: () => {
        controls.current = null;
        elapsed.current();
      },
    });
    controls.current = c;
    return () => {
      c.stop();
      controls.current = null;
    };
  }, [left, undoSeconds]);

  React.useEffect(() => {
    const c = controls.current;
    if (!c) return;
    if (awake) c.play();
    else c.pause();
  }, [awake]);

  return (
    <motion.div
      role="group"
      aria-label={`${action.title} undo window`}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0, transition: exitFor(durations.base) }}
      transition={
        motionSafe
          ? { height: springs.glide, opacity: { duration: durations.base } }
          : { height: { duration: 0 }, opacity: { duration: durations.base } }
      }
      className="overflow-hidden"
    >
      <div className="mx-4 mb-3 flex flex-col gap-2 rounded-3 border border-(--hs-edge) bg-(--hs-wash) px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-[12px] text-foreground">
            <span className="font-medium">{action.title}</span>{" "}
            <span className="text-ink-2">
              in{" "}
              <motion.span
                aria-hidden
                className="font-mono text-foreground tabular-nums"
              >
                {seconds}
              </motion.span>
              <span className="sr-only">{undoSeconds}</span> s
            </span>
          </p>
          <button
            type="button"
            onClick={() => {
              if (!inert) onCancel();
            }}
            aria-disabled={inert || undefined}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1 rounded-2 border border-hairline-strong bg-card px-2.5 text-xs text-foreground transition-colors hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            <X aria-hidden className="size-3.5" />
            Cancel
          </button>
        </div>
        <div
          aria-hidden
          className="relative h-1 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--hs-tone)_18%,transparent)]"
        >
          <motion.div
            className="absolute inset-0 rounded-full bg-(--hs-tone)"
            style={{ scaleX: left, originX: 0 }}
          />
        </div>
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Row                                    */
/* ----------------------------------------------------------------------- */

type RowProps = {
  action: HazardAction;
  open: boolean;
  phase: HazardPhase;
  workspaceName: string;
  coverStyle: HazardCoverStyle;
  holdSeconds: number;
  undoSeconds: number;
  motionSafe: boolean;
  inert: boolean;
  live: boolean;
  awake: boolean;
  tabIndex: number;
  /** The row's place in the shelf, for its arrival stagger. */
  index: number;
  uid: string;
  coverRef: (node: HTMLButtonElement | null) => void;
  fieldRef: (node: HTMLElement | null) => void;
  onToggle: (open: boolean) => void;
  onFocusCover: () => void;
  onNav: (event: React.KeyboardEvent) => void;
  onArm: (armed: boolean) => void;
  onCommit: () => void;
  onRelease: () => void;
  onUndoCancel: () => void;
  onUndoElapsed: () => void;
};

function HazardRow({
  action,
  open,
  phase,
  workspaceName,
  coverStyle,
  holdSeconds,
  undoSeconds,
  motionSafe,
  inert,
  live,
  awake,
  tabIndex,
  index,
  uid,
  coverRef,
  fieldRef,
  onToggle,
  onFocusCover,
  onNav,
  onArm,
  onCommit,
  onRelease,
  onUndoCancel,
  onUndoElapsed,
}: RowProps) {
  const panelId = `${uid}-panel-${action.id}`;
  const hintId = `${uid}-hint-${action.id}`;
  const matchId = `${uid}-match-${action.id}`;
  const gate = action.gate ?? "match";
  const consequences = action.consequences ?? [];
  const Icon = ICONS[action.icon ?? "alert"];

  const holdNode = React.useRef<HTMLButtonElement | null>(null);
  const [typed, setTyped] = React.useState("");
  const [acks, setAcks] = React.useState<boolean[]>([]);
  // The draft belongs to one lift of the cover: closing it starts over.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    setTyped("");
    setAcks([]);
  }

  const armed = isArmed(action, workspaceName, typed, acks);
  const lifted = open;
  const finished = phase === "done";
  const settled = phase === "idle" || phase === "failed";
  // Only a row with nothing in flight can have its cover lifted or closed by
  // hand; the rest close themselves when they are done.
  const coverInert = inert || !settled;

  const hits = Array.from(workspaceName).filter(
    (ch, i) => typed[i] === ch,
  ).length;

  const setTypedAndArm = (next: string) => {
    setTyped(next);
    onArm(isArmed(action, workspaceName, next, acks));
  };
  const toggleAck = (i: number) => {
    const next = consequences.map((_, j) => (j === i ? !acks[j] : !!acks[j]));
    setAcks(next);
    onArm(isArmed(action, workspaceName, typed, next));
  };

  // What the cover does when it is lifted, by style. Reduced motion makes
  // every style a cross-fade: the lid neither swings nor slides.
  const fades = coverStyle === "fade" || !motionSafe;
  const coverAnimate = fades
    ? { opacity: lifted ? 0 : 1, rotateX: 0, x: "0%" }
    : coverStyle === "hinge"
      ? { rotateX: lifted ? HINGE_DEG : 0, x: "0%", opacity: 1 }
      : { x: lifted ? SLEEVE_X : "0%", rotateX: 0, opacity: 1 };
  const coverTransition = fades
    ? { duration: durations.base, ease: easings.move }
    : { ...springs.snap, opacity: { duration: durations.fast } };
  const coverHidden = fades && lifted;

  const delay = motionSafe ? r3(index * cascade(8)) : 0;

  return (
    <motion.li
      initial={
        live ? { opacity: 0, y: motionSafe ? distances.step : 0 } : false
      }
      animate={{ opacity: 1, y: 0 }}
      transition={{
        y: motionSafe ? { ...springs.glide, delay } : { duration: 0 },
        opacity: { duration: durations.base, ease: easings.enter, delay },
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open && settled) {
          event.preventDefault();
          event.stopPropagation();
          onToggle(false);
        }
      }}
      className={cn(
        "relative border-b border-hairline last:border-b-0",
        lifted && "z-10",
      )}
    >
      <div className="flex flex-col gap-3 px-4 py-3.5 @min-[30rem]:flex-row @min-[30rem]:items-center @min-[30rem]:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            aria-hidden
            className={cn(
              "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-2 border transition-colors duration-200",
              lifted || finished
                ? "border-(--hs-edge) bg-(--hs-wash) text-(--hs-tone)"
                : "border-hairline bg-surface-1 text-ink-2",
            )}
          >
            <Icon className="size-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-foreground">
              <span className="min-w-0">{action.title}</span>
              {action.reversible ? (
                <span className="rounded-full border border-hairline px-1.5 py-px font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  {undoSeconds}s undo
                </span>
              ) : (
                <span className="rounded-full border border-(--hs-edge) px-1.5 py-px font-mono text-[10px] tracking-[0.08em] text-(--hs-tone) uppercase">
                  Permanent
                </span>
              )}
              <AnimatePresence initial={false}>
                {finished ? (
                  <motion.span
                    key="done"
                    initial={{ opacity: 0, scale: motionSafe ? 0.6 : 1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe ? springs.recoil : { duration: durations.fast }
                    }
                    className="inline-flex items-center gap-1 rounded-full bg-(--hs-wash) px-1.5 py-px font-mono text-[10px] tracking-[0.08em] text-(--hs-tone) uppercase"
                  >
                    <Check aria-hidden className="size-3" strokeWidth={2.4} />
                    {action.doneText}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </p>
            <p className="mt-0.5 text-[12px] leading-snug text-ink-2">
              {action.summary}
            </p>
          </div>
        </div>

        {/* The slot: the hold button, with the cover plate over it. */}
        <div
          className={cn(
            "relative h-9 w-full shrink-0 @min-[30rem]:w-40",
            coverStyle === "hinge" ? "[perspective:600px]" : "overflow-hidden",
            coverStyle !== "hinge" && "rounded-2",
          )}
        >
          <HoldButton
            action={action}
            open={lifted}
            armed={armed}
            phase={phase}
            holdSeconds={holdSeconds}
            motionSafe={motionSafe}
            inert={inert}
            hintId={hintId}
            nodeRef={(node) => {
              holdNode.current = node;
            }}
            onComplete={onCommit}
            onRelease={onRelease}
          />
          <motion.button
            ref={coverRef}
            type="button"
            tabIndex={coverHidden ? -1 : tabIndex}
            aria-hidden={coverHidden || undefined}
            aria-expanded={lifted}
            aria-controls={lifted ? panelId : undefined}
            aria-disabled={coverInert || undefined}
            aria-label={
              finished
                ? `${action.title}, done`
                : `${lifted ? "Close" : "Lift"} the cover on ${action.title}`
            }
            onFocus={onFocusCover}
            onClick={() => {
              if (coverInert) return;
              onToggle(!open);
            }}
            onKeyDown={onNav}
            initial={false}
            animate={coverAnimate}
            transition={coverTransition}
            style={{
              transformOrigin: "50% 0%",
              backgroundImage:
                "repeating-linear-gradient(135deg, color-mix(in oklab, var(--hs-tone) 16%, transparent) 0 5px, transparent 5px 13px)",
              pointerEvents: coverHidden ? "none" : undefined,
            }}
            className={cn(
              "absolute inset-0 flex items-center justify-center gap-1.5 rounded-2 border bg-surface-2 font-mono text-[10px] tracking-[0.08em] uppercase shadow-[0_1px_0_color-mix(in_oklab,var(--hs-tone)_30%,transparent),0_6px_14px_-8px_color-mix(in_oklab,black_50%,transparent)] transition-colors",
              coverInert
                ? "cursor-default border-hairline text-ink-3"
                : "cursor-pointer border-hairline-strong text-ink-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            {finished ? (
              <Check aria-hidden className="size-3.5" strokeWidth={2.4} />
            ) : (
              <ChevronUp
                aria-hidden
                className={cn(
                  "size-3.5 transition-transform duration-200",
                  lifted && "rotate-180",
                )}
              />
            )}
            {finished ? "Done" : lifted ? "Close" : "Lift cover"}
          </motion.button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {lifted ? (
          <motion.div
            key="panel"
            id={panelId}
            role="group"
            aria-label={`${action.title} confirmation`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{
              height: 0,
              opacity: 0,
              transition: exitFor(durations.base),
            }}
            transition={
              motionSafe
                ? {
                    height: springs.glide,
                    opacity: { duration: durations.base, ease: easings.enter },
                  }
                : {
                    height: { duration: 0 },
                    opacity: { duration: durations.base },
                  }
            }
            className="overflow-hidden"
          >
            <div className="mx-4 mb-3.5 flex flex-col gap-3 rounded-3 border border-hairline bg-surface-0 px-3 py-3">
              <p id={hintId} className="sr-only">
                {gate === "match"
                  ? `Type ${workspaceName} exactly to arm the ${action.verb} button, then hold it for ${holdSeconds.toFixed(1)} seconds.`
                  : `Acknowledge each consequence to arm the ${action.verb} button, then hold it for ${holdSeconds.toFixed(1)} seconds.`}
              </p>

              {gate === "match" ? (
                <>
                  <label
                    htmlFor={matchId}
                    className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                  >
                    Type the workspace name to arm
                  </label>
                  <input
                    ref={fieldRef}
                    id={matchId}
                    type="text"
                    value={typed}
                    disabled={inert || !settled}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-describedby={hintId}
                    aria-invalid={
                      typed.length > 0 && !workspaceName.startsWith(typed)
                        ? true
                        : undefined
                    }
                    placeholder={workspaceName}
                    onChange={(event) => setTypedAndArm(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        // The button sits before the field; Enter in an
                        // armed field goes straight to it.
                        if (armed) holdNode.current?.focus();
                      }
                    }}
                    className={cn(
                      "h-9 w-full rounded-2 border bg-card px-2.5 font-mono text-[13px] text-foreground placeholder:text-ink-3 disabled:opacity-60",
                      typed.length > 0 && !workspaceName.startsWith(typed)
                        ? "border-(--hs-tone)"
                        : armed
                          ? "border-(--hs-edge)"
                          : "border-hairline-strong",
                      FOCUS_RING,
                    )}
                  />
                  <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1.5">
                    <Letters
                      name={workspaceName}
                      typed={typed}
                      motionSafe={motionSafe}
                    />
                    <span
                      role="status"
                      className={cn(
                        "font-mono text-[10px] tracking-[0.08em] uppercase",
                        armed ? "text-(--hs-tone)" : "text-ink-3",
                      )}
                    >
                      {armed
                        ? "Armed"
                        : `${hits} of ${workspaceName.length} letters`}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    Acknowledge each consequence to arm
                  </p>
                  <div
                    role="group"
                    aria-label="Consequences"
                    className="-mx-1 flex flex-col"
                  >
                    {consequences.map((text, i) => (
                      <AckCheck
                        key={i}
                        id={`${uid}-ack-${action.id}-${i}`}
                        text={text}
                        checked={!!acks[i]}
                        index={i}
                        disabled={inert || !settled}
                        motionSafe={motionSafe}
                        live={live}
                        nodeRef={i === 0 ? fieldRef : undefined}
                        onToggle={() => toggleAck(i)}
                      />
                    ))}
                  </div>
                  <span
                    role="status"
                    className={cn(
                      "font-mono text-[10px] tracking-[0.08em] uppercase",
                      armed ? "text-(--hs-tone)" : "text-ink-3",
                    )}
                  >
                    {armed
                      ? "Armed"
                      : `${acks.filter(Boolean).length} of ${consequences.length} acknowledged`}
                  </span>
                </>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2.5">
                <p className="text-[11px] text-ink-3">
                  {phase === "failed" ? (
                    <span className="text-(--hs-tone)">
                      {action.title} didn&apos;t complete. Hold again to retry.
                    </span>
                  ) : phase === "working" ? (
                    `${action.busyText}...`
                  ) : phase === "done" ? (
                    `${action.doneText}.`
                  ) : armed ? (
                    `Hold the ${action.verb} button for ${holdSeconds.toFixed(1)}s. Let go early and nothing happens.`
                  ) : action.reversible ? (
                    `Reversible for ${undoSeconds}s after the hold.`
                  ) : (
                    "This cannot be undone."
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (settled) onToggle(false);
                  }}
                  aria-disabled={!settled || undefined}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-2 px-2 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  <X aria-hidden className="size-3.5" />
                  Close cover
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {phase === "undo" ? (
          <UndoBar
            key="undo"
            action={action}
            undoSeconds={undoSeconds}
            awake={awake}
            motionSafe={motionSafe}
            inert={inert}
            onCancel={onUndoCancel}
            onElapsed={onUndoElapsed}
          />
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A settings danger zone built as a shelf of covered switches. Each
 * hazardous action is a row with a hinged cover over its button: pressing
 * the cover lifts it on `springs.snap` — a lid swinging back on a top hinge,
 * a sleeve sliding aside, or a cross-fade — and a panel glides open under
 * the row. There the button is armed: for most actions by typing the
 * workspace name letter by letter, each matched letter ticking solid on
 * `springs.flick` and a wrong one going the hazard's colour; for one by
 * acknowledging three consequences, each check drawing in on flick.
 *
 * Armed, the button is held. A ring fills over `holdSeconds` on a linear
 * tween and drains on release before it is full — nothing happens. When it
 * closes, an irreversible action runs at once, lands with a stamp on
 * `springs.recoil`, and its cover closes itself a moment later. A reversible
 * one shuts its cover and opens an undo window instead: a bar runs down over
 * `undoSeconds` with Cancel beside it, pausing while the tab is hidden or the
 * shelf is off screen, and only then does the action run.
 *
 * The covers are one roving stop: Up/Down and Home/End move between them,
 * Space or Enter lifts one and moves focus into its field, Enter in an armed
 * field goes to the button, Space held on the button is the hold, and Escape
 * closes the cover and returns to it. Every lift, arm, release, cancel and
 * completion is announced. Under reduced motion covers cross-fade in place,
 * panels appear at their full height, and the ring still fills — it is the
 * hold's own measure.
 */
export function HazardShelf({
  actions = defaultHazardActions,
  workspaceName = defaultHazardWorkspace,
  value,
  defaultValue = null,
  onChange,
  onConfirm,
  onCancel,
  onDone,
  coverStyle = "hinge",
  holdSeconds = 1.2,
  undoSeconds = 8,
  tone = "danger",
  status = "ready",
  onRetry,
  title = "Danger zone",
  emptyText = "No hazards are available for your role.",
  emptyHint = "Ask an owner to make these changes.",
  label,
  height = 520,
  disabled = false,
  className,
}: HazardShelfProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;

  const [own, setOwn] = React.useState<string | null>(defaultValue);
  const openId = value === undefined ? own : value;
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [phases, setPhases] = React.useState<Record<string, HazardPhase>>({});
  const [activeCover, setActiveCover] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const [onScreen, setOnScreen] = React.useState(true);
  const [tabShown, setTabShown] = React.useState(true);
  const [focusReq, setFocusReq] = React.useState<{
    id: string;
    where: "cover" | "field";
    seq: number;
  } | null>(null);
  // False for the server render and hydration, so nothing on the page fades
  // in; true for what mounts later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const coverNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const fieldNodes = React.useRef(new Map<string, HTMLElement>());
  const closeTimer = React.useRef<number | null>(null);
  const alive = React.useRef(true);
  // Latest callbacks and mode, read from timers and after awaits so a
  // re-render never leaves a finished action talking to stale props.
  const handlers = React.useRef({
    onChange,
    onConfirm,
    onCancel,
    onDone,
    controlled: value !== undefined,
  });
  React.useEffect(() => {
    handlers.current = {
      onChange,
      onConfirm,
      onCancel,
      onDone,
      controlled: value !== undefined,
    };
  });

  const byId = new Map(actions.map((a) => [a.id, a]));
  const phaseOf = (id: string): HazardPhase => phases[id] ?? "idle";
  const doneCount = actions.filter((a) => phaseOf(a.id) === "done").length;
  const openAction = openId ? (byId.get(openId) ?? null) : null;

  /* ----------------------------- lifecycle ----------------------------- */

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    };
  }, []);

  // The undo clocks only run while someone could be watching them.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onVisibility = () => setTabShown(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    let watcher: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        setOnScreen(Boolean(entry?.isIntersecting));
      });
      watcher.observe(root);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      watcher?.disconnect();
    };
  }, []);

  React.useLayoutEffect(() => {
    if (!focusReq) return;
    const node =
      focusReq.where === "field"
        ? (fieldNodes.current.get(focusReq.id) ??
          coverNodes.current.get(focusReq.id))
        : coverNodes.current.get(focusReq.id);
    node?.focus({ preventScroll: true });
  }, [focusReq]);

  /* ------------------------------- changes ----------------------------- */

  const setPhase = (id: string, phase: HazardPhase) =>
    setPhases((prev) => (prev[id] === phase ? prev : { ...prev, [id]: phase }));

  const requestFocus = (id: string, where: "cover" | "field") =>
    setFocusReq((f) => ({ id, where, seq: (f?.seq ?? 0) + 1 }));

  const setOpen = (id: string | null) => {
    if (id === openId) return;
    if (value === undefined) setOwn(id);
    handlers.current.onChange?.(id);
  };

  const toggle = (action: HazardAction, open: boolean) => {
    if (inert) return;
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (open) {
      setOpen(action.id);
      setAnnouncement(
        `${action.title}: cover lifted. ${
          (action.gate ?? "match") === "acknowledge"
            ? "Acknowledge each consequence to arm it."
            : `Type ${workspaceName} to arm it.`
        }`,
      );
      requestFocus(action.id, "field");
    } else {
      setOpen(null);
      setAnnouncement(`${action.title}: cover closed.`);
      requestFocus(action.id, "cover");
    }
  };

  const run = async (action: HazardAction) => {
    setPhase(action.id, "working");
    setAnnouncement(`${action.busyText}.`);
    try {
      await (handlers.current.onConfirm ?? simulateHazard)(action);
      if (!alive.current) return;
      setPhase(action.id, "done");
      setAnnouncement(`${action.doneText}.`);
      handlers.current.onDone?.(action);
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      closeTimer.current = window.setTimeout(() => {
        closeTimer.current = null;
        if (!handlers.current.controlled) {
          setOwn((o) => (o === action.id ? null : o));
        }
        handlers.current.onChange?.(null);
      }, DONE_CLOSE_MS);
    } catch {
      if (!alive.current) return;
      setPhase(action.id, "failed");
      setAnnouncement(`${action.title} didn't complete. Hold again to retry.`);
    }
  };

  const commit = (action: HazardAction) => {
    if (action.reversible) {
      setPhase(action.id, "undo");
      setOpen(null);
      setAnnouncement(
        `${action.title} in ${undoSeconds} seconds. Cancel to keep things as they are.`,
      );
      requestFocus(action.id, "cover");
      return;
    }
    void run(action);
  };

  const cancelUndo = (action: HazardAction) => {
    setPhase(action.id, "idle");
    setAnnouncement(`${action.title} cancelled. Nothing changed.`);
    handlers.current.onCancel?.(action);
    requestFocus(action.id, "cover");
  };

  /* ------------------------------ keyboard ----------------------------- */

  const coverIds = actions.map((a) => a.id);
  const activeId =
    activeCover && coverIds.includes(activeCover)
      ? activeCover
      : (coverIds[0] ?? null);

  const onNav = (event: React.KeyboardEvent, id: string) => {
    const i = coverIds.indexOf(id);
    let to = -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") to = i + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = coverIds.length - 1;
    else return;
    event.preventDefault();
    const target = coverIds[clamp(to, 0, coverIds.length - 1)];
    if (target) coverNodes.current.get(target)?.focus();
  };

  /* ------------------------------- render ------------------------------ */

  const toneVar = TONES[tone] ?? TONES.danger;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--hs-tone" as string]: toneVar,
        ["--hs-wash" as string]: `color-mix(in oklab, ${toneVar} 11%, transparent)`,
        ["--hs-edge" as string]: `color-mix(in oklab, ${toneVar} 38%, transparent)`,
        ["--hs-ink" as string]: `oklch(from ${toneVar} 0.985 0.008 h)`,
      }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 pt-3 pb-3">
        <div className="min-w-0">
          <p
            id={titleId}
            className="flex min-w-0 items-center gap-2 text-sm font-semibold"
          >
            <TriangleAlert aria-hidden className="size-4 text-(--hs-tone)" />
            <span className="truncate">{title}</span>
          </p>
          <p className="mt-0.5 truncate text-[12px] text-ink-2">
            {ready
              ? `${actions.length} ${actions.length === 1 ? "action" : "actions"}, each behind a cover and a hold.`
              : status === "loading"
                ? "Loading the actions for your role."
                : "The actions did not load."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {ready && doneCount > 0 ? (
            <span className="hidden font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[24rem]:inline">
              {doneCount} done
            </span>
          ) : null}
          <span
            title="Workspace"
            className="max-w-[10rem] truncate rounded-full border border-hairline-strong bg-surface-1 px-2 py-0.5 font-mono text-[11px] text-foreground"
          >
            {workspaceName}
          </span>
        </div>
      </header>

      <div className="relative flex-1 overflow-y-auto overscroll-contain">
        {status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The danger zone didn&apos;t load.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            ) : null}
          </div>
        ) : status === "loading" ? (
          <div aria-hidden className="flex flex-col">
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 border-b border-hairline px-4 py-3.5 last:border-b-0"
                style={{ animationDelay: `${i * 90}ms` }}
              >
                <span className="size-7 shrink-0 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span
                    className="h-3 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                    style={{ width: `${34 + ((i * 17) % 22)}%` }}
                  />
                  <span
                    className="h-2.5 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                    style={{ width: `${60 + ((i * 23) % 30)}%` }}
                  />
                </div>
                <span className="hidden h-9 w-40 shrink-0 rounded-2 bg-surface-2 motion-safe:animate-pulse @min-[30rem]:block" />
              </div>
            ))}
          </div>
        ) : actions.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-full border border-hairline bg-surface-1">
              <ShieldOff aria-hidden className="size-4 text-ink-3" />
            </span>
            <p className="text-sm text-foreground">{emptyText}</p>
            <p className="text-[12px] text-ink-2">{emptyHint}</p>
          </div>
        ) : (
          <ul role="list" aria-label={title} className="flex flex-col">
            {actions.map((action, i) => (
              <HazardRow
                key={action.id}
                action={action}
                open={openId === action.id}
                phase={phaseOf(action.id)}
                workspaceName={workspaceName}
                coverStyle={coverStyle}
                holdSeconds={Math.max(0.2, holdSeconds)}
                undoSeconds={Math.max(1, Math.round(undoSeconds))}
                motionSafe={motionSafe}
                inert={inert}
                live={live}
                awake={onScreen && tabShown}
                tabIndex={activeId === action.id ? 0 : -1}
                index={i}
                uid={uid}
                coverRef={(node) => {
                  if (node) coverNodes.current.set(action.id, node);
                  else coverNodes.current.delete(action.id);
                }}
                fieldRef={(node) => {
                  if (node) fieldNodes.current.set(action.id, node);
                  else fieldNodes.current.delete(action.id);
                }}
                onToggle={(open) => toggle(action, open)}
                onFocusCover={() => setActiveCover(action.id)}
                onNav={(event) => onNav(event, action.id)}
                onArm={(armed) =>
                  setAnnouncement(
                    armed
                      ? `Armed. Hold the ${action.verb} button for ${holdSeconds.toFixed(1)} seconds.`
                      : "",
                  )
                }
                onCommit={() => commit(action)}
                onRelease={() =>
                  setAnnouncement("Released early. Nothing happened.")
                }
                onUndoCancel={() => cancelUndo(action)}
                onUndoElapsed={() => void run(action)}
              />
            ))}
          </ul>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-hairline px-4 py-2">
        <p className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {openAction
            ? `${openAction.title} · cover up`
            : ready
              ? "All covers down"
              : " "}
        </p>
        <p className="hidden shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[30rem]:block">
          Hold {holdSeconds.toFixed(1)}s
        </p>
      </footer>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
