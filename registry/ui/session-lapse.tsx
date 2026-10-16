"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import { FileText, LogOut } from "lucide-react";

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

export type SessionLapseRingStyle = "line" | "ticks" | "pie";
export type SessionLapseTone = "calm" | "plain" | "urgent";
export type SessionLapseWatch = "document" | "self" | "none";

/** The unsaved work the signed-out note promises to keep. */
export type SessionLapseDraft = {
  title: string;
  excerpt: string;
  /** Shown as "214 words". */
  words?: number;
};

export type SessionLapseLabels = {
  stay?: string;
  signOut?: string;
  signIn?: string;
};

export type SessionLapseProps = {
  /** Idle time before the session ends, in ms. @default 900000 */
  timeout?: number;
  /** How long before the end the warning appears, in ms. @default 60000 */
  warningTime?: number;
  /** Controlled: whether the warning is showing. */
  open?: boolean;
  /** Initial warning state when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires when the warning appears or leaves, from whatever caused it. */
  onOpenChange?: (open: boolean) => void;
  /** Whose activity keeps the session alive: the whole page, only this component's box, or nothing but the button. @default "document" */
  watch?: SessionLapseWatch;
  /** Hold the idle clock (a call, a video); it restarts when released. @default false */
  paused?: boolean;
  /** The session was extended, by the button (or Escape) or by activity during the warning. */
  onExtend?: (via: "button" | "activity") => void;
  /** Sign out was chosen from the warning. */
  onSignOut?: () => void;
  /** The warning ran out and the session ended. */
  onExpire?: () => void;
  /** Sign back in was pressed on the signed-out note. */
  onSignIn?: () => void;
  /** The unsaved work the note keeps. `null` for none. @default defaultSessionLapseDraft */
  draft?: SessionLapseDraft | null;
  /** The product's name, in the warning's sentence. @default "Fernworks" */
  appName?: string;
  /** The warning's title. @default by tone: "Still there?", "Are you still working?", "Signing out soon" */
  title?: string;
  /** The three actions' words. @default Stay signed in · Sign out · Sign back in */
  labels?: SessionLapseLabels;
  /** How the countdown is drawn: a draining line, a tick per second, or a shrinking sector. @default "line" */
  ringStyle?: SessionLapseRingStyle;
  /** The ring's colour and the title's voice: cobalt, ink, or amber turning to danger for the last ten seconds. @default "calm" */
  tone?: SessionLapseTone;
  /** The page the session belongs to. Inert while the warning or the note shows. @default a quiet placeholder */
  children?: React.ReactNode;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultSessionLapseDraft: SessionLapseDraft = {
  title: "Q3 survey notes",
  excerpt:
    "Transect 4 flooded after the storm; moved the quadrats 30 m upslope and re-pinned the markers.",
  words: 214,
};

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const TABBABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const TONE: Record<SessionLapseTone, string> = {
  calm: "var(--accent-bright)",
  plain: "var(--foreground)",
  urgent: "var(--warn)",
};

const TITLE: Record<SessionLapseTone, string> = {
  calm: "Still there?",
  plain: "Are you still working?",
  urgent: "Signing out soon",
};

/** The ring's geometry, in its 64-unit box. */
const C = 32;
const R = 27;
const TICK_IN = 23;
const TICK_OUT = 30;

const r2 = (v: number) => Math.round(v * 100) / 100;

const clock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** "15 minutes", "1 minute", "45 seconds" — for sentences, not the dial. */
const span = (ms: number) => {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 90) return plural(s, "second", "seconds");
  return plural(Math.round(s / 60), "minute", "minutes");
};

/** A point on the ring, `t` turns clockwise from twelve o'clock. */
const at = (t: number, radius: number) => {
  const a = t * Math.PI * 2 - Math.PI / 2;
  return [r2(C + radius * Math.cos(a)), r2(C + radius * Math.sin(a))] as const;
};

/** One short radial segment per tick, as path commands. */
const tickSegments = (count: number) =>
  Array.from({ length: count }, (_, i) => {
    const [x1, y1] = at(i / count, TICK_IN);
    const [x2, y2] = at(i / count, TICK_OUT);
    return `M${x1} ${y1}L${x2} ${y2}`;
  });

