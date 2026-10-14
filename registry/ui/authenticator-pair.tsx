"use client";

import * as React from "react";

import { AnimatePresence, motion, useAnimate } from "motion/react";
import {
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
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

export type AuthenticatorSecret = {
  /** The shared secret, base32-looking; only ever seeded data here. */
  key: string;
  /** Who issued it, e.g. "Fieldline". */
  issuer: string;
  /** The account it protects, e.g. "mara.lind@fieldline.app". */
  account: string;
};

export type AuthenticatorVerifyContext = {
  secret: AuthenticatorSecret;
  /** The code the authenticator shows right now. */
  expected: string;
  /** The code it showed one period ago; most servers still take it. */
  previous: string;
  /** Which period the clock is in. */
  counter: number;
  /** Which attempt this is, counting from 1. */
  attempt: number;
};

/** Resolves true to pair. A rejection counts as a wrong code. */
export type AuthenticatorVerify = (
  code: string,
  context: AuthenticatorVerifyContext,
) => Promise<boolean>;

export type AuthenticatorPairing = {
  device: string;
  /** When it paired, in ms on the surface's own clock. */
  pairedAt: number;
  secret: AuthenticatorSecret;
  /** How many codes it took. */
  attempts: number;
};

export type AuthenticatorCodeStyle = "grid" | "dots" | "bars";
export type AuthenticatorRingStyle = "ring" | "arc" | "bar";
export type AuthenticatorDensity = "compact" | "cozy" | "roomy";
export type AuthenticatorStatus = "ready" | "loading" | "error";
export type AuthenticatorPhase =
  "idle" | "checking" | "wrong" | "paired" | "locked";

export type AuthenticatorPairProps = {
  /** How the pairing code is drawn: square modules, dots, or runs joined into bars. @default "grid" */
  codeStyle?: AuthenticatorCodeStyle;
  /** The timer: a full ring, an open arc with the seconds inside, or a bar under the cells. @default "ring" */
  ringStyle?: AuthenticatorRingStyle;
  /** Cell size, type size and padding. @default "cozy" */
  density?: AuthenticatorDensity;
  /** The secret the authenticator is given. @default defaultAuthenticatorSecret */
  secret?: AuthenticatorSecret;
  /** Controlled code: the digits entered so far, up to six. */
  value?: string;
  /** Initial code when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires with the digits entered so far, on every keystroke, paste or clear. */
  onChange?: (code: string) => void;
  /** Checks a six-digit code. @default defaultAuthenticatorVerify, which takes the current or previous code */
  verify?: AuthenticatorVerify;
  /** A code was accepted and the Paired card has landed. */
  onPaired?: (pairing: AuthenticatorPairing) => void;
  /** A code was refused, with the attempt it used up. */
  onReject?: (attempt: number, code: string) => void;
  /** Start over was pressed after the last attempt. */
  onStartOver?: () => void;
  /** The key was copied from the back of the card. */
  onCopy?: (key: string) => void;
  /** How long each code lives, in seconds. @default 30 */
  period?: number;
  /** Wrong codes allowed before Start over is offered. @default 3 */
  maxAttempts?: number;
  /** The moment the clock starts from, in ms; it runs on from there while the surface is on screen. @default defaultAuthenticatorNow */
  now?: number;
  /** What the authenticator is called on the Paired card. @default "Mara's phone" */
  deviceName?: string;
  /** Show the "pretend your app shows" card with the current code, for demos and docs. @default true */
  simulator?: boolean;
  /** Whether the secret has been generated. @default "ready" */
  status?: AuthenticatorStatus;
  /** Try again was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Pair an authenticator" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; its body scrolls inside it. @default 520 */
  height?: number;
  /** Read only: nothing can be typed, flipped or copied. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** Monday 12 October 2026, 09:14:07 UTC. */
export const defaultAuthenticatorNow = Date.UTC(2026, 9, 12, 9, 14, 7);

export const defaultAuthenticatorSecret: AuthenticatorSecret = {
  key: "JBSWY3DPEHPK3PXPK7Q4R2WVN5ZFCMTA",
  issuer: "Fieldline",
  account: "mara.lind@fieldline.app",
};

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash32 = (text: string) => {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
};

/** Which period a moment falls in. */
export const authenticatorCounter = (now: number, period: number) =>
  Math.floor(now / 1000 / Math.max(1, period));

/**
 * The six digits a seeded authenticator shows for one period. Not a real
 * one-time-password algorithm: a hash of the key and the period, so the
 * surface, its demo and a host's verifier all agree on the same code.
 */
export const authenticatorCodeFor = (key: string, counter: number) => {
  const rand = mulberry32(hash32(`${key}:${counter}`));
  let out = "";
  for (let i = 0; i < 6; i += 1) out += String(Math.floor(rand() * 10));
  return out;
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Takes the current code or the one before it, after a short round trip. */
export const defaultAuthenticatorVerify: AuthenticatorVerify = async (
  code,
  { expected, previous },
) => {
  await wait(460);
  return code === expected || code === previous;
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const DIGITS = 6;
const MODULES = 21;
const TICK_MS = 250;
const WRONG_MS = 520;
const LAND_MS = 440;
const COPIED_MS = 1600;

const noopSubscribe = () => () => {};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const r3 = (v: number) => Number(v.toFixed(3));

const onlyDigits = (text: string) => text.replace(/\D/g, "");

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const pad2 = (n: number) => String(n).padStart(2, "0");

const formatStamp = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCFullYear()}, ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
};

const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

const DENSITY: Record<
  AuthenticatorDensity,
  {
    cell: string;
    gap: string;
    cellsMax: number;
    code: number;
    body: string;
    section: string;
  }
> = {
  compact: {
    cell: "h-10 text-lg",
    gap: "gap-1.5",
    cellsMax: 236,
    code: 172,
    body: "gap-4 px-3 pb-3",
    section: "gap-2.5",
  },
  cozy: {
    cell: "h-12 text-xl",
    gap: "gap-2",
    cellsMax: 284,
    code: 200,
    body: "gap-5 px-4 pb-4",
    section: "gap-3",
  },
  roomy: {
    cell: "h-14 text-2xl",
    gap: "gap-2.5",
    cellsMax: 316,
    code: 224,
    body: "gap-6 px-5 pb-5",
    section: "gap-4",
  },
};

/* ----------------------------------------------------------------------- */
/*                              Pairing pattern                             */
/* ----------------------------------------------------------------------- */

/**
 * A decorative 21 by 21 pattern seeded from the key: three anchor squares in
 * the corners so it reads as a pairing code, and a seeded field between
 * them. It is not a real QR code and nothing can scan it.
 */
const patternFor = (key: string): boolean[][] => {
  const rand = mulberry32(hash32(`pattern:${key}`));
  const anchors: [number, number][] = [
    [0, 0],
    [MODULES - 7, 0],
    [0, MODULES - 7],
  ];
  const anchorAt = (x: number, y: number): boolean | null => {
    for (const [ax, ay] of anchors) {
      const dx = x - ax;
      const dy = y - ay;
      // One quiet module around each anchor.
      if (dx >= -1 && dx <= 7 && dy >= -1 && dy <= 7) {
        if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return false;
        if (dx === 0 || dy === 0 || dx === 6 || dy === 6) return true;
        if (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4) return true;
        return false;
      }
    }
    return null;
  };
  return Array.from({ length: MODULES }, (_, y) =>
    Array.from({ length: MODULES }, (_, x) => {
      const fixed = anchorAt(x, y);
      if (fixed !== null) return fixed;
      // A timing line between the top anchors, like the real thing.
      if (y === 6 || x === 6) return (x + y) % 2 === 0;
      return rand() < 0.47;
    }),
  );
};

function CodeArt({
  pattern,
  style,
  motionSafe,
  enter,
}: {
  pattern: boolean[][];
  style: AuthenticatorCodeStyle;
  motionSafe: boolean;
  enter: boolean;
}) {
  const step = cascade(MODULES);
  return (
    <svg
      aria-hidden
      viewBox={`-1 -1 ${MODULES + 2} ${MODULES + 2}`}
      className="size-full text-foreground"
      shapeRendering={style === "grid" ? "crispEdges" : "auto"}
    >
      {pattern.map((row, y) => {
        let cells: React.ReactNode;
        if (style === "bars") {
          const runs: { start: number; length: number }[] = [];
          let start = -1;
          row.forEach((on, x) => {
            if (on && start < 0) start = x;
            if ((!on || x === row.length - 1) && start >= 0) {
              const end = on && x === row.length - 1 ? x + 1 : x;
              runs.push({ start, length: end - start });
              start = -1;
            }
          });
          cells = runs.map((run) => (
            <rect
              key={run.start}
              x={run.start + 0.1}
              y={y + 0.14}
              width={run.length - 0.2}
              height={0.72}
              rx={0.36}
              fill="currentColor"
            />
          ));
        } else if (style === "dots") {
          cells = row.map((on, x) =>
            on ? (
              <circle
                key={x}
                cx={x + 0.5}
                cy={y + 0.5}
                r={0.4}
                fill="currentColor"
              />
            ) : null,
          );
        } else {
          cells = row.map((on, x) =>
            on ? (
              <rect
                key={x}
                x={x}
                y={y}
                width={1}
                height={1}
                fill="currentColor"
              />
            ) : null,
          );
        }
        return (
          <motion.g
            key={y}
            initial={enter ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{
              duration: durations.base,
              ease: easings.enter,
              delay: motionSafe ? r3(y * step) : 0,
            }}
          >
            {cells}
          </motion.g>
        );
      })}
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Timer                                  */
/* ----------------------------------------------------------------------- */

function Timer({
  style,
  fraction,
  seconds,
  refreshed,
  motionSafe,
  className,
}: {
  style: AuthenticatorRingStyle;
  fraction: number;
  seconds: number;
  refreshed: boolean;
  motionSafe: boolean;
  className?: string;
}) {
  const low = seconds <= 5;
  const transition = refreshed
    ? motionSafe
      ? springs.snap
      : { duration: 0 }
    : { duration: TICK_MS / 1000, ease: easings.linear };
  const stroke = low ? "var(--warn)" : "var(--accent)";

  if (style === "bar") {
    return (
      <div className={cn("flex w-full items-center gap-2", className)}>
        <div
          aria-hidden
          className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2"
        >
          <motion.div
            className="h-full w-full rounded-full"
            style={{ originX: 0, backgroundColor: stroke }}
            initial={false}
            animate={{ scaleX: fraction }}
            transition={transition}
          />
        </div>
        <span
          className={cn(
            "w-[3ch] shrink-0 text-right font-mono text-[11px] tabular-nums",
            low ? "text-warn" : "text-ink-2",
          )}
        >
          {seconds}s
        </span>
      </div>
    );
  }

  if (style === "arc") {
    // A 270 degree arc, open at the foot, r 16 about (20, 20).
    const d = "M 8.686 31.314 A 16 16 0 1 1 31.314 31.314";
    return (
      <span className={cn("relative inline-flex size-10 shrink-0", className)}>
        <svg aria-hidden viewBox="0 0 40 40" className="size-full">
          <path
            d={d}
            fill="none"
            stroke="var(--hairline-strong)"
            strokeWidth={3}
            strokeLinecap="round"
          />
          <motion.path
            d={d}
            fill="none"
            stroke={stroke}
            strokeWidth={3}
            strokeLinecap="round"
            initial={false}
            animate={{ pathLength: fraction }}
            transition={transition}
          />
        </svg>
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center font-mono text-[11px] tabular-nums",
            low ? "text-warn" : "text-ink-2",
          )}
        >
          {seconds}
        </span>
      </span>
    );
  }

  return (
    <span className={cn("relative inline-flex size-10 shrink-0", className)}>
      <svg aria-hidden viewBox="0 0 40 40" className="size-full -rotate-90">
        <circle
          cx={20}
          cy={20}
          r={16}
          fill="none"
          stroke="var(--hairline-strong)"
          strokeWidth={3}
        />
        <motion.circle
          cx={20}
          cy={20}
          r={16}
          fill="none"
          stroke={stroke}
          strokeWidth={3}
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: fraction }}
          transition={transition}
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center font-mono text-[11px] tabular-nums",
          low ? "text-warn" : "text-ink-2",
        )}
      >
        {seconds}
      </span>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Cell                                   */
