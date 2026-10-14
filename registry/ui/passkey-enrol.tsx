"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Fingerprint,
  KeyRound,
  Laptop,
  LogIn,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Trash2,
  TriangleAlert,
  X,
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

export type PasskeyDevice = "phone" | "laptop" | "key";
export type PasskeyRingStyle = "ring" | "ridges" | "ticks";
export type PasskeyDensity = "compact" | "cozy" | "roomy";
export type PasskeyStatus = "ready" | "loading" | "error";

/** One enrolled passkey. */
export type PasskeyRecord = {
  id: string;
  /** What the person calls it, e.g. "Work laptop". */
  name: string;
  /** Where it lives. */
  device: PasskeyDevice;
  /** When it was created, in ms. */
  createdAt: number;
  /** When it last signed in, in ms; null when it never has. */
  lastUsedAt: number | null;
};

export type PasskeyChange = {
  kind: "add" | "rename" | "remove" | "used";
  passkey: PasskeyRecord;
};

/** Handed to `enrol`: the device being enrolled, which attempt this is (1-based, across the surface's life) and a signal that fires on Cancel or unmount. */
export type PasskeyEnrolContext = {
  device: PasskeyDevice;
  attempt: number;
  signal: AbortSignal;
};

/** What `enrol` resolves with; anything left out is filled in from the device. */
export type PasskeyEnrolResult = {
  id?: string;
  name?: string;
  device?: PasskeyDevice;
};

export type PasskeyEnrol = (
  context: PasskeyEnrolContext,
) => Promise<PasskeyEnrolResult | void>;

/** Handed to `verify`: the passkey being tried, the attempt and a signal that fires on Cancel or unmount. */
export type PasskeyVerifyContext = {
  passkey: PasskeyRecord;
  attempt: number;
  signal: AbortSignal;
};

export type PasskeyVerify = (context: PasskeyVerifyContext) => Promise<void>;

export type PasskeyEnrolProps = {
  /** Controlled list of passkeys. */
  passkeys?: PasskeyRecord[];
  /** Initial list when uncontrolled. @default defaultPasskeys */
  defaultPasskeys?: PasskeyRecord[];
  /** Fires with the whole list after a passkey is created, renamed, removed or used to sign in. */
  onChange?: (passkeys: PasskeyRecord[], change: PasskeyChange) => void;
  /** Controlled selection: the passkey id Try it signs in with. */
  selected?: string | null;
  /** Initial selection when uncontrolled; null selects the first passkey. @default null */
  defaultSelected?: string | null;
  /** The selection moved, from a press or an arrow key. */
  onSelectedChange?: (id: string | null) => void;
  /** Runs the creation ceremony; resolves with the new passkey's details or rejects with the reason (its message is shown). @default defaultPasskeyEnrol, a simulator whose second attempt is cancelled by the browser */
  enrol?: PasskeyEnrol;
  /** Runs the sign-in check for a passkey; resolves when it signed in. @default defaultPasskeyVerify, a simulator */
  verify?: PasskeyVerify;
  /** A passkey was created and has landed in the list. */
  onEnrolled?: (passkey: PasskeyRecord) => void;
  /** A passkey signed in from Try it. */
  onVerified?: (passkey: PasskeyRecord) => void;
  /** "Use a code instead" was pressed. */
  onUseCode?: () => void;
  /** The device drawn on the stage, and the one new passkeys are recorded on. @default "phone" */
  device?: PasskeyDevice;
  /** How the sensor fills while the ceremony waits: one ring, three fingerprint ridges, or a dial of ticks. @default "ring" */
  ringStyle?: PasskeyRingStyle;
  /** Row heights, type size and padding. @default "cozy" */
  density?: PasskeyDensity;
  /** The moment ages count from and new passkeys are stamped with, in ms; never read from the clock. @default defaultPasskeyNow */
  now?: number;
  /** The product the passkey signs in to. @default "Gaugeworks" */
  product?: string;
  /** The account being enrolled, shown in the header. @default "mara.lind" */
  account?: string;
  /** Whether the passkeys have arrived. @default "ready" */
  status?: PasskeyStatus;
  /** "Try again" was pressed after the passkeys failed to load. */
  onRetry?: () => void;
  /** The heading. @default "Passkeys" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the list scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be created, tried, renamed or removed. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Monday 12 October 2026, 09:30 UTC. */
export const defaultPasskeyNow = Date.UTC(2026, 9, 12, 9, 30);

/** Two passkeys already on Mara's Gaugeworks account. */
export const defaultPasskeys: PasskeyRecord[] = [
  {
    id: "pk-7c21",
    name: "Work laptop",
    device: "laptop",
    createdAt: defaultPasskeyNow - 41 * DAY,
    lastUsedAt: defaultPasskeyNow - 2 * HOUR,
  },
  {
    id: "pk-3b90",
    name: "Blue key",
    device: "key",
    createdAt: defaultPasskeyNow - 3 * DAY,
    lastUsedAt: null,
  },
];

const abortError = () =>
  new DOMException("The ceremony was cancelled.", "AbortError");

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });

/**
 * The default ceremony: a second and a half of waiting, then a passkey named
 * after the device. The second attempt the surface makes is cancelled by the
 * browser, so Try again has something to recover from.
 */
export const defaultPasskeyEnrol: PasskeyEnrol = async ({
  device,
  attempt,
  signal,
}) => {
  await wait(attempt === 2 ? 1100 : 1500, signal);
  if (attempt === 2) throw new Error("The browser cancelled the request.");
  return { name: DEVICES[device].name };
};

