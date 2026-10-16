"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import { CircleAlert, LifeBuoy, Mail } from "lucide-react";

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

export type CoolingLockFrostStyle = "crystal" | "rime" | "glaze";
export type CoolingLockTone = "calm" | "firm" | "stern";

/** What the form hands to `onRetry` once the lock has cooled. */
export type CoolingLockRetry = { email: string; password: string };

export type CoolingLockProps = {
  /** Failed sign-ins that caused the lock. @default 5 */
  attempts?: number;
  /** How long the lock lasts, in ms. @default 60000 */
  cooldown?: number;
  /** When the lock began, ms since the epoch. A new value starts a new lockout. @default `now` */
  lockedAt?: number;
  /** The moment the remaining time is measured from, ms since the epoch. @default defaultCoolingNow */
  now?: number;
  /** The account being signed in to; kept for the retry. @default "rae@fieldline.dev" */
  email?: string;
  /** The retry was sent. Return (or resolve) `false`, or reject, to refuse it; an Error's message is shown. */
  onRetry?: (
    retry: CoolingLockRetry,
  ) => boolean | void | Promise<boolean | void>;
  /** "Unlock by email" was pressed. A promise holds it as sending. */
  onUnlockByEmail?: (email: string) => void | Promise<void>;
  /** The wait ran out and the form came back. */
  onThaw?: () => void;
  /** Lockouts longer than this, in ms, point to support instead of counting down. @default 3600000 */
  supportAfter?: number;
  /** Where "Contact support" goes on a long lockout. @default "#support" */
  supportHref?: string;
  /** The product's name, in the sentences. @default "Fieldline" */
  appName?: string;
  /** The frost's material: six-armed flakes, bristling hoarfrost, or a smooth glaze of ice. @default "crystal" */
  frostStyle?: CoolingLockFrostStyle;
  /** How dense and thick the frost is, 0.2 to 1. @default 0.6 */
  density?: number;
  /** The voice and the lock's colour: calm cobalt, firm ink, or stern red. @default "firm" */
  tone?: CoolingLockTone;
  /** The retry and the unlock link are unavailable. @default false */
  disabled?: boolean;
  className?: string;
};

/** A fixed morning, so the default lockout renders the same everywhere. */
export const defaultCoolingNow = Date.UTC(2026, 9, 14, 8, 15);

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

/** The ring's box and radius. */
const BOX = 120;
const MID = 60;
const RING = 46;

const TITLE: Record<CoolingLockTone, string> = {
  calm: "Take a breather",
  firm: "Too many tries",
  stern: "Sign-in locked",
};

const INK: Record<CoolingLockTone, string> = {
  calm: "var(--accent-bright)",
  firm: "var(--foreground)",
  stern: "var(--danger)",
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const clock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** "1 minute", "45 seconds", "about 23 hours" — for sentences. */
const span = (ms: number) => {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 90) return plural(s, "second", "seconds");
  const m = Math.round(s / 60);
  if (m < 90) return plural(m, "minute", "minutes");
  return `about ${plural(Math.round(m / 60), "hour", "hours")}`;
};

/** A seeded generator, so every frost renders the same on server and client. */
const mulberry = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A point `turn` turns clockwise from twelve o'clock. */
const at = (turn: number, radius: number) => {
  const a = turn * Math.PI * 2 - Math.PI / 2;
  return [
    r2(MID + radius * Math.cos(a)),
    r2(MID + radius * Math.sin(a)),
  ] as const;
};

/** The arc from one turn to another, clockwise. */
const arc = (from: number, to: number, r: number) => {
  const radius = r2(r);
  const sweep = to - from;
  if (sweep <= 0.002) return "";
  if (sweep >= 0.998) {
    return `M${MID} ${MID - radius}A${radius} ${radius} 0 1 1 ${MID} ${MID + radius}A${radius} ${radius} 0 1 1 ${MID} ${MID - radius}`;
  }
  const [x1, y1] = at(from, radius);
  const [x2, y2] = at(to, radius);
  return `M${x1} ${y1}A${radius} ${radius} 0 ${sweep > 0.5 ? 1 : 0} 1 ${x2} ${y2}`;
};

