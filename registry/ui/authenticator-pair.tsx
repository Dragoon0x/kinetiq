"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";
import {
  Check,
  Copy,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type AuthenticatorModuleStyle = "square" | "dot" | "soft";
export type AuthenticatorDensity = "compact" | "cozy" | "roomy";
export type AuthenticatorAssemble = "inView" | "mount" | "none";
export type AuthenticatorStatus = "ready" | "loading" | "error";

export type AuthenticatorPairProps = {
  /** The shared secret, base32. Shown in groups of four for typing by hand. @default defaultAuthenticatorSecret */
  secret?: string;
  /** The account the app will list. @default "mara@fieldline.io" */
  account?: string;
  /** The service the app will list. @default "Fieldline" */
  issuer?: string;
  /** A real QR matrix from your encoder (true is dark). Omit it for a seeded stand-in drawn from the secret. */
  modules?: boolean[][];
  /** How many digits the app shows. @default 6 */
  digits?: number;
  /** Controlled code. */
  value?: string;
  /** Initial code when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires from every keystroke or paste in the code field, digits only. */
  onValueChange?: (code: string) => void;
  /** Checks a full code. Resolve true to turn two-step on; false keeps the digits and says so. Omitted, any full code is accepted. */
  onVerify?: (code: string) => boolean | Promise<boolean>;
  /** Cancel was pressed. */
  onCancel?: () => void;
  /** The setup key was copied. */
  onCopySecret?: (secret: string) => void;
  /** Done was pressed after two-step turned on. */
  onDone?: () => void;
  /** Check the code as soon as the last digit lands. @default true */
  autoSubmit?: boolean;
  /** When the QR assembles from its centre. @default "inView" */
  assemble?: AuthenticatorAssemble;
  /** Whether the setup key is ready. @default "ready" */
  status?: AuthenticatorStatus;
  /** "Try again" was pressed after the key failed to load. */
  onRetry?: () => void;
  /** The QR's modules: crisp squares, dots, or soft rounded squares. @default "square" */
  moduleStyle?: AuthenticatorModuleStyle;
  /** QR size, paddings and type. @default "cozy" */
  density?: AuthenticatorDensity;
  /** The step marker, the next slot, the finder eyes, the check and Verify, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Tallest the panel grows before its body scrolls, px. @default 560 */
  maxHeight?: number;
  /** Nothing can be typed, copied or pressed. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** An invented base32 key — no real account behind it. */
export const defaultAuthenticatorSecret = "K7QM2XRA4WDN6HTC";

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const FILL = "color-mix(in oklab, var(--ap-accent) 86%, black)";
const ON_FILL = `oklch(from ${FILL} clamp(0.18, (0.7 - l) * 100, 0.99) 0.02 h)`;

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * A code has to scan in both themes, so it is printed the way cameras
 * expect — dark modules on a light plate — rather than inverted in dark mode.
 * Deliberately fixed, not tokens.
 */
const QR_PAPER = "oklch(0.985 0.003 258)";
const QR_INK = "oklch(0.21 0.02 258)";
const QR_EYE = "color-mix(in oklab, var(--ap-accent) 70%, black)";

const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const groups = (secret: string) =>
  secret
    .replace(/\s+/g, "")
    .toUpperCase()
    .replace(/(.{4})/g, "$1 ")
    .trim();

/**
 * A 25 × 25 stand-in with the anatomy of a real code — three finder
 * patterns and their separators, timing rows, an alignment pattern, the
 * dark module and the format strips — and seeded data everywhere else, so
 * it reads as a QR without encoding anything.
 */
const standIn = (seed: string): boolean[][] => {
  const n = 25;
  const rnd = seeded(hash(seed));
  const grid: boolean[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => false),
  );
  const fixed: boolean[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => false),
  );
  const set = (r: number, c: number, on: boolean) => {
    const row = grid[r];
    const lock = fixed[r];
    if (!row || !lock || c < 0 || c >= n) return;
    row[c] = on;
    lock[c] = true;
  };
  const finder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
        const ring = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        set(rr, cc, inside && (ring || core));
      }
    }
  };
  finder(0, 0);
  finder(0, n - 7);
  finder(n - 7, 0);
  for (let i = 8; i < n - 8; i += 1) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (let r = -2; r <= 2; r += 1) {
    for (let c = -2; c <= 2; c += 1) {
      const edge = Math.max(Math.abs(r), Math.abs(c));
      set(18 + r, 18 + c, edge !== 1);
    }
  }
  set(n - 8, 8, true);
  for (let i = 0; i < n; i += 1) {
    const strip = i <= 8 || i >= n - 8;
    if (strip && !(fixed[8]?.[i] ?? true)) set(8, i, rnd() > 0.5);
    if (strip && !(fixed[i]?.[8] ?? true)) set(i, 8, rnd() > 0.5);
  }
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (!(fixed[r]?.[c] ?? true)) {
        const row = grid[r];
        if (row) row[c] = rnd() > 0.52;
      }
    }
  }
  return grid;
};

