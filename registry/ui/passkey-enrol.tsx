"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  KeyRound,
  KeySquare,
  Laptop,
  Monitor,
  Pencil,
  RotateCcw,
  Smartphone,
  Trash2,
  TriangleAlert,
} from "lucide-react";

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

export type PasskeyRingStyle = "rings" | "arcs" | "dots";
export type PasskeyDensity = "compact" | "cozy" | "roomy";
export type PasskeyAccentName = "cobalt" | "mint" | "amber" | "ink";
export type PasskeyStatus = "ready" | "loading" | "error";
export type PasskeyDeviceKind = "laptop" | "phone" | "key" | "desktop";
export type PasskeyFallback = "other-device" | "password";

export type PasskeyAccount = { name: string; email: string };

export type PasskeyDevice = {
  id: string;
  name: string;
  kind: PasskeyDeviceKind;
  /** When it was enrolled, in ms. */
  addedAt: number;
  /** When it last signed in, in ms. */
  lastUsedAt?: number;
};

/** What `onEnrol` rejects with when the platform prompt does not save a passkey. */
export type PasskeyEnrolError = {
  reason: "cancelled" | "unsupported" | "error";
  message?: string;
};

export type PasskeyEnrolProps = {
  /** Whose passkeys these are. @default defaultPasskeyAccount */
  account?: PasskeyAccount;
  /** Controlled list of enrolled devices. */
  devices?: PasskeyDevice[];
  /** Initial devices when uncontrolled. @default defaultPasskeyDevices */
  defaultDevices?: PasskeyDevice[];
  /** Fires with the whole list after an enrol, a rename or a remove. */
  onDevicesChange?: (devices: PasskeyDevice[]) => void;
  /** Opens the platform prompt. Resolve with the new device; reject with { reason } (or the platform's NotAllowedError) when nothing was saved. */
  onEnrol?: () => PasskeyDevice | Promise<PasskeyDevice>;
  /** A device was renamed. */
  onRename?: (device: PasskeyDevice, name: string) => void;
  /** A device was removed after its confirm. */
  onRemove?: (device: PasskeyDevice) => void;
  /** A fallback was chosen: another device, or keeping the password for now. */
  onFallback?: (kind: PasskeyFallback) => void;
  /** Whether this browser can create passkeys. False shows the unsupported message from the start. @default true */
  supported?: boolean;
  /** The moment "used today" counts from, in ms. @default defaultPasskeyNow */
  now?: number;
  /** How many rings draw round the key, 2 to 5. @default 3 */
  ringCount?: number;
  /** Milliseconds each ring takes to draw while the prompt is open. @default 1400 */
  drawDuration?: number;
  /** The heading. @default "Add a passkey" */
  title?: string;
  /** Whether the device list has arrived. @default "ready" */
  status?: PasskeyStatus;
  /** "Try again" was pressed after the list failed to load. */
  onRetry?: () => void;
  /** The rings: full circles, broken arcs that turn both ways, or rings of dots. @default "rings" */
  ringStyle?: PasskeyRingStyle;
  /** Padding, row height and type size. @default "cozy" */
  density?: PasskeyDensity;
  /** The rings, the solid mark and Create: a named pigment or any CSS colour. @default "cobalt" */
  accent?: PasskeyAccentName | (string & {});
  /** How a date is written. @default "3 Sep", in UTC */
  formatDate?: (ms: number) => string;
  /** The surface's height cap in px; the list scrolls inside it. @default 560 */
  maxHeight?: number;
  /** Nothing can be enrolled, renamed or removed. @default false */
  disabled?: boolean;
  /** Classes for the surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;
/** A fixed afternoon, so the defaults render the same on every machine. */
export const defaultPasskeyNow = Date.UTC(2026, 9, 14, 15, 10);

export const defaultPasskeyAccount: PasskeyAccount = {
  name: "Ana Ferreira",
  email: "ana@waylight.studio",
};

export const defaultPasskeyDevices: PasskeyDevice[] = [
  {
    id: "work-laptop",
    name: "Work laptop",
    kind: "laptop",
    addedAt: Date.UTC(2026, 8, 3),
    lastUsedAt: defaultPasskeyNow - 2 * 3_600_000,
  },
  {
    id: "hardware-key",
    name: "Hardware key",
    kind: "key",
    addedAt: Date.UTC(2026, 6, 21),
    lastUsedAt: defaultPasskeyNow - 9 * DAY,
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

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
const utcDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
};
const usedAgo = (now: number, at?: number) => {
  if (at === undefined) return "never used";
  const days = Math.floor(now / DAY) - Math.floor(at / DAY);
  if (days <= 0) return "used today";
  if (days === 1) return "used yesterday";
  return `used ${days} days ago`;
};
const r3 = (v: number) => Number(v.toFixed(3));

const KIND_ICON: Record<PasskeyDeviceKind, typeof Laptop> = {
  laptop: Laptop,
  phone: Smartphone,
  key: KeySquare,
  desktop: Monitor,
};

const ACCENTS: Record<PasskeyAccentName, Record<string, string>> = {
  cobalt: {
    "--pk-ink": "var(--accent-bright)",
    "--pk-fill": "var(--primary)",
    "--pk-on": "var(--primary-foreground)",
  },
  mint: {
    "--pk-ink": "var(--success)",
    "--pk-fill": "oklch(from var(--success) 0.72 c h)",
    "--pk-on": "oklch(from var(--success) 0.24 0.05 h)",
  },
  amber: {
    "--pk-ink": "var(--warn)",
    "--pk-fill": "oklch(from var(--warn) 0.8 0.13 h)",
    "--pk-on": "oklch(from var(--warn) 0.26 0.05 h)",
  },
  ink: {
    "--pk-ink": "var(--ink-2)",
    "--pk-fill": "var(--foreground)",
    "--pk-on": "var(--background)",
  },
};
/** Mint and amber fills are pigment: the hue at a fixed lightness, never the text token. */
const accentVars = (accent: string): React.CSSProperties =>
  ({
    ...(ACCENTS[accent as PasskeyAccentName] ?? {
      "--pk-ink": accent,
      "--pk-fill": accent,
      "--pk-on": "var(--primary-foreground)",
    }),
    "--pk-wash": "color-mix(in oklab, var(--pk-ink) 10%, transparent)",
  }) as React.CSSProperties;

const DENSITY: Record<
  PasskeyDensity,
  { pad: string; gap: string; row: string; text: string; meta: string }
> = {
  compact: {
    pad: "p-4",
    gap: "gap-3",
    row: "py-2",
    text: "text-[13px] leading-5",
    meta: "text-[11px] leading-4",
  },
  cozy: {
    pad: "p-5",
    gap: "gap-4",
    row: "py-2.5",
    text: "text-[13px] leading-5",
    meta: "text-[12px] leading-4",
  },
  roomy: {
    pad: "p-6",
    gap: "gap-5",
    row: "py-3",
    text: "text-[14px] leading-5",
    meta: "text-[12px] leading-[18px]",
  },
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const EYEBROW =
  "font-mono text-[10px] leading-4 tracking-[0.08em] text-ink-3 uppercase";
const SECONDARY =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 border border-input bg-surface-1 px-3 text-[12px] font-medium whitespace-nowrap text-foreground transition-colors hover:bg-surface-2";
const ICON_BUTTON =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground";

/* ----------------------------------------------------------------------- */
/*                                 The rings                                */
/* ----------------------------------------------------------------------- */

type Phase =
  "idle" | "prompting" | "success" | "cancelled" | "unsupported" | "error";

const BOX = 140;
const C = BOX / 2;
const DISC = 22;
const MARK = 27;

/** An arc on the ring, as a path from one angle to another (degrees, 0 at top). */
const arc = (r: number, from: number, to: number) => {
  const p = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${r3(C + r * Math.cos(a))} ${r3(C + r * Math.sin(a))}`;
  };
  return `M ${p(from)} A ${r} ${r} 0 0 1 ${p(to)}`;
};

function Ring({
  index,
  radius,
  phase,
  ringStyle,
  drawDuration,
  stagger,
  spin,
  motionSafe,
}: {
  index: number;
  radius: number;
  phase: Phase;
  ringStyle: PasskeyRingStyle;
  drawDuration: number;
  stagger: number;
  spin: MotionValue<number>;
  motionSafe: boolean;
}) {
  const prompting = phase === "prompting";
  const success = phase === "success";
  const unwound = phase === "cancelled" || phase === "error";
  const lit = prompting || success;
  const delay = (index * stagger) / 1000;
  const draw = drawDuration / 1000;
  // Rings turn in alternate directions; arcs and dots make the turn visible.
  const reverse = useTransform(spin, (v) => -v);
  // The draw: while the prompt is open each ring sweeps round from the top,
  // one after another, on a symmetric tween; a cancelled prompt winds them
  // back to nothing, quicker, on the exit ease.
  const stroke = {
    initial: false as const,
    animate: {
      pathLength: prompting && motionSafe ? [0, 1] : unwound ? 0 : 1,
      opacity: lit ? 1 : unwound ? 0.35 : 0.55,
    },
    transition: prompting
      ? {
          pathLength: motionSafe
            ? { duration: draw, delay, ease: easings.move }
            : { duration: 0 },
          opacity: { duration: durations.base, delay: motionSafe ? delay : 0 },
        }
      : {
          duration: motionSafe ? durations.slow : durations.fast,
          ease: easings.exit,
        },
  };
  const ink = cn(
    "fill-none transition-[stroke] duration-300",
    lit ? "stroke-[var(--pk-ink)]" : "stroke-hairline-strong",
  );
  const width = success ? 4 : 1.5;

  let body: React.ReactNode;
  if (ringStyle === "arcs") {
    body = [0, 120, 240].map((start) => (
      <motion.path
        key={start}
        d={arc(radius, start + 8, start + 112)}
        strokeWidth={width}
        strokeLinecap="round"
        className={ink}
        {...stroke}
      />
    ));
  } else if (ringStyle === "dots") {
    const count = Math.max(12, Math.round((2 * Math.PI * radius) / 9));
    const gap = r3((2 * Math.PI * radius) / count);
    body = (
      <motion.circle
        cx={C}
        cy={C}
        r={radius}
        strokeWidth={success ? 4 : 3}
        strokeLinecap="round"
        strokeDasharray={`0.01 ${gap}`}
        className={ink}
        initial={false}
        animate={{ opacity: lit ? 1 : unwound ? 0.2 : 0.45 }}
        transition={{
          duration: prompting ? draw * 0.6 : durations.base,
          delay: prompting && motionSafe ? delay : 0,
          ease: easings.enter,
        }}
      />
    );
  } else {
    // A circle's stroke starts at three o'clock; turned a quarter back, the
    // draw starts at the top.
    body = (
      <g transform={`rotate(-90 ${C} ${C})`}>
        <motion.circle
          cx={C}
          cy={C}
          r={radius}
          strokeWidth={width}
          className={ink}
          {...stroke}
        />
      </g>
    );
  }

  return (
    <motion.g
      initial={false}
      animate={{
        // Success closes the ring onto the solid mark: it contracts on glide,
        // outer rings a beat behind the inner, then fades into the mark.
        scale: success && motionSafe ? r3(MARK / radius) : 1,
        opacity: success ? 0 : 1,
      }}
      transition={
        success
          ? {
              scale: { ...springs.glide, delay: index * 0.05 },
              opacity: {
                duration: durations.fast,
                delay: motionSafe ? 0.22 + index * 0.05 : 0,
              },
            }
          : { duration: durations.base }
      }
      style={{ originX: 0.5, originY: 0.5 }}
    >
      <motion.g
        style={{
          rotate: index % 2 === 0 ? spin : reverse,
          originX: 0.5,
          originY: 0.5,
        }}
      >
        {/* An invisible full ring keeps the box square, so scaling and
            turning happen about the centre for every style. */}
        <circle cx={C} cy={C} r={radius + 2} fill="none" stroke="none" />
        {body}
      </motion.g>
    </motion.g>
  );
}

function Rings({
  phase,
  ringStyle,
  ringCount,
  drawDuration,
  motionSafe,
  inView,
}: {
  phase: Phase;
  ringStyle: PasskeyRingStyle;
  ringCount: number;
  drawDuration: number;
  motionSafe: boolean;
  inView: boolean;
}) {
  const n = Math.min(5, Math.max(2, Math.round(ringCount)));
  const radii = Array.from({ length: n }, (_, i) =>
    r3(34 + (i * 30) / Math.max(1, n - 1)),
  );
  const stagger = drawDuration * 0.4;
  const spin = useMotionValue(0);
  const success = phase === "success";
  const spinning = phase === "prompting" && motionSafe && inView;

  // While the prompt waits the rings turn very slowly — only while it is
  // open, on screen and the tab is shown; stopping leaves them where they are.
  React.useEffect(() => {
    if (!spinning) return;
    let controls = animate(spin, spin.get() + 360, {
      duration: 24,
      ease: "linear",
      repeat: Infinity,
    });
    const onVisible = () => {
      if (document.hidden) controls.stop();
      else
        controls = animate(spin, spin.get() + 360, {
          duration: 24,
          ease: "linear",
          repeat: Infinity,
        });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controls.stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [spin, spinning]);

  // Reduced motion: no draw and no turn — the open prompt is a gentle
  // breathing of the rings' opacity instead.
  const breathe = phase === "prompting" && !motionSafe && inView;

  return (
    <div aria-hidden className="relative size-28 shrink-0 @min-[36rem]:size-36">
      <motion.svg
        viewBox={`0 0 ${BOX} ${BOX}`}
        className="absolute inset-0 size-full overflow-visible"
        animate={{ opacity: breathe ? 0.55 : 1 }}
        transition={
          breathe
            ? {
                duration: 1.2,
                ease: easings.move,
                repeat: Infinity,
                repeatType: "mirror",
              }
            : { duration: durations.fast }
        }
      >
        {radii.map((r, i) => (
          <Ring
            key={`${ringStyle}-${r}`}
            index={i}
            radius={r}
            phase={phase}
            ringStyle={ringStyle}
            drawDuration={drawDuration}
            stagger={stagger}
            spin={spin}
            motionSafe={motionSafe}
          />
        ))}
        <circle
          cx={C}
          cy={C}
          r={DISC}
          className={cn(
            "transition-[fill] duration-300",
            phase === "prompting" ? "fill-[var(--pk-wash)]" : "fill-surface-2",
          )}
        />
        {/* The solid mark the rings close into. */}
        <motion.circle
          cx={C}
          cy={C}
          r={MARK}
          className="fill-[var(--pk-fill)]"
          initial={false}
          animate={{
            scale: success ? 1 : motionSafe ? 0.7 : 1,
            opacity: success ? 1 : 0,
          }}
          transition={
            success && motionSafe
              ? {
                  scale: { ...springs.snap, delay: 0.16 },
                  opacity: { duration: durations.fast, delay: 0.12 },
                }
              : { duration: durations.fast }
          }
          style={{ originX: 0.5, originY: 0.5 }}
        />
      </motion.svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <AnimatePresence initial={false}>
          {success ? (
            <motion.svg
              key="check"
              viewBox="0 0 24 24"
              className="absolute size-6 text-[var(--pk-on)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                duration: durations.fast,
                delay: motionSafe ? 0.2 : 0,
              }}
            >
              <motion.path
                d="M5 12.5l4.5 4.5L19 7.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: motionSafe ? 0 : 1 }}
                animate={{ pathLength: 1 }}
                transition={
                  motionSafe
                    ? { ...springs.flick, delay: 0.26 }
                    : { duration: 0 }
                }
              />
            </motion.svg>
          ) : (
            <motion.span
              key="key"
              className={cn(
                "absolute transition-colors duration-300",
                phase === "prompting" ? "text-[var(--pk-ink)]" : "text-ink-2",
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast }}
            >
              <KeyRound className="size-5 @min-[36rem]:size-6" />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

const reasonOf = (why: unknown): PasskeyEnrolError["reason"] => {
  if (why && typeof why === "object") {
    const r = (why as { reason?: unknown }).reason;
    if (r === "cancelled" || r === "unsupported" || r === "error") return r;
    const name = (why as { name?: unknown }).name;
    // What the platform throws when the visitor closes its prompt.
    if (name === "NotAllowedError" || name === "AbortError") return "cancelled";
    if (name === "NotSupportedError") return "unsupported";
  }
  return "error";
};

/**
 * A passkey setup step: a key inside a disc with rings round it, a short
 * explanation, Create, and the devices already enrolled with Rename and
 * Remove.
 *
 * The signature is rings that close. While the platform prompt is open
 * (`onEnrol` is running), the rings draw slowly round the key one after
 * another — each a stroke sweeping from the top on a symmetric tween — then
 * turn very slowly while the prompt waits, only in view and in a visible
 * tab. On success every ring contracts onto the key on `springs.glide`,
 * outer ones a beat behind, as its stroke thickens, and they close into one
 * solid mark that settles on `springs.snap` while a check draws inside it
 * on `springs.flick`; the new device slides into the top of the list from
 * 8px on glide with a New chip that lands on `springs.recoil`.
 *
 * Cancelled prompts and browsers without passkeys each get a plain sentence
 * and a fallback. Rename edits in place (Enter saves, Escape cancels and
 * returns focus); Remove asks in the row and the row's height closes on the
 * exit ease while focus moves to the next row. Under reduced motion the
 * rings sit fully drawn and breathe in opacity while the prompt is open, and
 * success cross-fades to the mark.
 */
export function PasskeyEnrol({
  account = defaultPasskeyAccount,
  devices: devicesProp,
  defaultDevices = defaultPasskeyDevices,
  onDevicesChange,
  onEnrol,
  onRename,
  onRemove,
  onFallback,
  supported = true,
  now = defaultPasskeyNow,
  ringCount = 3,
  drawDuration = 1400,
  title = "Add a passkey",
  status = "ready",
  onRetry,
  ringStyle = "rings",
  density = "cozy",
  accent = "cobalt",
  formatDate = utcDate,
  maxHeight = 560,
  disabled = false,
  className,
}: PasskeyEnrolProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const d = DENSITY[density] ?? DENSITY.cozy;
  const ready = status === "ready";

  const [ownDevices, setOwnDevices] =
    React.useState<PasskeyDevice[]>(defaultDevices);
  const devices = devicesProp ?? ownDevices;
  const [phase, setPhase] = React.useState<Phase>(
    supported ? "idle" : "unsupported",
  );
  const [newId, setNewId] = React.useState<string | null>(null);
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const attempt = React.useRef(0);

  // A host that learns the browser can't do passkeys (or can again) says so
  // through `supported`; the phase follows, decided in render as it flips.
  const [seenSupported, setSeenSupported] = React.useState(supported);
  if (seenSupported !== supported) {
    setSeenSupported(supported);
    setPhase(supported ? "idle" : "unsupported");
  }

  const rootRef = React.useRef<HTMLElement | null>(null);
  const inView = useInView(rootRef, { amount: 0.2 });

  const commit = (next: PasskeyDevice[]) => {
    if (devicesProp === undefined) setOwnDevices(next);
    onDevicesChange?.(next);
  };

  // Focus that must land on a node that arrives (or survives) after a change
  // is requested by id and bound in an effect once the DOM has it.
  const [focusTarget, setFocusTarget] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!focusTarget) return;
    const node = rootRef.current?.querySelector<HTMLElement>(
      `[data-pk-focus="${focusTarget}"]`,
    );
    if (node?.isConnected) {
      node.focus({ preventScroll: true });
      setFocusTarget(null);
    }
  }, [focusTarget, devices, renaming, confirming, phase]);

  const enrol = () => {
    if (disabled || phase === "prompting" || !ready) return;
    if (!supported) return;
    const run = ++attempt.current;
    setPhase("prompting");
    setMessage(null);
    setNewId(null);
    setAnnouncement("Your device is asking to save a passkey.");
    const land = (device: PasskeyDevice) => {
      if (attempt.current !== run) return;
      setPhase("success");
      setNewId(device.id);
      commit([device, ...devices.filter((x) => x.id !== device.id)]);
      setAnnouncement(`Passkey added for ${device.name}.`);
    };
    const fail = (why: unknown) => {
      if (attempt.current !== run) return;
      const reason = reasonOf(why);
      const own =
        why && typeof why === "object"
          ? (why as { message?: unknown }).message
          : undefined;
      setPhase(reason);
      setMessage(typeof own === "string" && own ? own : null);
      setAnnouncement(
        reason === "cancelled"
          ? "The prompt closed before a passkey was saved. Nothing changed."
          : reason === "unsupported"
            ? "This browser can't create passkeys."
            : "The passkey wasn't saved.",
      );
    };
    try {
      const result = onEnrol?.();
      if (!result) {
        fail({ reason: "error", message: "No passkey came back." });
      } else if (
        typeof (result as Promise<PasskeyDevice>).then === "function"
      ) {
        (result as Promise<PasskeyDevice>).then(land, fail);
      } else {
        land(result as PasskeyDevice);
      }
    } catch (why) {
      fail(why);
    }
  };

  const startRename = (device: PasskeyDevice) => {
    if (disabled) return;
    setConfirming(null);
    setRenaming(device.id);
    setDraft(device.name);
  };
  const finishRename = (
    device: PasskeyDevice,
    save: boolean,
    refocus = true,
  ) => {
    const name = draft.trim();
    setRenaming(null);
    // Enter and Escape hand focus back to Rename; a click elsewhere keeps it.
    if (refocus) setFocusTarget(`rename-${device.id}`);
    if (!save || !name || name === device.name) return;
    commit(devices.map((x) => (x.id === device.id ? { ...x, name } : x)));
    onRename?.(device, name);
    setAnnouncement(`Renamed to ${name}.`);
  };

  const remove = (device: PasskeyDevice) => {
    if (disabled) return;
    const at = devices.findIndex((x) => x.id === device.id);
    const rest = devices.filter((x) => x.id !== device.id);
    const next = rest[at] ?? rest[at - 1];
    setConfirming(null);
    commit(rest);
    onRemove?.(device);
    setFocusTarget(next ? `rename-${next.id}` : "create");
    setAnnouncement(
      `${device.name} removed. ${rest.length} ${rest.length === 1 ? "passkey" : "passkeys"} left.`,
    );
  };

  /* -------------------------------- render ------------------------------- */

  const count = devices.length;
  const busy = phase === "prompting";
  const heading =
    phase === "success"
      ? "Passkey added"
      : phase === "prompting"
        ? "Waiting for your device"
        : title;
  const lead =
    phase === "success"
      ? "This device can now sign you in with your fingerprint, face or screen lock."
      : phase === "prompting"
        ? "Follow your device's prompt to save the passkey."
        : "Sign in with your fingerprint, face or screen lock. Nothing to remember, nothing to phish.";

  const notice =
    phase === "cancelled" || phase === "unsupported" || phase === "error" ? (
      <motion.div
        key={phase}
        role={phase === "error" ? "alert" : undefined}
        initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          motionSafe
            ? { y: springs.glide, opacity: { duration: durations.base } }
            : { duration: durations.fast }
        }
        className="flex w-full flex-col gap-2.5 rounded-3 border border-hairline bg-surface-1 p-3 text-left"
      >
        <p className={cn("flex items-start gap-2 text-ink-2", d.meta)}>
          <TriangleAlert
            aria-hidden
            className={cn(
              "mt-px size-3.5 shrink-0",
              phase === "error" ? "text-danger" : "text-warn",
            )}
          />
          <span>
            {message ??
              (phase === "cancelled"
                ? "The prompt closed before a passkey was saved. Nothing changed."
                : phase === "unsupported"
                  ? "This browser can't create passkeys. Add one from your phone instead, or keep your password for now."
                  : "Something went wrong saving the passkey. Try again in a moment.")}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {phase === "unsupported" ? (
            <>
              <button
                type="button"
                onClick={() => onFallback?.("other-device")}
                className={cn(SECONDARY, FOCUS)}
              >
                <Smartphone aria-hidden className="size-3.5" />
                Use my phone
              </button>
              <button
                type="button"
                onClick={() => onFallback?.("password")}
                className={cn(
                  SECONDARY,
                  FOCUS,
                  "border-transparent bg-transparent text-ink-2",
                )}
              >
                Keep my password
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onFallback?.("other-device")}
              className={cn(SECONDARY, FOCUS)}
            >
              <Smartphone aria-hidden className="size-3.5" />
              Use another device
            </button>
          )}
        </div>
      </motion.div>
    ) : null;

  const hero = (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center gap-3 text-center",
        d.pad,
        "@min-[36rem]:border-r @min-[36rem]:border-hairline",
      )}
    >
      <Rings
        phase={phase}
        ringStyle={ringStyle}
        ringCount={ringCount}
        drawDuration={drawDuration}
        motionSafe={motionSafe}
        inView={inView}
      />
      <div className="flex flex-col gap-1">
        <h2 id={`${uid}-title`} className="text-base leading-6 font-semibold">
          {heading}
        </h2>
        <p className={cn("text-ink-2", d.meta)}>{lead}</p>
      </div>
      {phase !== "unsupported" ? (
        <button
          type="button"
          data-pk-focus="create"
          onClick={enrol}
          aria-disabled={disabled || busy || !ready || undefined}
          aria-busy={busy || undefined}
          className={cn(
            "inline-flex h-9 items-center justify-center gap-1.5 rounded-2 bg-[var(--pk-fill)] px-4 text-[13px] font-medium whitespace-nowrap text-[var(--pk-on)] transition-[background-color,opacity,translate] hover:bg-[color-mix(in_oklab,var(--pk-fill)_88%,var(--foreground))] active:translate-y-px",
            FOCUS,
            (disabled || !ready) && "opacity-60",
          )}
        >
          {busy
            ? "Waiting…"
            : phase === "success"
              ? "Add another passkey"
              : phase === "cancelled" || phase === "error"
                ? "Try again"
                : "Create a passkey"}
        </button>
      ) : null}
      <AnimatePresence initial={false}>{notice}</AnimatePresence>
    </div>
  );

  const list = (() => {
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-2 rounded-3 border border-hairline px-4 py-6 text-center">
          <TriangleAlert aria-hidden className="size-4 text-danger" />
          <p className={cn("text-foreground", d.text)}>
            Your passkeys didn&apos;t load.
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(SECONDARY, FOCUS)}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      );
    }
    if (status === "loading") {
      return (
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Loading your passkeys.</span>
          {[0, 1].map((i) => (
            <span
              key={i}
              aria-hidden
              className="h-12 rounded-3 bg-surface-2 motion-safe:animate-pulse"
            />
          ))}
        </div>
      );
    }
    if (count === 0) {
      return (
        <p
          className={cn(
            "rounded-3 border border-dashed border-hairline-strong px-4 py-5 text-center text-ink-3",
            d.meta,
          )}
        >
          No passkeys yet. The first one takes about ten seconds.
        </p>
      );
    }
    return (
      <ul
        role="list"
        aria-label="Your passkeys"
        className="flex flex-col divide-y divide-hairline rounded-3 border border-hairline bg-surface-1"
      >
        <AnimatePresence initial={false}>
          {devices.map((device) => {
            const Icon = KIND_ICON[device.kind] ?? KeyRound;
            const isNew = device.id === newId;
            const editing = renaming === device.id;
            const asking = confirming === device.id;
            return (
              <motion.li
                key={device.id}
                className="overflow-hidden"
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
                        opacity: { duration: durations.base },
                      }
                    : { duration: durations.fast }
                }
              >
                <motion.div
                  className={cn("flex items-center gap-3 px-3", d.row)}
                  initial={{ y: motionSafe && isNew ? -distances.step : 0 }}
                  animate={{ y: 0 }}
                  transition={motionSafe ? springs.glide : { duration: 0 }}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "hidden size-9 shrink-0 items-center justify-center rounded-2 transition-colors duration-300 @min-[26rem]:flex",
                      isNew
                        ? "bg-[var(--pk-wash)] text-[var(--pk-ink)]"
                        : "bg-surface-2 text-ink-2",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    {editing ? (
                      <input
                        autoFocus
                        value={draft}
                        aria-label={`Name for ${device.name}`}
                        maxLength={40}
                        onChange={(event) => {
                          const v = event.currentTarget.value;
                          setDraft(v);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            finishRename(device, true);
                          } else if (event.key === "Escape") {
                            event.preventDefault();
                            finishRename(device, false);
                          }
                        }}
                        onBlur={() => {
                          if (renaming === device.id)
                            finishRename(device, true, false);
                        }}
                        className={cn(
                          "h-8 w-full min-w-0 rounded-2 border border-input bg-surface-0 px-2 text-foreground",
                          d.text,
                          "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
                        )}
                      />
                    ) : (
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          title={device.name}
                          className={cn(
                            "truncate font-medium text-foreground",
                            d.text,
                          )}
                        >
                          {device.name}
                        </span>
                        {isNew ? (
                          <motion.span
                            className="inline-flex h-5 shrink-0 items-center rounded-full bg-[var(--pk-wash)] px-1.5 font-mono text-[10px] text-[var(--pk-ink)]"
                            initial={{
                              scale: motionSafe ? 0.6 : 1,
                              opacity: 0,
                            }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={
                              motionSafe
                                ? {
                                    scale: { ...springs.recoil, delay: 0.25 },
                                    opacity: {
                                      duration: durations.fast,
                                      delay: 0.25,
                                    },
                                  }
                                : { duration: durations.fast }
                            }
                          >
                            New
                          </motion.span>
                        ) : null}
                      </span>
                    )}
                    <span className={cn("text-ink-3", d.meta)}>
                      Added {formatDate(device.addedAt)} ·{" "}
                      {usedAgo(now, device.lastUsedAt)}
                    </span>
                  </div>
                  {!editing ? (
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        data-pk-focus={`rename-${device.id}`}
                        aria-label={`Rename ${device.name}`}
                        title="Rename"
                        aria-disabled={disabled || undefined}
                        onClick={() => startRename(device)}
                        className={cn(ICON_BUTTON, FOCUS)}
                      >
                        <Pencil aria-hidden className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${device.name}`}
                        aria-expanded={asking}
                        title="Remove"
                        aria-disabled={disabled || undefined}
                        onClick={() => {
                          if (disabled) return;
                          setRenaming(null);
                          setConfirming(asking ? null : device.id);
                        }}
                        className={cn(
                          ICON_BUTTON,
                          FOCUS,
                          asking && "bg-surface-2 text-danger",
                        )}
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    </div>
                  ) : null}
                </motion.div>
                <AnimatePresence initial={false}>
                  {asking ? (
                    <motion.div
                      key="confirm"
                      className="overflow-hidden"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{
                        height: 0,
                        opacity: 0,
                        transition: exitFor(durations.fast),
                      }}
                      transition={
                        motionSafe
                          ? {
                              height: springs.glide,
                              opacity: { duration: durations.fast },
                            }
                          : { duration: 0 }
                      }
                    >
                      <div className="flex flex-wrap items-center gap-2 px-3 pt-0.5 pb-3 @min-[26rem]:pl-15">
                        <p
                          className={cn(
                            "min-w-0 flex-1 basis-40 text-ink-2",
                            d.meta,
                          )}
                        >
                          Remove {device.name}? It won&apos;t be able to sign
                          you in.
                        </p>
                        <span className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => remove(device)}
                            className={cn(
                              SECONDARY,
                              FOCUS,
                              "border-[color-mix(in_oklab,var(--danger)_40%,transparent)] text-danger",
                            )}
                          >
                            Remove
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirming(null);
                              setFocusTarget(`rename-${device.id}`);
                            }}
                            className={cn(SECONDARY, FOCUS)}
                          >
                            Keep
                          </button>
                        </span>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    );
  })();

  return (
    <section
      ref={rootRef}
      aria-labelledby={`${uid}-title`}
      className={cn(
        "@container flex w-full max-w-3xl flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ ...accentVars(accent), maxHeight }}
    >
      <div className="[scrollbar-width:thin] overflow-y-auto overscroll-contain">
        <div className="grid grid-cols-1 @min-[36rem]:grid-cols-[17rem_minmax(0,1fr)]">
          {hero}
          <div
            className={cn(
              "flex min-w-0 flex-col border-t border-hairline @min-[36rem]:border-t-0",
              d.pad,
              d.gap,
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <h3 className={EYEBROW}>Your passkeys</h3>
              <span className={cn("min-w-0 truncate text-ink-3", d.meta)}>
                {account.email}
              </span>
            </div>
            {list}
            <p className={cn("flex items-start gap-2 text-ink-3", d.meta)}>
              <KeyRound aria-hidden className="mt-px size-3.5 shrink-0" />
              <span>
                {count >= 2
                  ? `${count} passkeys on ${account.name.split(" ")[0] ?? account.name}'s account. Your password can retire.`
                  : "Password: still on. Once you have two passkeys, it can retire."}
              </span>
            </p>
          </div>
        </div>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