/** A six-armed flake of radius `s`, centred on the origin, barbed. */
const flakePath = (s: number) => {
  let d = "";
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3;
    const cx = Math.cos(a);
    const cy = Math.sin(a);
    d += `M${r2(-s * cx)} ${r2(-s * cy)}L${r2(s * cx)} ${r2(s * cy)}`;
    for (const dir of [1, -1]) {
      const bx = dir * s * 0.55 * cx;
      const by = dir * s * 0.55 * cy;
      for (const side of [1, -1]) {
        const ba = a + (dir === 1 ? 0 : Math.PI) + side * (Math.PI / 4);
        d += `M${r2(bx)} ${r2(by)}L${r2(bx + s * 0.32 * Math.cos(ba))} ${r2(by + s * 0.32 * Math.sin(ba))}`;
      }
    }
  }
  return d;
};

type Flake = { turn: number; x: number; y: number; d: string; twist: number };
type Spike = { turn: number; out: number; inner: number };

/* ----------------------------------------------------------------------- */
/*                              The frost ring                              */
/* ----------------------------------------------------------------------- */

function FrostRing({
  frost,
  frostStyle,
  density,
  thawed,
  open,
  ink,
  motionSafe,
}: {
  frost: MotionValue<number>;
  frostStyle: CoolingLockFrostStyle;
  density: number;
  thawed: boolean;
  open: boolean;
  ink: string;
  motionSafe: boolean;
}) {
  const flakes = React.useMemo<Flake[]>(() => {
    const rand = mulberry(1716);
    const count = Math.round(6 + 10 * density);
    return Array.from({ length: count }, (_, i) => {
      const turn = (i + 0.5) / count;
      const [x, y] = at(turn, RING + (rand() - 0.5) * 3);
      const size = (6 + rand() * 3) * (0.8 + 0.4 * density);
      return { turn, x, y, d: flakePath(size), twist: Math.round(rand() * 60) };
    });
  }, [density]);

  const spikes = React.useMemo<Spike[]>(() => {
    const rand = mulberry(4417);
    const count = Math.round(36 + 72 * density);
    return Array.from({ length: count }, (_, i) => ({
      turn: (i + rand() * 0.6) / count,
      out: (3 + rand() * 6) * (0.7 + 0.6 * density),
      inner: (1 + rand() * 3) * (0.7 + 0.6 * density),
    }));
  }, [density]);

  // Which flakes the thaw front has passed: React hears of it once per flake.
  const meltedFor = React.useCallback(
    (f: number) => flakes.filter((fl) => 1 - f > fl.turn).length,
    [flakes],
  );
  // The state is only the nudge to re-render; the count is read from the
  // value, so a change of density never leaves a stale count behind.
  const [, setMelted] = React.useState(() => meltedFor(frost.get()));
  useMotionValueEvent(frost, "change", (f) => {
    const m = meltedFor(f);
    setMelted((prev) => (prev === m ? prev : m));
  });
  const melted = thawed ? flakes.length : meltedFor(frost.get());

  const band = useTransform(frost, (f) => arc(1 - f, 1, RING));
  const glazeLight = useTransform(frost, (f) =>
    arc(Math.min(1, 1 - f + 0.03), 0.985, RING - 2 - 2 * density),
  );
  const rime = useTransform(frost, (f) => {
    const front = 1 - f;
    let d = "";
    for (const s of spikes) {
      const k = clamp((s.turn - front) / 0.06, 0, 1);
      if (k <= 0) continue;
      const [x1, y1] = at(s.turn, RING + 1);
      const [x2, y2] = at(s.turn, RING + 1 + s.out * k);
      const [x3, y3] = at(s.turn, RING - 1 - s.inner * k);
      d += `M${x3} ${y3}L${x1} ${y1}L${x2} ${y2}`;
    }
    return d;
  });

  const bandWidth = r2(
    frostStyle === "glaze" ? 5 + 7 * density : 2 + 3 * density,
  );

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${BOX} ${BOX}`}
      className="block size-full overflow-visible"
      style={
        {
          "--cl-ice": "oklch(from var(--accent-bright) 0.84 0.06 230)",
          "--cl-edge": "oklch(from var(--accent-bright) 0.6 0.09 235)",
        } as React.CSSProperties
      }
    >
      <circle
        cx={MID}
        cy={MID}
        r={RING}
        fill="none"
        className="stroke-hairline-strong"
        strokeWidth={thawed ? 1.5 : 1}
      />

      {frostStyle === "glaze" ? (
        <>
          <motion.path
            d={band}
            fill="none"
            stroke="var(--cl-edge)"
            strokeOpacity={0.55}
            strokeWidth={r2(bandWidth + 1.6)}
            strokeLinecap="round"
          />
          <motion.path
            d={band}
            fill="none"
            stroke="var(--cl-ice)"
            strokeOpacity={0.85}
            strokeWidth={bandWidth}
            strokeLinecap="round"
          />
          <motion.path
            d={glazeLight}
            fill="none"
            stroke="oklch(1 0 0 / 0.6)"
            strokeWidth={1.2}
            strokeLinecap="round"
          />
        </>
      ) : frostStyle === "rime" ? (
        <>
          <motion.path
            d={band}
            fill="none"
            stroke="var(--cl-ice)"
            strokeOpacity={0.7}
            strokeWidth={bandWidth}
            strokeLinecap="round"
          />
          <motion.path
            d={rime}
            fill="none"
            stroke="var(--cl-edge)"
            strokeOpacity={0.45}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <motion.path
            d={rime}
            fill="none"
            stroke="var(--cl-ice)"
            strokeWidth={1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <motion.path
            d={band}
            fill="none"
            stroke="var(--cl-ice)"
            strokeOpacity={0.45}
            strokeWidth={bandWidth}
            strokeLinecap="round"
          />
          {flakes.map((fl, i) => {
            const gone = i < melted;
            return (
              <g key={i} transform={`translate(${fl.x} ${fl.y})`}>
                {/* The melt leaves a droplet that slips a few pixels and goes. */}
                {gone && !thawed ? (
                  <motion.circle
                    r={1.4}
                    fill="var(--cl-edge)"
                    initial={{ opacity: 0.9, y: 0 }}
                    animate={{ opacity: 0, y: motionSafe ? 4 : 0 }}
                    transition={{ duration: 0.6, ease: easings.exit }}
                  />
                ) : null}
                <g transform={`rotate(${fl.twist})`}>
                  <motion.g
                    initial={false}
                    animate={{
                      scale: gone && motionSafe ? 0.25 : 1,
                      opacity: gone ? 0 : 1,
                    }}
                    transition={
                      motionSafe
                        ? {
                            scale: springs.snap,
                            opacity: { duration: durations.base },
                          }
                        : { duration: durations.base }
                    }
                    style={{ originX: 0.5, originY: 0.5 }}
                  >
                    <path
                      d={fl.d}
                      fill="none"
                      stroke="var(--cl-edge)"
                      strokeOpacity={0.5}
                      strokeWidth={2.2}
                      strokeLinecap="round"
                    />
                    <path
                      d={fl.d}
                      fill="none"
                      stroke="var(--cl-ice)"
                      strokeWidth={1.2}
                      strokeLinecap="round"
                    />
                  </motion.g>
                </g>
              </g>
            );
          })}
        </>
      )}

      {thawed ? (
        <g aria-hidden>
          <circle
            cx={MID - 5}
            cy={MID + RING + 5}
            r={1.6}
            fill="var(--cl-edge)"
            fillOpacity={0.7}
          />
          <circle
            cx={MID + 4}
            cy={MID + RING + 6.5}
            r={1.1}
            fill="var(--cl-edge)"
            fillOpacity={0.5}
          />
        </g>
      ) : null}

      <g style={{ color: ink }}>
        <motion.path
          d="M51 58 V52.5 A9 9 0 0 1 69 52.5 V58"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          initial={false}
          animate={{ y: open ? -4 : 0, rotate: open ? 14 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
          style={{ originX: 1, originY: 1 }}
        />
        <rect
          x={46}
          y={58}
          width={28}
          height={21}
          rx={4.5}
          fill="currentColor"
          fillOpacity={0.14}
          stroke="currentColor"
          strokeWidth={2.4}
        />
        <circle cx={MID} cy={67} r={2.3} fill="currentColor" />
        <path
          d="M60 68.5 V72.5"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

type Phase = "locked" | "long" | "open" | "done";

/**
 * A lockout panel for after repeated failed sign-ins. Frost covers a ring
 * round the lock and thaws clockwise from the top as the wait runs down — the
 * thaw front is the time itself — in one of three materials: six-armed
 * flakes that shrink on `springs.snap` and leave a droplet as the front
 * passes them, bristling hoarfrost whose spikes shorten in a soft band at the
 * front, or a smooth glaze that drains as one arc.
 *
 * When the last of it melts the shackle lifts on snap, the ring settles to a
 * hairline with two droplets at its foot, and the copy gives way to the
 * sign-in form with the address kept. "Unlock by email" is always
 * there. A new `lockedAt` from the host freezes the ring back over on
 * `springs.glide` before the wait starts again; a lockout longer than
 * `supportAfter` holds its frost and points to support instead of counting.
 *
 * The countdown digits are hidden from assistive tech; a polite status
 * announces the wait, then 5 minutes, 1 minute, 30 and 10 seconds, and the
 * thaw. Under reduced motion the ring still thaws by the same front, but
 * flakes fade without shrinking and the copy cross-fades in place.
 */
export function CoolingLock({
  attempts = 5,
  cooldown = 60_000,
  lockedAt,
  now = defaultCoolingNow,
  email = "rae@fieldline.dev",
  onRetry,
  onUnlockByEmail,
  onThaw,
  supportAfter = 3_600_000,
  supportHref = "#support",
  appName = "Fieldline",
  frostStyle = "crystal",
  density = 0.6,
  tone = "firm",
  disabled = false,
  className,
}: CoolingLockProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const ids = {
    title: `${uid}-title`,
    password: `${uid}-password`,
    error: `${uid}-error`,
  };
  const d = clamp(density, 0.2, 1);
  const total = Math.max(1000, cooldown);
  const started = lockedAt ?? now;
  const remaining0 = clamp(total - (now - started), 0, total);
  const phase0: Phase =
    remaining0 > supportAfter ? "long" : remaining0 > 0 ? "locked" : "open";

  // A new lockout from the host starts clean — decided in render, as it lands.
  const lockKey = `${started}:${total}:${now}:${supportAfter}`;
  const [seenKey, setSeenKey] = React.useState(lockKey);
  const [phase, setPhase] = React.useState<Phase>(phase0);
  const [left, setLeft] = React.useState(Math.ceil(remaining0 / 1000));
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [link, setLink] = React.useState<"idle" | "sending" | "sent">("idle");
  const [canResend, setCanResend] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [live, setLive] = React.useState(false);
  const [inputNode, setInputNode] = React.useState<HTMLInputElement | null>(
    null,
  );
  const [headNode, setHeadNode] = React.useState<HTMLHeadingElement | null>(
    null,
  );
  if (seenKey !== lockKey) {
    setSeenKey(lockKey);
    setPhase(phase0);
    setLeft(Math.ceil(remaining0 / 1000));
    setPassword("");
    setError(null);
    setBusy(false);
    if (phase0 !== "open") {
      setAnnouncement(
        phase0 === "long"
          ? `Sign-in is locked for ${span(remaining0)}.`
          : `Sign-in is locked. Try again in ${span(remaining0)}.`,
      );
    }
  }

  const frost = useMotionValue(phase0 === "open" ? 0 : remaining0 / total);
  const rootRef = React.useRef<HTMLElement | null>(null);
  const fieldRef = React.useRef<HTMLDivElement | null>(null);
  const deadline = React.useRef<number | null>(null);
  const spoken = React.useRef(Infinity);
  const focusOnArrive = React.useRef(false);
  const focusHead = React.useRef(false);
  const run = React.useRef(0);
  const currentKey = React.useRef(lockKey);
  const shakes = React.useRef<AnimationPlaybackControls | null>(null);
  const thawRef = React.useRef<() => void>(() => {});

  React.useEffect(
    () => () => {
      shakes.current?.stop();
      run.current += 1;
    },
    [],
  );

  // Only animate where someone can see it.
  React.useEffect(() => {
    const node = rootRef.current;
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

  // Each lockout gets its own wall-clock deadline; its end is one timeout.
  React.useEffect(() => {
    // A new lockout swaps out whatever had focus in the form; the heading
    // that arrives with the frost takes it.
    const root = rootRef.current;
    const active = document.activeElement;
    if (
      currentKey.current !== lockKey &&
      root &&
      active &&
      root.contains(active)
    ) {
      focusHead.current = true;
    }
    currentKey.current = lockKey;
    deadline.current = null;
    spoken.current = Infinity;
  }, [lockKey]);

  React.useEffect(() => {
    if (!headNode || !focusHead.current) return;
    focusHead.current = false;
    headNode.focus({ preventScroll: true });
  }, [headNode]);

  React.useEffect(() => {
    if (phase !== "locked") return;
    if (deadline.current === null) deadline.current = Date.now() + remaining0;
    const id = window.setTimeout(
      () => thawRef.current(),
      Math.max(0, deadline.current - Date.now()),
    );
    return () => window.clearTimeout(id);
  }, [lockKey, phase, remaining0]);

  // The thaw, drawn only while it can be seen: a plain number tweened to
  // zero over what is left, after the frost has first grown back if a new
  // lockout found the ring clear.
  React.useEffect(() => {
    if (phase !== "locked" || !live) return;
    const end = deadline.current;
    if (end === null) return;
    const controls: AnimationPlaybackControls[] = [];
    const drain = () => {
      const ms = Math.max(0, end - Date.now());
      const from = ms / total;
      frost.jump(from);
      controls.push(
        animate(from, 0, {
          duration: ms / 1000,
          ease: "linear",
          onUpdate: (v) => frost.set(v),
        }),
      );
    };
    const target = Math.max(0, end - Date.now()) / total;
    if (motionSafe && frost.get() < target - 0.05) {
      controls.push(
        animate(frost.get(), target, {
          ...springs.glide,
          onUpdate: (v) => frost.set(v),
          onComplete: drain,
        }),
      );
    } else {
      drain();
    }
    const tick = () => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(s);
      const before = spoken.current;
      spoken.current = s;
      for (const mark of [300, 60, 30, 10]) {
        if (before > mark && s <= mark && s > 0 && before !== Infinity) {
          setAnnouncement(`Try again in ${span(s * 1000)}.`);
          break;
        }
      }
    };
    const id = window.setInterval(tick, 1000);
    return () => {
      for (const c of controls) c.stop();
      window.clearInterval(id);
    };
  }, [frost, live, lockKey, motionSafe, phase, total]);

  React.useEffect(() => {
    thawRef.current = () => {
      const root = rootRef.current;
      const active = document.activeElement;
      focusOnArrive.current = Boolean(root && active && root.contains(active));
      deadline.current = null;
      frost.jump(0);
      setLeft(0);
      setPhase("open");
      setAnnouncement(
        `The lock has cooled. You can sign in to ${appName} again.`,
      );
      onThaw?.();
    };
  });

  // The field is focused when it arrives, if focus was already in the panel.
  React.useEffect(() => {
    if (!inputNode || !focusOnArrive.current) return;
    focusOnArrive.current = false;
    inputNode.focus({ preventScroll: true });
  }, [inputNode]);

  React.useEffect(() => {
    if (link !== "sent") return;
    const id = window.setTimeout(() => setCanResend(true), 30_000);
    return () => window.clearTimeout(id);
  }, [link]);

  const sendLink = async () => {
    if (disabled || link === "sending") return;
    setLink("sending");
    setCanResend(false);
    const token = run.current;
    try {
      await Promise.resolve(onUnlockByEmail?.(email));
      if (token !== run.current) return;
      setLink("sent");
      setAnnouncement(`Unlock link sent to ${email}.`);
    } catch (err) {
      if (token !== run.current) return;
      setLink("idle");
      setAnnouncement(
        err instanceof Error && err.message
          ? err.message
          : "The unlock link didn't send. Try again.",
      );
    }
  };

  const retry = async (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled || busy || phase !== "open") return;
    if (!password) {
      setError("Enter your password.");
      inputNode?.focus();
      return;
    }
    const token = ++run.current;
    const key = currentKey.current;
    setBusy(true);
    setError(null);
    let ok = true;
    let reason: string | undefined;
    try {
      const result = await Promise.resolve(onRetry?.({ email, password }));
      if (result === false) ok = false;
    } catch (err) {
      ok = false;
      reason = err instanceof Error && err.message ? err.message : undefined;
    }
    if (token !== run.current) return;
    setBusy(false);
    // A host that answered the refusal with a new lockout has said enough:
    // the frost comes back, and the error does not wait for the next form.
    if (key !== currentKey.current) return;
    if (ok) {
      const root = rootRef.current;
      const active = document.activeElement;
      focusHead.current = Boolean(root && active && root.contains(active));
      setPhase("done");
      setAnnouncement(`Signed in to ${appName}.`);
      return;
    }
    const message = reason ?? "That password didn't match.";
    setError(message);
    setAnnouncement(message);
    const field = fieldRef.current;
    if (field && motionSafe) {
      shakes.current?.stop();
      shakes.current = animate(
        field,
        { x: [0, -6, 6, -4, 4, 0] },
        { duration: 0.32, ease: "linear" },
      );
    }
    inputNode?.focus();
    inputNode?.select();
  };

  /* ------------------------------ drawing ------------------------------ */

  const ink = phase === "done" ? "var(--success)" : (INK[tone] ?? INK.firm);
  const thawed = phase === "open" || phase === "done";
  const swap = {
    initial: { opacity: 0, y: motionSafe ? distances.nudge : 0 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, transition: exitFor(durations.fast) },
    transition: motionSafe
      ? {
          y: springs.glide,
          opacity: { duration: durations.base, ease: easings.enter },
        }
      : { duration: durations.fast },
  };
  const quietLink = cn(
    "inline-flex h-7 items-center gap-1.5 self-start rounded-1 text-[12px] leading-4 font-medium text-ink-2 underline-offset-2 transition-colors hover:text-foreground hover:underline",
    FOCUS,
    disabled && "cursor-not-allowed opacity-50",
  );

  const unlock =
    link === "sent" ? (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-[12px] leading-4 text-ink-2">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="size-3.5 shrink-0 text-success"
          >
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
          <span className="truncate">Link sent to {email}</span>
        </span>
        {canResend ? (
          <button
            type="button"
            onClick={() => void sendLink()}
            className={quietLink}
          >
            Resend
          </button>
        ) : null}
      </span>
    ) : (
      <button
        type="button"
        onClick={() => void sendLink()}
        aria-disabled={disabled || link === "sending" || undefined}
        aria-busy={link === "sending" || undefined}
        className={quietLink}
      >
        <Mail aria-hidden className="size-3.5 shrink-0" />
        {link === "sending" ? "Sending…" : "Unlock by email"}
      </button>
    );

  let body: React.ReactNode;
  if (phase === "done") {
    body = (
      <motion.div key="done" className="flex flex-col gap-1" {...swap}>
        <h2
          id={ids.title}
          ref={setHeadNode}
          tabIndex={-1}
          className={cn("rounded-1 text-[15px] leading-5 font-semibold", FOCUS)}
        >
          You&apos;re signed in
        </h2>
        <p className="text-[12px] leading-4 text-ink-2">
          Taking you to {appName}.
        </p>
      </motion.div>
    );
  } else if (phase === "open") {
    body = (
      <motion.div key="form" className="flex min-w-0 flex-col gap-2" {...swap}>
        <div className="flex flex-col">
          <h2 id={ids.title} className="text-[15px] leading-5 font-semibold">
            Try again
          </h2>
          <p
            className="truncate text-[12px] leading-4 text-ink-2"
            title={email}
          >
            {email}
          </p>
        </div>
        <form
          noValidate
          onSubmit={(event) => void retry(event)}
          className="flex flex-col gap-1"
        >
          <label htmlFor={ids.password} className="sr-only">
            Password for {email}
          </label>
          <div ref={fieldRef} className="flex min-w-0 items-center gap-2">
            <input
              ref={setInputNode}
              id={ids.password}
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              readOnly={busy}
              disabled={disabled}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? ids.error : undefined}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setPassword(value);
                if (error) setError(null);
              }}
              className={cn(
                "h-8 min-w-0 flex-1 rounded-2 border bg-surface-0 px-2.5 text-[13px] text-foreground placeholder:text-ink-3 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid disabled:opacity-50",
                error ? "border-danger" : "border-input",
              )}
            />
            <button
              type="submit"
              aria-disabled={busy || disabled || undefined}
              aria-busy={busy || undefined}
              className={cn(
                "inline-flex h-8 shrink-0 items-center rounded-2 bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90",
                FOCUS,
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </div>
          {error ? (
            <p
              id={ids.error}
              role="alert"
              className="flex items-start gap-1.5 text-[11px] leading-4 text-danger"
            >
              <CircleAlert aria-hidden className="mt-px size-3 shrink-0" />
              {error}
            </p>
          ) : null}
        </form>
        {unlock}
      </motion.div>
    );
  } else {
    const long = phase === "long";
    body = (
      <motion.div
        key="locked"
        className="flex min-w-0 flex-col gap-1.5"
        {...swap}
      >
        <div className="flex flex-col gap-0.5">
          <h2
            id={ids.title}
            ref={setHeadNode}
            tabIndex={-1}
            className={cn(
              "self-start rounded-1 text-[15px] leading-5 font-semibold",
              FOCUS,
            )}
          >
            {TITLE[tone] ?? TITLE.firm}
          </h2>
          <p className="text-[12px] leading-4 text-ink-2">
            {plural(attempts, "failed sign-in", "failed sign-ins")} for
            <span className="block truncate text-foreground" title={email}>
              {email}
            </span>
          </p>
        </div>
        {long ? (
          <p className="text-[12px] leading-4 text-pretty text-ink-2">
            Try again in {span(remaining0)}, or ask support to check it&apos;s
            you.
          </p>
        ) : (
          <p className="flex items-baseline gap-2">
            <span className="text-[12px] leading-4 text-ink-3">
              Try again in
            </span>
            <span
              aria-hidden
              className="font-mono text-[20px] leading-6 font-medium tabular-nums"
              style={{ color: ink }}
            >
              {clock(left)}
            </span>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4">
          {long ? (
            <a href={supportHref} className={quietLink}>
              <LifeBuoy aria-hidden className="size-3.5 shrink-0" />
              Contact support
            </a>
          ) : null}
          {unlock}
        </div>
      </motion.div>
    );
  }

  return (
    <section
      ref={rootRef}
      aria-labelledby={ids.title}
      className={cn("@container w-full", className)}
    >
      <div className="flex w-full items-center gap-4 rounded-4 border border-hairline bg-card p-4 text-card-foreground @max-[16rem]:flex-col @max-[16rem]:items-start @min-[30rem]:gap-5 @min-[30rem]:p-5">
        <div className="size-[76px] shrink-0 @min-[20rem]:size-24">
          <FrostRing
            frost={frost}
            frostStyle={frostStyle}
            density={d}
            thawed={thawed}
            open={thawed}
            ink={ink}
            motionSafe={motionSafe}
          />
        </div>
        <div className="grid min-w-0 flex-1">
          <AnimatePresence initial={false} mode="wait">
            {body}
          </AnimatePresence>
        </div>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
