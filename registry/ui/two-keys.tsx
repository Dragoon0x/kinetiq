"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import { Bell, Bot, Check, Lock, LockOpen, Undo2, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type TwoKeysAction = {
  /** The verb, shown before the amount: "Refund". */
  title: string;
  amount?: number;
  /** ISO currency code for `amount`. @default "GBP" */
  currency?: string;
  /** Who receives it. */
  payee?: string;
  /** Order, ticket or case numbers, in mono. */
  reference?: string;
  /** Why the agent wants to do it. */
  reason?: string;
  /** Why it needs two people: "Over the £2,500 single-approver limit". */
  limitNote?: string;
  /** Who asked: the agent's name. */
  requestedBy: string;
  /** When it asked, ms. */
  requestedAt: number;
  /** When the request lapses entirely, ms. */
  expiresAt?: number;
};

export type TwoKeysApprover = {
  id: string;
  name: string;
  /** The role whose key this is: "Finance lead". */
  role: string;
  /** When this approver turned their key, ms; null while waiting. */
  turnedAt?: number | null;
  /** Set when this approver rejected the action. */
  rejected?: { at: number; note: string } | null;
  /** What they said about it. */
  comment?: string;
};

export type TwoKeysStatus = "open" | "expired" | "withdrawn" | "done";
export type TwoKeysSwitchStyle = "key" | "lever" | "dial";
export type TwoKeysTurnReason = "key" | "lapsed";