type Ring = { ring: number; d: string };
type Finder = { x: number; y: number; ring: number };
type Built = {
  size: number;
  quiet: number;
  rings: Ring[];
  finders: Finder[];
  maxRing: number;
};

/** One module as a path, in the chosen style. */
const moduleD = (x: number, y: number, style: AuthenticatorModuleStyle) => {
  if (style === "dot") {
    return `M${r2(x + 0.08)} ${r2(y + 0.5)}a0.42 0.42 0 1 0 0.84 0a0.42 0.42 0 1 0 -0.84 0`;
  }
  if (style === "soft") {
    return `M${r2(x + 0.34)} ${r2(y + 0.06)}h0.32a0.28 0.28 0 0 1 0.28 0.28v0.32a0.28 0.28 0 0 1 -0.28 0.28h-0.32a0.28 0.28 0 0 1 -0.28 -0.28v-0.32a0.28 0.28 0 0 1 0.28 -0.28z`;
  }
  return `M${x} ${y}h1v1h-1z`;
};

/**
 * Groups the dark modules into square rings by their distance from the
 * centre — one path per ring, so the assembly animates a dozen elements,
 * not six hundred. Finder patterns are drawn whole, in the ring of their
 * centre, so each lands as one piece.
 */
const build = (matrix: boolean[][], style: AuthenticatorModuleStyle): Built => {
  const n = matrix.length;
  const quiet = 2;
  const centre = (n - 1) / 2;
  const ringOf = (r: number, c: number) =>
    Math.round(Math.max(Math.abs(r - centre), Math.abs(c - centre)));
  const finders: Finder[] =
    n >= 21
      ? [
          { x: 0, y: 0 },
          { x: n - 7, y: 0 },
          { x: 0, y: n - 7 },
        ].map((f) => ({
          x: f.x + quiet,
          y: f.y + quiet,
          ring: ringOf(f.y + 3, f.x + 3),
        }))
      : [];
  const inFinder = (r: number, c: number) =>
    n >= 21 &&
    ((r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7));
  const parts = new Map<number, string[]>();
  for (let r = 0; r < n; r += 1) {
    const row = matrix[r] ?? [];
    for (let c = 0; c < n; c += 1) {
      if (!row[c] || inFinder(r, c)) continue;
      const k = ringOf(r, c);
      const list = parts.get(k) ?? [];
      list.push(moduleD(c + quiet, r + quiet, style));
      parts.set(k, list);
    }
  }
  const maxRing = Math.ceil(centre);
  const rings: Ring[] = [];
  for (let k = 0; k <= maxRing; k += 1) {
    rings.push({ ring: k, d: (parts.get(k) ?? []).join("") });
  }
  return { size: n + quiet * 2, quiet, rings, finders, maxRing };
};

const DENSITY: Record<
  AuthenticatorDensity,
  { qr: string; pad: string; gap: string; text: string; slot: string }
> = {
  compact: {
    qr: "size-[136px] @min-[40rem]:size-[168px]",
    pad: "px-4 py-4",
    gap: "gap-4",
    text: "text-[12.5px]",
    slot: "h-10 w-[26px] text-[20px]",
  },
  cozy: {
    qr: "size-[152px] @min-[40rem]:size-[192px]",
    pad: "px-5 py-5",
    gap: "gap-5",
    text: "text-[13px]",
    slot: "h-11 w-[28px] text-[22px]",
  },
  roomy: {
    qr: "size-[168px] @min-[40rem]:size-[216px]",
    pad: "px-6 py-6",
    gap: "gap-6",
    text: "text-[14px]",
    slot: "h-12 w-[31px] text-[24px]",
  },
};