/** The default sign-in check: just over a second, then success. */
export const defaultPasskeyVerify: PasskeyVerify = async ({ signal }) => {
  await wait(1100, signal);
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const LABEL = "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase";

type IconType = React.ComponentType<{
  className?: string;
  "aria-hidden"?: boolean;
}>;

const DEVICES: Record<
  PasskeyDevice,
  { word: string; name: string; prompt: string; Icon: IconType }
> = {
  phone: {
    word: "phone",
    name: "Phone",
    prompt: "Confirm on your phone",
    Icon: Smartphone,
  },
  laptop: {
    word: "laptop",
    name: "Laptop",
    prompt: "Use your fingerprint or PIN",
    Icon: Laptop,
  },
  key: {
    word: "security key",
    name: "Security key",
    prompt: "Touch your security key",
    Icon: KeyRound,
  },
};

const DENSITY: Record<
  PasskeyDensity,
  { row: string; text: string; meta: string; pad: string; gap: string }
> = {
  compact: {
    row: "py-1.5 px-2",
    text: "text-[12px]",
    meta: "text-[10px]",
    pad: "p-3",
    gap: "gap-2",
  },
  cozy: {
    row: "py-2.5 px-2.5",
    text: "text-[13px]",
    meta: "text-[11px]",
    pad: "p-4",
    gap: "gap-3",
  },
  roomy: {
    row: "py-3.5 px-3",
    text: "text-[14px]",
    meta: "text-[12px]",
    pad: "p-5",
    gap: "gap-4",
  },
};

/** The ring's fill while the ceremony waits for the device. */
const WAITING_FILL = 0.82;
/** From the tick drawing to the card landing. */
const LAND_MS = 720;
/** How long the stage keeps its result before the explainer returns. */
const SETTLE_MS = 1600;
/** An armed Remove disarms itself after this. */
const ARM_MS = 5000;

const noopSubscribe = () => () => {};
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** "just now", "4 min ago", "2 h ago", "3 days ago", "6 weeks ago". */
export const passkeyAge = (ms: number): string => {
  if (ms < MIN) return "just now";
  if (ms < HOUR) return `${Math.round(ms / MIN)} min ago`;
  if (ms < DAY) return `${Math.round(ms / HOUR)} h ago`;
  const days = Math.round(ms / DAY);
  if (days < 14) return `${days} ${days === 1 ? "day" : "days"} ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
};

const uniqueName = (base: string, list: PasskeyRecord[]) => {
  const taken = new Set(list.map((p) => p.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`.toLowerCase())) n += 1;
  return `${base} ${n}`;
};

type Mode = "enrol" | "verify";

type Ceremony =
  | { phase: "idle" }
  | { phase: "waiting"; mode: Mode; attempt: number; passkey?: PasskeyRecord }
  | { phase: "done"; mode: Mode; passkey: PasskeyRecord; landed: boolean }
  | { phase: "failed"; mode: Mode; attempt: number; message: string };

/* ----------------------------------------------------------------------- */
/*                                  Stage                                   */
/* ----------------------------------------------------------------------- */

const STAGE_W = 160;
const STAGE_H = 120;
const RING_R = 21;

/** Where each device's sensor sits, in stage units. */
const SENSOR: Record<PasskeyDevice, { x: number; y: number }> = {
  phone: { x: 80, y: 62 },
  laptop: { x: 80, y: 49 },
  key: { x: 94, y: 60 },
};

function DeviceArt({ device }: { device: PasskeyDevice }) {
  const body = "fill-(--bg-1) stroke-(--hairline-strong)";
  const screen = "fill-(--bg-0) stroke-(--hairline)";
  if (device === "phone") {
    return (
      <g strokeWidth={1.5}>
        <rect x={51} y={8} width={58} height={104} rx={11} className={body} />
        <rect
          x={56.5}
          y={16}
          width={47}
          height={88}
          rx={6}
          className={screen}
        />
        <rect
          x={72}
          y={11}
          width={16}
          height={2.5}
          rx={1.25}
          className="fill-(--hairline-strong)"
        />
        <rect
          x={71}
          y={106}
          width={18}
          height={2}
          rx={1}
          className="fill-(--hairline-strong)"
        />
      </g>
    );
  }
  if (device === "laptop") {
    return (
      <g strokeWidth={1.5}>
        <rect x={27} y={13} width={106} height={70} rx={6} className={body} />
        <rect
          x={32.5}
          y={18.5}
          width={95}
          height={59}
          rx={3}
          className={screen}
        />
        <rect x={13} y={85} width={134} height={9} rx={3.5} className={body} />
        <rect
          x={66}
          y={87.5}
          width={28}
          height={3}
          rx={1.5}
          className="fill-(--hairline-strong)"
        />
      </g>
    );
  }
  return (
    <g strokeWidth={1.5}>
      <rect x={22} y={50} width={30} height={20} rx={2.5} className={body} />
      <rect
        x={28}
        y={56}
        width={10}
        height={2}
        rx={1}
        className="fill-(--hairline-strong)"
      />
      <rect
        x={28}
        y={62}
        width={10}
        height={2}
        rx={1}
        className="fill-(--hairline-strong)"
      />
      <rect x={48} y={41} width={94} height={38} rx={9} className={body} />
      <circle cx={127} cy={60} r={4} className={screen} />
      <circle cx={94} cy={60} r={11.5} className={screen} />
    </g>
  );
}