/** The sector still left, from twelve o'clock clockwise. */
const sector = (p: number) => {
  if (p <= 0.0005) return "";
  if (p >= 0.9995) {
    return `M${C} ${C - R}A${R} ${R} 0 1 1 ${C} ${C + R}A${R} ${R} 0 1 1 ${C} ${C - R}Z`;
  }
  const [x, y] = at(p, R);
  return `M${C} ${C}L${C} ${C - R}A${R} ${R} 0 ${p > 0.5 ? 1 : 0} 1 ${x} ${y}Z`;
};

/** The rim of that sector alone: the edge is drawn, the radii are not, so
 * nothing crosses the seconds in the middle. */
const rim = (p: number) => {
  if (p <= 0.0005) return "";
  if (p >= 0.9995) {
    return `M${C} ${C - R}A${R} ${R} 0 1 1 ${C} ${C + R}A${R} ${R} 0 1 1 ${C} ${C - R}`;
  }
  const [x, y] = at(p, R);
  return `M${C} ${C - R}A${R} ${R} 0 ${p > 0.5 ? 1 : 0} 1 ${x} ${y}`;
};

/** A quiet stand-in page, for when none is passed. */
function PlaceholderPage() {
  return (
    <div className="flex flex-col gap-2.5 rounded-3 border border-hairline bg-card p-4">
      <span className="h-3 w-32 rounded-full bg-surface-2" />
      {[92, 84, 88, 60].map((w, i) => (
        <span
          key={i}
          className="h-2 rounded-full bg-surface-2"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The ring                                  */
/* ----------------------------------------------------------------------- */

function Ring({
  progress,
  ringStyle,
  ticks,
  seconds,
  color,
}: {
  progress: MotionValue<number>;
  ringStyle: SessionLapseRingStyle;
  ticks: string[];
  seconds: number;
  color: MotionValue<string>;
}) {
  // Every drawing is a function of the one value the countdown runs on, so
  // the refill's spring and the drain's line move every style alike.
  const lit = useTransform(progress, (p) =>
    ticks.slice(0, Math.ceil(p * ticks.length - 0.001)).join(""),
  );
  const spent = useTransform(progress, (p) =>
    ticks.slice(Math.ceil(p * ticks.length - 0.001)).join(""),
  );
  const pie = useTransform(progress, sector);
  const edge = useTransform(progress, rim);
  const label = useTransform(progress, (p) =>
    clock(Math.ceil(r2(p * seconds))),
  );

  return (
    <span className="relative flex size-full items-center justify-center">
      <motion.svg
        aria-hidden
        viewBox="0 0 64 64"
        className="absolute inset-0 size-full overflow-visible"
        style={{ color }}
      >
        {ringStyle === "ticks" ? (
          <>
            <motion.path
              d={spent}
              className="stroke-hairline-strong"
              strokeWidth={2}
              strokeLinecap="round"
              fill="none"
            />
            <motion.path
              d={lit}
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              fill="none"
            />
          </>
        ) : ringStyle === "pie" ? (
          <>
            <circle
              cx={C}
              cy={C}
              r={R}
              className="fill-surface-2 stroke-hairline-strong"
              strokeWidth={1}
            />
            <motion.path d={pie} fill="currentColor" fillOpacity={0.22} />
            <motion.path
              d={edge}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <circle
              cx={C}
              cy={C}
              r={R}
              fill="none"
              className="stroke-hairline-strong"
              strokeWidth={4}
            />
            <g transform={`rotate(-90 ${C} ${C})`}>
              <motion.circle
                cx={C}
                cy={C}
                r={R}
                fill="none"
                stroke="currentColor"
                strokeWidth={4}
                strokeLinecap="round"
                style={{ pathLength: progress }}
              />
            </g>
          </>
        )}
      </motion.svg>
      <motion.span
        aria-hidden
        className="relative font-mono text-[12px] leading-none font-medium text-foreground tabular-nums"
      >
        {label}
      </motion.span>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

/**
 * An idle-timeout guard for a page. It keeps an idle clock of `timeout` ms;
 * `warningTime` before the end an alert dialog rises over the page with a
 * ring that drains, linearly, as the seconds in its middle count down — both
 * read off one motion value, so they can never disagree.
 *
 * Stay signed in — or a real sign of life on the page — refills the ring on
 * `springs.glide` while the ring pops from 0.94 on `springs.snap`, the
 * seconds counting back up with it, and the dialog leaves on the exit ease.
 * Letting it run out fades the page away and fades up a signed-out note that
 * keeps the unsaved draft, with a way back in.
 *
 * Before the warning, any pointer, key or scroll activity in scope resets
 * the clock. Once it shows, only a press, a key or a scroll outside the
 * dialog counts — a drifting pointer does not, so reaching for Sign out
 * never cancels it. Focus moves to Stay signed in when the warning appears
 * (unless the visitor is busy elsewhere on the page); Escape stays signed in.
 * Under reduced motion the ring still drains and the seconds still count,
 * but the refill is a jump and the dialog and note only cross-fade.
 */
export function SessionLapse({
  timeout = 900_000,
  warningTime = 60_000,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  watch = "document",
  paused = false,
  onExtend,
  onSignOut,
  onExpire,
  onSignIn,
  draft = defaultSessionLapseDraft,
  appName = "Fernworks",
  title,
  labels,
  ringStyle = "line",
  tone = "calm",
  children,
  className,
}: SessionLapseProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const ids = {
    title: `${uid}-title`,
    desc: `${uid}-desc`,
    note: `${uid}-note`,
  };
  const words = {
    stay: labels?.stay ?? "Stay signed in",
    signOut: labels?.signOut ?? "Sign out",
    signIn: labels?.signIn ?? "Sign back in",
  };
  const warnMs = Math.max(1000, Math.min(warningTime, timeout));
  const seconds = Math.round(warnMs / 1000);

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const open = openProp ?? ownOpen;
  // The arrival is spoken from the render that shows it, whoever opened it.
  const [seenOpen, setSeenOpen] = React.useState(open);
  const [out, setOut] = React.useState<null | "expired" | "signed-out">(null);
  const [extending, setExtending] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [live, setLive] = React.useState(false);
  const [dialogNode, setDialogNode] = React.useState<HTMLDivElement | null>(
    null,
  );
  const [signInNode, setSignInNode] = React.useState<HTMLButtonElement | null>(
    null,
  );
  if (seenOpen !== open) {
    setSeenOpen(open);
    if (open) {
      setAnnouncement(
        `Still there? You'll be signed out in ${span(warnMs)} unless you stay signed in.`,
      );
    }
  }

  const progress = useMotionValue(1);
  const pop = useMotionValue(1);
  const color = useTransform(progress, (p) =>
    tone === "urgent" && p * warnMs <= 10_000 ? "var(--danger)" : TONE[tone],
  );
  const ticks = React.useMemo(
    () => tickSegments(Math.min(60, Math.max(12, seconds))),
    [seconds],
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const lastActivity = React.useRef<number | null>(null);
  const deadline = React.useRef<number | null>(null);
  const held = React.useRef<number | null>(null);
  const warnTimer = React.useRef<number | null>(null);
  const timers = React.useRef<number[]>([]);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const focusOnArrive = React.useRef(false);
  const spoken = React.useRef(Infinity);
  const liveRef = React.useRef(false);

  const halt = () => {
    for (const c of running.current) c.stop();
    running.current = [];
  };

  React.useEffect(
    () => () => {
      for (const c of running.current) c.stop();
      running.current = [];
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
      if (warnTimer.current !== null) window.clearTimeout(warnTimer.current);
    },
    [],
  );

  // Only animate where someone can see it.
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    let onScreen = true;
    const update = () => {
      liveRef.current = onScreen && !document.hidden;
      setLive(liveRef.current);
    };
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

  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  /* --------------------------- the idle clock --------------------------- */

  const warnRef = React.useRef<() => void>(() => {});
  const expireRef = React.useRef<() => void>(() => {});
  const extendRef = React.useRef<(via: "button" | "activity") => void>(
    () => {},
  );

  // The idle clock: one timeout for the moment the warning is due, moved
  // forward by activity. Nothing ticks while the page is simply in use.
  const schedule = React.useCallback(() => {
    if (warnTimer.current !== null) window.clearTimeout(warnTimer.current);
    warnTimer.current = null;
    if (open || out || paused) return;
    if (lastActivity.current === null) lastActivity.current = Date.now();
    const wait = Math.max(
      0,
      lastActivity.current + timeout - warnMs - Date.now(),
    );
    warnTimer.current = window.setTimeout(() => warnRef.current(), wait);
  }, [open, out, paused, timeout, warnMs]);

  const wasPaused = React.useRef(paused);
  React.useEffect(() => {
    if (wasPaused.current && !paused) lastActivity.current = Date.now();
    wasPaused.current = paused;
    schedule();
    return () => {
      if (warnTimer.current !== null) window.clearTimeout(warnTimer.current);
      warnTimer.current = null;
    };
  }, [paused, schedule]);

  // The warning's deadline, wherever the warning came from; a pause holds it.
  React.useEffect(() => {
    if (!open || out || extending) return;
    if (paused) {
      if (deadline.current !== null) {
        held.current = Math.max(0, deadline.current - Date.now());
        deadline.current = null;
      }
      return;
    }
    if (deadline.current === null) {
      deadline.current = Date.now() + (held.current ?? warnMs);
      held.current = null;
    }
    const id = window.setTimeout(
      () => expireRef.current(),
      Math.max(0, deadline.current - Date.now()),
    );
    return () => window.clearTimeout(id);
  }, [extending, open, out, paused, warnMs]);

  // The drain: a plain number tweened linearly to zero over what is left,
  // written into the ring's value — and only while the ring can be seen.
  React.useEffect(() => {
    if (!open || out || extending || paused || !live) return;
    const end = deadline.current;
    if (end === null) return;
    const left = Math.max(0, end - Date.now());
    const from = Math.min(1, left / warnMs);
    progress.jump(from);
    const drain = animate(from, 0, {
      duration: left / 1000,
      ease: "linear",
      onUpdate: (p) => {
        progress.set(p);
        const s = Math.ceil(p * seconds);
        const before = spoken.current;
        if (before > 30 && s <= 30 && s > 10 && seconds > 40) {
          spoken.current = s;
          setAnnouncement("30 seconds until you're signed out.");
        } else if (before > 10 && s <= 10 && s > 0) {
          spoken.current = s;
          setAnnouncement("10 seconds until you're signed out.");
        }
      },
    });
    return () => drain.stop();
  }, [extending, live, open, out, paused, progress, seconds, warnMs]);

  // A warning that arrives (from the clock or the host) is announced, and
  // focus goes to it unless the visitor is busy in another part of the page.
  const shownOpen = React.useRef(open);
  React.useEffect(() => {
    if (shownOpen.current === open) return;
    shownOpen.current = open;
    if (!open) return;
    const active = document.activeElement;
    const root = rootRef.current;
    // Unclaimed focus is taken only by a warning someone can see; focus
    // already inside the guarded page always follows it.
    focusOnArrive.current =
      ((!active || active === document.body) && liveRef.current) ||
      Boolean(root && active && root.contains(active));
    spoken.current = seconds;
  }, [open, seconds]);

  React.useEffect(() => {
    if (!open || !dialogNode || !focusOnArrive.current) return;
    focusOnArrive.current = false;
    dialogNode
      .querySelector<HTMLElement>(TABBABLE)
      ?.focus({ preventScroll: true });
  }, [dialogNode, open]);

  React.useEffect(() => {
    if (!signInNode || !focusOnArrive.current) return;
    focusOnArrive.current = false;
    signInNode.focus({ preventScroll: true });
  }, [signInNode]);

  /* ------------------------------- actions ------------------------------- */

  const warn = () => {
    if (open || out || paused) return;
    deadline.current = (lastActivity.current ?? Date.now()) + timeout;
    progress.jump(1);
    setOpen(true);
  };

  const extend = (via: "button" | "activity") => {
    if (!open || out || extending) return;
    deadline.current = null;
    held.current = null;
    setExtending(true);
    setAnnouncement("You're still signed in.");
    onExtend?.(via);
    halt();
    if (motionSafe) {
      running.current.push(
        animate(progress.get(), 1, {
          ...springs.glide,
          onUpdate: (p) => progress.set(p),
        }),
      );
      pop.jump(0.94);
      running.current.push(animate(pop, 1, springs.snap));
    } else {
      progress.jump(1);
    }
    // The ring is seen full before the dialog leaves.
    timers.current.push(
      window.setTimeout(
        () => {
          lastActivity.current = Date.now();
          setExtending(false);
          setOpen(false);
        },
        motionSafe ? 480 : 160,
      ),
    );
  };

  const leave = (reason: "expired" | "signed-out") => {
    if (out) return;
    const root = rootRef.current;
    const active = document.activeElement;
    focusOnArrive.current = Boolean(root && active && root.contains(active));
    deadline.current = null;
    held.current = null;
    halt();
    progress.jump(0);
    setOut(reason);
    if (open) setOpen(false);
    setAnnouncement(
      reason === "expired"
        ? `You were signed out of ${appName}. Your draft is kept.`
        : `You signed out of ${appName}. Your draft is kept.`,
    );
    if (reason === "expired") onExpire?.();
    else onSignOut?.();
  };

  const signIn = () => {
    onSignIn?.();
    lastActivity.current = Date.now();
    progress.jump(1);
    setAnnouncement(`Signed in to ${appName}.`);
    setOut(null);
  };

  React.useEffect(() => {
    warnRef.current = warn;
    expireRef.current = () => leave("expired");
    extendRef.current = extend;
  });

  // Activity: before the warning it moves the clock on (at most once a
  // second); during it, only deliberate input outside the dialog extends.
  React.useEffect(() => {
    if (watch === "none" || out) return;
    const target: Document | HTMLElement | null =
      watch === "document" ? document : rootRef.current;
    if (!target) return;
    let last = 0;
    const onActivity = (event: Event) => {
      if (open) {
        if (event.type === "pointermove") return;
        if (dialogNode && dialogNode.contains(event.target as Node)) return;
        extendRef.current("activity");
        return;
      }
      const now = Date.now();
      if (now - last < 1000) return;
      last = now;
      lastActivity.current = now;
      schedule();
    };
    const kinds = ["pointerdown", "pointermove", "keydown", "wheel", "scroll"];
    for (const kind of kinds) {
      target.addEventListener(kind, onActivity, {
        capture: true,
        passive: true,
      });
    }
    return () => {
      for (const kind of kinds) {
        target.removeEventListener(kind, onActivity, { capture: true });
      }
    };
  }, [dialogNode, open, out, schedule, watch]);

  const onDialogKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      extend("button");
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

  const heading = title ?? TITLE[tone] ?? TITLE.calm;
  const covered = open || out !== null;

  return (
    <div
      ref={rootRef}
      className={cn("@container relative grid w-full", className)}
    >
      <motion.div
        className="min-w-0 [grid-area:1/1]"
        inert={covered}
        initial={false}
        animate={{ opacity: out ? 0 : 1 }}
        transition={{
          duration: out ? durations.slow : durations.base,
          ease: out ? easings.exit : easings.enter,
        }}
      >
        {children ?? <PlaceholderPage />}
      </motion.div>

      <AnimatePresence initial={false}>
        {open && !out ? (
          <motion.div
            key="warning"
            className="relative z-10 flex items-center justify-center p-3 [grid-area:1/1]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            <span
              aria-hidden
              className="absolute inset-0 rounded-[inherit] bg-[color-mix(in_oklab,var(--background)_58%,transparent)]"
            />
            <motion.div
              ref={setDialogNode}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={ids.title}
              aria-describedby={ids.desc}
              onKeyDown={onDialogKey}
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.base) }}
              transition={
                motionSafe
                  ? { y: springs.glide, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className="relative grid w-full max-w-[24rem] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-3 rounded-4 border border-hairline-strong bg-popover p-3.5 text-popover-foreground shadow-raised @min-[22rem]:gap-x-4 @min-[22rem]:p-4"
            >
              <motion.span
                className="size-12 shrink-0 @min-[22rem]:row-span-2 @min-[22rem]:size-16"
                style={{ scale: pop }}
              >
                <Ring
                  progress={progress}
                  ringStyle={ringStyle}
                  ticks={ticks}
                  seconds={seconds}
                  color={color}
                />
              </motion.span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <h2
                  id={ids.title}
                  className="text-[15px] leading-5 font-semibold text-balance"
                >
                  {heading}
                </h2>
                <p
                  id={ids.desc}
                  className="text-[12px] leading-4 text-pretty text-ink-2"
                >
                  {appName} signs you out after {span(timeout)} without
                  activity.
                </p>
              </div>
              <div className="col-span-2 flex flex-wrap items-center gap-2 @min-[22rem]:col-span-1 @min-[22rem]:col-start-2">
                <button
                  type="button"
                  onClick={() => extend("button")}
                  aria-disabled={extending || undefined}
                  className={cn(
                    "inline-flex h-8 flex-1 items-center justify-center rounded-2 bg-primary px-3 text-[13px] font-medium whitespace-nowrap text-primary-foreground transition-colors hover:bg-primary/90 @min-[22rem]:flex-none",
                    FOCUS,
                  )}
                >
                  {words.stay}
                </button>
                <button
                  type="button"
                  onClick={() => leave("signed-out")}
                  aria-disabled={extending || undefined}
                  className={cn(
                    "inline-flex h-8 items-center justify-center rounded-2 px-2.5 text-[13px] font-medium whitespace-nowrap text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS,
                  )}
                >
                  {words.signOut}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {out ? (
          <motion.section
            key="note"
            aria-labelledby={ids.note}
            className="relative z-10 flex items-center justify-center p-3 [grid-area:1/1]"
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={
              motionSafe
                ? {
                    y: { ...springs.glide, delay: 0.18 },
                    opacity: {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: 0.18,
                    },
                  }
                : { duration: durations.base }
            }
          >
            <div className="flex w-full max-w-[22rem] flex-col gap-3">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-2 text-ink-2"
                >
                  <LogOut className="size-4" />
                </span>
                <div className="flex min-w-0 flex-col">
                  <h2
                    id={ids.note}
                    className="text-[15px] leading-5 font-semibold"
                  >
                    {out === "expired"
                      ? "You were signed out"
                      : "You signed out"}
                  </h2>
                  <p className="text-[12px] leading-4 text-ink-2">
                    {draft
                      ? "Your draft is kept on this device."
                      : "Nothing was waiting to be saved."}
                  </p>
                </div>
              </div>
              {draft ? (
                <figure className="flex min-w-0 flex-col gap-1 rounded-3 border border-hairline bg-surface-1 px-3 py-2.5">
                  <figcaption className="flex min-w-0 items-center gap-1.5 text-[12px] leading-4 font-medium text-foreground">
                    <FileText
                      aria-hidden
                      className="size-3.5 shrink-0 text-ink-3"
                    />
                    <span className="truncate" title={draft.title}>
                      {draft.title}
                    </span>
                    {typeof draft.words === "number" ? (
                      <span className="ml-auto shrink-0 font-mono text-[10px] font-normal text-ink-3 tabular-nums">
                        {plural(draft.words, "word", "words")}
                      </span>
                    ) : null}
                  </figcaption>
                  <p className="line-clamp-2 text-[12px] leading-4 text-ink-2">
                    {draft.excerpt}
                  </p>
                </figure>
              ) : null}
              <button
                ref={setSignInNode}
                type="button"
                onClick={signIn}
                className={cn(
                  "inline-flex h-8 items-center justify-center self-start rounded-2 bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90",
                  FOCUS,
                )}
              >
                {words.signIn}
              </button>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