const STOPS = ["Scan", "Verify", "On"] as const;

/* ----------------------------------------------------------------------- */
/*                                  The QR                                  */
/* ----------------------------------------------------------------------- */

function QrFace({
  built,
  moduleStyle,
  assembly,
  done,
  motionSafe,
  label,
}: {
  built: Built;
  moduleStyle: AuthenticatorModuleStyle;
  /** Bumped to re-run the assembly on fresh elements; 0 shows it at rest. */
  assembly: number;
  done: boolean;
  motionSafe: boolean;
  label: string;
}) {
  const { size, rings, finders, maxRing } = built;
  const step = 0.5 / Math.max(1, maxRing);
  const rx = moduleStyle === "dot" ? 3.5 : moduleStyle === "soft" ? 1.8 : 0;
  const eyeRx = moduleStyle === "dot" ? 1.5 : moduleStyle === "soft" ? 0.8 : 0;
  const c = size / 2;

  const ringMotion = (k: number) => {
    if (done) {
      return {
        initial: false as const,
        animate: { opacity: 0, scale: motionSafe ? 0.2 : 1 },
        transition: motionSafe
          ? {
              duration: durations.base,
              ease: easings.exit,
              delay: (maxRing - k) * step * 0.6,
            }
          : { duration: durations.fast },
      };
    }
    if (assembly === 0) {
      return {
        initial: false as const,
        animate: { opacity: 1, scale: 1 },
        transition: { duration: 0 },
      };
    }
    return {
      initial: { opacity: 0, scale: motionSafe ? 0.6 : 1 },
      animate: { opacity: 1, scale: 1 },
      transition: motionSafe
        ? {
            scale: { ...springs.snap, delay: k * step },
            opacity: {
              duration: durations.fast,
              ease: easings.enter,
              delay: k * step,
            },
          }
        : { duration: durations.slow },
    };
  };

  // Every ring group carries an invisible square the size of the code, so
  // its own box — and so its scale origin — is the code's centre.
  const frame = (
    <rect x={0} y={0} width={size} height={size} fill="none" stroke="none" />
  );

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      className="block size-full"
      shapeRendering={moduleStyle === "square" ? "crispEdges" : undefined}
    >
      <g key={assembly}>
        {rings.map(({ ring, d }) => (
          <motion.g
            key={ring}
            {...ringMotion(ring)}
            style={{ originX: 0.5, originY: 0.5 }}
          >
            {frame}
            {d ? <path d={d} fill={QR_INK} /> : null}
            {finders
              .filter((f) => f.ring === ring)
              .map((f) => (
                <g key={`${f.x}-${f.y}`}>
                  <rect
                    x={f.x + 0.5}
                    y={f.y + 0.5}
                    width={6}
                    height={6}
                    rx={rx}
                    fill="none"
                    strokeWidth={1}
                    stroke={QR_INK}
                    shapeRendering="geometricPrecision"
                  />
                  <rect
                    x={f.x + 2}
                    y={f.y + 2}
                    width={3}
                    height={3}
                    rx={eyeRx}
                    fill={QR_EYE}
                  />
                </g>
              ))}
          </motion.g>
        ))}
      </g>
      {done ? (
        <g>
          <motion.circle
            cx={c}
            cy={c}
            r={c * 0.62}
            fill="var(--ap-accent)"
            initial={{ scale: motionSafe ? 0 : 1, opacity: motionSafe ? 1 : 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={
              motionSafe
                ? { ...springs.snap, delay: maxRing * step * 0.6 }
                : { duration: durations.fast }
            }
            style={{ originX: 0.5, originY: 0.5 }}
          />
          <motion.path
            d={`M${r2(c - 3.6)} ${r2(c + 0.2)} l${2.6} ${2.6} l${5} -${5.6}`}
            fill="none"
            stroke={ON_FILL}
            strokeWidth={0.9}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: motionSafe ? 0 : 1 }}
            animate={{ pathLength: 1 }}
            transition={
              motionSafe
                ? { ...springs.flick, delay: maxRing * step * 0.6 + 0.16 }
                : { duration: 0 }
            }
          />
        </g>
      ) : null}
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

/**
 * An authenticator setup: a QR code with the secret written beside it for
 * typing by hand, then a six-digit check. When the panel comes into view
 * the QR assembles from its centre outward, ring by ring of modules — each
 * fading up from 0.6 scale on `springs.snap`, the finder eyes landing with
 * their ring — inside the 600ms budget.
 *
 * The code field is one real input drawn as two groups of three slots;
 * digits drop into place on `springs.flick` and a paste lands left to right.
 * When `onVerify` accepts the code the rings collapse back into the centre
 * from the outside in, a disc grows on snap, a check draws across it on
 * flick and the step marker slides on to "On". A wrong code nudges gently —
 * a short tween, never a spring — and keeps the digits, selected, so typing
 * replaces them. Under reduced motion the QR fades in whole and cross-fades
 * to the check.
 */
export function AuthenticatorPair({
  secret = defaultAuthenticatorSecret,
  account = "mara@fieldline.io",
  issuer = "Fieldline",
  modules,
  digits = 6,
  value,
  defaultValue = "",
  onValueChange,
  onVerify,
  onCancel,
  onCopySecret,
  onDone,
  autoSubmit = true,
  assemble = "inView",
  status = "ready",
  onRetry,
  moduleStyle = "square",
  density = "cozy",
  accent = "var(--accent-bright)",
  maxHeight = 560,
  disabled = false,
  className,
}: AuthenticatorPairProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const d = DENSITY[density] ?? DENSITY.cozy;
  const length = Math.min(10, Math.max(4, Math.round(digits)));

  const [own, setOwn] = React.useState(defaultValue.replace(/\D/g, ""));
  const code = (value ?? own).replace(/\D/g, "").slice(0, length);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [doneNode, setDoneNode] = React.useState<HTMLButtonElement | null>(
    null,
  );
  /** Focus was inside when the code was accepted: carry it to Done. */
  const refocus = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);
  const [focused, setFocused] = React.useState(false);
  const [selectedAll, setSelectedAll] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [assembly, setAssembly] = React.useState(0);
  const [burst, setBurst] = React.useState<{ from: number; count: number }>({
    from: 0,
    count: 0,
  });
  const [announcement, setAnnouncement] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const slotsRef = React.useRef<HTMLDivElement | null>(null);
  const markerRef = React.useRef<HTMLOListElement | null>(null);
  const stopRefs = React.useRef<(HTMLLIElement | null)[]>([]);
  const checked = React.useRef<string | null>(null);
  const run = React.useRef(0);
  const copyTimer = React.useRef<number | null>(null);
  const verifyRef = React.useRef(onVerify);
  React.useEffect(() => {
    verifyRef.current = onVerify;
  });

  const matrix = React.useMemo(
    () => modules ?? standIn(`${issuer}:${account}:${secret}`),
    [modules, issuer, account, secret],
  );
  const built = React.useMemo(
    () => build(matrix, moduleStyle),
    [matrix, moduleStyle],
  );

  React.useEffect(
    () => () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  // The assembly runs once the code is actually on screen.
  React.useEffect(() => {
    if (assemble === "none" || status !== "ready") return;
    const root = rootRef.current;
    if (!root) return;
    if (assemble === "mount") {
      const t = window.setTimeout(
        () => setAssembly((a) => (a === 0 ? 1 : a)),
        0,
      );
      return () => window.clearTimeout(t);
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setAssembly((a) => (a === 0 ? 1 : a));
        io.disconnect();
      }
    });
    io.observe(root);
    return () => io.disconnect();
  }, [assemble, status]);

  const step = done ? 2 : code.length > 0 || focused ? 1 : 0;

  // The marker's pill: placed under the current stop, sliding on snap.
  const pillX = useMotionValue(0);
  const pillW = useMotionValue(0);
  const pillO = useMotionValue(0);
  React.useEffect(() => {
    const list = markerRef.current;
    if (!list) return;
    let controls: { stop: () => void }[] = [];
    const place = () => {
      const el = stopRefs.current[step];
      if (!el) return;
      for (const c of controls) c.stop();
      const x = el.offsetLeft;
      const w = el.offsetWidth;
      // The first placement lands; every later one slides.
      if (!motionSafe || pillO.get() === 0) {
        pillX.jump(x);
        pillW.jump(w);
        pillO.jump(1);
        controls = [];
        return;
      }
      controls = [
        animate(pillX, x, springs.snap),
        animate(pillW, w, springs.snap),
      ];
    };
    const ro = new ResizeObserver(place);
    ro.observe(list);
    return () => {
      ro.disconnect();
      for (const c of controls) c.stop();
    };
  }, [step, motionSafe, pillO, pillW, pillX]);

  // The field that held focus leaves with the steps; focus lands on Done
  // once it exists, so it never falls to the page.
  React.useEffect(() => {
    if (!doneNode || !refocus.current) return;
    refocus.current = false;
    doneNode.focus({ preventScroll: true });
  }, [doneNode]);

  const setCode = (next: string) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const verify = React.useCallback(
    (full: string) => {
      if (disabled || done || full.length < length) return;
      const mine = ++run.current;
      checked.current = full;
      setBusy(true);
      setError(null);
      setAnnouncement("Checking the code.");
      let result: boolean | Promise<boolean>;
      try {
        const check = verifyRef.current;
        result = check ? check(full) : true;
      } catch {
        result = Promise.reject(new Error("check failed"));
      }
      Promise.resolve(result).then(
        (ok) => {
          if (mine !== run.current) return;
          setBusy(false);
          if (ok === false) {
            setError(
              "That code didn’t match. Codes change every 30 seconds — try the newest one.",
            );
            setAnnouncement(
              "That code didn’t match. Your digits are still there.",
            );
            const slots = slotsRef.current;
            if (slots && motionSafe) {
              animate(
                slots,
                { x: [0, -5, 5, -3, 3, 0] },
                { duration: 0.36, ease: easings.move },
              );
            }
            // Typing replaces the kept digits — but focus is never pulled
            // into the field from elsewhere on the page.
            window.requestAnimationFrame(() => {
              const input = inputRef.current;
              if (!input || document.activeElement !== input) return;
              input.select();
              setSelectedAll(true);
            });
            return;
          }
          refocus.current =
            rootRef.current?.contains(document.activeElement) ?? false;
          setDone(true);
          setAnnouncement("Two-step sign-in is on.");
        },
        () => {
          if (mine !== run.current) return;
          setBusy(false);
          setError("Couldn’t check the code. Try again.");
          setAnnouncement("Couldn’t check the code.");
        },
      );
    },
    [disabled, done, length, motionSafe],
  );

  // A full code checks itself — whether it was typed, pasted or set by the
  // host — once its last digit has landed. Each code is checked once.
  React.useEffect(() => {
    if (!autoSubmit || done || busy || code.length < length) return;
    if (checked.current === code) return;
    const t = window.setTimeout(() => verify(code), 140);
    return () => window.clearTimeout(t);
  }, [autoSubmit, busy, code, done, length, verify]);

  const copySecret = () => {
    if (disabled || status !== "ready") return;
    const clean = secret.replace(/\s+/g, "");
    try {
      void navigator.clipboard?.writeText(clean).catch(() => undefined);
    } catch {
      // No clipboard here; the key is still on screen to type.
    }
    setCopied(true);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    setAnnouncement("Setup key copied.");
    onCopySecret?.(clean);
  };

  const label = `QR code for ${issuer}, ${account}`;
  const slots = Array.from({ length }, (_, i) => code[i] ?? "");
  const half = Math.ceil(length / 2);
  const showNext = focused && !done && code.length < length && !selectedAll;

  const slot = (i: number) => {
    const digit = slots[i] ?? "";
    const next = showNext && i === code.length;
    const inBurst =
      burst.count > 1 && i >= burst.from && i < burst.from + burst.count;
    return (
      <span
        key={i}
        className={cn(
          "relative flex items-end justify-center pb-1.5 font-mono leading-none tabular-nums",
          d.slot,
        )}
      >
        {digit ? (
          <motion.span
            key={`${i}-${digit}`}
            initial={motionSafe ? { y: -6, opacity: 0 } : { opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={
              motionSafe
                ? {
                    ...springs.flick,
                    delay: inBurst ? (i - burst.from) * 0.035 : 0,
                    opacity: {
                      duration: durations.blink,
                      delay: inBurst ? (i - burst.from) * 0.035 : 0,
                    },
                  }
                : { duration: durations.fast }
            }
            className={cn(
              "relative z-0 rounded-1 px-0.5",
              selectedAll &&
                "bg-[color-mix(in_oklab,var(--ap-accent)_22%,transparent)]",
            )}
          >
            {digit}
          </motion.span>
        ) : null}
        <span
          className={cn(
            "absolute inset-x-0.5 bottom-0 h-[2px] rounded-full transition-colors duration-150",
            error
              ? "bg-danger"
              : next
                ? "bg-[var(--ap-accent)]"
                : digit
                  ? "bg-ink-2"
                  : "bg-hairline-strong",
          )}
        />
      </span>
    );
  };

  const stepsColumn = done ? (
    <motion.div
      initial={{ opacity: 0, y: motionSafe ? 8 : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        motionSafe
          ? {
              y: { ...springs.glide, delay: 0.35 },
              opacity: { duration: durations.base, delay: 0.35 },
            }
          : { duration: durations.fast }
      }
      className="flex flex-col justify-center gap-2"
    >
      <p className="text-[15px] leading-5 font-semibold">All set</p>
      <p className={cn("leading-5 text-ink-2", d.text)}>
        Next time you sign in to {issuer}, we’ll ask for a code from your
        authenticator app. Keep your backup codes somewhere safe too.
      </p>
    </motion.div>
  ) : (
    <ol role="list" className="flex flex-col gap-5">
      <li className="flex gap-3" aria-current={step === 0 ? "step" : undefined}>
        <span
          aria-hidden
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] transition-colors",
            step === 0
              ? "bg-[color-mix(in_oklab,var(--ap-accent)_16%,transparent)] text-[color:var(--ap-accent)]"
              : "bg-surface-2 text-ink-2",
          )}
        >
          1
        </span>
        <div className={cn("flex min-w-0 flex-1 flex-col gap-1.5", d.text)}>
          <span className="leading-5 font-medium">
            Scan this code with your authenticator app
          </span>
          <span className="text-[12px] leading-4 text-ink-2">
            Can’t scan? Type this key instead:
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <code
              id={`${uid}-key`}
              className="rounded-2 border border-hairline bg-surface-1 px-2.5 py-1.5 font-mono text-[12.5px] tracking-[0.06em] break-all text-foreground select-all"
            >
              {status === "ready" ? groups(secret) : "•••• •••• •••• ••••"}
            </code>
            <button
              type="button"
              onClick={copySecret}
              aria-disabled={disabled || status !== "ready" || undefined}
              aria-label={copied ? "Setup key copied" : "Copy setup key"}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-2.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                FOCUS,
              )}
            >
              {copied ? (
                <Check aria-hidden className="size-3.5 text-success" />
              ) : (
                <Copy aria-hidden className="size-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </span>
          <span className="font-mono text-[10.5px] leading-4 text-ink-3">
            Time-based · {length} digits · every 30 s
          </span>
        </div>
      </li>
      <li className="flex gap-3" aria-current={step === 1 ? "step" : undefined}>
        <span
          aria-hidden
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] transition-colors",
            step === 1
              ? "bg-[color-mix(in_oklab,var(--ap-accent)_16%,transparent)] text-[color:var(--ap-accent)]"
              : "bg-surface-2 text-ink-2",
          )}
        >
          2
        </span>
        <div className={cn("flex min-w-0 flex-1 flex-col gap-2", d.text)}>
          <label htmlFor={`${uid}-code`} className="leading-5 font-medium">
            Enter the {length === 6 ? "six" : length}-digit code it shows
          </label>
          <form
            noValidate
            className="flex flex-wrap items-end gap-x-4 gap-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (code.length < length) {
                setError(`Enter all ${length} digits.`);
                return;
              }
              verify(code);
            }}
          >
            <div className="relative">
              <input
                ref={inputRef}
                id={`${uid}-code`}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={length + 8}
                disabled={disabled || status !== "ready"}
                value={code}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${uid}-error` : `${uid}-hint`}
                onFocus={() => setFocused(true)}
                onBlur={() => {
                  setFocused(false);
                  setSelectedAll(false);
                }}
                onSelect={(event) => {
                  const el = event.currentTarget;
                  const all =
                    el.value.length > 0 &&
                    el.selectionStart === 0 &&
                    el.selectionEnd === el.value.length;
                  setSelectedAll(all);
                }}
                onChange={(event) => {
                  const raw = event.currentTarget.value;
                  const next = raw.replace(/\D/g, "").slice(0, length);
                  const common = (() => {
                    let k = 0;
                    while (
                      k < next.length &&
                      k < code.length &&
                      next[k] === code[k]
                    )
                      k += 1;
                    return k;
                  })();
                  setBurst({
                    from: common,
                    count: Math.max(0, next.length - common),
                  });
                  setSelectedAll(false);
                  setError(null);
                  if (next !== code) checked.current = null;
                  setCode(next);
                }}
                className="peer absolute inset-0 z-10 size-full cursor-text opacity-0 disabled:cursor-not-allowed"
              />
              <div
                ref={slotsRef}
                aria-hidden
                className={cn(
                  "flex items-end gap-1 rounded-2 px-1.5",
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-focus-visible:outline-solid",
                )}
              >
                {Array.from({ length: half }, (_, i) => slot(i))}
                <span className="mx-1 mb-3 size-1 rounded-full bg-hairline-strong" />
                {Array.from({ length: length - half }, (_, i) =>
                  slot(i + half),
                )}
              </div>
            </div>
            <button
              type="submit"
              aria-disabled={
                disabled || busy || code.length < length || undefined
              }
              aria-busy={busy || undefined}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-2 px-3.5 text-[13px] font-medium transition-[filter,opacity] hover:brightness-110",
                FOCUS,
                (disabled || code.length < length) && "opacity-70",
              )}
              style={{ backgroundColor: FILL, color: ON_FILL }}
            >
              {busy ? (
                <LoaderCircle
                  aria-hidden
                  className={cn("size-3.5", motionSafe && "animate-spin")}
                />
              ) : null}
              {busy ? "Checking…" : "Verify"}
            </button>
          </form>
          {error ? (
            <motion.p
              id={`${uid}-error`}
              role="alert"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              transition={
                motionSafe
                  ? {
                      height: springs.glide,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: 0 }
              }
              className="flex items-start gap-1.5 overflow-hidden text-[12px] leading-4 text-danger"
            >
              <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
              {error}
            </motion.p>
          ) : (
            <p
              id={`${uid}-hint`}
              className="text-[11.5px] leading-4 text-ink-3"
            >
              Paste works too. The code checks itself when it’s complete.
            </p>
          )}
        </div>
      </li>
    </ol>
  );

  return (
    <div
      ref={rootRef}
      className={cn("@container relative w-full text-foreground", className)}
      style={{ "--ap-accent": accent } as React.CSSProperties}
    >
      <div
        className="mx-auto flex w-full max-w-[52rem] flex-col overflow-hidden rounded-4 border border-hairline bg-card"
        style={{ maxHeight }}
      >
        <header
          className={cn(
            "flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-hairline",
            d.pad,
            "py-4",
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-3 bg-[color-mix(in_oklab,var(--ap-accent)_14%,transparent)] text-[color:var(--ap-accent)]"
            >
              <ShieldCheck className="size-4" />
            </span>
            <div className="flex min-w-0 flex-col">
              <h2 className="text-[15px] leading-5 font-semibold">
                {done ? "Two-step is on" : "Turn on two-step sign-in"}
              </h2>
              <p
                className="truncate text-[11.5px] leading-4 text-ink-3"
                title={account}
              >
                {issuer} · {account}
              </p>
            </div>
          </div>
          <ol
            ref={markerRef}
            aria-label="Setup progress"
            className="relative flex items-center"
          >
            <span
              aria-hidden
              className="absolute top-1/2 right-3 left-3 h-px -translate-y-1/2 bg-hairline-strong"
            />
            <motion.span
              aria-hidden
              className="absolute top-1/2 left-3 h-px origin-left -translate-y-1/2 bg-[var(--ap-accent)]"
              style={{ width: "calc(100% - 1.5rem)" }}
              initial={false}
              animate={{ scaleX: step / (STOPS.length - 1) }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            />
            <motion.span
              aria-hidden
              className="absolute top-0 left-0 z-[1] h-full rounded-full border border-[color-mix(in_oklab,var(--ap-accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--ap-accent)_12%,var(--card))]"
              style={{ x: pillX, width: pillW, opacity: pillO }}
            />
            {STOPS.map((stop, i) => (
              <li
                key={stop}
                ref={(node) => {
                  stopRefs.current[i] = node;
                }}
                aria-current={step === i ? "step" : undefined}
                className={cn(
                  "relative flex h-6 items-center rounded-full bg-card px-2.5 text-[11.5px] transition-colors",
                  i > 0 && "ml-2",
                  step === i
                    ? "font-medium text-[color:var(--ap-accent)]"
                    : i < step
                      ? "text-foreground"
                      : "text-ink-3",
                )}
              >
                <span className="relative z-[2] flex items-center gap-1">
                  {i < step ? (
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden
                      className="size-3 text-success"
                    >
                      <motion.path
                        d="M3.5 8.5l3 3 6-7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={{ pathLength: motionSafe ? 0 : 1 }}
                        animate={{ pathLength: 1 }}
                        transition={
                          motionSafe ? springs.flick : { duration: 0 }
                        }
                      />
                    </svg>
                  ) : null}
                  {stop}
                  <span className="sr-only">
                    {i < step ? ", done" : step === i ? ", current" : ""}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </header>

        <div
          className={cn(
            "flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain",
            d.pad,
          )}
        >
          {status === "error" ? (
            <div
              role="alert"
              className="flex flex-col items-start gap-3 rounded-3 border border-hairline bg-surface-1 p-4"
            >
              <span className="flex items-center gap-2 text-[13px] text-danger">
                <TriangleAlert aria-hidden className="size-4 shrink-0" />
                Couldn’t make a setup key.
              </span>
              <button
                type="button"
                onClick={() => onRetry?.()}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-input bg-card px-3 text-[12px] font-medium transition-colors hover:bg-surface-2",
                  FOCUS,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            </div>
          ) : (
            <div
              className={cn(
                "grid grid-cols-1 justify-items-center @min-[40rem]:grid-cols-[auto_minmax(0,1fr)] @min-[40rem]:items-start @min-[40rem]:justify-items-stretch",
                d.gap,
              )}
            >
              <div className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    "relative rounded-3 border border-hairline p-1.5",
                    d.qr,
                  )}
                  style={{ backgroundColor: QR_PAPER }}
                >
                  {status === "loading" ? (
                    <div
                      aria-label="Making your setup key"
                      role="img"
                      className="grid size-full grid-cols-5 gap-1 p-2"
                    >
                      {Array.from({ length: 25 }, (_, i) => (
                        <span
                          key={i}
                          className="rounded-[3px]"
                          style={{
                            backgroundColor: QR_INK,
                            opacity: r2(0.06 + (hash(String(i)) % 14) / 100),
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <QrFace
                      built={built}
                      moduleStyle={moduleStyle}
                      assembly={assembly}
                      done={done}
                      motionSafe={motionSafe}
                      label={label}
                    />
                  )}
                </div>
                <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  {issuer}
                </span>
              </div>
              <div className="w-full">{stepsColumn}</div>
            </div>
          )}
        </div>

        <footer
          className={cn(
            "flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-hairline",
            d.pad,
            "py-3",
          )}
        >
          {done ? (
            <span className="text-[12px] text-ink-3">
              Step 3 of 3 · all set
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onCancel?.()}
              className={cn(
                "inline-flex h-8 items-center rounded-2 px-2.5 text-[12.5px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                FOCUS,
              )}
            >
              Cancel
            </button>
          )}
          {done ? (
            <button
              type="button"
              ref={setDoneNode}
              onClick={() => onDone?.()}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 px-3.5 text-[12.5px] font-medium transition-[filter] hover:brightness-110",
                FOCUS,
              )}
              style={{ backgroundColor: FILL, color: ON_FILL }}
            >
              <Check aria-hidden className="size-3.5" />
              Done
            </button>
          ) : (
            <span className="font-mono text-[10.5px] text-ink-3">
              Step {step + 1} of 3
            </span>
          )}
        </footer>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