function SensorRing({
  style,
  progress,
  failed,
  motionSafe,
  cx,
  cy,
}: {
  style: PasskeyRingStyle;
  progress: number;
  failed: boolean;
  motionSafe: boolean;
  cx: number;
  cy: number;
}) {
  const fill = motionSafe
    ? failed
      ? exitFor(durations.slow)
      : springs.glide
    : { duration: durations.fast };
  const rotate = `rotate(-90 ${cx} ${cy})`;
  if (style === "ticks") {
    const n = 24;
    const step = cascade(n);
    return (
      <g>
        {Array.from({ length: n }, (_, i) => {
          const a = (i / n) * Math.PI * 2 - Math.PI / 2;
          const lit = (i + 1) / n <= progress + 0.001;
          const x1 = cx + Math.cos(a) * (RING_R - 3);
          const y1 = cy + Math.sin(a) * (RING_R - 3);
          const x2 = cx + Math.cos(a) * (RING_R + 3);
          const y2 = cy + Math.sin(a) * (RING_R + 3);
          return (
            <motion.line
              key={i}
              x1={r3(x1)}
              y1={r3(y1)}
              x2={r3(x2)}
              y2={r3(y2)}
              strokeWidth={2}
              strokeLinecap="round"
              className="stroke-(--pe-ring) transition-[stroke] duration-200"
              initial={{ opacity: 0.18 }}
              animate={{ opacity: lit ? 1 : 0.18 }}
              transition={
                motionSafe
                  ? { ...springs.flick, delay: lit ? r3(i * step) : 0 }
                  : { duration: durations.fast }
              }
            />
          );
        })}
      </g>
    );
  }
  const radii =
    style === "ridges" ? [RING_R, RING_R - 5.5, RING_R - 11] : [RING_R];
  const step = cascade(radii.length);
  return (
    <g>
      {radii.map((r, i) => (
        <React.Fragment key={r}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            strokeWidth={style === "ridges" ? 2 : 3}
            className="stroke-(--hairline)"
          />
          <motion.circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            strokeWidth={style === "ridges" ? 2 : 3}
            strokeLinecap="round"
            transform={rotate}
            className="stroke-(--pe-ring) transition-[stroke] duration-200"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: progress }}
            transition={
              motionSafe && !failed ? { ...fill, delay: r3(i * step) } : fill
            }
          />
        </React.Fragment>
      ))}
    </g>
  );
}