/* ----------------------------------------------------------------------- */

type CellTone = "idle" | "checking" | "wrong" | "paired";

const CELL_TONE: Record<CellTone, string> = {
  idle: "border-hairline-strong bg-surface-0 text-foreground",
  checking:
    "border-[color-mix(in_oklab,var(--accent)_55%,transparent)] bg-cobalt-wash text-foreground",
  wrong:
    "border-[color-mix(in_oklab,var(--danger)_60%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] text-danger",
  paired:
    "border-[color-mix(in_oklab,var(--success)_60%,transparent)] bg-[color-mix(in_oklab,var(--success)_10%,transparent)] text-success",
};

function Cell({
  index,
  digit,
  tone,
  tabStop,
  delay,
  cellClass,
  motionSafe,
  disabled,
  inputRef,
  onInput,
  onKeyDown,
  onPaste,
  onFocus,
}: {
  index: number;
  digit: string;
  tone: CellTone;
  tabStop: boolean;
  /** Seconds before the digit pops in: a pasted code fills in a cascade. */
  delay: number;
  cellClass: string;
  motionSafe: boolean;
  disabled: boolean;
  inputRef: (node: HTMLInputElement | null) => void;
  onInput: (index: number, typed: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onPaste: (event: React.ClipboardEvent<HTMLInputElement>) => void;
  onFocus: () => void;
}) {
  return (
    <span
      className={cn(
        "relative flex min-w-0 items-center justify-center rounded-2 border font-mono transition-colors duration-200",
        cellClass,
        CELL_TONE[tone],
        disabled && "cursor-not-allowed",
      )}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete={index === 0 ? "one-time-code" : "off"}
        aria-label={`Digit ${index + 1} of ${DIGITS}`}
        value={digit}
        disabled={disabled}
        tabIndex={tabStop ? 0 : -1}
        onChange={(event) => onInput(index, event.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onFocus={(event) => {
          event.target.select();
          onFocus();
        }}
        className={cn(
          "absolute inset-0 size-full rounded-2 bg-transparent text-center text-transparent caret-(--ink) selection:bg-transparent",
          FOCUS_RING,
        )}
      />
      {/* The digit itself: the input's text is transparent so a pasted code
          can fill its cells one after another. */}
      {digit ? (
        <motion.span
          key={digit}
          aria-hidden
          className="pointer-events-none"
          initial={motionSafe ? { opacity: 0, scale: 0.6 } : { opacity: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={
            motionSafe
              ? {
                  ...springs.flick,
                  delay,
                  opacity: { duration: durations.fast, delay },
                }
              : { duration: durations.fast }
          }
        >
          {digit}
        </motion.span>
      ) : (
        <span aria-hidden className="pointer-events-none text-ink-3 opacity-50">
          <span className="block size-1.5 rounded-full bg-current" />
        </span>
      )}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Reveal = { from: number; to: number; seq: number };

/**
 * Two steps on one card: a pairing code to scan and six cells for the code
 * the authenticator answers with. The code is a decorative grid seeded from
 * the secret — not a real QR, and labelled as a pairing code — drawn row by
 * row on a cascade. "Can't scan? Show the key" turns the card over on
 * `springs.snap` to the key in groups of four with a Copy that ticks on
 * `springs.flick`.
 *
 * The cells advance as digits land; a pasted code fills them one after
 * another on the same cascade; Backspace steps back. A timer ring drains over
 * the period and refills on `springs.snap` when the code rolls over — the
 * clock runs on `now` from mount and stops when the tab is hidden or the
 * surface is off screen. The sixth digit checks itself: a right code ticks
 * every cell green on `springs.flick` and lands a Paired card on
 * `springs.recoil` with the device name and the date; a wrong one shakes the
 * row a little, counts the attempt and clears; the last attempt locks the
 * cells and offers Start over. A "pretend your app shows" status card beside
 * the cells shows the code a seeded authenticator would, so the default
 * verifier can be satisfied by hand.
 *
 * The cells are a group of textboxes with one tab stop (arrows and Home/End
 * move, Escape clears), the flip is a button with `aria-pressed`, and every
 * change is announced. Under reduced motion the card cross-fades instead of
 * turning, digits appear in place, nothing shakes and the ring refills at
 * once.
 */
export function AuthenticatorPair({
  codeStyle = "grid",
  ringStyle = "ring",
  density = "cozy",
  secret = defaultAuthenticatorSecret,
  value,
  defaultValue = "",
  onChange,
  verify = defaultAuthenticatorVerify,
  onPaired,
  onReject,
  onStartOver,
  onCopy,
  period = 30,
  maxAttempts = 3,
  now = defaultAuthenticatorNow,
  deviceName = "Mara's phone",
  simulator = true,
  status = "ready",
  onRetry,
  title = "Pair an authenticator",
  label,
  height = 520,
  disabled = false,
  className,
}: AuthenticatorPairProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const cellsHintId = `${uid}-cells-hint`;
  const keyId = `${uid}-key`;

  const [own, setOwn] = React.useState(() =>
    onlyDigits(defaultValue).slice(0, DIGITS),
  );
  const code = (value !== undefined ? onlyDigits(value) : own).slice(0, DIGITS);
  const [phase, setPhase] = React.useState<AuthenticatorPhase>("idle");
  const [attempts, setAttempts] = React.useState(0);
  const [showKey, setShowKey] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [reveal, setReveal] = React.useState<Reveal | null>(null);
  const [activeCell, setActiveCell] = React.useState<number | null>(null);
  const [landed, setLanded] = React.useState<AuthenticatorPairing | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const [tick, setTick] = React.useState({ clock: now, refreshed: false });
  const [awake, setAwake] = React.useState(true);
  // False for the server render and hydration, so a code already on the page
  // never fades in; true for a code that arrives later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const ready = status === "ready";
  const empty = ready && secret.key.length === 0;
  const inert = disabled || !ready || empty;
  const paired = phase === "paired";
  const d = DENSITY[density];
  const safePeriod = Math.max(1, period);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const cellNodes = React.useRef<(HTMLInputElement | null)[]>([]);
  const [shakeScope, animateShake] = useAnimate<HTMLDivElement>();
  const wrongTimer = React.useRef<number | null>(null);
  const landTimer = React.useRef<number | null>(null);
  const copiedTimer = React.useRef<number | null>(null);
  const verifySeq = React.useRef(0);
  const mounted = React.useRef(true);
  const origin = React.useRef<{ now: number; wall: number } | null>(null);

  /* -------------------------------- clock ------------------------------ */

  const counter = authenticatorCounter(tick.clock, safePeriod);
  const elapsedInPeriod = (tick.clock / 1000) % safePeriod;
  const remaining = safePeriod - elapsedInPeriod;
  const fraction = clamp(remaining / safePeriod, 0, 1);
  const seconds = Math.max(1, Math.ceil(remaining));
  const expected = authenticatorCodeFor(secret.key, counter);
  const previous = authenticatorCodeFor(secret.key, counter - 1);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (wrongTimer.current !== null) window.clearTimeout(wrongTimer.current);
      if (landTimer.current !== null) window.clearTimeout(landTimer.current);
      if (copiedTimer.current !== null)
        window.clearTimeout(copiedTimer.current);
    };
  }, []);

  // The clock sleeps when the tab is hidden or the surface is off screen.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let inView = true;
    let visible = !document.hidden;
    const update = () => setAwake(inView && visible);
    const watcher =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            const entry = entries[entries.length - 1];
            inView = Boolean(entry?.isIntersecting);
            update();
          })
        : null;
    watcher?.observe(root);
    const onVisibility = () => {
      visible = !document.hidden;
      update();
    };
    document.addEventListener("visibilitychange", onVisibility);
    update();
    return () => {
      watcher?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const running = awake && ready && !empty && !paired;
  React.useEffect(() => {
    if (!running) return;
    if (origin.current?.now !== now) {
      origin.current = { now, wall: Date.now() };
      setTick({ clock: now, refreshed: false });
    }
    const read = () => {
      const o = origin.current;
      if (!o) return;
      const clock = o.now + (Date.now() - o.wall);
      setTick((prev) => ({
        clock,
        refreshed:
          authenticatorCounter(clock, safePeriod) !==
          authenticatorCounter(prev.clock, safePeriod),
      }));
    };
    read();
    const id = window.setInterval(read, TICK_MS);
    return () => window.clearInterval(id);
  }, [running, now, safePeriod]);

  /* -------------------------------- code ------------------------------- */

  const announce = (text: string) => setAnnouncement(text);

  const setCode = (next: string) => {
    const clean = onlyDigits(next).slice(0, DIGITS);
    if (value === undefined) setOwn(clean);
    if (clean !== code) onChange?.(clean);
  };

  const focusCell = (index: number) => {
    const node = cellNodes.current[clamp(index, 0, DIGITS - 1)];
    node?.focus({ preventScroll: true });
  };

  const cellsLocked = inert || phase === "checking" || phase === "locked";

  /** Fills from a cell with one or more digits; several arrive in a cascade. */
  const fillFrom = (index: number, digits: string) => {
    if (cellsLocked || digits.length === 0) return;
    if (phase === "wrong") {
      if (wrongTimer.current !== null) window.clearTimeout(wrongTimer.current);
      wrongTimer.current = null;
      setPhase("idle");
    }
    const next = (code.slice(0, index) + digits).slice(0, DIGITS);
    setCode(next);
    if (digits.length > 1) {
      setReveal((r) => ({
        from: index,
        to: Math.min(DIGITS, index + digits.length),
        seq: (r?.seq ?? 0) + 1,
      }));
    } else {
      setReveal(null);
    }
    focusCell(Math.min(next.length, DIGITS - 1));
    if (next.length < DIGITS) {
      announce(`${next.length} of ${DIGITS} digits.`);
    }
  };

  const onInput = (index: number, raw: string) => {
    let typed = onlyDigits(raw);
    const digit = code[index] ?? "";
    // The cell already held a digit and the caret sat after it.
    if (typed.length === 2 && digit && typed.startsWith(digit)) {
      typed = typed.slice(1);
    }
    if (typed.length === 0) {
      // A cleared cell: the digit was selected and deleted.
      if (digit) {
        setCode(code.slice(0, index) + code.slice(index + 1));
        setReveal(null);
      }
      return;
    }
    fillFrom(index, typed);
  };

  const onCellKey = (
    event: React.KeyboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    const key = event.key;
    if (key === "Backspace") {
      event.preventDefault();
      if (cellsLocked) return;
      const digit = code[index] ?? "";
      if (digit) {
        setCode(code.slice(0, index) + code.slice(index + 1));
        setReveal(null);
        focusCell(index);
      } else if (index > 0) {
        setCode(code.slice(0, index - 1) + code.slice(index));
        setReveal(null);
        focusCell(index - 1);
      }
      return;
    }
    if (key === "Delete") {
      event.preventDefault();
      if (cellsLocked) return;
      if (code[index]) {
        setCode(code.slice(0, index) + code.slice(index + 1));
        setReveal(null);
      }
      return;
    }
    if (key === "Escape") {
      event.preventDefault();
      if (cellsLocked || code.length === 0) return;
      setCode("");
      setReveal(null);
      focusCell(0);
      announce("Code cleared.");
      return;
    }
    let to = -1;
    if (key === "ArrowRight") to = index + 1;
    else if (key === "ArrowLeft") to = index - 1;
    else if (key === "Home") to = 0;
    else if (key === "End") to = DIGITS - 1;
    else return;
    event.preventDefault();
    focusCell(clamp(to, 0, DIGITS - 1));
  };

  const onCellPaste = (
    event: React.ClipboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    const digits = onlyDigits(event.clipboardData.getData("text"));
    if (digits.length === 0) return;
    event.preventDefault();
    // A whole code pasted anywhere starts from the first cell.
    fillFrom(digits.length >= DIGITS ? 0 : index, digits);
  };

  /* ------------------------------- verify ------------------------------ */

  const latest = React.useRef({
    verify,
    secret,
    expected,
    previous,
    counter,
    attempts,
    maxAttempts,
    deviceName,
    clock: tick.clock,
    motionSafe,
    onPaired,
    onReject,
    setCode,
    reveal,
  });
  React.useEffect(() => {
    latest.current = {
      verify,
      secret,
      expected,
      previous,
      counter,
      attempts,
      maxAttempts,
      deviceName,
      clock: tick.clock,
      motionSafe,
      onPaired,
      onReject,
      setCode,
      reveal,
    };
  });

  const full = code.length === DIGITS;
  React.useEffect(() => {
    if (!full || phase !== "idle" || inert) return;
    const l = latest.current;
    // A pasted code checks itself once its last digit has landed.
    const cascadeMs =
      l.reveal && l.motionSafe
        ? (l.reveal.to - l.reveal.from - 1) * cascade(DIGITS) * 1000 + 260
        : 120;
    const seq = (verifySeq.current += 1);
    const id = window.setTimeout(() => {
      if (!mounted.current || seq !== verifySeq.current) return;
      const attempt = l.attempts + 1;
      setPhase("checking");
      setAnnouncement("Six digits entered. Checking.");
      const context: AuthenticatorVerifyContext = {
        secret: l.secret,
        expected: l.expected,
        previous: l.previous,
        counter: l.counter,
        attempt,
      };
      Promise.resolve()
        .then(() => l.verify(code, context))
        .then(
          (ok) => ok,
          () => false,
        )
        .then((ok) => {
          if (!mounted.current || seq !== verifySeq.current) return;
          if (ok) {
            setPhase("paired");
            const pairing: AuthenticatorPairing = {
              device: l.deviceName,
              pairedAt: l.clock,
              secret: l.secret,
              attempts: attempt,
            };
            setAnnouncement(
              `Code accepted. Paired with ${l.deviceName} on ${formatStamp(l.clock)}.`,
            );
            landTimer.current = window.setTimeout(
              () => {
                landTimer.current = null;
                if (!mounted.current) return;
                setLanded(pairing);
                l.onPaired?.(pairing);
              },
              l.motionSafe ? LAND_MS : 0,
            );
            return;
          }
          setAttempts(attempt);
          l.onReject?.(attempt, code);
          if (attempt >= l.maxAttempts) {
            setPhase("locked");
            setAnnouncement(
              `Wrong code. No attempts left. Start over to try again.`,
            );
            return;
          }
          setPhase("wrong");
          setAnnouncement(
            `Wrong code. Attempt ${attempt} of ${l.maxAttempts}. The cells are cleared.`,
          );
          if (l.motionSafe && shakeScope.current) {
            animateShake(
              shakeScope.current,
              { x: [0, -6, 6, -4, 2, 0] },
              { duration: durations.slow, ease: easings.move },
            );
          }
          wrongTimer.current = window.setTimeout(
            () => {
              wrongTimer.current = null;
              if (!mounted.current) return;
              latest.current.setCode("");
              setReveal(null);
              setPhase("idle");
              focusCell(0);
            },
            l.motionSafe ? WRONG_MS : 0,
          );
        });
    }, cascadeMs);
    return () => {
      window.clearTimeout(id);
    };
    // The handler reads everything else from `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full, code, phase, inert]);

  const startOver = () => {
    if (inert) return;
    verifySeq.current += 1;
    setAttempts(0);
    setCode("");
    setReveal(null);
    setPhase("idle");
    setAnnouncement("Started over. Enter the code your app shows now.");
    onStartOver?.();
    window.setTimeout(() => focusCell(0), 0);
  };

  /* ------------------------------ flip, copy --------------------------- */

  const toggleKey = () => {
    if (inert) return;
    const next = !showKey;
    setShowKey(next);
    announce(next ? "Showing the key." : "Showing the pairing code.");
  };

  const copyKey = () => {
    if (inert) return;
    const text = secret.key;
    const done = () => {
      if (!mounted.current) return;
      setCopied(true);
      announce("Key copied.");
      if (copiedTimer.current !== null)
        window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => {
        copiedTimer.current = null;
        if (mounted.current) setCopied(false);
      }, COPIED_MS);
    };
    onCopy?.(text);
    const clipboard =
      typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (clipboard?.writeText) {
      clipboard.writeText(text).then(done, done);
    } else {
      done();
    }
  };

  /* ------------------------------- render ------------------------------ */

  const pattern = React.useMemo(() => patternFor(secret.key), [secret.key]);
  const keyGroups = secret.key.match(/.{1,4}/g) ?? [];
  const cellTone: CellTone =
    phase === "checking"
      ? "checking"
      : phase === "wrong" || phase === "locked"
        ? "wrong"
        : paired
          ? "paired"
          : "idle";
  const tabStop =
    activeCell !== null && activeCell < DIGITS
      ? activeCell
      : Math.min(code.length, DIGITS - 1);
  const stepCascade = cascade(DIGITS);
  const attemptsLeft = Math.max(0, maxAttempts - attempts);
  const hintText =
    phase === "checking"
      ? "Checking the code."
      : phase === "wrong"
        ? `That code didn't match. ${attemptsLeft} ${attemptsLeft === 1 ? "attempt" : "attempts"} left.`
        : phase === "locked"
          ? `${attempts} codes didn't match.`
          : attempts > 0
            ? `Attempt ${attempts + 1} of ${maxAttempts}. The sixth digit checks itself.`
            : "The sixth digit checks itself.";

  const flipTransition = motionSafe ? springs.snap : { duration: 0 };

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
      style={{ height }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <KeyRound aria-hidden className="size-4 shrink-0 text-ink-3" />
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
        </div>
        {ready && !empty ? (
          <p className="hidden min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[30rem]:block">
            {secret.issuer} · {secret.account}
          </p>
        ) : null}
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-hairline">
        {status === "loading" ? (
          <div
            aria-busy
            className={cn(
              "grid pt-4 @min-[40rem]:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]",
              d.body,
            )}
          >
            <p className="sr-only">Generating a secret</p>
            <div aria-hidden className="flex flex-col gap-3">
              <span className="h-3 w-24 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
              <span
                className="aspect-square w-full rounded-3 bg-surface-2 motion-safe:animate-pulse"
                style={{ maxWidth: d.code, animationDelay: "90ms" }}
              />
              <span className="h-3 w-32 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
            </div>
            <div aria-hidden className="flex flex-col gap-3">
              <span className="h-3 w-28 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
              <div
                className={cn("grid grid-cols-6", d.gap)}
                style={{ maxWidth: d.cellsMax }}
              >
                {Array.from({ length: DIGITS }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "rounded-2 bg-surface-2 motion-safe:animate-pulse",
                      d.cell,
                    )}
                    style={{ animationDelay: `${i * 70}ms` }}
                  />
                ))}
              </div>
              <span className="h-3 w-40 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
              <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                Generating a secret
              </p>
            </div>
          </div>
        ) : status === "error" ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The secret couldn&apos;t be generated.
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
        ) : empty ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <KeyRound aria-hidden className="size-5 text-ink-3" />
            <p className="text-sm text-ink-2">Nothing to pair yet.</p>
            <p className="max-w-[28ch] text-[12px] text-ink-3">
              This account has no secret issued. Ask the host to generate one.
            </p>
          </div>
        ) : (
          <div
            className={cn(
              "grid pt-4 @min-[40rem]:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]",
              d.body,
            )}
          >
            {/* ------------------------- step 1 ------------------------- */}
            <section
              aria-label="Step 1, scan"
              className={cn(
                "flex min-w-0 flex-col transition-opacity duration-300",
                d.section,
                paired && "opacity-60",
              )}
            >
              <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                Step 1 · Scan
              </p>
              <p className="text-[13px] text-ink-2">
                Open your authenticator and scan the pairing code.
              </p>
              <div
                className="relative w-full [perspective:900px]"
                style={{ maxWidth: d.code }}
              >
                <motion.div
                  className="relative aspect-square w-full [transform-style:preserve-3d]"
                  initial={false}
                  animate={
                    motionSafe ? { rotateY: showKey ? 180 : 0 } : { rotateY: 0 }
                  }
                  transition={flipTransition}
                >
                  <div
                    aria-hidden={showKey}
                    inert={showKey}
                    className={cn(
                      "absolute inset-0 flex flex-col rounded-3 border border-hairline bg-background p-2.5 transition-opacity duration-200 [backface-visibility:hidden]",
                      !motionSafe && showKey && "opacity-0",
                    )}
                  >
                    <CodeArt
                      key={secret.key}
                      pattern={pattern}
                      style={codeStyle}
                      motionSafe={motionSafe}
                      enter={live}
                    />
                    <span className="absolute right-2 bottom-1.5 font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase">
                      Pairing code
                    </span>
                  </div>
                  <div
                    aria-hidden={!showKey}
                    inert={!showKey}
                    className={cn(
                      "absolute inset-0 flex flex-col justify-between rounded-3 border border-hairline-strong bg-surface-1 p-3 transition-opacity duration-200 [backface-visibility:hidden]",
                      !motionSafe && !showKey && "opacity-0",
                    )}
                    style={{
                      transform: motionSafe ? "rotateY(180deg)" : undefined,
                    }}
                  >
                    <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                      Setup key
                    </p>
                    <p
                      id={keyId}
                      aria-label={`Setup key ${keyGroups.join(" ")}`}
                      className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[13px] tracking-[0.12em] text-foreground tabular-nums @min-[40rem]:grid-cols-2"
                    >
                      {keyGroups.map((g, i) => (
                        <span key={i}>{g}</span>
                      ))}
                    </p>
                    <div className="flex items-end justify-between gap-2">
                      <span className="min-w-0 truncate text-[11px] text-ink-3">
                        Time based · {safePeriod}s
                      </span>
                      <button
                        type="button"
                        onClick={copyKey}
                        aria-disabled={inert || undefined}
                        aria-describedby={keyId}
                        className={cn(
                          "inline-flex h-7 shrink-0 items-center gap-1 rounded-2 border border-hairline bg-card px-2 text-xs text-foreground transition-colors hover:bg-surface-2",
                          FOCUS_RING,
                        )}
                      >
                        {copied ? (
                          <svg
                            aria-hidden
                            viewBox="0 0 14 14"
                            className="size-3.5"
                          >
                            <motion.path
                              d="M3 7.4 5.8 10 11 4.2"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              initial={motionSafe ? { pathLength: 0 } : false}
                              animate={{ pathLength: 1 }}
                              transition={
                                motionSafe ? springs.flick : { duration: 0 }
                              }
                            />
                          </svg>
                        ) : (
                          <Copy aria-hidden className="size-3.5" />
                        )}
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
              <button
                type="button"
                onClick={toggleKey}
                aria-pressed={showKey}
                aria-disabled={inert || undefined}
                className={cn(
                  "inline-flex h-7 w-fit items-center gap-1.5 rounded-2 px-1.5 text-xs transition-colors",
                  inert
                    ? "cursor-default text-ink-3"
                    : "text-cobalt hover:bg-surface-2 hover:text-cobalt-bright",
                  FOCUS_RING,
                )}
              >
                <motion.span
                  aria-hidden
                  className="inline-flex"
                  initial={false}
                  animate={{ rotate: showKey ? 180 : 0 }}
                  transition={flipTransition}
                >
                  <KeyRound className="size-3.5" />
                </motion.span>
                {showKey ? "Back to the code" : "Can't scan? Show the key"}
              </button>
            </section>

            {/* ------------------------- step 2 ------------------------- */}
            <section
              aria-label="Step 2, confirm"
              className={cn("flex min-w-0 flex-col", d.section)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    Step 2 · Confirm
                  </p>
                  <p className="text-[13px] text-ink-2">
                    Enter the six-digit code it shows.
                  </p>
                </div>
                {ringStyle !== "bar" && !landed ? (
                  <Timer
                    style={ringStyle}
                    fraction={fraction}
                    seconds={seconds}
                    refreshed={tick.refreshed}
                    motionSafe={motionSafe}
                  />
                ) : null}
              </div>
              <AnimatePresence initial={false} mode="wait">
                {landed ? (
                  <motion.div
                    key="paired"
                    role="status"
                    initial={{
                      opacity: 0,
                      scale: motionSafe ? 0.9 : 1,
                      y: motionSafe ? distances.shift : 0,
                    }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.recoil,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: durations.base }
                    }
                    className="flex flex-col gap-3 rounded-3 border border-[color-mix(in_oklab,var(--success)_45%,transparent)] bg-[color-mix(in_oklab,var(--success)_9%,transparent)] p-4"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--success)_18%,transparent)] text-success">
                        <ShieldCheck aria-hidden className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          Paired
                        </p>
                        <p className="truncate text-[12px] text-ink-2">
                          {landed.device}
                        </p>
                      </div>
                    </div>
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12px]">
                      <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                        When
                      </dt>
                      <dd className="text-foreground tabular-nums">
                        {formatStamp(landed.pairedAt)}
                      </dd>
                      <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                        Account
                      </dt>
                      <dd className="truncate text-foreground">
                        {landed.secret.account}
                      </dd>
                      <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                        Codes
                      </dt>
                      <dd className="text-foreground tabular-nums">
                        {landed.attempts === 1
                          ? "first try"
                          : `${landed.attempts} tries`}
                      </dd>
                    </dl>
                    <p className="text-[11px] text-ink-3">
                      Codes from this app will be asked for at sign-in.
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="cells"
                    className={cn("flex flex-col", d.section)}
                    initial={false}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.base) }}
                  >
                    <div
                      ref={shakeScope}
                      role="group"
                      aria-label="Verification code, six digits"
                      aria-describedby={cellsHintId}
                      className={cn("grid grid-cols-6", d.gap)}
                      style={{ maxWidth: d.cellsMax }}
                    >
                      {Array.from({ length: DIGITS }, (_, i) => (
                        <Cell
                          key={i}
                          index={i}
                          digit={code[i] ?? ""}
                          tone={cellTone}
                          tabStop={tabStop === i}
                          delay={
                            reveal && i >= reveal.from && i < reveal.to
                              ? r3((i - reveal.from) * stepCascade)
                              : 0
                          }
                          cellClass={d.cell}
                          motionSafe={motionSafe}
                          disabled={cellsLocked}
                          inputRef={(node) => {
                            cellNodes.current[i] = node;
                          }}
                          onInput={onInput}
                          onKeyDown={(event) => onCellKey(event, i)}
                          onPaste={(event) => onCellPaste(event, i)}
                          onFocus={() => setActiveCell(i)}
                        />
                      ))}
                    </div>
                    {ringStyle === "bar" ? (
                      <Timer
                        style="bar"
                        fraction={fraction}
                        seconds={seconds}
                        refreshed={tick.refreshed}
                        motionSafe={motionSafe}
                        className="max-w-[316px]"
                      />
                    ) : null}
                    <p id={cellsHintId} className="sr-only">
                      Type a digit to move to the next cell. Backspace steps
                      back, arrows move, Escape clears. Paste fills every cell.
                    </p>

                    <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1.5">
                      <p
                        className={cn(
                          "flex items-center gap-1.5 text-[12px]",
                          phase === "wrong" || phase === "locked"
                            ? "text-danger"
                            : phase === "checking"
                              ? "text-cobalt"
                              : "text-ink-3",
                        )}
                      >
                        {phase === "checking" ? (
                          <LoaderCircle
                            aria-hidden
                            className="size-3.5 motion-safe:animate-spin"
                          />
                        ) : phase === "paired" ? (
                          <Check
                            aria-hidden
                            className="size-3.5 text-success"
                          />
                        ) : null}
                        {phase === "paired" ? "Code accepted." : hintText}
                      </p>
                      <AnimatePresence initial={false}>
                        {phase === "locked" ? (
                          <motion.button
                            key="start-over"
                            type="button"
                            onClick={startOver}
                            initial={{
                              opacity: 0,
                              y: motionSafe ? distances.nudge : 0,
                            }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{
                              opacity: 0,
                              transition: exitFor(durations.fast),
                            }}
                            transition={
                              motionSafe
                                ? {
                                    ...springs.snap,
                                    opacity: { duration: durations.fast },
                                  }
                                : { duration: durations.fast }
                            }
                            className={cn(
                              "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline bg-card px-2.5 text-xs text-foreground transition-colors hover:bg-surface-2",
                              FOCUS_RING,
                            )}
                          >
                            <RotateCcw aria-hidden className="size-3.5" />
                            Start over
                          </motion.button>
                        ) : null}
                      </AnimatePresence>
                    </div>

                    {simulator ? (
                      <div
                        role="status"
                        className="flex flex-col gap-2 rounded-3 border border-dashed border-hairline-strong bg-surface-1 px-3 py-2.5"
                      >
                        <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                          <Smartphone aria-hidden className="size-3.5" />
                          Pretend your app shows
                        </p>
                        <div className="flex items-center justify-between gap-3">
                          <span className="relative block h-7 min-w-[7ch] overflow-hidden">
                            <AnimatePresence initial={false}>
                              <motion.span
                                key={expected}
                                aria-label={`The app shows ${expected.split("").join(" ")}`}
                                className="absolute inset-0 flex items-center font-mono text-[18px] tracking-[0.18em] text-foreground tabular-nums"
                                initial={{
                                  opacity: 0,
                                  y: motionSafe ? distances.step : 0,
                                }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{
                                  opacity: 0,
                                  y: motionSafe ? -distances.step : 0,
                                  transition: exitFor(durations.fast),
                                }}
                                transition={
                                  motionSafe
                                    ? {
                                        ...springs.snap,
                                        opacity: { duration: durations.fast },
                                      }
                                    : { duration: durations.fast }
                                }
                              >
                                {spaced(expected)}
                              </motion.span>
                            </AnimatePresence>
                          </span>
                          <button
                            type="button"
                            onClick={() => fillFrom(0, expected)}
                            aria-disabled={cellsLocked || undefined}
                            className={cn(
                              "inline-flex h-7 shrink-0 items-center rounded-2 border border-hairline bg-card px-2.5 text-xs transition-colors",
                              cellsLocked
                                ? "cursor-default text-ink-3"
                                : "text-foreground hover:bg-surface-2",
                              FOCUS_RING,
                            )}
                          >
                            Use it
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          </div>
        )}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