export type TwoKeysProps = {
  /** What the agent wants to do. @default defaultTwoKeysAction */
  action?: TwoKeysAction;
  /** The two people whose keys it needs, in the order the switches sit. @default defaultTwoKeysApprovers */
  approvers?: TwoKeysApprover[];
  /** Whose key is focusable here; anyone else sees the switches as drawings. @default "mara" */
  currentUser?: string;
  /** Controlled: the current user's key is turned. */
  turned?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultTurned?: boolean;
  /** Fires from the turn, the drag, Space — or the window lapsing ("lapsed"). */
  onTurnKey?: (turned: boolean, reason: TwoKeysTurnReason) => void;
  /** Reject, with the note the approver wrote. */
  onReject?: (note: string) => void;
  /** Remind, with the approver to nudge. */
  onRemind?: (approverId: string) => void;
  /** Withdraw, offered to anyone who is not an approver. */
  onWithdraw?: () => void;
  /** The unlocked Run control was pressed. */
  onRun?: () => void;
  /** Seconds the second key has after the first one turns. @default 60 */
  windowLength?: number;
  /** The moment times count from, ms; the switches keep time from it while a window is open. @default defaultTwoKeysNow */
  now?: number;
  /** open, expired, withdrawn, or done (it ran). @default "open" */
  status?: TwoKeysStatus;
  /** A key in a keyhole, a throw lever, or a dial whose ring fills. @default "key" */
  switchStyle?: TwoKeysSwitchStyle;
  /** Lit ticks, the closed bar and Run — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The Run control's words. @default "Run refund" */
  runLabel?: string;
  /** Formats the amount. @default en-GB currency */
  format?: (amount: number, currency: string) => string;
  /** The card's accessible name. @default the action's title and amount */
  label?: string;
  /** Nothing can be turned or pressed. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

/** A fixed afternoon, so the default card renders the same everywhere. */
export const defaultTwoKeysNow = Date.UTC(2026, 9, 15, 14, 20, 0);

export const defaultTwoKeysAction: TwoKeysAction = {
  title: "Refund",
  amount: 4820,
  currency: "GBP",
  payee: "Basinworks Supply Co.",
  reference: "Order GW-30418 · RMA 7731",
  reason:
    "Twelve pressure gauges arrived cracked; the warehouse has them back.",
  limitNote: "Over the £2,500 single-approver limit",
  requestedBy: "Gaugeworks billing agent",
  requestedAt: defaultTwoKeysNow - 4 * 60_000,
  expiresAt: defaultTwoKeysNow + 3 * 3_600_000,
};

export const defaultTwoKeysApprovers: TwoKeysApprover[] = [
  { id: "mara", name: "Mara Ilves", role: "Finance lead", turnedAt: null },
  {
    id: "theo",
    name: "Theo Brandt",
    role: "Support manager",
    turnedAt: null,
    comment: "RMA checked, the gauges are back.",
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
    amount,
  );

const since = (from: number, to: number) => {
  const s = Math.max(0, Math.round((to - from) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** Each style turns through its own arc, in degrees. */
const ARC: Record<TwoKeysSwitchStyle, [number, number]> = {
  key: [0, 90],
  lever: [-38, 38],
  dial: [-60, 60],
};

const r3 = (v: number) => Number(v.toFixed(3));
const polar = (deg: number, r: number, c = 36) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [r3(c + r * Math.cos(a)), r3(c + r * Math.sin(a))] as const;
};
const arcPath = (from: number, to: number, r: number) => {
  const [x0, y0] = polar(from, r);
  const [x1, y1] = polar(to, r);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};

/* ----------------------------------------------------------------------- */
/*                                A switch                                  */
/* ----------------------------------------------------------------------- */

type SwitchProps = {
  approver: TwoKeysApprover;
  mine: boolean;
  shown: boolean;
  lapsedBack: boolean;
  locked: boolean;
  rejected: boolean;
  style: TwoKeysSwitchStyle;
  motionSafe: boolean;
  actionName: string;
  onTurn: (next: boolean) => void;
};

/**
 * One key switch. The turned amount is a 0–1 motion value: a press sends it
 * to its new end on `springs.snap` (one crisp overshoot — a key that clicks
 * home); a drag follows the pointer 1:1, rubber-bands past either stop, and
 * commits by projection with the release velocity handed to the spring.
 */
function KeySwitch({
  approver,
  mine,
  shown,
  lapsedBack,
  locked,
  rejected,
  style,
  motionSafe,
  actionName,
  onTurn,
}: SwitchProps) {
  const p = useMotionValue(shown ? 1 : 0);
  const [a0, a1] = ARC[style];
  const rotate = useTransform(p, (v) => r3(a0 + (a1 - a0) * v));
  const ring = useTransform(p, (v) => r3(Math.min(1, Math.max(0.001, v))));
  const running = React.useRef<AnimationPlaybackControls | null>(null);
  const dragging = React.useRef(false);
  const startP = React.useRef(0);

  const settle = React.useCallback(
    (to: boolean, velocity = 0) => {
      running.current?.stop();
      if (!motionSafe) {
        p.jump(to ? 1 : 0);
        return;
      }
      running.current = animate(p.get(), to ? 1 : 0, {
        ...springs.snap,
        velocity,
        onUpdate: (v) => p.set(r3(v)),
      });
    },
    [motionSafe, p],
  );

  // The drawn position follows the derived state: a host's turn, a lapse
  // turning a lone key back, or the user's own press once it lands.
  React.useEffect(() => {
    if (dragging.current) return;
    settle(shown);
    return () => running.current?.stop();
  }, [shown, settle]);

  const travel = 64;
  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled: !mine || locked,
    onStart: () => {
      dragging.current = true;
      running.current?.stop();
      startP.current = p.get();
    },
    onMove: ({ offset }) => {
      const raw = startP.current + offset.x / travel;
      const v =
        raw < 0
          ? rubberband(raw, 1)
          : raw > 1
            ? 1 + rubberband(raw - 1, 1)
            : raw;
      p.set(r3(v));
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const v = velocity.x / travel;
      const landing = project(p.get(), v, 0.99);
      const next = landing > 0.5;
      settle(next, v);
      if (next !== shown) onTurn(next);
    },
    onCancel: () => {
      dragging.current = false;
      settle(shown);
    },
    onTap: () => onTurn(!shown),
  });

  const lit = shown && !rejected;
  const [onX, onY] = polar(a1, 31);
  const [offX, offY] = polar(a0, 31);
  const [onX2, onY2] = polar(a1, 27);
  const [offX2, offY2] = polar(a0, 27);

  const face = (
    <span className="relative block size-full">
      <svg
        aria-hidden
        viewBox="0 0 72 72"
        className="absolute inset-0 size-full overflow-visible"
      >
        <circle
          cx={36}
          cy={36}
          r={34}
          className="fill-surface-1 stroke-hairline-strong"
          strokeWidth={1}
        />
        <circle
          cx={36}
          cy={36}
          r={24}
          className="fill-surface-0 stroke-hairline"
          strokeWidth={1}
        />
        <line
          x1={offX2}
          y1={offY2}
          x2={offX}
          y2={offY}
          strokeWidth={2}
          strokeLinecap="round"
          className="stroke-ink-3"
        />
        <line
          x1={onX2}
          y1={onY2}
          x2={onX}
          y2={onY}
          strokeWidth={2}
          strokeLinecap="round"
          className={cn(
            "transition-[stroke] duration-200",
            lit ? "stroke-(--tk-accent)" : "stroke-hairline-strong",
          )}
        />
        {style === "lever" ? (
          <path
            d={arcPath(a0, a1, 18)}
            fill="none"
            strokeWidth={4}
            strokeLinecap="round"
            className="stroke-surface-2"
          />
        ) : null}
        {style === "dial" ? (
          <>
            <path
              d={arcPath(a0, a1, 29)}
              fill="none"
              strokeWidth={3}
              strokeLinecap="round"
              className="stroke-surface-2"
            />
            <motion.path
              d={arcPath(a0, a1, 29)}
              fill="none"
              strokeWidth={3}
              strokeLinecap="round"
              className={cn(
                rejected ? "stroke-danger" : "stroke-(--tk-accent)",
              )}
              style={{ pathLength: ring }}
            />
          </>
        ) : null}
        {style === "key" ? (
          <rect
            x={33}
            y={22}
            width={6}
            height={28}
            rx={3}
            className="fill-surface-2 stroke-hairline-strong"
            strokeWidth={1}
          />
        ) : null}
      </svg>
      {/* The moving part turns about the plate's centre as an HTML box: no SVG transform strings. */}
      <motion.span
        aria-hidden
        className="absolute inset-0 block"
        style={{ rotate }}
      >
        <svg viewBox="0 0 72 72" className="size-full overflow-visible">
          {style === "key" ? (
            <>
              <rect
                x={27}
                y={12}
                width={18}
                height={48}
                rx={7}
                className="fill-[oklch(from_var(--tk-accent)_0.78_0.05_h)] stroke-[oklch(from_var(--tk-accent)_0.5_0.08_h)]"
                strokeWidth={1}
              />
              <circle cx={36} cy={20} r={3} className="fill-surface-0" />
              <rect
                x={34.5}
                y={30}
                width={3}
                height={22}
                rx={1.5}
                className="fill-[oklch(from_var(--tk-accent)_0.6_0.08_h)]"
              />
            </>
          ) : style === "lever" ? (
            <>
              <rect
                x={33.5}
                y={8}
                width={5}
                height={30}
                rx={2.5}
                className="fill-ink-2"
              />
              <circle
                cx={36}
                cy={9}
                r={6.5}
                className="fill-[oklch(from_var(--tk-accent)_0.7_0.12_h)] stroke-[oklch(from_var(--tk-accent)_0.45_0.1_h)]"
                strokeWidth={1}
              />
              <circle
                cx={36}
                cy={36}
                r={8}
                className="fill-surface-2 stroke-hairline-strong"
                strokeWidth={1}
              />
            </>
          ) : (
            <>
              <circle
                cx={36}
                cy={36}
                r={19}
                className="fill-surface-2 stroke-hairline-strong"
                strokeWidth={1}
              />
              <rect
                x={34.5}
                y={19}
                width={3}
                height={12}
                rx={1.5}
                className="fill-foreground"
              />
            </>
          )}
        </svg>
      </motion.span>
      {rejected ? (
        <span className="absolute inset-[18%] flex items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--danger)_55%,transparent)] bg-[color-mix(in_oklab,var(--danger)_14%,var(--card))] text-danger">
          <X aria-hidden className="size-1/2" strokeWidth={2.5} />
        </span>
      ) : null}
    </span>
  );

  const sizeClass = "size-14 @min-[34rem]/two-keys:size-[76px]";
  const lamp = (
    <span
      aria-hidden
      className={cn(
        "absolute -top-0.5 left-1/2 size-2 -translate-x-1/2 rounded-full border transition-colors duration-200",
        lit
          ? "border-(--tk-line) bg-(--tk-accent) shadow-[0_0_6px_1px_var(--tk-line)]"
          : "border-hairline-strong bg-card",
      )}
    />
  );

  if (!mine)
    return (
      <span
        className={cn(
          "relative block shrink-0",
          sizeClass,
          lapsedBack && "opacity-80",
        )}
      >
        {face}
        {lamp}
      </span>
    );

  return (
    <button
      type="button"
      role="switch"
      aria-checked={shown}
      aria-label={`Turn your key: ${approver.role} approval for ${actionName}`}
      aria-disabled={locked || undefined}
      onClick={(event) => {
        // A click with no pointer behind it is Space or Enter; pointers come
        // through the drag's tap so a turn and a drag never both fire.
        if (event.detail === 0 && !locked) onTurn(!shown);
      }}
      {...drag}
      className={cn(
        "relative block shrink-0 cursor-grab touch-pan-y rounded-full select-none active:cursor-grabbing",
        locked && "cursor-not-allowed opacity-60",
        sizeClass,
        FOCUS,
      )}
    >
      {face}
      {lamp}
    </button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The card                                  */
/* ----------------------------------------------------------------------- */

/**
 * A two-person approval for an agent's action, drawn as two key switches
 * beneath a summary of it. Each approver turns their own key a quarter turn on
 * `springs.snap`, lighting its ON tick; the first key opens a window that
 * drains as a hairline, and when the second turns inside it the two halves of
 * the bar between the switches close on `springs.glide`, the lock swaps open
 * on `springs.flick` and the Run control unlocks. If the window lapses, the
 * lone key turns itself back on snap.
 *
 * Only the current user's key is a control — a real `role="switch"` that
 * Space or Enter turns, or a sideways drag that follows the pointer 1:1 and
 * commits by projection; everyone else's is a drawing with its state in text.
 * Rejected, expired, withdrawn and done are designed states. Under 34rem the
 * switches stack beside a shorter summary with the bar running down between
 * them. Under reduced motion keys switch pose without travel and the bar
 * jumps shut.
 */
export function TwoKeys({
  action = defaultTwoKeysAction,
  approvers = defaultTwoKeysApprovers,
  currentUser = "mara",
  turned: turnedProp,
  defaultTurned = false,
  onTurnKey,
  onReject,
  onRemind,
  onWithdraw,
  onRun,
  windowLength = 60,
  now = defaultTwoKeysNow,
  status = "open",
  switchStyle = "key",
  accent = "var(--accent-bright)",
  runLabel = "Run refund",
  format = money,
  label,
  disabled = false,
  className,
}: TwoKeysProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const currency = action.currency ?? "GBP";
  const amountText =
    action.amount !== undefined ? format(action.amount, currency) : "";
  const actionName = `${action.title}${amountText ? ` ${amountText}` : ""}`;
  const pair = approvers.slice(0, 2);
  const me = pair.find((a) => a.id === currentUser);
  const W = Math.max(5, windowLength) * 1000;

  /* -------------------------------- clock ------------------------------ */

  // Time comes from `now`; while a window is open the card keeps time from
  // there itself, so a host that renders once still sees the window drain.
  const [clock, setClock] = React.useState(now);
  const [seenNow, setSeenNow] = React.useState(now);
  if (seenNow !== now) {
    setSeenNow(now);
    setClock(now);
  }

  /* ------------------------------ my key ------------------------------- */

  const [own, setOwn] = React.useState<number | null>(() =>
    defaultTurned ? (me?.turnedAt ?? now) : (me?.turnedAt ?? null),
  );
  const [flipAt, setFlipAt] = React.useState<number | null>(
    turnedProp ? (me?.turnedAt ?? now) : null,
  );
  const [seenTurned, setSeenTurned] = React.useState(turnedProp);
  if (seenTurned !== turnedProp) {
    setSeenTurned(turnedProp);
    setFlipAt(turnedProp ? clock : null);
  }
  const mineAt =
    turnedProp === undefined
      ? own
      : turnedProp
        ? (me?.turnedAt ?? flipAt ?? clock)
        : null;

  /* ------------------------------ derived ------------------------------ */

  const times = pair.map((a) =>
    a.id === currentUser ? mineAt : (a.turnedAt ?? null),
  );
  const [ta = null, tb = null] = times;
  const rejecter = pair.find((a) => a.rejected);
  const expired =
    status === "expired" ||
    (action.expiresAt !== undefined && clock > action.expiresAt);
  const closed = status !== "open" || expired;
  const both = ta !== null && tb !== null && Math.abs(ta - tb) <= W;
  const lone = !both
    ? Math.max(ta ?? Number.NEGATIVE_INFINITY, tb ?? Number.NEGATIVE_INFINITY)
    : null;
  const loneAt = lone !== null && Number.isFinite(lone) ? lone : null;
  const remaining = loneAt !== null ? loneAt + W - clock : 0;
  const windowOpen = loneAt !== null && remaining > 0 && !rejecter && !closed;
  const lapsed = loneAt !== null && remaining <= 0;
  const shownTurned = times.map(
    (t) => t !== null && (both || (windowOpen && t === loneAt)) && !closed,
  );
  const unlocked = both && !rejecter && !closed;
  const loneIndex = windowOpen ? times.findIndex((t) => t === loneAt) : -1;
  const waitingFor = loneIndex >= 0 ? pair[1 - loneIndex] : undefined;
  const turnedBy = loneIndex >= 0 ? pair[loneIndex] : undefined;
  const seconds = Math.max(0, Math.ceil(remaining / 1000));

  /* --------------------------- keeping time ---------------------------- */

  const rootRef = React.useRef<HTMLElement | null>(null);
  const [onScreen, setOnScreen] = React.useState(true);
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const node = rootRef.current;
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    if (!node || typeof IntersectionObserver === "undefined")
      return () => document.removeEventListener("visibilitychange", onVis);
    const io = new IntersectionObserver(([entry]) =>
      setOnScreen(!!entry?.isIntersecting),
    );
    io.observe(node);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const lapseRef = React.useRef({ mine: false, end: 0, controlled: false });
  React.useEffect(() => {
    lapseRef.current = {
      mine: windowOpen && loneIndex >= 0 && pair[loneIndex]?.id === currentUser,
      end: (loneAt ?? 0) + W,
      controlled: turnedProp !== undefined,
    };
  });
  const turnRef = React.useRef(onTurnKey);
  React.useEffect(() => {
    turnRef.current = onTurnKey;
  });

  React.useEffect(() => {
    if (!windowOpen || !onScreen || !visible) return;
    const from = clock;
    const t0 = performance.now();
    const id = window.setInterval(() => {
      const t = Math.round(from + performance.now() - t0);
      const lapse = lapseRef.current;
      if (t >= lapse.end && lapse.mine) {
        // The window ran out on the user's own key: it turns back, and the
        // host hears it from the moment it happened.
        if (!lapse.controlled) setOwn(null);
        turnRef.current?.(false, "lapsed");
      }
      setClock(t);
    }, 250);
    return () => window.clearInterval(id);
    // The clock restarts from wherever it stood when a window opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowOpen, onScreen, visible]);

  /* ---------------------------- announcing ----------------------------- */

  const [announcement, setAnnouncement] = React.useState("");
  const phase = closed
    ? `closed:${status}:${expired}`
    : rejecter
      ? `rejected:${rejecter.id}`
      : unlocked
        ? "unlocked"
        : windowOpen
          ? `window:${turnedBy?.id ?? ""}`
          : lapsed
            ? "lapsed"
            : "waiting";
  const [seenPhase, setSeenPhase] = React.useState(phase);
  if (seenPhase !== phase) {
    setSeenPhase(phase);
    if (phase === "unlocked")
      setAnnouncement(`Both keys turned. ${runLabel} is unlocked.`);
    else if (phase.startsWith("window:") && turnedBy && waitingFor)
      setAnnouncement(
        `${turnedBy.id === currentUser ? "You" : turnedBy.name} turned a key. ${waitingFor.id === currentUser ? "You have" : `${waitingFor.name} has`} ${Math.round(W / 1000)} seconds to turn the other.`,
      );
    else if (phase === "lapsed")
      setAnnouncement(
        `The window lapsed and the key turned back. Both keys must turn within ${Math.round(W / 1000)} seconds.`,
      );
    else if (phase.startsWith("rejected:") && rejecter)
      setAnnouncement(
        `Rejected by ${rejecter.name}: ${rejecter.rejected?.note ?? ""}`,
      );
    else if (phase.startsWith("closed:"))
      setAnnouncement(
        expired
          ? "This request has expired."
          : status === "withdrawn"
            ? "The request was withdrawn."
            : `${actionName} ran.`,
      );
  }

  /* ------------------------------ actions ------------------------------ */

  const locked = disabled || closed || !!rejecter;
  const turn = (next: boolean) => {
    if (locked || !me) return;
    if (turnedProp === undefined) setOwn(next ? clock : null);
    onTurnKey?.(next, "key");
  };

  const [rejecting, setRejecting] = React.useState(false);
  const [note, setNote] = React.useState("");
  const noteRef = React.useRef<HTMLTextAreaElement | null>(null);
  const rejectButtonRef = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    if (rejecting) noteRef.current?.focus();
  }, [rejecting]);
  const [noteBind, noteHeight] = useMeasured();
  const [reminded, setReminded] = React.useState<string[]>([]);
  const [ran, setRan] = React.useState(false);
  const done = status === "done" || ran;

  const submitReject = () => {
    const text = note.trim();
    if (!text) {
      setAnnouncement("Say why, so the agent and the other approver know.");
      noteRef.current?.focus();
      return;
    }
    onReject?.(text);
    setRejecting(false);
    setNote("");
    setAnnouncement("Rejection sent.");
  };

  const run = () => {
    if (!unlocked || disabled || done) {
      setAnnouncement(
        rejecter
          ? "Rejected: it can’t run."
          : `${runLabel} needs both keys turned within ${Math.round(W / 1000)} seconds.`,
      );
      return;
    }
    setRan(true);
    onRun?.();
    setAnnouncement(`${actionName} is running.`);
  };

  /* ------------------------------- layout ------------------------------ */

  const vars = {
    "--tk-accent": accent,
    "--tk-wash": `color-mix(in oklab, ${accent} 12%, transparent)`,
    "--tk-line": `color-mix(in oklab, ${accent} 50%, transparent)`,
    "--tk-bar": `oklch(from ${accent} 0.62 c h)`,
    "--tk-solid": `oklch(from ${accent} 0.55 c h)`,
    "--tk-on": "oklch(0.99 0.004 262)",
  } as React.CSSProperties;

  const halfClass = (lit: boolean) =>
    cn(
      "flex-1 rounded-full transition-colors duration-300",
      "w-1.5 @min-[34rem]/two-keys:h-1.5 @min-[34rem]/two-keys:w-auto",
      rejecter
        ? "bg-[color-mix(in_oklab,var(--danger)_45%,transparent)]"
        : unlocked
          ? "bg-(--tk-bar)"
          : lit
            ? "bg-(--tk-line)"
            : "bg-hairline-strong",
    );

  const gap = (
    <motion.span
      aria-hidden
      className="shrink-0"
      initial={false}
      animate={{ flexBasis: unlocked ? "0px" : "14px" }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
    />
  );

  const bar = (
    <div
      aria-hidden
      className="flex flex-1 flex-col items-center self-stretch @min-[34rem]/two-keys:flex-row @min-[34rem]/two-keys:self-auto"
    >
      <span className={halfClass(shownTurned[0] ?? false)} />
      {gap}
      <motion.span
        key={unlocked ? "open" : rejecter ? "no" : "shut"}
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border",
          unlocked
            ? "border-(--tk-line) bg-(--tk-wash) text-(--tk-accent)"
            : rejecter
              ? "border-[color-mix(in_oklab,var(--danger)_50%,transparent)] text-danger"
              : "border-hairline-strong bg-card text-ink-3",
        )}
        initial={motionSafe && unlocked ? { scale: 0.6 } : false}
        animate={{ scale: 1 }}
        transition={springs.flick}
      >
        {unlocked ? (
          <LockOpen className="size-3.5" />
        ) : rejecter ? (
          <X className="size-3.5" />
        ) : (
          <Lock className="size-3.5" />
        )}
      </motion.span>
      {gap}
      <span className={halfClass(shownTurned[1] ?? false)} />
    </div>
  );

  const who = (a: TwoKeysApprover, i: number) => {
    const t = times[i] ?? null;
    const isMe = a.id === currentUser;
    const state = a.rejected
      ? "Rejected"
      : shownTurned[i]
        ? windowOpen
          ? `Turned ${since(t ?? clock, clock)} ago`
          : "Turned"
        : t !== null && !closed
          ? "Turned back"
          : isMe
            ? closed
              ? "—"
              : "Your key"
            : "Waiting";
    return (
      <div className="flex max-w-[7.5rem] min-w-0 flex-col items-center text-center @min-[34rem]/two-keys:max-w-none">
        <span className="max-w-full truncate text-[12.5px] leading-4 font-medium text-foreground">
          {isMe ? `${a.name} (you)` : a.name}
        </span>
        <span className="max-w-full truncate text-[11px] leading-4 text-ink-3">
          {a.role}
        </span>
        <span
          className={cn(
            "mt-0.5 font-mono text-[10.5px] leading-4 tabular-nums",
            a.rejected
              ? "text-danger"
              : shownTurned[i]
                ? "text-(--tk-accent)"
                : "text-ink-3",
          )}
        >
          {state}
        </span>
        {!isMe ? (
          <span className="sr-only">
            {`${a.name}, ${a.role}: ${a.rejected ? `rejected. ${a.rejected.note}` : shownTurned[i] ? "key turned." : "key not turned."}`}
          </span>
        ) : null}
        {a.comment && !a.rejected ? (
          <span className="mt-1 hidden max-w-[15rem] text-[11.5px] leading-4 text-ink-2 @min-[34rem]/two-keys:line-clamp-2">
            {`“${a.comment}”`}
          </span>
        ) : null}
      </div>
    );
  };

  const switches = pair.map((a, i) => (
    <div key={a.id} className="flex flex-col items-center gap-1.5">
      <KeySwitch
        approver={a}
        mine={a.id === currentUser}
        shown={shownTurned[i] ?? false}
        lapsedBack={lapsed && times[i] === loneAt}
        locked={locked || done}
        rejected={!!a.rejected}
        style={switchStyle}
        motionSafe={motionSafe}
        actionName={actionName}
        onTurn={turn}
      />
      {who(a, i)}
    </div>
  ));

  const windowLine = (() => {
    if (done) return { text: `${actionName} ran.`, tone: "accent" as const };
    if (expired)
      return {
        text: `This request expired ${action.expiresAt ? `${since(action.expiresAt, clock)} ago` : ""}.`,
        tone: "quiet" as const,
      };
    if (status === "withdrawn")
      return { text: "The request was withdrawn.", tone: "quiet" as const };
    if (rejecter)
      return {
        text: `Rejected by ${rejecter.name}: “${rejecter.rejected?.note ?? ""}”`,
        tone: "danger" as const,
      };
    if (unlocked) {
      const apart =
        ta !== null && tb !== null ? Math.round(Math.abs(ta - tb) / 1000) : 0;
      return {
        text: `Both keys turned, ${apart} s apart. Unlocked.`,
        tone: "accent" as const,
      };
    }
    if (windowOpen && waitingFor)
      return {
        text: `${seconds} s left for ${waitingFor.id === currentUser ? "you" : `the ${waitingFor.role.toLowerCase()}`} to turn the other key`,
        tone: "accent" as const,
      };
    if (lapsed)
      return {
        text: `The window lapsed. Both keys must turn within ${Math.round(W / 1000)} s.`,
        tone: "warn" as const,
      };
    return {
      text: `Needs both keys within ${Math.round(W / 1000)} s: ${pair.map((a) => a.role.toLowerCase()).join(" and ")}.`,
      tone: "quiet" as const,
    };
  })();

  const others = pair.filter(
    (a) => a.id !== currentUser && !shownTurned[pair.indexOf(a)] && !a.rejected,
  );
  const canAct = !closed && !rejecter && !done;
  const isApprover = !!me;

  return (
    <section
      ref={rootRef}
      aria-label={label ?? `${actionName}, two approvals`}
      className={cn(
        "@container/two-keys flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        (expired || status === "withdrawn") && "opacity-75",
        className,
      )}
      style={vars}
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 @min-[34rem]/two-keys:grid-cols-1">
          {/* The action. */}
          <div className="flex min-w-0 flex-col gap-2">
            <p className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-ink-3">
              <Bot aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{`${action.requestedBy} · ${since(action.requestedAt, clock)} ago`}</span>
              {action.expiresAt && !expired && !closed ? (
                <span className="hidden shrink-0 @min-[34rem]/two-keys:inline">{`· expires in ${since(clock, action.expiresAt)}`}</span>
              ) : null}
            </p>
            <h3 className="text-[19px] leading-6 font-semibold tracking-tight tabular-nums @min-[34rem]/two-keys:text-[22px] @min-[34rem]/two-keys:leading-7">
              {action.title}{" "}
              <span className="whitespace-nowrap">{amountText}</span>
            </h3>
            {action.payee ? (
              <p className="text-[13px] leading-5 text-ink-2">{`to ${action.payee}`}</p>
            ) : null}
            {action.limitNote ? (
              <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[color-mix(in_oklab,var(--warn)_45%,transparent)] bg-[color-mix(in_oklab,var(--warn)_11%,transparent)] px-2 py-0.5 text-[11px] leading-4 text-foreground">
                {action.limitNote}
              </span>
            ) : null}
            {action.reason ? (
              <p className="hidden max-w-[60ch] text-[13px] leading-5 text-ink-2 @min-[34rem]/two-keys:block">
                {action.reason}
              </p>
            ) : null}
            {action.reference ? (
              <p className="hidden font-mono text-[11px] text-ink-3 @min-[34rem]/two-keys:block">
                {action.reference}
              </p>
            ) : null}
          </div>

          {/* The keys, and the bar between them. */}
          <div className="flex flex-col items-center gap-2 @min-[34rem]/two-keys:grid @min-[34rem]/two-keys:grid-cols-[minmax(0,13rem)_minmax(3rem,1fr)_minmax(0,13rem)] @min-[34rem]/two-keys:items-start @min-[34rem]/two-keys:gap-3 @min-[34rem]/two-keys:border-t @min-[34rem]/two-keys:border-hairline @min-[34rem]/two-keys:pt-4">
            {switches[0]}
            <div className="flex h-16 items-center justify-center @min-[34rem]/two-keys:-mx-[3.4rem] @min-[34rem]/two-keys:mt-[24px] @min-[34rem]/two-keys:h-7">
              {bar}
            </div>
            {switches[1]}
          </div>
        </div>

        {/* The window. */}
        <div className="flex flex-col gap-1.5">
          <p
            className={cn(
              "text-[12.5px] leading-5 tabular-nums",
              windowLine.tone === "danger"
                ? "text-danger"
                : windowLine.tone === "warn"
                  ? "text-warn"
                  : windowLine.tone === "accent"
                    ? "text-foreground"
                    : "text-ink-2",
            )}
          >
            {windowLine.text}
          </p>
          <span
            aria-hidden
            className="relative block h-[2px] overflow-hidden rounded-full bg-surface-2"
          >
            {windowOpen ? (
              motionSafe ? (
                <motion.span
                  key={`${loneAt}-${W}`}
                  className="absolute inset-0 rounded-full bg-(--tk-bar)"
                  style={{ originX: 0 }}
                  initial={{ scaleX: r3(Math.max(0, remaining) / W) }}
                  animate={{ scaleX: 0 }}
                  transition={{
                    duration: Math.max(0, remaining) / 1000,
                    ease: "linear",
                  }}
                />
              ) : (
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-(--tk-bar)"
                  style={{
                    width: `${r3((Math.max(0, remaining) / W) * 100)}%`,
                  }}
                />
              )
            ) : unlocked || done ? (
              <span className="absolute inset-0 rounded-full bg-(--tk-bar)" />
            ) : null}
          </span>
        </div>

        {/* Rejecting needs a reason. */}
        <motion.div
          className="overflow-hidden"
          initial={false}
          animate={{
            height: rejecting ? noteHeight : 0,
            opacity: rejecting ? 1 : 0,
          }}
          transition={
            motionSafe
              ? { height: springs.glide, opacity: { duration: durations.base } }
              : { duration: durations.fast }
          }
          inert={!rejecting}
        >
          <div ref={noteBind} className="flex flex-col gap-2 pb-1">
            <label htmlFor={`${uid}-note`} className="text-[12px] text-ink-2">
              Why are you rejecting it? The agent and the other approver will
              see this.
            </label>
            <textarea
              id={`${uid}-note`}
              ref={noteRef}
              rows={2}
              value={note}
              onChange={(event) => {
                const v = event.currentTarget.value;
                setNote(v);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setRejecting(false);
                  rejectButtonRef.current?.focus();
                } else if (
                  event.key === "Enter" &&
                  (event.metaKey || event.ctrlKey)
                ) {
                  event.preventDefault();
                  submitReject();
                }
              }}
              className={cn(
                "w-full resize-none rounded-2 border border-input bg-surface-0 px-2.5 py-1.5 text-[13px] leading-5 text-foreground",
                "outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
              )}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={submitReject}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 bg-[oklch(from_var(--danger)_0.55_c_h)] px-3 text-[12px] font-medium text-(--tk-on) transition-colors hover:bg-[color-mix(in_oklab,oklch(from_var(--danger)_0.55_c_h)_88%,black)]",
                  FOCUS,
                )}
              >
                {`Reject ${action.title.toLowerCase()}`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRejecting(false);
                  rejectButtonRef.current?.focus();
                }}
                className={cn(
                  "inline-flex h-8 items-center rounded-2 px-2.5 text-[12px] text-ink-2 hover:bg-surface-2",
                  FOCUS,
                )}
              >
                Cancel
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* What can be done. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-4 py-3">
        {canAct && isApprover ? (
          <button
            ref={rejectButtonRef}
            type="button"
            aria-expanded={rejecting}
            onClick={() => setRejecting((r) => !r)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <X aria-hidden className="size-3.5 shrink-0" />
            Reject
          </button>
        ) : null}
        {canAct
          ? others.map((a) => {
              const done2 = reminded.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    if (done2) return;
                    onRemind?.(a.id);
                    setReminded((r) => [...r, a.id]);
                    setAnnouncement(`${a.name} reminded.`);
                  }}
                  aria-disabled={done2 || undefined}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    done2 && "opacity-60",
                    FOCUS,
                  )}
                >
                  {done2 ? (
                    <Check aria-hidden className="size-3.5 shrink-0" />
                  ) : (
                    <Bell aria-hidden className="size-3.5 shrink-0" />
                  )}
                  {done2
                    ? "Reminded"
                    : `Remind ${a.name.split(" ")[0] ?? a.name}`}
                </button>
              );
            })
          : null}
        {!isApprover && !closed && !done ? (
          <button
            type="button"
            onClick={() => {
              onWithdraw?.();
              setAnnouncement("Withdrawing the request.");
            }}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <Undo2 aria-hidden className="size-3.5 shrink-0" />
            Withdraw
          </button>
        ) : null}
        <span className="ml-auto" />
        {done ? (
          <motion.span
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-(--tk-line) bg-(--tk-wash) px-3 text-[12px] font-medium"
            initial={motionSafe ? { opacity: 0, scale: 0.94 } : { opacity: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={
              motionSafe
                ? springs.flick
                : { duration: durations.fast, ease: easings.enter }
            }
          >
            <Check
              aria-hidden
              className="size-3.5 shrink-0 text-(--tk-accent)"
            />
            Running
          </motion.span>
        ) : (
          <button
            type="button"
            onClick={run}
            aria-disabled={!unlocked || disabled || undefined}
            aria-describedby={`${uid}-why`}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-[12px] font-medium transition-[background-color,color] duration-300",
              unlocked && !disabled
                ? "bg-(--tk-solid) text-(--tk-on) hover:bg-[color-mix(in_oklab,var(--tk-solid)_88%,black)]"
                : "bg-surface-2 text-ink-3",
              FOCUS,
            )}
          >
            {unlocked ? (
              <LockOpen aria-hidden className="size-3.5 shrink-0" />
            ) : (
              <Lock aria-hidden className="size-3.5 shrink-0" />
            )}
            {runLabel}
          </button>
        )}
        <span id={`${uid}-why`} className="sr-only">
          {unlocked
            ? "Both keys are turned."
            : `Needs both keys turned within ${Math.round(W / 1000)} seconds.`}
        </span>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

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