function Stage({
  device,
  ringStyle,
  ceremony,
  motionSafe,
  product,
  locked,
  onCancel,
  onRetry,
  onUseCode,
}: {
  device: PasskeyDevice;
  ringStyle: PasskeyRingStyle;
  ceremony: Exclude<Ceremony, { phase: "idle" }>;
  motionSafe: boolean;
  product: string;
  locked: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onUseCode?: () => void;
}) {
  const drawn =
    ceremony.mode === "verify" && ceremony.phase !== "failed"
      ? (ceremony.passkey?.device ?? device)
      : device;
  const spot = SENSOR[drawn];
  const waiting = ceremony.phase === "waiting";
  const done = ceremony.phase === "done";
  const failed = ceremony.phase === "failed";
  const progress = done ? 1 : waiting ? WAITING_FILL : 0;
  const ring = failed
    ? "var(--danger)"
    : done
      ? "var(--success)"
      : "var(--accent-bright)";
  const headline = failed
    ? ceremony.message
    : done
      ? ceremony.mode === "enrol"
        ? "Passkey created"
        : `Signed in to ${product}`
      : DEVICES[drawn].prompt;
  const sub = failed
    ? "Nothing was saved."
    : done
      ? ceremony.mode === "enrol"
        ? `${ceremony.passkey.name} is on its way to the list.`
        : `With ${ceremony.passkey.name}.`
      : ceremony.mode === "enrol"
        ? `Creating a passkey for ${product}.`
        : `Checking ${ceremony.passkey?.name ?? "the passkey"}.`;

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-between p-3"
      style={{ ["--pe-ring" as string]: ring }}
    >
      <div
        className="relative shrink-0"
        style={{ width: STAGE_W, height: STAGE_H }}
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
          width={STAGE_W}
          height={STAGE_H}
          className="block"
        >
          <DeviceArt device={drawn} />
          <SensorRing
            style={ringStyle}
            progress={progress}
            failed={failed}
            motionSafe={motionSafe}
            cx={spot.x}
            cy={spot.y}
          />
          <AnimatePresence>
            {done ? (
              <motion.path
                key="tick"
                d={`M${spot.x - 7} ${spot.y + 0.5} l5 5 l9.5 -10.5`}
                fill="none"
                stroke="var(--success)"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={
                  motionSafe ? { pathLength: 0, opacity: 1 } : { opacity: 0 }
                }
                animate={{ pathLength: 1, opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? { ...springs.flick, delay: 0.18 }
                    : { duration: durations.fast }
                }
              />
            ) : failed ? (
              <motion.g
                key="cross"
                stroke="var(--danger)"
                strokeWidth={2.4}
                strokeLinecap="round"
                fill="none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast }}
              >
                <motion.path
                  d={`M${spot.x - 6} ${spot.y - 6} l12 12`}
                  initial={motionSafe ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={motionSafe ? springs.flick : { duration: 0 }}
                />
                <motion.path
                  d={`M${spot.x + 6} ${spot.y - 6} l-12 12`}
                  initial={motionSafe ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={
                    motionSafe
                      ? { ...springs.flick, delay: durations.blink }
                      : { duration: 0 }
                  }
                />
              </motion.g>
            ) : null}
          </AnimatePresence>
        </svg>
        <AnimatePresence>
          {waiting ? (
            <motion.span
              key="print"
              aria-hidden
              className="pointer-events-none absolute flex items-center justify-center text-cobalt-bright"
              style={{
                left: spot.x - 11,
                top: spot.y - 11,
                width: 22,
                height: 22,
              }}
              initial={{ opacity: 0, scale: motionSafe ? 0.8 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe ? springs.snap : { duration: durations.fast }
              }
            >
              <Fingerprint aria-hidden className="size-5" />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex min-w-0 flex-col items-center gap-1 text-center">
        <p
          className={cn(
            "line-clamp-2 max-w-full text-[13px] leading-[17px] font-medium",
            failed ? "text-danger" : done ? "text-success" : "text-foreground",
          )}
        >
          {headline}
        </p>
        <p className="max-w-full truncate text-[11px] text-ink-3">{sub}</p>
      </div>

      <div className="flex h-8 items-center gap-2">
        {waiting ? (
          <button
            type="button"
            onClick={onCancel}
            aria-disabled={locked || undefined}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-2 px-2 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <X aria-hidden className="size-3.5" />
            Cancel
          </button>
        ) : failed ? (
          <>
            <button
              type="button"
              onClick={onRetry}
              aria-disabled={locked || undefined}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-2 bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
            {onUseCode ? (
              <button
                type="button"
                onClick={onUseCode}
                className={cn(
                  "inline-flex h-7 items-center rounded-2 px-2 text-xs text-cobalt transition-colors hover:text-cobalt-bright",
                  FOCUS_RING,
                )}
              >
                Use a code instead
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Explainer                                 */
/* ----------------------------------------------------------------------- */

function Explainer({
  device,
  product,
  motionSafe,
}: {
  device: PasskeyDevice;
  product: string;
  motionSafe: boolean;
}) {
  const { Icon, word } = DEVICES[device];
  const bullets: { Icon: IconType; text: string }[] = [
    {
      Icon: Fingerprint,
      text: "Unlock it with your face, fingerprint or PIN; nothing to type or remember.",
    },
    {
      Icon: ShieldCheck,
      text: `It only answers to ${product}, so a lookalike site gets nothing.`,
    },
    {
      Icon,
      text: `It stays on this ${word}. Add another device any time.`,
    },
  ];
  const step = cascade(bullets.length);
  return (
    <div className="absolute inset-0 flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-0.5">
        <span className={LABEL}>What a passkey is</span>
        <p className="text-[14px] font-semibold text-foreground">
          Sign in without a password
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {bullets.map((b, i) => (
          <motion.li
            key={i}
            className="flex items-start gap-2.5 text-[12.5px] leading-[17px] text-ink-2"
            initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              y: motionSafe
                ? { ...springs.glide, delay: r3(i * step) }
                : { duration: 0 },
              opacity: {
                duration: durations.base,
                ease: easings.enter,
                delay: r3(i * step),
              },
            }}
          >
            <span className="mt-px flex size-4 shrink-0 items-center justify-center text-cobalt">
              <b.Icon aria-hidden className="size-3.5" />
            </span>
            <span>{b.text}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Row                                    */
/* ----------------------------------------------------------------------- */

type RowProps = {
  passkey: PasskeyRecord;
  d: (typeof DENSITY)[PasskeyDensity];
  now: number;
  selected: boolean;
  tabIndex: number;
  armed: boolean;
  editing: boolean;
  draft: string;
  pulse: number;
  landed: boolean;
  enter: boolean;
  locked: boolean;
  motionSafe: boolean;
  hintId: string;
  nodeRef: (node: HTMLLIElement | null) => void;
  inputRef: (node: HTMLInputElement | null) => void;
  onFocus: () => void;
  onSelect: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onStartRename: () => void;
  onDraft: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onArm: () => void;
  onDisarm: () => void;
  onRemove: () => void;
};

function PasskeyRow({
  passkey,
  d,
  now,
  selected,
  tabIndex,
  armed,
  editing,
  draft,
  pulse,
  landed,
  enter,
  locked,
  motionSafe,
  hintId,
  nodeRef,
  inputRef,
  onFocus,
  onSelect,
  onKeyDown,
  onStartRename,
  onDraft,
  onCommitRename,
  onCancelRename,
  onArm,
  onDisarm,
  onRemove,
}: RowProps) {
  const { Icon, word } = DEVICES[passkey.device];
  const created = passkeyAge(now - passkey.createdAt);
  const used =
    passkey.lastUsedAt === null
      ? "never used"
      : `last used ${passkeyAge(now - passkey.lastUsedAt)}`;
  const label = `${passkey.name}, ${word}, created ${created}, ${used}${
    armed ? ", press Delete again to remove" : ""
  }`;
  const action = cn(
    "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
    FOCUS_RING,
  );
  return (
    <motion.li
      ref={nodeRef}
      role="option"
      aria-selected={selected}
      aria-label={editing ? undefined : label}
      aria-describedby={hintId}
      tabIndex={editing ? -1 : tabIndex}
      onFocus={onFocus}
      onClick={() => {
        if (!editing) onSelect();
      }}
      onKeyDown={onKeyDown}
      layout={motionSafe ? "position" : false}
      initial={
        enter
          ? {
              opacity: 0,
              y: landed && motionSafe ? -distances.shift : 0,
              scale: landed && motionSafe ? 0.94 : 1,
            }
          : false
      }
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{
        opacity: 0,
        x: motionSafe ? distances.step : 0,
        transition: exitFor(durations.fast),
      }}
      transition={{
        layout: springs.glide,
        y: springs.recoil,
        scale: springs.recoil,
        opacity: { duration: durations.base, ease: easings.enter },
      }}
      className={cn(
        "relative flex cursor-default items-center gap-2.5 rounded-3 border transition-colors",
        d.row,
        armed
          ? "border-[color-mix(in_oklab,var(--danger)_45%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)]"
          : selected
            ? "border-[color-mix(in_oklab,var(--accent-bright)_35%,transparent)] bg-cobalt-wash"
            : "border-transparent hover:bg-surface-1",
        FOCUS_RING,
      )}
    >
      <AnimatePresence>
        {pulse > 0 ? (
          <motion.span
            key={pulse}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-3 bg-[color-mix(in_oklab,var(--success)_22%,transparent)]"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: durations.page, ease: easings.exit }}
          />
        ) : null}
      </AnimatePresence>
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-2 bg-surface-2",
          selected ? "text-cobalt-bright" : "text-ink-2",
        )}
      >
        <Icon aria-hidden className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            aria-label={`Rename ${passkey.name}`}
            onChange={(event) => onDraft(event.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                onCommitRename();
              } else if (event.key === "Escape") {
                event.preventDefault();
                onCancelRename();
              }
            }}
            className={cn(
              "h-6 w-full min-w-0 rounded-1 border border-hairline-strong bg-background px-1.5 font-medium text-foreground",
              d.text,
              FOCUS_RING,
            )}
          />
        ) : (
          <span className={cn("truncate font-medium text-foreground", d.text)}>
            {passkey.name}
          </span>
        )}
        <span className={cn("truncate text-ink-3", d.meta)}>
          {armed ? (
            <span className="text-danger">Remove this passkey?</span>
          ) : (
            <>
              {word.charAt(0).toUpperCase() + word.slice(1)} · created {created}{" "}
              · {used}
            </>
          )}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5">
        {armed ? (
          <>
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Remove ${passkey.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onRemove();
              }}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-2 bg-danger px-2 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90",
                FOCUS_RING,
              )}
            >
              <Trash2 aria-hidden className="size-3.5" />
              Remove
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                onDisarm();
              }}
              className={cn(
                "inline-flex h-7 items-center rounded-2 px-2 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              Keep
            </button>
          </>
        ) : editing ? null : (
          <>
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Rename ${passkey.name}`}
              aria-disabled={locked || undefined}
              onClick={(event) => {
                event.stopPropagation();
                onStartRename();
              }}
              className={action}
            >
              <Pencil aria-hidden className="size-3.5" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Remove ${passkey.name}`}
              aria-disabled={locked || undefined}
              onClick={(event) => {
                event.stopPropagation();
                onArm();
              }}
              className={action}
            >
              <Trash2 aria-hidden className="size-3.5" />
            </button>
          </>
        )}
      </span>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A passkey enrolment flow with nothing real behind it: `enrol` and `verify`
 * are promises the host supplies, and the defaults simulate a browser. The
 * stage opens on an explainer whose three points rise in a cascade on
 * `springs.glide`. Create passkey swaps it for a drawn device — a phone, a
 * laptop or a security key — whose sensor ring fills most of the way on
 * `springs.glide` while the promise is out. When it resolves the ring closes,
 * a tick draws on `springs.flick`, and the new passkey card lands at the top
 * of the list on `springs.recoil` while the rest glide down. Try it runs the
 * same ceremony as a sign-in check and stamps the passkey's last-used time
 * under a wash. A rejection drains the ring, draws a cross and offers Try
 * again and a code instead; the default simulator's second attempt is
 * cancelled by the browser for exactly that.
 *
 * The list is a single-select listbox with one tab stop: arrows move the
 * selection, F2 opens an inline rename, Delete arms a two-step remove that
 * a second Delete confirms and Escape or five seconds cancels, Enter signs
 * in with the row. Every step of the ceremony and every change to the list is
 * announced. Under reduced motion the ring and tick appear in place, the
 * stage cross-fades and the card simply appears.
 */
export function PasskeyEnrol({
  passkeys,
  defaultPasskeys: initialPasskeys = defaultPasskeys,
  onChange,
  selected,
  defaultSelected = null,
  onSelectedChange,
  enrol = defaultPasskeyEnrol,
  verify = defaultPasskeyVerify,
  onEnrolled,
  onVerified,
  onUseCode,
  device = "phone",
  ringStyle = "ring",
  density = "cozy",
  now = defaultPasskeyNow,
  product = "Gaugeworks",
  account = "mara.lind",
  status = "ready",
  onRetry,
  title = "Passkeys",
  label,
  height = 540,
  disabled = false,
  className,
}: PasskeyEnrolProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const listId = `${uid}-list`;
  const d = DENSITY[density] ?? DENSITY.cozy;

  const [own, setOwn] = React.useState<PasskeyRecord[]>(initialPasskeys);
  const list = passkeys ?? own;
  const [ownSel, setOwnSel] = React.useState<string | null>(defaultSelected);
  const rawSel = selected !== undefined ? selected : ownSel;
  const sel =
    rawSel !== null && list.some((p) => p.id === rawSel)
      ? rawSel
      : (list[0]?.id ?? null);
  const ready = status === "ready";
  const locked = disabled || !ready;

  const [ceremony, setCeremony] = React.useState<Ceremony>({ phase: "idle" });
  const busy = ceremony.phase === "waiting" || ceremony.phase === "done";
  const [editing, setEditing] = React.useState<{
    id: string;
    draft: string;
  } | null>(null);
  const [armed, setArmed] = React.useState<string | null>(null);
  const [landed, setLanded] = React.useState<string | null>(null);
  const [pulses, setPulses] = React.useState<Record<string, number>>({});
  const [focusReq, setFocusReq] = React.useState<{
    id: string | "create" | null;
    seq: number;
  } | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // False for the server render and hydration, so rows already on the page
  // never fade in; true for rows that mount later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rowNodes = React.useRef(new Map<string, HTMLLIElement>());
  const inputNode = React.useRef<HTMLInputElement | null>(null);
  const createNode = React.useRef<HTMLButtonElement | null>(null);
  const listRef = React.useRef(list);
  const timers = React.useRef(new Set<number>());
  const armTimer = React.useRef<number | null>(null);
  const controller = React.useRef<AbortController | null>(null);
  const attempts = React.useRef(0);
  // A rename closes exactly once: the box's blur on unmount must not commit
  // again after Enter or Escape already did.
  const renameOpen = React.useRef(false);

  React.useEffect(() => {
    listRef.current = list;
  });

  const schedule = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
    return id;
  };
  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current.clear();
  };

  React.useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id);
      timers.current.clear();
      if (armTimer.current !== null) window.clearTimeout(armTimer.current);
      controller.current?.abort();
    },
    [],
  );

  // Focus lands after the DOM has moved: on a row, the rename box or Create.
  React.useLayoutEffect(() => {
    if (!focusReq) return;
    if (focusReq.id === "create") {
      createNode.current?.focus({ preventScroll: true });
      return;
    }
    if (focusReq.id === null) {
      inputNode.current?.focus();
      inputNode.current?.select();
      return;
    }
    rowNodes.current.get(focusReq.id)?.focus({ preventScroll: true });
  }, [focusReq]);

  /* ------------------------------- changes ----------------------------- */

  const commit = (next: PasskeyRecord[], change: PasskeyChange) => {
    if (passkeys === undefined) setOwn(next);
    onChange?.(next, change);
  };

  const select = (id: string | null) => {
    if (selected === undefined) setOwnSel(id);
    if (id !== sel) onSelectedChange?.(id);
  };

  const focusRow = (id: string | "create" | null) =>
    setFocusReq((f) => ({ id, seq: (f?.seq ?? 0) + 1 }));

  const disarm = () => {
    if (armTimer.current !== null) window.clearTimeout(armTimer.current);
    armTimer.current = null;
    setArmed(null);
  };

  const arm = (pk: PasskeyRecord) => {
    if (locked) return;
    if (armTimer.current !== null) window.clearTimeout(armTimer.current);
    setArmed(pk.id);
    say(`Remove ${pk.name}? Press Delete again to confirm, Escape to keep it.`);
    armTimer.current = window.setTimeout(() => {
      armTimer.current = null;
      setArmed(null);
    }, ARM_MS);
  };

  const remove = (pk: PasskeyRecord) => {
    if (locked) return;
    disarm();
    const i = list.findIndex((p) => p.id === pk.id);
    const next = list.filter((p) => p.id !== pk.id);
    commit(next, { kind: "remove", passkey: pk });
    const neighbour = next[Math.min(i, next.length - 1)];
    if (sel === pk.id) select(neighbour?.id ?? null);
    say(
      `${pk.name} removed. ${next.length === 0 ? "No passkeys left." : `${next.length} ${next.length === 1 ? "passkey" : "passkeys"}.`}`,
    );
    focusRow(neighbour?.id ?? "create");
  };

  const startRename = (pk: PasskeyRecord) => {
    if (locked) return;
    disarm();
    renameOpen.current = true;
    setEditing({ id: pk.id, draft: pk.name });
    focusRow(null);
  };

  const commitRename = () => {
    if (!editing || !renameOpen.current) return;
    renameOpen.current = false;
    const pk = list.find((p) => p.id === editing.id);
    const name = editing.draft.trim();
    setEditing(null);
    if (!pk) return;
    if (name && name !== pk.name) {
      const renamed = { ...pk, name };
      commit(
        list.map((p) => (p.id === pk.id ? renamed : p)),
        { kind: "rename", passkey: renamed },
      );
      say(`Renamed to ${name}.`);
    } else {
      say(`Kept the name ${pk.name}.`);
    }
    focusRow(pk.id);
  };

  const cancelRename = () => {
    if (!editing || !renameOpen.current) return;
    renameOpen.current = false;
    const id = editing.id;
    setEditing(null);
    say("Rename cancelled.");
    focusRow(id);
  };

  /* ------------------------------ ceremony ----------------------------- */

  const begin = (mode: Mode, passkey?: PasskeyRecord) => {
    clearTimers();
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    attempts.current += 1;
    const attempt = attempts.current;
    setLanded(null);
    disarm();
    renameOpen.current = false;
    setEditing(null);
    setCeremony({ phase: "waiting", mode, attempt, passkey });
    return { ctrl, attempt };
  };

  const fail = (
    ctrl: AbortController,
    mode: Mode,
    attempt: number,
    err: unknown,
  ) => {
    if (ctrl.signal.aborted) return;
    const message =
      err instanceof Error && err.message
        ? err.message
        : "Something went wrong.";
    setCeremony({ phase: "failed", mode, attempt, message });
    say(
      `${message} ${mode === "enrol" ? "Try again or use a code instead." : "Try again."}`,
    );
  };

  const startEnrol = () => {
    if (locked || busy) return;
    const { ctrl, attempt } = begin("enrol");
    say(`Creating a passkey. ${DEVICES[device].prompt}.`);
    enrol({ device, attempt, signal: ctrl.signal })
      .then((result) => {
        if (ctrl.signal.aborted) return;
        const r: PasskeyEnrolResult = result ? result : {};
        const dev = r.device ?? device;
        const pk: PasskeyRecord = {
          id: r.id ?? `pk-${attempt}-${Math.floor(now / 1000).toString(36)}`,
          name: uniqueName(r.name ?? DEVICES[dev].name, listRef.current),
          device: dev,
          createdAt: now,
          lastUsedAt: null,
        };
        setCeremony({
          phase: "done",
          mode: "enrol",
          passkey: pk,
          landed: false,
        });
        say(`Passkey created on your ${DEVICES[dev].word}.`);
        schedule(
          () => {
            commit([pk, ...listRef.current], { kind: "add", passkey: pk });
            setLanded(pk.id);
            select(pk.id);
            setCeremony((c) =>
              c.phase === "done" ? { ...c, landed: true } : c,
            );
            say(`${pk.name} added to the list and selected.`);
            onEnrolled?.(pk);
            schedule(() => setCeremony({ phase: "idle" }), SETTLE_MS);
          },
          motionSafe ? LAND_MS : durations.base * 1000,
        );
      })
      .catch((err: unknown) => fail(ctrl, "enrol", attempt, err));
  };

  const startVerify = (pk: PasskeyRecord | undefined) => {
    if (locked || busy || !pk) return;
    const { ctrl, attempt } = begin("verify", pk);
    select(pk.id);
    say(`Signing in with ${pk.name}. ${DEVICES[pk.device].prompt}.`);
    verify({ passkey: pk, attempt, signal: ctrl.signal })
      .then(() => {
        if (ctrl.signal.aborted) return;
        setCeremony({
          phase: "done",
          mode: "verify",
          passkey: pk,
          landed: false,
        });
        schedule(
          () => {
            const used = { ...pk, lastUsedAt: now };
            commit(
              listRef.current.map((p) => (p.id === pk.id ? used : p)),
              { kind: "used", passkey: used },
            );
            setPulses((p) => ({ ...p, [pk.id]: (p[pk.id] ?? 0) + 1 }));
            setCeremony((c) =>
              c.phase === "done" ? { ...c, landed: true } : c,
            );
            say(`Signed in to ${product} with ${pk.name}.`);
            onVerified?.(used);
            schedule(() => setCeremony({ phase: "idle" }), SETTLE_MS);
          },
          motionSafe ? LAND_MS : durations.base * 1000,
        );
      })
      .catch((err: unknown) => fail(ctrl, "verify", attempt, err));
  };

  const cancel = () => {
    controller.current?.abort();
    controller.current = null;
    clearTimers();
    setCeremony({ phase: "idle" });
    say("Cancelled.");
  };

  const retry = () => {
    if (ceremony.phase !== "failed") return;
    if (ceremony.mode === "enrol") startEnrol();
    else startVerify(list.find((p) => p.id === sel));
  };

  /* ------------------------------ keyboard ----------------------------- */

  const onRowKey = (
    event: React.KeyboardEvent,
    pk: PasskeyRecord,
    i: number,
  ) => {
    if (editing) return;
    const key = event.key;
    let to: number | null = null;
    if (key === "ArrowDown") to = i + 1;
    else if (key === "ArrowUp") to = i - 1;
    else if (key === "Home") to = 0;
    else if (key === "End") to = list.length - 1;
    if (to !== null) {
      event.preventDefault();
      const target = list[clamp(to, 0, list.length - 1)];
      if (target && target.id !== pk.id) {
        disarm();
        select(target.id);
        rowNodes.current.get(target.id)?.focus({ preventScroll: true });
      }
      return;
    }
    if (key === "F2") {
      event.preventDefault();
      startRename(pk);
    } else if (key === "Delete" || key === "Backspace") {
      event.preventDefault();
      if (armed === pk.id) remove(pk);
      else arm(pk);
    } else if (key === "Escape") {
      if (armed === pk.id) {
        event.preventDefault();
        disarm();
        say(`Kept ${pk.name}.`);
      }
    } else if (key === "Enter") {
      event.preventDefault();
      if (armed === pk.id) remove(pk);
      else startVerify(pk);
    } else if (key === " ") {
      event.preventDefault();
      select(pk.id);
    }
  };

  /* ------------------------------- render ------------------------------ */

  const selectedPasskey = list.find((p) => p.id === sel);
  const stageOpen = ceremony.phase !== "idle";
  const count = list.length;

  const primary = cn(
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity",
    locked || busy ? "cursor-not-allowed opacity-50" : "hover:opacity-90",
    FOCUS_RING,
  );
  const secondary = cn(
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors",
    locked || busy || !selectedPasskey
      ? "cursor-not-allowed text-ink-3"
      : "hover:bg-surface-2",
    FOCUS_RING,
  );

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      aria-busy={busy || undefined}
      style={{ height }}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <p id={hintId} className="sr-only">
        Arrows move the selection. F2 renames, Delete removes after a second
        press, Enter signs in with it.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 pt-3 pb-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          {ready ? (
            <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
              {count}
            </span>
          ) : null}
        </div>
        <p className={cn("min-w-0 truncate", LABEL)}>
          {product}
          <span className="hidden @min-[24rem]:inline"> · {account}</span>
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain @min-[40rem]:grid @min-[40rem]:grid-cols-[19rem_minmax(0,1fr)] @min-[40rem]:overflow-hidden">
        {/* ------------------------------ stage ----------------------------- */}
        <div
          className={cn(
            "flex shrink-0 flex-col border-b border-hairline @min-[40rem]:min-h-0 @min-[40rem]:overflow-y-auto @min-[40rem]:border-r @min-[40rem]:border-b-0",
            d.pad,
            d.gap,
          )}
        >
          {status === "loading" ? (
            <div
              aria-hidden
              className="relative h-54 shrink-0 rounded-3 border border-hairline bg-surface-1 p-4"
            >
              <div className="flex flex-col gap-3">
                <span className="h-2.5 w-24 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
                <span className="h-4 w-44 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
                {Array.from({ length: 3 }, (_, i) => (
                  <span
                    key={i}
                    className="h-3 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                    style={{
                      width: `${72 - i * 9}%`,
                      animationDelay: `${i * 90}ms`,
                    }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="relative h-54 shrink-0 overflow-hidden rounded-3 border border-hairline bg-surface-1">
              <AnimatePresence initial={false}>
                {stageOpen ? (
                  <motion.div
                    key="stage"
                    className="absolute inset-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{
                      duration: durations.fast,
                      ease: easings.enter,
                    }}
                  >
                    <Stage
                      device={device}
                      ringStyle={ringStyle}
                      ceremony={ceremony}
                      motionSafe={motionSafe}
                      product={product}
                      locked={locked}
                      onCancel={cancel}
                      onRetry={retry}
                      onUseCode={onUseCode}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="explainer"
                    className="absolute inset-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{
                      duration: durations.fast,
                      ease: easings.enter,
                    }}
                  >
                    <Explainer
                      device={device}
                      product={product}
                      motionSafe={motionSafe}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              ref={createNode}
              type="button"
              onClick={startEnrol}
              aria-disabled={locked || busy || undefined}
              className={cn(primary, "flex-1")}
            >
              <Plus aria-hidden className="size-3.5" />
              Create passkey
            </button>
            <button
              type="button"
              onClick={() => startVerify(selectedPasskey)}
              aria-disabled={locked || busy || !selectedPasskey || undefined}
              aria-label={
                selectedPasskey
                  ? `Try it: sign in with ${selectedPasskey.name}`
                  : "Try it: no passkey to sign in with"
              }
              className={secondary}
            >
              <LogIn aria-hidden className="size-3.5" />
              Try it
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[11px] text-ink-3">
              {selectedPasskey
                ? `Try it signs in with ${selectedPasskey.name}.`
                : "Create a passkey, then try signing in."}
            </p>
            {onUseCode ? (
              <button
                type="button"
                onClick={onUseCode}
                className={cn(
                  "shrink-0 rounded-1 text-[11px] text-cobalt underline-offset-2 transition-colors hover:text-cobalt-bright hover:underline",
                  FOCUS_RING,
                )}
              >
                Use a code instead
              </button>
            ) : null}
          </div>
        </div>

        {/* ------------------------------ list ------------------------------ */}
        <div className="flex min-h-0 flex-1 flex-col @min-[40rem]:overflow-y-auto @min-[40rem]:overscroll-contain">
          <div
            className={cn("flex items-center justify-between px-4 pt-3 pb-1.5")}
          >
            <span className={LABEL}>Your passkeys</span>
            {ready && count > 0 ? (
              <span className="text-[11px] text-ink-3">newest first</span>
            ) : null}
          </div>

          {status === "error" ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <TriangleAlert aria-hidden className="size-5 text-danger" />
              <p className="text-sm text-foreground">
                Your passkeys didn&apos;t load.
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
            <div aria-hidden className="flex flex-col gap-1 px-2 pb-2">
              {Array.from({ length: 3 }, (_, i) => (
                <div
                  key={i}
                  className={cn("flex items-center gap-2.5", d.row)}
                  style={{ animationDelay: `${i * 110}ms` }}
                >
                  <span className="size-8 shrink-0 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
                  <span className="flex flex-1 flex-col gap-1.5">
                    <span
                      className="h-3 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                      style={{ width: `${44 - i * 8}%` }}
                    />
                    <span
                      className="h-2.5 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                      style={{ width: `${70 - i * 6}%` }}
                    />
                  </span>
                </div>
              ))}
            </div>
          ) : count === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-ink-3">
                <KeyRound aria-hidden className="size-5" />
              </span>
              <p className="text-sm text-foreground">No passkeys yet</p>
              <p className="max-w-56 text-[12px] text-ink-3">
                Create one and it lands here, named after the device it lives
                on.
              </p>
            </div>
          ) : (
            <ul
              id={listId}
              role="listbox"
              aria-label="Your passkeys"
              className="relative flex flex-col gap-1 px-2 pb-2"
            >
              <AnimatePresence initial={false} mode="popLayout">
                {list.map((pk, i) => (
                  <PasskeyRow
                    key={pk.id}
                    passkey={pk}
                    d={d}
                    now={now}
                    selected={pk.id === sel}
                    tabIndex={pk.id === sel ? 0 : -1}
                    armed={armed === pk.id}
                    editing={editing?.id === pk.id}
                    draft={editing?.id === pk.id ? editing.draft : pk.name}
                    pulse={pulses[pk.id] ?? 0}
                    landed={landed === pk.id}
                    enter={live}
                    locked={locked}
                    motionSafe={motionSafe}
                    hintId={hintId}
                    nodeRef={(node) => {
                      if (node) rowNodes.current.set(pk.id, node);
                      else rowNodes.current.delete(pk.id);
                    }}
                    inputRef={(node) => {
                      if (node) inputNode.current = node;
                    }}
                    onFocus={() => {
                      if (pk.id !== sel) select(pk.id);
                    }}
                    onSelect={() => select(pk.id)}
                    onKeyDown={(event) => onRowKey(event, pk, i)}
                    onStartRename={() => startRename(pk)}
                    onDraft={(draft) =>
                      setEditing((e) => (e ? { ...e, draft } : e))
                    }
                    onCommitRename={commitRename}
                    onCancelRename={cancelRename}
                    onArm={() => arm(pk)}
                    onDisarm={() => {
                      disarm();
                      say(`Kept ${pk.name}.`);
                    }}
                    onRemove={() => remove(pk)}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
