"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import { Check, Eye, EyeOff, Fingerprint, TriangleAlert } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type StepUpMethod = "passkey" | "password";
export type StepUpLockStyle = "padlock" | "keyhole" | "shield";

export type StepUpAccount = {
  name: string;
  email: string;
};

/** What one try at verifying sends to `onVerify`. */
export type StepUpAttempt = {
  method: StepUpMethod;
  /** The typed password, for the password method. */
  password?: string;
};

/** What `onFail` reports about a refused try. */
export type StepUpFailure = {
  method: StepUpMethod;
  /** Which try this was, from 1. */
  attempt: number;
  /** Tries left before verification pauses. */
  remaining: number;
  /** The reason shown in the dialog. */
  message: string;
};

export type StepUpCheckProps = {
  /** The sensitive change, as it reads after "You're about to". @default "change where payouts go" */
  action?: string;
  /** The ways to verify, in the order offered; the first is the primary one. @default ["passkey", "password"] */
  methods?: StepUpMethod[];
  /** Who is verifying, shown under the title. @default defaultStepUpAccount */
  account?: StepUpAccount;
  /** The protected section's name, in the header strip. @default "Billing and payouts" */
  heading?: string;
  /** The dialog's title. @default "Confirm it's you" */
  title?: string;
  /** The protected content. It is inert and frosted until verified. @default a quiet placeholder panel */
  children?: React.ReactNode;
  /** Controlled: whether the elevated session is open. */
  verified?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultVerified?: boolean;
  /** Fires from the verification, expiry or Lock now that changed it. */
  onVerifiedChange?: (verified: boolean) => void;
  /**
   * Checks a try. Return (or resolve) `false`, or reject, to refuse it; an
   * Error's message is shown as the reason. Anything else verifies.
   * @default accepts every try
   */
  onVerify?: (
    attempt: StepUpAttempt,
  ) => boolean | void | Promise<boolean | void>;
  /** A try was refused; it carries the tries left and the reason shown. */
  onFail?: (failure: StepUpFailure) => void;
  /** The elevated session ran out and the panel locked again. */
  onExpire?: () => void;
  /** Lock now was pressed on the session chip. */
  onLock?: () => void;
  /** Not now, or Escape, dismissed the dialog. The panel stays locked. */
  onCancel?: () => void;
  /** How long the elevated session lasts, in ms. @default 900000 */
  sessionDuration?: number;
  /** How long before the end the chip turns to a warning, in ms. @default 60000 */
  warnAt?: number;
  /** Refused tries before verification pauses. @default 5 */
  maxAttempts?: number;
  /** Where "Forgot password?" goes. Omit it and the link is not shown. */
  forgotHref?: string;
  /** Move focus into the dialog when it first shows. Leave off when the check renders with the page. @default false */
  autoFocus?: boolean;
  /** How heavy the frost is, 0 to 1: blur radius and tint. @default 0.6 */
  frostAmount?: number;
  /** The lock's glyph and how it opens. @default "padlock" */
  lockStyle?: StepUpLockStyle;
  /** The badge, the primary button, the clearing edge and the session chip. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Every method is unavailable. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultStepUpAccount: StepUpAccount = {
  name: "Rae Okafor",
  email: "rae@basinworks.io",
};

const DEFAULT_METHODS: StepUpMethod[] = ["passkey", "password"];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const TABBABLE =
  'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** How soft the frost's clearing edge is, in px. */
const FEATHER = 36;
/** The lock glyph's box, in px: the ghost flies at this size. */
const GLYPH = 22;
const CHIP_GLYPH = 14;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

const clock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/* ----------------------------------------------------------------------- */
/*                                The lock                                  */
/* ----------------------------------------------------------------------- */

/**
 * The lock, drawn so its opening is its own motion: a padlock's shackle lifts
 * and swings about its right leg, a keyhole's slot turns a quarter like a
 * key, a shield's keyhole gives way to a check drawn on flick. Snap carries
 * the openings — one crisp overshoot, a mechanism catching.
 */
function LockGlyph({
  lockStyle,
  open,
  motionSafe,
  size = GLYPH,
}: {
  lockStyle: StepUpLockStyle;
  open: boolean;
  motionSafe: boolean;
  size?: number;
}) {
  const snap = motionSafe ? springs.snap : { duration: 0 };
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block shrink-0 overflow-visible"
    >
      {lockStyle === "keyhole" ? (
        <>
          <circle
            cx={12}
            cy={12}
            r={9}
            fill="currentColor"
            fillOpacity={0.12}
          />
          <motion.g
            initial={false}
            animate={{ rotate: open ? 90 : 0 }}
            transition={snap}
            style={{ originX: 0.5, originY: 0.5 }}
          >
            <circle
              cx={12}
              cy={10.6}
              r={2.1}
              fill="currentColor"
              stroke="none"
            />
            <path
              d="M11 12.2 L10.3 16.2 H13.7 L13 12.2 Z"
              fill="currentColor"
              stroke="none"
            />
          </motion.g>
        </>
      ) : lockStyle === "shield" ? (
        <>
          <path
            d="M12 3 L19 5.8 V11.2 C19 15.6 16.1 19 12 21 C7.9 19 5 15.6 5 11.2 V5.8 Z"
            fill="currentColor"
            fillOpacity={0.12}
          />
          <motion.g
            initial={false}
            animate={{ opacity: open ? 0 : 1 }}
            transition={{ duration: durations.fast }}
          >
            <circle
              cx={12}
              cy={10.4}
              r={1.7}
              fill="currentColor"
              stroke="none"
            />
            <path d="M12 11.6 V14.6" />
          </motion.g>
          <motion.path
            d="M8.7 12.1 L11 14.4 L15.4 9.6"
            initial={false}
            animate={{ pathLength: open ? 1 : 0, opacity: open ? 1 : 0 }}
            transition={
              motionSafe
                ? {
                    pathLength: springs.flick,
                    opacity: { duration: durations.blink },
                  }
                : { duration: 0 }
            }
          />
        </>
      ) : (
        <>
          <motion.path
            d="M8 10.5 V7.6 A4 4 0 0 1 16 7.6 V10.5"
            initial={false}
            animate={{ y: open ? -2.2 : 0, rotate: open ? 16 : 0 }}
            transition={snap}
            style={{ originX: 1, originY: 1 }}
          />
          <rect
            x={5}
            y={10.5}
            width={14}
            height={10.5}
            rx={2.6}
            fill="currentColor"
            fillOpacity={0.14}
          />
          <circle cx={12} cy={15.2} r={1.3} fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}

/** A placeholder panel for when no content is passed: rows the frost can hide. */
function PlaceholderPanel() {
  return (
    <div className="flex flex-col divide-y divide-hairline px-4">
      {[64, 48, 72, 56, 40].map((w, i) => (
        <div key={i} className="flex items-center gap-3 py-4">
          <span className="size-8 shrink-0 rounded-2 bg-surface-2" />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="h-2.5 w-24 rounded-full bg-surface-2" />
            <span
              className="h-2 rounded-full bg-surface-2"
              style={{ width: `${w}%` }}
            />
          </span>
          <span className="h-7 w-16 shrink-0 rounded-2 border border-hairline" />
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

/**
 * A step-up check standing in front of a sensitive panel. The panel sits
 * behind a frost layer — a real backdrop blur with a card-coloured tint —
 * and a dialog asks the visitor to confirm it's them with the methods given.
 *
 * Verifying opens the lock on snap, and then the frost clears outward from
 * the lock itself: the layer's mask is a radial gradient whose clear radius
 * grows on `springs.glide` to the farthest corner, a soft accent ring riding
 * its edge, while the opened lock flies from the dialog into the header's
 * session chip on the same spring and the chip starts counting the elevated
 * minutes down. When the session runs out (or Lock now is pressed) the frost
 * closes back in toward the lock on glide and the dialog returns. Refused
 * tries shake the field on a symmetric tween — a refusal never bounces — and
 * are counted against `maxAttempts` with the reason in words.
 *
 * The dialog traps Tab, Escape dismisses it to a lone Unlock button, and the
 * panel is inert while locked. Below a 28rem container the dialog is a
 * bottom sheet. Under reduced motion nothing travels: the frost fades, the
 * lock swaps to open, and the countdown and tries still update.
 */
export function StepUpCheck({
  action = "change where payouts go",
  methods = DEFAULT_METHODS,
  account = defaultStepUpAccount,
  heading = "Billing and payouts",
  title = "Confirm it's you",
  children,
  verified,
  defaultVerified = false,
  onVerifiedChange,
  onVerify,
  onFail,
  onExpire,
  onLock,
  onCancel,
  sessionDuration = 900_000,
  warnAt = 60_000,
  maxAttempts = 5,
  forgotHref,
  autoFocus = false,
  frostAmount = 0.6,
  lockStyle = "padlock",
  accent = "var(--accent-bright)",
  disabled = false,
  className,
}: StepUpCheckProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const ids = {
    heading: `${uid}-heading`,
    title: `${uid}-title`,
    desc: `${uid}-desc`,
    password: `${uid}-password`,
    error: `${uid}-error`,
  };

  const [own, setOwn] = React.useState(defaultVerified);
  const isVerified = verified ?? own;

  const [dismissed, setDismissed] = React.useState(false);
  const [busy, setBusy] = React.useState<StepUpMethod | null>(null);
  /** The method that just verified, while its lock opens. */
  const [opening, setOpening] = React.useState<StepUpMethod | null>(null);
  const [failures, setFailures] = React.useState(0);
  const [error, setError] = React.useState<{
    message: string;
    counted: boolean;
  } | null>(null);
  const [password, setPassword] = React.useState("");
  const [reveal, setReveal] = React.useState(false);
  const [frostClear, setFrostClear] = React.useState(isVerified);
  const totalSeconds = Math.max(1, Math.round(sessionDuration / 1000));
  const [left, setLeft] = React.useState(totalSeconds);
  const [announcement, setAnnouncement] = React.useState("");
  const [live, setLive] = React.useState(false);
  const [sheet, setSheet] = React.useState(false);

  // A relock starts the dialog clean — decided in render as it flips, so
  // the dialog that returns never shows the last session's state.
  const [seen, setSeen] = React.useState(isVerified);
  if (seen !== isVerified) {
    setSeen(isVerified);
    setBusy(null);
    setOpening(null);
    if (isVerified) {
      setDismissed(false);
    } else {
      setDismissed(false);
      setFrostClear(false);
      setError(null);
      setPassword("");
      setReveal(false);
      setLeft(totalSeconds);
    }
  }

  const dialogOpen = !isVerified && !dismissed;

  const sectionRef = React.useRef<HTMLElement | null>(null);
  const cellRef = React.useRef<HTMLDivElement | null>(null);
  const frostRef = React.useRef<HTMLDivElement | null>(null);
  const glowRef = React.useRef<HTMLDivElement | null>(null);
  const badgeRef = React.useRef<HTMLSpanElement | null>(null);
  const chipRef = React.useRef<HTMLButtonElement | null>(null);
  const chipGlyphRef = React.useRef<HTMLSpanElement | null>(null);
  const fieldRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const notNowRef = React.useRef<HTMLButtonElement | null>(null);
  const [dialogNode, setDialogNode] = React.useState<HTMLDivElement | null>(
    null,
  );
  const [unlockNode, setUnlockNode] = React.useState<HTMLButtonElement | null>(
    null,
  );

  const ghostX = useMotionValue(0);
  const ghostY = useMotionValue(0);
  const ghostScale = useMotionValue(1);
  const ghostOpacity = useMotionValue(0);
  const chipGlyph = useMotionValue(1);

  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const timers = React.useRef<number[]>([]);
  const run = React.useRef(0);
  const center = React.useRef<{ x: number; y: number } | null>(null);
  const deadline = React.useRef<number | null>(null);
  const focusOnArrive = React.useRef(autoFocus && !isVerified);
  const focusChip = React.useRef(false);
  const accentRef = React.useRef(accent);
  const lastLeft = React.useRef(left);

  React.useEffect(() => {
    accentRef.current = accent;
  });

  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
  }, []);

  React.useEffect(
    () => () => {
      halt();
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
      // Any try still in flight answers into nothing.
      run.current += 1;
    },
    [halt],
  );

  // The countdown only ticks where someone can see it.
  React.useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    let onScreen = true;
    const update = () => setLive(onScreen && !document.hidden);
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      update();
    });
    io.observe(node);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  // The dialog turns into a sheet in a narrow container.
  React.useEffect(() => {
    const cell = cellRef.current;
    if (!cell) return;
    const ro = new ResizeObserver(() => {
      setSheet(cell.clientWidth < 448);
    });
    ro.observe(cell);
    return () => ro.disconnect();
  }, []);

  /* ------------------------------ the frost ------------------------------ */

  /** The clear radius, written straight to the layers: no React per frame. */
  const paint = React.useCallback((radius: number, max: number) => {
    const frost = frostRef.current;
    const glow = glowRef.current;
    const c = center.current;
    if (!frost || !glow || !c) return;
    if (radius <= 0) {
      frost.style.maskImage = "none";
      frost.style.setProperty("-webkit-mask-image", "none");
      glow.style.opacity = "0";
      return;
    }
    const r = r1(radius);
    const at = `circle at ${r1(c.x)}px ${r1(c.y)}px`;
    const mask = `radial-gradient(${at}, transparent ${r}px, black ${r1(r + FEATHER)}px)`;
    frost.style.maskImage = mask;
    frost.style.setProperty("-webkit-mask-image", mask);
    glow.style.backgroundImage = `radial-gradient(${at}, transparent ${r1(Math.max(0, r - 12))}px, color-mix(in oklab, ${accentRef.current} 26%, transparent) ${r1(r + FEATHER * 0.45)}px, transparent ${r1(r + FEATHER + 16)}px)`;
    glow.style.opacity = String(
      Number((1 - clamp01((radius / max - 0.55) / 0.45)).toFixed(3)),
    );
  }, []);

  const measureCenter = React.useCallback(() => {
    const cell = cellRef.current;
    if (!cell) return { max: 0 };
    const box = cell.getBoundingClientRect();
    const badge = badgeRef.current;
    if (badge?.isConnected) {
      const b = badge.getBoundingClientRect();
      center.current = {
        x: b.left + b.width / 2 - box.left,
        y: b.top + b.height / 2 - box.top,
      };
    } else if (!center.current) {
      center.current = { x: box.width / 2, y: box.height / 2 };
    }
    const c = center.current;
    const max =
      Math.max(
        Math.hypot(c.x, c.y),
        Math.hypot(box.width - c.x, c.y),
        Math.hypot(c.x, box.height - c.y),
        Math.hypot(box.width - c.x, box.height - c.y),
      ) + FEATHER;
    return { max };
  }, []);

  /** The lock flies from the dialog into the chip on glide. */
  const fly = React.useCallback(() => {
    const section = sectionRef.current;
    const badge = badgeRef.current;
    const target = chipGlyphRef.current;
    if (!section || !badge?.isConnected || !target) return;
    const box = section.getBoundingClientRect();
    const from = badge.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const half = GLYPH / 2;
    ghostX.jump(Math.round(from.left + from.width / 2 - box.left - half));
    ghostY.jump(Math.round(from.top + from.height / 2 - box.top - half));
    ghostScale.jump(1);
    ghostOpacity.jump(1);
    // The chip's own glyph waits for the one in flight to land in it.
    chipGlyph.jump(0);
    const tx = Math.round(to.left + to.width / 2 - box.left - half);
    const ty = Math.round(to.top + to.height / 2 - box.top - half);
    running.current.push(
      animate(ghostX, tx, springs.glide),
      animate(ghostY, ty, { ...springs.glide, delay: 0.03 }),
      animate(ghostScale, CHIP_GLYPH / GLYPH, {
        ...springs.glide,
        onComplete: () => {
          ghostOpacity.jump(0);
          chipGlyph.jump(1);
        },
      }),
    );
  }, [chipGlyph, ghostOpacity, ghostScale, ghostX, ghostY]);

  const thaw = React.useCallback(() => {
    halt();
    const frost = frostRef.current;
    if (!frost) return;
    const { max } = measureCenter();
    if (!motionSafe) {
      running.current.push(
        animate(
          frost,
          { opacity: 0 },
          {
            duration: durations.base,
            ease: easings.exit,
            onComplete: () => setFrostClear(true),
          },
        ),
      );
      return;
    }
    frost.style.opacity = "1";
    paint(0, max);
    // A plain number carries the radius: the layers are written in onUpdate.
    running.current.push(
      animate(0, max, {
        ...springs.glide,
        onUpdate: (r) => paint(r, max),
        onComplete: () => setFrostClear(true),
      }),
    );
    fly();
  }, [fly, halt, measureCenter, motionSafe, paint]);

  const freeze = React.useCallback(() => {
    halt();
    ghostOpacity.jump(0);
    chipGlyph.jump(1);
    const frost = frostRef.current;
    if (!frost) return;
    const { max } = measureCenter();
    if (!motionSafe) {
      paint(0, max);
      frost.style.opacity = "0";
      running.current.push(
        animate(
          frost,
          { opacity: 1 },
          {
            duration: durations.base,
            ease: easings.enter,
          },
        ),
      );
      return;
    }
    frost.style.opacity = "1";
    paint(max, max);
    running.current.push(
      animate(max, 0, {
        ...springs.glide,
        onUpdate: (r) => paint(r, max),
      }),
    );
  }, [chipGlyph, ghostOpacity, halt, measureCenter, motionSafe, paint]);

  // The frost follows the verified state, whoever changed it.
  const shown = React.useRef(isVerified);
  React.useLayoutEffect(() => {
    if (shown.current === isVerified) return;
    shown.current = isVerified;
    if (isVerified) thaw();
    else freeze();
  }, [freeze, isVerified, thaw]);

  /* ---------------------------- the session ---------------------------- */

  const expireRef = React.useRef<() => void>(() => {});

  React.useEffect(() => {
    if (!isVerified) {
      deadline.current = null;
      return;
    }
    if (deadline.current === null) {
      deadline.current = Date.now() + sessionDuration;
    }
    const wait = Math.max(0, deadline.current - Date.now());
    const id = window.setTimeout(() => expireRef.current(), wait);
    return () => window.clearTimeout(id);
  }, [isVerified, sessionDuration]);

  React.useEffect(() => {
    if (!isVerified || !live) return;
    const tick = () => {
      const end = deadline.current;
      if (end === null) return;
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      const before = lastLeft.current;
      lastLeft.current = s;
      setLeft(s);
      if (before > 300 && s <= 300 && s > 60) {
        setAnnouncement("Five minutes left in the elevated session.");
      } else if (before > 60 && s <= 60 && s > 0) {
        setAnnouncement("One minute left in the elevated session.");
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [isVerified, live]);

  const relock = (reason: "expire" | "lock") => {
    const section = sectionRef.current;
    const active = document.activeElement;
    focusOnArrive.current = Boolean(
      section && active && section.contains(active),
    );
    deadline.current = null;
    lastLeft.current = totalSeconds;
    setAnnouncement(
      reason === "expire"
        ? "The elevated session ended. Confirm it's you to continue."
        : "Locked. Confirm it's you to continue.",
    );
    if (verified === undefined) setOwn(false);
    onVerifiedChange?.(false);
    if (reason === "expire") onExpire?.();
    else onLock?.();
  };

  React.useEffect(() => {
    expireRef.current = () => relock("expire");
  });

  /* ----------------------------- focus ----------------------------- */

  // Focus is bound to the dialog when it arrives, never fired on a guess.
  // A quick reopen can bring back the dialog that was still leaving — the
  // same node — so the open state is watched as well as the node.
  React.useEffect(() => {
    if (!dialogOpen || !dialogNode || !focusOnArrive.current) return;
    focusOnArrive.current = false;
    const first = dialogNode.querySelector<HTMLElement>(TABBABLE);
    first?.focus({ preventScroll: true });
  }, [dialogNode, dialogOpen]);

  React.useEffect(() => {
    if (!unlockNode || !focusOnArrive.current) return;
    focusOnArrive.current = false;
    unlockNode.focus({ preventScroll: true });
  }, [unlockNode]);

  React.useEffect(() => {
    if (!isVerified || !focusChip.current) return;
    focusChip.current = false;
    chipRef.current?.focus({ preventScroll: true });
  }, [isVerified]);

  /* ------------------------------ verifying ------------------------------ */

  const remaining = Math.max(0, maxAttempts - failures);
  const blocked = remaining === 0;
  const unavailable = disabled || blocked || busy !== null || opening !== null;

  const succeed = (method: StepUpMethod) => {
    const dialog = dialogNode;
    focusChip.current = Boolean(
      dialog &&
      document.activeElement &&
      dialog.contains(document.activeElement),
    );
    setError(null);
    setOpening(method);
    setAnnouncement(
      `Verified with your ${method}. Elevated for ${plural(
        Math.max(1, Math.round(sessionDuration / 60_000)),
        "minute",
        "minutes",
      )}.`,
    );
    // The lock opens first; the frost waits for the shackle to clear.
    const commit = () => {
      if (verified === undefined) setOwn(true);
      onVerifiedChange?.(true);
      timers.current.push(window.setTimeout(() => setOpening(null), 700));
    };
    if (motionSafe) timers.current.push(window.setTimeout(commit, 280));
    else commit();
  };

  const fail = (method: StepUpMethod, reason?: string) => {
    const used = failures + 1;
    const rest = Math.max(0, maxAttempts - used);
    const message =
      reason ??
      (method === "password"
        ? "That password didn't match."
        : "Your passkey wasn't accepted.");
    setFailures(used);
    setError({ message, counted: true });
    setAnnouncement(
      rest === 0
        ? `${message} Verification is paused.`
        : `${message} ${plural(rest, "try", "tries")} left.`,
    );
    onFail?.({ method, attempt: used, remaining: rest, message });
    // The last try takes the methods away; focus that was on them stays in
    // the dialog, on the one way left.
    const dialog = dialogNode;
    if (
      rest === 0 &&
      dialog &&
      document.activeElement &&
      dialog.contains(document.activeElement)
    ) {
      notNowRef.current?.focus({ preventScroll: true });
    }
    if (method === "password") {
      const field = fieldRef.current;
      if (field && motionSafe) {
        running.current.push(
          animate(
            field,
            { x: [0, -6, 6, -4, 4, 0] },
            { duration: 0.32, ease: "linear" },
          ),
        );
      }
      if (rest > 0) {
        const input = inputRef.current;
        input?.focus({ preventScroll: true });
        input?.select();
      }
    }
  };

  const attempt = async (method: StepUpMethod) => {
    if (unavailable) return;
    if (method === "password" && password.trim() === "") {
      setError({ message: "Enter your password.", counted: false });
      inputRef.current?.focus({ preventScroll: true });
      return;
    }
    const token = ++run.current;
    setBusy(method);
    setError(null);
    if (method === "passkey") setAnnouncement("Waiting for your passkey.");
    let ok = true;
    let reason: string | undefined;
    try {
      const result = await Promise.resolve(
        onVerify?.(method === "password" ? { method, password } : { method }),
      );
      if (result === false) ok = false;
    } catch (err) {
      ok = false;
      reason = err instanceof Error && err.message ? err.message : undefined;
    }
    if (token !== run.current) return;
    setBusy(null);
    if (ok) succeed(method);
    else fail(method, reason);
  };

  const dismiss = () => {
    if (opening !== null) return;
    run.current += 1;
    setBusy(null);
    focusOnArrive.current = true;
    setDismissed(true);
    setAnnouncement("Still locked.");
    onCancel?.();
  };

  const reopen = () => {
    focusOnArrive.current = true;
    setDismissed(false);
  };

  const onDialogKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
      return;
    }
    if (event.key !== "Tab" || !dialogNode) return;
    const nodes = Array.from(
      dialogNode.querySelectorAll<HTMLElement>(TABBABLE),
    ).filter((n) => n.offsetParent !== null);
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  /* ------------------------------ drawing ------------------------------ */

  const frost = clamp01(frostAmount);
  const blur = r1(6 + frost * 14);
  const tint = Math.round(40 + frost * 48);
  const warning = isVerified && left * 1000 <= warnAt;
  const chipTone = warning ? "var(--warn)" : accent;
  const minutesLeft = Math.max(1, Math.ceil(left / 60));
  const offered = methods.filter(
    (m, i) => (m === "passkey" || m === "password") && methods.indexOf(m) === i,
  );
  const list: StepUpMethod[] = offered.length ? offered : DEFAULT_METHODS;

  const vars = {
    "--suc-accent": accent,
    "--suc-on": `oklch(from ${accent} clamp(0, (0.7 - l) * 100, 1) 0 0)`,
  } as React.CSSProperties;

  const passkeyButton = (primary: boolean) => {
    const waiting = busy === "passkey";
    const done = opening === "passkey";
    return (
      <button
        key="passkey"
        type="button"
        onClick={() => void attempt("passkey")}
        disabled={disabled}
        aria-disabled={unavailable || undefined}
        aria-busy={waiting || undefined}
        className={cn(
          "inline-flex h-9 w-full items-center justify-center gap-2 rounded-2 px-3 text-[13px] font-medium transition-[background-color,opacity]",
          FOCUS,
          primary
            ? "bg-[var(--suc-accent)] text-[var(--suc-on)] hover:bg-[color-mix(in_oklab,var(--suc-accent)_88%,black)]"
            : "border border-input bg-surface-1 text-foreground hover:bg-surface-2",
          (disabled || blocked) && "cursor-not-allowed opacity-50",
          (waiting || done) && "cursor-default",
        )}
      >
        <span className="relative flex size-4 shrink-0 items-center justify-center">
          {done ? (
            <svg aria-hidden viewBox="0 0 16 16" className="size-4">
              <motion.path
                d="M3.5 8.5l3 3 6-7"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: motionSafe ? 0 : 1 }}
                animate={{ pathLength: 1 }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              />
            </svg>
          ) : (
            <Fingerprint aria-hidden className="size-4" />
          )}
        </span>
        <span>
          {done
            ? "Verified"
            : waiting
              ? "Waiting for passkey…"
              : primary
                ? "Use passkey"
                : "Use a passkey instead"}
        </span>
      </button>
    );
  };

  const passwordForm = (primary: boolean) => {
    const checking = busy === "password";
    const done = opening === "password";
    return (
      <form
        key="password"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void attempt("password");
        }}
        className="flex flex-col gap-1.5"
      >
        <label
          htmlFor={ids.password}
          className="text-[12px] leading-4 font-medium text-ink-2"
        >
          Password
        </label>
        <div className="flex items-center gap-2">
          <div ref={fieldRef} className="relative min-w-0 flex-1">
            <input
              ref={inputRef}
              id={ids.password}
              type={reveal ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              disabled={disabled || blocked}
              readOnly={checking || opening !== null}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? ids.error : undefined}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setPassword(value);
                if (error && !error.counted) setError(null);
              }}
              className={cn(
                "h-9 w-full rounded-2 border bg-surface-0 pr-10 pl-3 text-[13px] text-foreground transition-colors placeholder:text-ink-3 disabled:opacity-50",
                "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
                error ? "border-danger" : "border-input",
              )}
            />
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? "Hide password" : "Show password"}
              aria-pressed={reveal}
              disabled={disabled || blocked}
              className={cn(
                "absolute top-1/2 right-1 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-1 text-ink-3 transition-colors hover:text-foreground disabled:opacity-50",
                FOCUS,
              )}
            >
              {reveal ? (
                <EyeOff aria-hidden className="size-4" />
              ) : (
                <Eye aria-hidden className="size-4" />
              )}
            </button>
          </div>
          <button
            type="submit"
            disabled={disabled}
            aria-disabled={unavailable || undefined}
            aria-busy={checking || undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3 text-[13px] font-medium transition-[background-color,opacity]",
              FOCUS,
              primary
                ? "bg-[var(--suc-accent)] text-[var(--suc-on)] hover:bg-[color-mix(in_oklab,var(--suc-accent)_88%,black)]"
                : "border border-input bg-surface-1 text-foreground hover:bg-surface-2",
              (disabled || blocked) && "cursor-not-allowed opacity-50",
            )}
          >
            {done ? <Check aria-hidden className="size-4 shrink-0" /> : null}
            <span className="grid">
              <span
                className={cn(
                  "[grid-area:1/1]",
                  (checking || done) && "invisible",
                )}
              >
                Confirm
              </span>
              <span className={cn("[grid-area:1/1]", !checking && "invisible")}>
                Checking…
              </span>
              <span className={cn("[grid-area:1/1]", !done && "invisible")}>
                Verified
              </span>
            </span>
          </button>
        </div>
      </form>
    );
  };

  const methodBlocks = list.map((m, i) => (
    <React.Fragment key={m}>
      {i > 0 ? (
        <div
          aria-hidden
          className="flex items-center gap-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          <span className="h-px flex-1 bg-hairline" />
          or
          <span className="h-px flex-1 bg-hairline" />
        </div>
      ) : null}
      {m === "passkey" ? passkeyButton(i === 0) : passwordForm(i === 0)}
    </React.Fragment>
  ));

  return (
    <section
      ref={sectionRef}
      aria-labelledby={ids.heading}
      className={cn(
        "relative w-full overflow-hidden rounded-4 border border-hairline bg-card text-card-foreground",
        className,
      )}
      style={vars}
    >
      <header
        inert={dialogOpen}
        className="flex h-12 items-center justify-between gap-3 border-b border-hairline px-4"
      >
        <h2
          id={ids.heading}
          className="min-w-0 truncate text-[14px] leading-5 font-semibold"
          title={heading}
        >
          {heading}
        </h2>
        <button
          ref={chipRef}
          type="button"
          onClick={() => (isVerified ? relock("lock") : reopen())}
          aria-label={
            isVerified
              ? `Elevated session, ${plural(minutesLeft, "minute", "minutes")} left. Lock now`
              : "Locked. Confirm it's you to unlock"
          }
          className={cn(
            "group/step-up-chip relative inline-flex h-7 shrink-0 items-center gap-1.5 overflow-hidden rounded-full border px-2.5 text-[12px] font-medium transition-colors",
            FOCUS,
            isVerified
              ? "border-[color-mix(in_oklab,var(--suc-chip)_40%,transparent)] bg-[color-mix(in_oklab,var(--suc-chip)_12%,transparent)] text-[var(--suc-chip)]"
              : "border-hairline-strong bg-surface-2 text-ink-2 hover:text-foreground",
          )}
          style={{ "--suc-chip": chipTone } as React.CSSProperties}
        >
          <motion.span
            ref={chipGlyphRef}
            className="flex size-3.5 shrink-0 items-center justify-center"
            style={{ opacity: chipGlyph }}
          >
            <LockGlyph
              lockStyle={lockStyle}
              open={isVerified}
              motionSafe={motionSafe}
              size={CHIP_GLYPH}
            />
          </motion.span>
          <span className="grid text-left">
            <motion.span
              aria-hidden
              className="whitespace-nowrap [grid-area:1/1]"
              initial={false}
              animate={{ opacity: isVerified ? 0 : 1 }}
              transition={{ duration: durations.fast }}
            >
              Locked
            </motion.span>
            <span
              aria-hidden
              className={cn(
                "flex transition-opacity duration-150 [grid-area:1/1]",
                isVerified &&
                  "group-hover/step-up-chip:opacity-0 group-focus-visible/step-up-chip:opacity-0",
              )}
            >
              <motion.span
                className="inline-flex items-center gap-1.5 whitespace-nowrap"
                initial={false}
                animate={{
                  opacity: isVerified ? 1 : 0,
                  scale: isVerified || !motionSafe ? 1 : 0.92,
                }}
                transition={
                  motionSafe
                    ? {
                        scale: springs.snap,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
              >
                Elevated
                <span className="font-mono text-[11px] tabular-nums">
                  {clock(left)}
                </span>
              </motion.span>
            </span>
            <span
              aria-hidden
              className={cn(
                "whitespace-nowrap opacity-0 transition-opacity duration-150 [grid-area:1/1]",
                isVerified &&
                  "group-hover/step-up-chip:opacity-100 group-focus-visible/step-up-chip:opacity-100",
              )}
            >
              Lock now
            </span>
          </span>
          {isVerified ? (
            <span
              aria-hidden
              className="absolute inset-x-2.5 bottom-0 h-px origin-left bg-[var(--suc-chip)] transition-transform duration-1000 ease-linear"
              style={{
                transform: `scaleX(${Number((left / totalSeconds).toFixed(3))})`,
              }}
            />
          ) : null}
        </button>
      </header>

      <div ref={cellRef} className="@container relative grid">
        <div className="min-w-0 [grid-area:1/1]" inert={!isVerified}>
          {children ?? <PlaceholderPanel />}
        </div>

        <div
          ref={frostRef}
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0",
            frostClear && "invisible",
          )}
          style={{
            backdropFilter: `blur(${blur}px) saturate(1.15)`,
            WebkitBackdropFilter: `blur(${blur}px) saturate(1.15)`,
            backgroundColor: `color-mix(in oklab, var(--card) ${tint}%, transparent)`,
            backgroundImage:
              "linear-gradient(to bottom, color-mix(in oklab, var(--foreground) 4%, transparent), transparent 40%)",
          }}
        />
        <div
          ref={glowRef}
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 opacity-0",
            frostClear && "invisible",
          )}
        />

        <AnimatePresence initial={false}>
          {dialogOpen ? (
            <motion.div
              key="dialog"
              className="relative z-10 flex items-center justify-center p-4 [grid-area:1/1] @max-[28rem]:items-end @max-[28rem]:p-0"
              // The dialog gets out of the way quickly: the thaw starts
              // under it, at the lock.
              exit={{
                opacity: 0,
                scale: motionSafe ? 0.98 : 1,
                transition: exitFor(durations.fast),
              }}
            >
              <motion.div
                ref={setDialogNode}
                role="dialog"
                aria-modal="true"
                aria-labelledby={ids.title}
                aria-describedby={ids.desc}
                onKeyDown={onDialogKey}
                initial={{
                  opacity: 0,
                  y: motionSafe
                    ? sheet
                      ? distances.shift
                      : distances.step
                    : 0,
                }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  motionSafe
                    ? {
                        y: springs.glide,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
                className="flex w-full max-w-[22rem] flex-col gap-4 rounded-4 border border-hairline-strong bg-popover p-5 text-popover-foreground shadow-raised @max-[28rem]:max-w-none @max-[28rem]:rounded-b-none @max-[28rem]:border-x-0 @max-[28rem]:border-b-0 @max-[28rem]:px-4 @max-[28rem]:pt-2.5 @max-[28rem]:pb-4"
              >
                <span
                  aria-hidden
                  className="mx-auto hidden h-1 w-9 shrink-0 rounded-full bg-hairline-strong @max-[28rem]:block"
                />
                <div className="flex flex-col items-center gap-3 text-center">
                  <span
                    ref={badgeRef}
                    className="relative flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--suc-accent)]"
                    style={{
                      backgroundColor:
                        "color-mix(in oklab, var(--suc-accent) 13%, transparent)",
                      boxShadow:
                        "inset 0 0 0 1px color-mix(in oklab, var(--suc-accent) 32%, transparent)",
                    }}
                  >
                    {busy === "passkey" ? (
                      <motion.svg
                        aria-hidden
                        viewBox="0 0 52 52"
                        className="pointer-events-none absolute -inset-1"
                        animate={motionSafe ? { rotate: 360 } : undefined}
                        transition={
                          motionSafe
                            ? {
                                duration: 1.1,
                                ease: "linear",
                                repeat: Infinity,
                              }
                            : undefined
                        }
                      >
                        <circle
                          cx={26}
                          cy={26}
                          r={24}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeDasharray="38 113"
                        />
                      </motion.svg>
                    ) : null}
                    <LockGlyph
                      lockStyle={lockStyle}
                      open={opening !== null}
                      motionSafe={motionSafe}
                    />
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3
                      id={ids.title}
                      className="text-[16px] leading-6 font-semibold text-balance"
                    >
                      {blocked ? "Verification paused" : title}
                    </h3>
                    <p
                      id={ids.desc}
                      className="text-[13px] leading-5 text-pretty text-ink-2"
                    >
                      {blocked
                        ? "Too many tries. Reset your password, or come back and try again later."
                        : `You're about to ${action}. Confirm it's you to continue.`}
                    </p>
                  </div>
                  <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-hairline bg-surface-1 py-0.5 pr-2.5 pl-0.5 text-[12px] text-ink-2">
                    <span
                      aria-hidden
                      className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-[9px] font-semibold text-foreground"
                    >
                      {initials(account.name)}
                    </span>
                    <span className="truncate" title={account.email}>
                      {account.email}
                    </span>
                  </span>
                </div>

                {blocked ? null : (
                  <div className="flex flex-col gap-3">{methodBlocks}</div>
                )}

                {error ? (
                  <div
                    id={ids.error}
                    role="alert"
                    className="-mt-1 flex flex-col gap-2 rounded-2 bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] px-3 py-2 text-[12px] leading-4 text-danger"
                  >
                    <span className="flex items-start gap-2">
                      <TriangleAlert
                        aria-hidden
                        className="mt-px size-3.5 shrink-0"
                      />
                      <span>
                        {error.message}
                        {error.counted
                          ? blocked
                            ? " Verification is paused."
                            : ` ${plural(remaining, "try", "tries")} left before verification pauses.`
                          : null}
                      </span>
                    </span>
                    {error.counted ? (
                      <span aria-hidden className="flex gap-1 pl-5.5">
                        {Array.from({ length: maxAttempts }, (_, i) => {
                          const spent = i < failures;
                          // A pip that has just been spent mounts afresh,
                          // so only it pops; the rest stay still.
                          return (
                            <motion.span
                              key={`${i}-${spent ? "spent" : "left"}`}
                              className={cn(
                                "size-1.5 rounded-full",
                                spent ? "bg-danger" : "bg-hairline-strong",
                              )}
                              initial={
                                spent && i === failures - 1 && motionSafe
                                  ? { scale: 0.3 }
                                  : false
                              }
                              animate={{ scale: 1 }}
                              transition={springs.snap}
                            />
                          );
                        })}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <button
                    ref={notNowRef}
                    type="button"
                    onClick={dismiss}
                    className={cn(
                      "-ml-2 inline-flex h-8 items-center rounded-2 px-2 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                      FOCUS,
                    )}
                  >
                    Not now
                  </button>
                  {forgotHref && list.includes("password") ? (
                    <a
                      href={forgotHref}
                      className={cn(
                        "-mr-1 inline-flex h-8 items-center rounded-2 px-1 text-[12px] text-ink-3 underline-offset-2 transition-colors hover:text-foreground hover:underline",
                        FOCUS,
                      )}
                    >
                      Forgot password?
                    </a>
                  ) : null}
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {!isVerified && dismissed ? (
          <div className="relative z-10 flex items-center justify-center p-4 [grid-area:1/1]">
            <motion.button
              ref={setUnlockNode}
              type="button"
              onClick={reopen}
              initial={{ opacity: 0, scale: motionSafe ? 0.94 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={
                motionSafe
                  ? {
                      scale: springs.snap,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: durations.fast }
              }
              className={cn(
                "flex flex-col items-center gap-2 rounded-3 px-4 py-3 text-[13px] font-medium text-foreground",
                FOCUS,
              )}
            >
              <span
                className="flex size-12 items-center justify-center rounded-full text-[var(--suc-accent)] transition-transform hover:scale-105"
                style={{
                  backgroundColor:
                    "color-mix(in oklab, var(--suc-accent) 13%, transparent)",
                  boxShadow:
                    "inset 0 0 0 1px color-mix(in oklab, var(--suc-accent) 32%, transparent)",
                }}
              >
                <LockGlyph
                  lockStyle={lockStyle}
                  open={false}
                  motionSafe={motionSafe}
                />
              </span>
              Unlock {heading.toLowerCase()}
            </motion.button>
          </div>
        ) : null}
      </div>

      {/* The opened lock in flight between the dialog and the chip. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 z-30 flex text-[var(--suc-accent)]"
        style={{
          x: ghostX,
          y: ghostY,
          scale: ghostScale,
          opacity: ghostOpacity,
          width: GLYPH,
          height: GLYPH,
        }}
      >
        <LockGlyph lockStyle={lockStyle} open motionSafe={false} />
      </motion.span>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
