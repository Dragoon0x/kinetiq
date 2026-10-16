"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useTransform,
} from "motion/react";
import { ChevronRight, RotateCcw, TriangleAlert } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type RackLight = "power" | "net" | "health";
export type RackHostState = "ok" | "warn" | "alert" | "off";
export type RackLedStyle = "dot" | "pipe" | "ring";
export type RackTone = "graphite" | "steel" | "sand";
export type RackStatus = "ready" | "loading" | "error";

export type RackHost = {
  id: string;
  /** Host name, set in the mono face. */
  name: string;
  /** What it does, one short phrase. */
  role: string;
  /** Its lowest rack unit, counted from 1 at the bottom of the rack. */
  u: number;
  /** How many rack units it fills. @default 1 */
  size?: number;
  /** Overall health; drives the health light. */
  state: RackHostState;
  /** Management address, mono. */
  address: string;
  /** System temperature, °C. */
  temp: number;
  /** CPU load, 0 to 1. */
  load: number;
  /** Power draw, watts. */
  power: number;
  /** Hours since boot. */
  uptime: number;
  /** Taken out of rotation. */
  drained?: boolean;
  /** The one light an alert belongs to, and what it says. */
  alert?: { light: RackLight; message: string };
};

export type RackSpec = {
  id: string;
  /** Short label over the rack, e.g. "A1". */
  name: string;
  /** Height in rack units. @default 16 */
  units?: number;
  hosts: RackHost[];
};

export type RackElevationProps = {
  /** How many racks are drawn side by side (stacked when narrow), from the start of `racks`. @default 3 */
  rackCount?: number;
  /** How a status light is drawn: a round lamp, a slim light pipe, or a hollow ring. @default "dot" */
  ledStyle?: RackLedStyle;
  /** The rack's metal: graphite, steel or sand, mixed from theme tokens so both themes read. @default "graphite" */
  tone?: RackTone;
  /** The racks and their hosts. @default defaultRacks (four racks of Gaugeworks hosts) */
  racks?: RackSpec[];
  /** Controlled open host id, or null for none. */
  selected?: string | null;
  /** Initially open host when uncontrolled. @default null */
  defaultSelected?: string | null;
  /** Fires from the press, key or pull that opened or closed a drawer, with the host or null. */
  onSelect?: (host: RackHost | null) => void;
  /** Drain or Undrain was pressed, with the host and its new drained state. */
  onDrain?: (host: RackHost, drained: boolean) => void;
  /** A reboot was confirmed (the second press of Reboot). */
  onReboot?: (host: RackHost) => void;
  /** Whether the racks have arrived. Loading draws outline units; error offers Retry. @default "ready" */
  status?: RackStatus;
  /** Retry was pressed after the racks failed to load. */
  onRetry?: () => void;
  /** Height of one rack unit, px. @default 22 */
  unitHeight?: number;
  /** How far a drawer slides out on its rails, px. @default 14 */
  pull?: number;
  /** Temperature drawn as a warning at or above this, °C. @default 48 */
  tempLimit?: number;
  /** Let an alert's light blink (only while on screen and visible). @default true */
  blink?: boolean;
  /** The room or row, over the racks. @default "Basin Hall · row 3" */
  title?: string;
  /** Height of the surface, px; the racks scroll inside it. @default 540 */
  height?: number;
  /** Nothing opens, drains or reboots; the surface dims. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

type Seed = [
  name: string,
  role: string,
  u: number,
  size: number,
  state: RackHostState,
  temp: number,
  load: number,
  power: number,
  uptimeDays: number,
];

const rackOf = (
  id: string,
  name: string,
  subnet: number,
  seeds: Seed[],
  extra: Partial<Record<string, Partial<RackHost>>> = {},
): RackSpec => ({
  id,
  name,
  units: 16,
  hosts: seeds.map(
    ([host, role, u, size, state, temp, load, power, days], i) => ({
      id: host,
      name: host,
      role,
      u,
      size,
      state,
      address: `10.42.${subnet}.${11 + i * 3}`,
      temp,
      load,
      power,
      uptime: days * 24 + ((i * 7) % 24),
      ...extra[host],
    }),
  ),
});

/**
 * Four racks in Gaugeworks' Basin Hall, row 3. A1 and A2 carry the
 * databases and the API tier; A2 has one host with a failing fan (its health
 * light is the one that blinks) and one running warm; A3 is storage with a
 * drained node and one powered off; A4 is new and mostly empty.
 */
export const defaultRacks: RackSpec[] = [
  rackOf("a1", "A1", 31, [
    ["gw-sw-a1", "Top-of-rack switch", 16, 1, "ok", 39, 0.22, 148, 212],
    ["gw-db-01", "Postgres primary", 13, 2, "ok", 44, 0.64, 418, 96],
    ["gw-db-02", "Postgres replica", 11, 2, "ok", 42, 0.41, 386, 96],
    ["gw-api-01", "API worker", 9, 1, "ok", 41, 0.57, 214, 34],
    ["gw-api-02", "API worker", 8, 1, "ok", 40, 0.52, 206, 34],
    ["gw-api-03", "API worker", 7, 1, "ok", 43, 0.69, 231, 34],
    ["gw-cache-01", "Cache node", 5, 1, "ok", 37, 0.18, 152, 61],
    ["gw-store-01", "Object storage", 2, 2, "ok", 38, 0.27, 344, 140],
  ]),
  rackOf(
    "a2",
    "A2",
    32,
    [
      ["gw-sw-a2", "Top-of-rack switch", 16, 1, "ok", 40, 0.25, 151, 212],
      ["gw-db-03", "Postgres replica", 13, 2, "warn", 49, 0.81, 432, 12],
      ["gw-api-04", "API worker", 11, 1, "ok", 42, 0.6, 222, 34],
      ["gw-api-05", "API worker", 10, 1, "alert", 47, 0.74, 240, 34],
      ["gw-api-06", "API worker", 9, 1, "ok", 41, 0.55, 211, 34],
      ["gw-queue-01", "Queue broker", 6, 2, "ok", 39, 0.36, 290, 77],
      ["gw-cache-02", "Cache node", 4, 1, "ok", 36, 0.15, 149, 61],
      ["gw-mon-01", "Metrics and logs", 1, 2, "ok", 40, 0.47, 318, 150],
    ],
    {
      "gw-api-05": {
        alert: { light: "health", message: "Fan 2 below 1,800 rpm" },
      },
    },
  ),
  rackOf(
    "a3",
    "A3",
    33,
    [
      ["gw-sw-a3", "Top-of-rack switch", 16, 1, "ok", 39, 0.19, 146, 212],
      ["gw-store-02", "Object storage", 13, 2, "ok", 38, 0.31, 352, 140],
      ["gw-store-03", "Object storage", 11, 2, "ok", 37, 0.08, 301, 140],
      ["gw-store-04", "Object storage", 9, 2, "ok", 39, 0.34, 357, 140],
      ["gw-store-05", "Object storage", 7, 2, "off", 24, 0, 0, 0],
      ["gw-backup-01", "Backup target", 3, 2, "ok", 36, 0.12, 280, 88],
      ["gw-oob-a3", "Out-of-band console", 1, 1, "ok", 33, 0.05, 41, 300],
    ],
    { "gw-store-03": { drained: true } },
  ),
  rackOf("a4", "A4", 34, [
    ["gw-sw-a4", "Top-of-rack switch", 16, 1, "ok", 38, 0.06, 139, 9],
    ["gw-gpu-01", "Batch compute", 11, 3, "ok", 46, 0.88, 912, 9],
    ["gw-edge-01", "Edge proxy", 6, 1, "ok", 37, 0.21, 168, 9],
  ]),
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;
const sizeOf = (h: RackHost) => Math.max(1, Math.round(h.size ?? 1));
const unitsOf = (r: RackSpec) => Math.max(1, Math.round(r.units ?? 16));
const uptimeText = (hours: number) =>
  hours <= 0
    ? "powered off"
    : hours < 48
      ? `up ${Math.round(hours)} h`
      : `up ${Math.floor(hours / 24)} d`;

/** Lamps are pigment: each token's hue and chroma at a fixed lightness. */
const LAMP = {
  green: "oklch(from var(--success) 0.76 0.17 h)",
  amber: "oklch(from var(--warn) 0.8 0.16 h)",
  red: "oklch(from var(--danger) 0.66 0.22 h)",
  blue: "oklch(from var(--accent-bright) 0.72 0.15 h)",
  off: "var(--hairline-strong)",
} as const;

const METAL: Record<RackTone, string> = {
  graphite: "var(--ink)",
  steel: "oklch(from var(--accent-bright) 0.62 0.08 h)",
  sand: "oklch(from var(--warn) 0.66 0.07 h)",
};

const toneVars = (tone: RackTone): React.CSSProperties => {
  const metal = METAL[tone] ?? METAL.graphite;
  return {
    ["--re-frame" as string]: `color-mix(in oklab, ${metal} 15%, var(--card))`,
    ["--re-face" as string]: `color-mix(in oklab, ${metal} 6%, var(--card))`,
    ["--re-slot" as string]: `color-mix(in oklab, ${metal} 30%, var(--card))`,
    ["--re-rail" as string]: `color-mix(in oklab, ${metal} 42%, var(--card))`,
  };
};

type HostView = RackHost & { drainedNow: boolean; rack: string };

function lightColour(host: HostView, light: RackLight): string {
  if (host.state === "off") return LAMP.off;
  if (host.alert?.light === light) return LAMP.red;
  if (light === "power") return LAMP.green;
  if (light === "net") return host.drainedNow ? LAMP.off : LAMP.blue;
  if (host.drainedNow) return LAMP.amber;
  if (host.state === "alert") return LAMP.red;
  if (host.state === "warn") return LAMP.amber;
  return LAMP.green;
}

function stateWords(host: HostView, tempLimit: number): string {
  if (host.state === "off") return "powered off";
  const parts = [
    host.state === "alert"
      ? "alerting"
      : host.state === "warn"
        ? "needs attention"
        : "healthy",
  ];
  if (host.drainedNow) parts.push("drained");
  parts.push(
    `${Math.round(host.temp)} degrees${host.temp >= tempLimit ? ", hot" : ""}`,
  );
  parts.push(`load ${Math.round(host.load * 100)} percent`);
  if (host.alert) {
    parts.push(`alert: ${host.alert.message.trim().replace(/[.!?]+$/, "")}`);
  }
  return parts.join(", ");
}

/** Whether the page is visible, from an external store so no effect re-renders twice. */
const subscribeVisibility = (cb: () => void) => {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
};
const usePageVisible = () =>
  React.useSyncExternalStore(
    subscribeVisibility,
    () => !document.hidden,
    () => true,
  );

/** Outline units for a rack that is still loading: a plausible, fixed pattern. */
const GHOST = [1, 2, 0, 1, 1, 2, 0, 1, 2, 1, 0, 1, 2];

/* ----------------------------------------------------------------------- */
/*                                  Lamps                                  */
/* ----------------------------------------------------------------------- */

function Lamp({
  colour,
  style,
  blinking,
  steadyAlert,
}: {
  colour: string;
  style: RackLedStyle;
  blinking: boolean;
  steadyAlert: boolean;
}) {
  const lit = colour !== LAMP.off;
  // An alert lamp flashes like a real LED: on and off on a slow timer with a
  // short colour fade, rather than a continuous animation, so the page stays
  // idle between flashes. The timer runs only while the caller says the rack is on
  // screen, the page visible and motion allowed.
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    if (!blinking) return;
    const id = window.setInterval(() => setDark((d) => !d), 560);
    return () => {
      window.clearInterval(id);
      setDark(false);
    };
  }, [blinking]);
  return (
    <span
      aria-hidden
      className="relative flex shrink-0 items-center justify-center"
      style={{ ["--lamp" as string]: colour }}
    >
      <span
        className={cn(
          "block transition-[background-color,border-color,box-shadow] duration-150 ease-out",
          style === "dot" && "size-[5px] rounded-full bg-(--lamp-now)",
          style === "pipe" && "h-[9px] w-[2.5px] rounded-full bg-(--lamp-now)",
          style === "ring" &&
            "size-[7px] rounded-full border-[1.5px] border-(--lamp-now) bg-[color-mix(in_oklab,var(--lamp-now)_28%,transparent)]",
          lit &&
            style !== "ring" &&
            "shadow-[0_0_5px_color-mix(in_oklab,var(--lamp-now)_70%,transparent)]",
          steadyAlert &&
            "ring-2 ring-[color-mix(in_oklab,var(--lamp)_40%,transparent)]",
        )}
        style={{
          // A paint-only change: the lamp dims to a ghost of its colour, so a
          // flash never promotes a layer or re-rasters the page around it.
          ["--lamp-now" as string]:
            blinking && dark
              ? "color-mix(in oklab, var(--lamp) 22%, var(--hairline-strong))"
              : "var(--lamp)",
        }}
      />
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Drawer                                 */
/* ----------------------------------------------------------------------- */

type DrawerProps = {
  host: HostView;
  top: number;
  height: number;
  open: boolean;
  dimmed: boolean;
  trayDown: boolean;
  pull: number;
  ledStyle: RackLedStyle;
  tempLimit: number;
  blinking: boolean;
  motionSafe: boolean;
  disabled: boolean;
  tabbable: boolean;
  armed: boolean;
  sent: boolean;
  trayId: string;
  registerFace: (id: string, node: HTMLButtonElement | null) => void;
  onToggle: (open: boolean) => void;
  onNavigate: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onFocusFace: () => void;
  onDrain: () => void;
  onReboot: () => void;
};

/**
 * One host on its rails. The face is a button that a press, Enter or Space
 * opens; it can also be pulled: it follows the finger 1:1 sideways, rubber-
 * bands past its stop, and a release is projected open or shut. The slide is
 * `springs.glide` with the throw's velocity — a heavy, damped drawer.
 */
function Drawer({
  host,
  top,
  height,
  open,
  dimmed,
  trayDown,
  pull,
  ledStyle,
  tempLimit,
  blinking,
  motionSafe,
  disabled,
  tabbable,
  armed,
  sent,
  trayId,
  registerFace,
  onToggle,
  onNavigate,
  onFocusFace,
  onDrain,
  onReboot,
}: DrawerProps) {
  const x = useMotionValue(open && motionSafe ? pull : 0);
  // The shadow grows with the pull, so a drawer half out casts half a shadow.
  const shadowCss = useTransform(x, (v) => {
    const k = clamp(v / Math.max(1, pull), 0, 1.2);
    return `0 ${r2(k * 7)}px ${r2(k * 16)}px color-mix(in oklab, black ${Math.round(k * 24)}%, transparent)`;
  });
  // One stable ref callback for the face's whole life: a motion element binds
  // its ref once.
  const hostId = host.id;
  const bindFace = React.useCallback(
    (node: HTMLButtonElement | null) => registerFace(hostId, node),
    [registerFace, hostId],
  );
  const dragging = React.useRef(false);
  const dragFrom = React.useRef(0);
  const pendingVelocity = React.useRef(0);
  const [settleTick, setSettleTick] = React.useState(0);

  React.useEffect(() => {
    if (dragging.current) return;
    const to = open && motionSafe ? pull : 0;
    const velocity = pendingVelocity.current;
    pendingVelocity.current = 0;
    if (!motionSafe) {
      x.jump(0);
      return;
    }
    const controls = animate(x, to, { ...springs.glide, velocity });
    return () => controls.stop();
  }, [open, pull, motionSafe, x, settleTick]);

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => {
      dragging.current = true;
      dragFrom.current = x.get();
      x.stop();
    },
    onMove: ({ offset }) => {
      const raw = dragFrom.current + offset.x;
      const room = Math.max(8, pull * 1.5);
      const v =
        raw < 0
          ? rubberband(raw, room)
          : raw > pull
            ? pull + rubberband(raw - pull, room)
            : raw;
      x.set(r2(v));
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const landing = project(x.get(), velocity.x, 0.99);
      const next = landing > pull / 2;
      pendingVelocity.current = velocity.x;
      if (next !== open) onToggle(next);
      setSettleTick((t) => t + 1);
    },
    onCancel: () => {
      dragging.current = false;
      setSettleTick((t) => t + 1);
    },
    onTap: () => onToggle(!open),
  });

  const size = sizeOf(host);
  const tall = height >= 34;
  const hot = host.temp >= tempLimit;
  const lights: RackLight[] = ["power", "net", "health"];
  const loadSegments = Math.round(clamp(host.load, 0, 1) * 8);
  const label = `${host.name}, U${host.u}${size > 1 ? ` to U${host.u + size - 1}` : ""}, ${host.role}, ${stateWords(host, tempLimit)}`;

  return (
    <div
      className="absolute inset-x-0"
      style={{ top, height, zIndex: open ? 20 : 1 }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          onToggle(false);
        }
      }}
    >
      {/* The slot the drawer came out of, with its two rails. */}
      <span
        aria-hidden
        className="absolute inset-0 overflow-hidden rounded-[3px] bg-(--re-slot)"
      >
        <span className="absolute inset-x-0 top-[22%] h-px bg-(--re-rail)" />
        <span className="absolute inset-x-0 bottom-[22%] h-px bg-(--re-rail)" />
      </span>
      <motion.div
        className="absolute inset-0"
        style={{ x }}
        initial={false}
        animate={{ opacity: dimmed ? 0.4 : 1 }}
        transition={{ duration: durations.base, ease: easings.enter }}
      >
        <motion.button
          ref={bindFace}
          type="button"
          aria-expanded={open}
          aria-controls={open ? trayId : undefined}
          aria-label={label}
          aria-disabled={disabled || undefined}
          tabIndex={tabbable ? 0 : -1}
          onFocus={onFocusFace}
          onKeyDown={onNavigate}
          onClick={(event) => {
            // Pointer presses arrive through the drag's tap; a click with no
            // pointer behind it (Enter, Space, assistive tech) is a press too.
            if (event.detail === 0 && !disabled) onToggle(!open);
          }}
          {...drag}
          style={{ boxShadow: shadowCss }}
          className={cn(
            "absolute inset-0 flex touch-pan-y items-center gap-2 overflow-hidden rounded-[3px] border bg-(--re-face) px-1.5 text-left transition-colors select-none",
            FOCUS_RING,
            open
              ? "border-hairline-strong"
              : "border-[color-mix(in_oklab,var(--re-rail)_70%,transparent)]",
            !disabled && !open && "hover:brightness-[1.03]",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
            !motionSafe && open && "ring-2 ring-ring/40",
          )}
        >
          <span className="flex shrink-0 items-center gap-[3px]">
            {lights.map((light) => (
              <Lamp
                key={light}
                colour={lightColour(host, light)}
                style={ledStyle}
                blinking={blinking && host.alert?.light === light}
                steadyAlert={!motionSafe && host.alert?.light === light}
              />
            ))}
          </span>
          <span className="flex min-w-0 flex-1 flex-col justify-center leading-none">
            <span
              className={cn(
                "truncate font-mono text-[10.5px] leading-none",
                host.state === "off" ? "text-ink-3" : "text-foreground",
              )}
            >
              {host.name}
            </span>
            {tall ? (
              <span className="mt-1 truncate text-[10px] leading-none text-ink-3">
                {host.role}
              </span>
            ) : null}
          </span>
          {host.state !== "off" ? (
            <>
              <span
                className={cn(
                  "hidden shrink-0 font-mono text-[10px] leading-none tabular-nums @min-[8.5rem]/rack:inline",
                  hot ? "text-warn" : "text-ink-3",
                )}
              >
                {Math.round(host.temp)}°
              </span>
              <span
                aria-hidden
                className={cn(
                  "hidden shrink-0 items-end gap-px",
                  !host.drainedNow && "@min-[11.5rem]/rack:flex",
                )}
              >
                {Array.from({ length: 8 }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "w-[2px] rounded-[0.5px]",
                      i < loadSegments
                        ? host.load > 0.8
                          ? "bg-warn"
                          : "bg-ink-2"
                        : "bg-hairline-strong",
                    )}
                    style={{ height: 3 + i }}
                  />
                ))}
              </span>
            </>
          ) : (
            <span className="shrink-0 text-[10px] leading-none text-ink-3">
              Off
            </span>
          )}
          {host.drainedNow ? (
            <span className="hidden shrink-0 rounded-full bg-[color-mix(in_oklab,var(--warn)_16%,transparent)] px-1.5 py-0.5 text-[9.5px] leading-none text-warn @min-[11.5rem]/rack:inline">
              Drained
            </span>
          ) : null}
        </motion.button>

        <AnimatePresence>
          {open ? (
            <motion.div
              key="tray"
              id={trayId}
              role="group"
              aria-label={`${host.name} details`}
              className={cn(
                "absolute inset-x-0 z-10 flex flex-col gap-2 rounded-[3px] border border-hairline-strong bg-popover p-2.5 shadow-[0_10px_28px_color-mix(in_oklab,black_18%,transparent)]",
                trayDown ? "top-full mt-1" : "bottom-full mb-1",
              )}
              initial={
                motionSafe
                  ? {
                      clipPath: trayDown
                        ? "inset(0% 0% 100% 0%)"
                        : "inset(100% 0% 0% 0%)",
                      opacity: 1,
                    }
                  : { clipPath: "inset(0% 0% 0% 0%)", opacity: 0 }
              }
              animate={{ clipPath: "inset(0% 0% 0% 0%)", opacity: 1 }}
              exit={{
                clipPath: motionSafe
                  ? trayDown
                    ? "inset(0% 0% 100% 0%)"
                    : "inset(100% 0% 0% 0%)"
                  : "inset(0% 0% 0% 0%)",
                opacity: motionSafe ? 1 : 0,
                transition: {
                  duration: durations.base * 0.6,
                  ease: easings.exit,
                },
              }}
              transition={{
                duration: motionSafe ? durations.slow : durations.fast,
                ease: easings.enter,
              }}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="truncate text-[12px] font-medium text-foreground">
                  {host.role}
                </p>
                <p className="truncate font-mono text-[10px] text-ink-3">
                  {host.address} · U{host.u}
                  {size > 1 ? `–${host.u + size - 1}` : ""} ·{" "}
                  {uptimeText(host.uptime)}
                </p>
              </div>
              {host.state !== "off" ? (
                <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 text-[11px]">
                  <dt className="text-ink-3">Temp</dt>
                  <dd className="h-1 overflow-hidden rounded-full bg-surface-2">
                    <motion.span
                      className={cn(
                        "block h-full rounded-full",
                        hot ? "bg-warn" : "bg-ink-2",
                      )}
                      style={{ originX: 0 }}
                      initial={{ scaleX: motionSafe ? 0 : r2(host.temp / 60) }}
                      animate={{ scaleX: r2(clamp(host.temp / 60, 0, 1)) }}
                      transition={
                        motionSafe
                          ? { ...springs.glide, delay: 0.08 }
                          : { duration: 0 }
                      }
                    />
                  </dd>
                  <dd
                    className={cn(
                      "text-right font-mono text-[10.5px] tabular-nums",
                      hot ? "text-warn" : "text-ink-2",
                    )}
                  >
                    {Math.round(host.temp)} °C
                  </dd>
                  <dt className="text-ink-3">Load</dt>
                  <dd className="h-1 overflow-hidden rounded-full bg-surface-2">
                    <motion.span
                      className={cn(
                        "block h-full rounded-full",
                        host.load > 0.8 ? "bg-warn" : "bg-ink-2",
                      )}
                      style={{ originX: 0 }}
                      initial={{ scaleX: motionSafe ? 0 : r2(host.load) }}
                      animate={{ scaleX: r2(clamp(host.load, 0, 1)) }}
                      transition={
                        motionSafe
                          ? { ...springs.glide, delay: 0.12 }
                          : { duration: 0 }
                      }
                    />
                  </dd>
                  <dd className="text-right font-mono text-[10.5px] text-ink-2 tabular-nums">
                    {Math.round(host.load * 100)}%
                  </dd>
                  <dt className="text-ink-3">Power</dt>
                  <dd className="col-span-2 text-right font-mono text-[10.5px] text-ink-2 tabular-nums">
                    {Math.round(host.power)} W
                  </dd>
                </dl>
              ) : null}
              {host.alert ? (
                <p className="flex items-start gap-1.5 text-[11px] text-danger">
                  <TriangleAlert
                    aria-hidden
                    className="mt-px size-3 shrink-0"
                  />
                  <span className="min-w-0">{host.alert.message}</span>
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={onDrain}
                  aria-pressed={host.drainedNow}
                  aria-disabled={disabled || host.state === "off" || undefined}
                  className={cn(
                    "inline-flex h-7 items-center rounded-2 border border-hairline px-2.5 text-[11.5px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS_RING,
                    host.drainedNow &&
                      "border-[color-mix(in_oklab,var(--warn)_45%,transparent)] text-warn hover:text-warn",
                  )}
                >
                  {host.drainedNow ? "Undrain" : "Drain"}
                </button>
                <button
                  type="button"
                  onClick={onReboot}
                  aria-label={
                    sent
                      ? `Reboot sent to ${host.name}`
                      : armed
                        ? `Confirm reboot of ${host.name}`
                        : `Reboot ${host.name}`
                  }
                  aria-disabled={disabled || host.state === "off" || undefined}
                  className={cn(
                    "relative inline-flex h-7 items-center overflow-hidden rounded-2 border px-2.5 text-[11.5px] transition-colors",
                    FOCUS_RING,
                    armed
                      ? "border-[color-mix(in_oklab,var(--danger)_50%,transparent)] text-danger"
                      : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  {armed ? (
                    <motion.span
                      aria-hidden
                      className="absolute inset-x-0 bottom-0 h-[2px] bg-danger"
                      style={{ originX: 0 }}
                      initial={{ scaleX: 1 }}
                      animate={{ scaleX: 0 }}
                      transition={{ duration: 3, ease: "linear" }}
                    />
                  ) : null}
                  <span className="grid">
                    {["Reboot", "Confirm", "Sent"].map((t) => {
                      const shown = sent
                        ? "Sent"
                        : armed
                          ? "Confirm"
                          : "Reboot";
                      return (
                        <span
                          key={t}
                          aria-hidden
                          className={cn(
                            "col-start-1 row-start-1 text-left whitespace-nowrap",
                            t === shown ? "visible" : "invisible",
                          )}
                        >
                          {t}
                        </span>
                      );
                    })}
                  </span>
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A rack elevation drawn from data: each rack front-on with its rails and
 * U numbers, each host a slim drawer with three status lights (power,
 * network, health), its name, temperature and an eight-step load meter, and
 * every free unit a dashed slot.
 *
 * Selecting a host slides its drawer out of the rack on its rails on
 * `springs.glide` — heavy and damped, with the throw's velocity when it is
 * pulled — while the slot it left shows dark between two rails, a shadow
 * lifts under it, and its tray unrolls toward the side with room to show
 * the host's details and its Drain and Reboot actions; every other unit dims.
 * An alert blinks one light, the one it belongs to, and only while the rack
 * is on screen and the page is visible.
 *
 * The whole elevation is one tab stop: Up and Down walk units, Left and Right
 * cross racks to the unit at the nearest height, Home and End jump, Enter or
 * Space opens, Escape closes. Below a 544px container the racks stack as an
 * accordion with one rack open. Under reduced motion nothing slides: the open
 * drawer is ringed in place, the tray fades, and the alert light holds steady
 * inside a halo.
 */
export function RackElevation({
  rackCount = 3,
  ledStyle = "dot",
  tone = "graphite",
  racks = defaultRacks,
  selected,
  defaultSelected = null,
  onSelect,
  onDrain,
  onReboot,
  status = "ready",
  onRetry,
  unitHeight = 22,
  pull = 14,
  tempLimit = 48,
  blink = true,
  title = "Basin Hall · row 3",
  height = 540,
  disabled = false,
  className,
}: RackElevationProps) {
  const motionSafe = useMotionSafe();
  const visible = usePageVisible();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";
  const uh = clamp(Math.round(unitHeight), 14, 32);

  const [own, setOwn] = React.useState<string | null>(defaultSelected);
  const openId = selected === undefined ? own : selected;
  const [drained, setDrained] = React.useState<Record<string, boolean>>({});
  const [armed, setArmed] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState<string | null>(null);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [openRack, setOpenRack] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const faces = React.useRef(new Map<string, HTMLButtonElement>());
  const registerFace = React.useCallback(
    (id: string, node: HTMLButtonElement | null) => {
      if (node) faces.current.set(id, node);
      else faces.current.delete(id);
    },
    [],
  );
  const timers = React.useRef<number[]>([]);

  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
    },
    [],
  );

  // Each rack's hosts top to bottom, with the live drained state folded in.
  const columns = React.useMemo(
    () =>
      racks
        .slice(0, clamp(Math.round(rackCount), 1, Math.max(1, racks.length)))
        .map((rack) => ({
          rack,
          units: unitsOf(rack),
          hosts: [...rack.hosts]
            .sort((a, b) => b.u - a.u)
            .map((h): HostView => ({
              ...h,
              rack: rack.id,
              drainedNow: drained[h.id] ?? Boolean(h.drained),
            })),
        })),
    [drained, rackCount, racks],
  );
  const allHosts = columns.flatMap((c) => c.hosts);
  const openHost = allHosts.find((h) => h.id === openId) ?? null;
  const tabStop =
    (focusId && allHosts.some((h) => h.id === focusId) ? focusId : null) ??
    openHost?.id ??
    allHosts[0]?.id ??
    null;
  const activeRack =
    openRack && columns.some((c) => c.rack.id === openRack)
      ? openRack
      : (openHost?.rack ?? columns[0]?.rack.id ?? null);

  const totals = React.useMemo(() => {
    let hostsCount = 0;
    let alerts = 0;
    let watts = 0;
    for (const c of columns) {
      for (const h of c.hosts) {
        hostsCount += 1;
        if (h.alert || h.state === "alert") alerts += 1;
        watts += h.power;
      }
    }
    return { hostsCount, alerts, kw: (watts / 1000).toFixed(1) };
  }, [columns]);

  const setOpen = (host: HostView, next: boolean) => {
    if (disabled) return;
    const id = next ? host.id : null;
    if (id === openId) return;
    if (selected === undefined) setOwn(id);
    onSelect?.(next ? host : null);
    setArmed(null);
    if (next) {
      setOpenRack(host.rack);
      setAnnouncement(`${host.name} open. ${stateWords(host, tempLimit)}.`);
    } else {
      setAnnouncement(`${host.name} closed.`);
      faces.current.get(host.id)?.focus();
    }
  };

  const drain = (host: HostView) => {
    if (disabled || host.state === "off") return;
    const next = !host.drainedNow;
    setDrained((d) => ({ ...d, [host.id]: next }));
    onDrain?.(host, next);
    setAnnouncement(`${host.name} ${next ? "drained" : "back in rotation"}.`);
  };

  const reboot = (host: HostView) => {
    if (disabled || host.state === "off") return;
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    if (armed !== host.id) {
      setArmed(host.id);
      setSent(null);
      setAnnouncement(
        `Press Reboot again within 3 seconds to reboot ${host.name}.`,
      );
      timers.current.push(window.setTimeout(() => setArmed(null), 3000));
      return;
    }
    setArmed(null);
    setSent(host.id);
    onReboot?.(host);
    setAnnouncement(`Reboot sent to ${host.name}.`);
    timers.current.push(window.setTimeout(() => setSent(null), 2000));
  };

  // Focus that has to wait for a rack to open (narrow widths) is handed to
  // the commit that shows it, never to a guessed frame.
  const pendingFocus = React.useRef<string | null>(null);
  React.useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    faces.current.get(id)?.focus();
  });

  const focusHost = (host: HostView | undefined) => {
    if (!host) return;
    setFocusId(host.id);
    if (host.rack === activeRack) {
      faces.current.get(host.id)?.focus();
      return;
    }
    pendingFocus.current = host.id;
    setOpenRack(host.rack);
  };

  const navigate = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    host: HostView,
  ) => {
    const ci = columns.findIndex((c) => c.rack.id === host.rack);
    const col = columns[ci];
    if (!col) return;
    const at = col.hosts.findIndex((h) => h.id === host.id);
    const mid = host.u + sizeOf(host) / 2;
    const nearest = (c: (typeof columns)[number] | undefined) =>
      c
        ? [...c.hosts].sort(
            (a, b) =>
              Math.abs(a.u + sizeOf(a) / 2 - mid) -
              Math.abs(b.u + sizeOf(b) / 2 - mid),
          )[0]
        : undefined;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusHost(col.hosts[Math.min(col.hosts.length - 1, at + 1)]);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusHost(col.hosts[Math.max(0, at - 1)]);
        break;
      case "ArrowRight":
        event.preventDefault();
        focusHost(nearest(columns[ci + 1]));
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusHost(nearest(columns[ci - 1]));
        break;
      case "Home":
        event.preventDefault();
        focusHost(col.hosts[0]);
        break;
      case "End":
        event.preventDefault();
        focusHost(col.hosts[col.hosts.length - 1]);
        break;
      default:
        break;
    }
  };

  const frameHeight = (units: number) => units * uh;

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container/rack-elevation relative w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ...toneVars(tone) }}
    >
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
          <div className="min-w-36 flex-1">
            <p id={titleId} className="truncate text-sm font-semibold">
              {title}
            </p>
            <p className="truncate text-[11px] text-ink-3">
              {ready
                ? `${plural(columns.length, "rack", "racks")} · ${plural(totals.hostsCount, "host", "hosts")} · ${totals.kw} kW`
                : status === "loading"
                  ? "Reading the racks"
                  : "Racks unavailable"}
            </p>
          </div>
          {ready && totals.alerts > 0 ? (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] px-2 text-[11px] font-medium text-danger">
              <span aria-hidden className="size-1.5 rounded-full bg-danger" />
              {plural(totals.alerts, "alert", "alerts")}
            </span>
          ) : null}
        </header>

        <p id={hintId} className="sr-only">
          Up and Down move between units, Left and Right between racks. Enter
          opens a unit, Escape closes it.
        </p>

        <div className="flex-1 [scrollbar-width:thin] overflow-x-hidden overflow-y-auto overscroll-contain">
          {status === "error" ? (
            <div
              role="alert"
              className="flex flex-col items-center gap-3 px-6 py-16 text-center"
            >
              <TriangleAlert aria-hidden className="size-5 text-danger" />
              <p className="text-sm text-ink-2">The racks did not load.</p>
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
                  Retry
                </button>
              ) : null}
            </div>
          ) : (
            <div
              className="grid grid-cols-1 gap-3 px-4 pt-3 pb-4 @min-[34rem]/rack-elevation:[grid-template-columns:repeat(var(--re-count),minmax(0,15rem))] @min-[34rem]/rack-elevation:justify-center @min-[34rem]/rack-elevation:gap-5"
              style={{ ["--re-count" as string]: columns.length }}
            >
              {columns.map((col) => (
                <RackColumn
                  key={col.rack.id}
                  col={col}
                  ready={ready}
                  expanded={activeRack === col.rack.id}
                  onExpand={() =>
                    setOpenRack((r) => (r === col.rack.id ? r : col.rack.id))
                  }
                  uh={uh}
                  frameHeight={frameHeight(col.units)}
                  openId={openId}
                  tabStop={tabStop}
                  pull={pull}
                  ledStyle={ledStyle}
                  tempLimit={tempLimit}
                  blink={blink && visible && motionSafe}
                  motionSafe={motionSafe}
                  disabled={disabled}
                  armed={armed}
                  sent={sent}
                  uid={uid}
                  hintId={hintId}
                  registerFace={registerFace}
                  setOpen={setOpen}
                  navigate={navigate}
                  setFocusId={setFocusId}
                  drain={drain}
                  reboot={reboot}
                />
              ))}
            </div>
          )}
        </div>

        <footer
          aria-hidden
          className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline px-4 py-2 text-[10.5px] text-ink-3"
        >
          <span className="inline-flex items-center gap-1.5">
            <Lamp
              colour={LAMP.green}
              style={ledStyle}
              blinking={false}
              steadyAlert={false}
            />
            Power
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Lamp
              colour={LAMP.blue}
              style={ledStyle}
              blinking={false}
              steadyAlert={false}
            />
            Network
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Lamp
              colour={LAMP.amber}
              style={ledStyle}
              blinking={false}
              steadyAlert={false}
            />
            Health
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3.5 rounded-[2px] border border-dashed border-hairline-strong" />
            Free unit
          </span>
        </footer>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Rack column                              */
/* ----------------------------------------------------------------------- */

type Column = { rack: RackSpec; units: number; hosts: HostView[] };

function RackColumn({
  col,
  ready,
  expanded,
  onExpand,
  uh,
  frameHeight,
  openId,
  tabStop,
  pull,
  ledStyle,
  tempLimit,
  blink,
  motionSafe,
  disabled,
  armed,
  sent,
  uid,
  hintId,
  registerFace,
  setOpen,
  navigate,
  setFocusId,
  drain,
  reboot,
}: {
  col: Column;
  ready: boolean;
  expanded: boolean;
  onExpand: () => void;
  uh: number;
  frameHeight: number;
  openId: string | null;
  tabStop: string | null;
  pull: number;
  ledStyle: RackLedStyle;
  tempLimit: number;
  blink: boolean;
  motionSafe: boolean;
  disabled: boolean;
  armed: string | null;
  sent: string | null;
  uid: string;
  hintId: string;
  registerFace: (id: string, node: HTMLButtonElement | null) => void;
  setOpen: (host: HostView, next: boolean) => void;
  navigate: (
    event: React.KeyboardEvent<HTMLButtonElement>,
    host: HostView,
  ) => void;
  setFocusId: (id: string) => void;
  drain: (host: HostView) => void;
  reboot: (host: HostView) => void;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const { rack, units, hosts } = col;
  const headingId = `${uid}-${rack.id}`;
  const occupied = new Set<number>();
  for (const h of hosts) {
    for (let k = 0; k < sizeOf(h); k += 1) occupied.add(h.u + k);
  }
  const free: number[] = [];
  for (let u = 1; u <= units; u += 1) if (!occupied.has(u)) free.push(u);
  const alerts = hosts.filter((h) => h.alert || h.state === "alert").length;
  const somethingOpen = openId !== null;
  const summary = ready
    ? `${plural(hosts.length, "host", "hosts")} · ${plural(free.length, "free unit", "free units")}${alerts ? ` · ${plural(alerts, "alert", "alerts")}` : ""}`
    : "Loading";

  // Loading: outline units in a fixed, plausible pattern.
  const ghosts: { u: number; size: number }[] = [];
  if (!ready) {
    let u = units;
    let i = rack.id.length;
    while (u >= 1) {
      const size = GHOST[i % GHOST.length] ?? 1;
      i += 1;
      if (size === 0) {
        u -= 1;
        continue;
      }
      const s = Math.min(size, u);
      ghosts.push({ u: u - s + 1, size: s });
      u -= s;
    }
  }

  return (
    <div ref={ref} className="@container/rack flex min-w-0 flex-col gap-2">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`${headingId}-frame`}
        onClick={onExpand}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-2 border border-hairline bg-surface-1 px-3 text-left @min-[34rem]/rack-elevation:hidden",
          FOCUS_RING,
        )}
      >
        <ChevronRight
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 text-ink-3 transition-transform",
            expanded && "rotate-90",
          )}
        />
        <span className="text-[13px] font-medium">Rack {rack.name}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-3">
          {summary}
        </span>
        {/* The spine: one cell per unit, top of the rack first, lit where a host is. */}
        <span aria-hidden className="flex shrink-0 items-center gap-px">
          {Array.from({ length: Math.min(units, 16) }, (_, k) => {
            const u = units - k;
            const host = hosts.find((h) => u >= h.u && u < h.u + sizeOf(h));
            return (
              <span
                key={k}
                className={cn(
                  "h-2.5 w-[3px] rounded-[1px]",
                  !host
                    ? "bg-hairline"
                    : host.alert || host.state === "alert"
                      ? "bg-danger"
                      : host.state === "off"
                        ? "bg-hairline-strong"
                        : "bg-ink-3",
                )}
              />
            );
          })}
        </span>
      </button>

      <div
        id={`${headingId}-frame`}
        role="group"
        aria-labelledby={headingId}
        aria-describedby={hintId}
        className={cn(
          "flex-col gap-2 @min-[34rem]/rack-elevation:flex",
          expanded ? "flex" : "hidden",
        )}
      >
        <p
          id={headingId}
          className="hidden items-baseline justify-between gap-2 px-0.5 @min-[34rem]/rack-elevation:flex"
        >
          <span className="text-[13px] font-medium">Rack {rack.name}</span>
          <span className="truncate text-[11px] text-ink-3">{summary}</span>
        </p>
        <div className="flex rounded-2 bg-(--re-frame) p-1.5 shadow-[inset_0_0_0_1px_var(--hairline)]">
          <div
            aria-hidden
            className="relative w-5 shrink-0"
            style={{ height: frameHeight }}
          >
            {Array.from({ length: units }, (_, k) => (
              <span
                key={k}
                className="absolute inset-x-0 flex items-center justify-center font-mono text-[8.5px] leading-none text-ink-3 tabular-nums"
                style={{ top: (units - 1 - k) * uh, height: uh }}
              >
                {k + 1}
              </span>
            ))}
          </div>
          <div
            className="relative min-w-0 flex-1"
            style={{ height: frameHeight }}
          >
            {ready
              ? free.map((u) => (
                  <span
                    key={`free-${u}`}
                    aria-hidden
                    className="absolute inset-x-0 rounded-[3px] border border-dashed border-hairline-strong"
                    style={{ top: (units - u) * uh + 1, height: uh - 2 }}
                  />
                ))
              : ghosts.map((g) => (
                  <span
                    key={`ghost-${g.u}`}
                    aria-hidden
                    className="absolute inset-x-0 rounded-[3px] border border-hairline-strong motion-safe:animate-pulse"
                    style={{
                      top: (units - (g.u + g.size - 1)) * uh + 1,
                      height: g.size * uh - 2,
                    }}
                  />
                ))}
            {ready
              ? hosts.map((host) => {
                  const size = sizeOf(host);
                  const top = (units - (host.u + size - 1)) * uh + 1;
                  const h = size * uh - 2;
                  const below = frameHeight - (top + h);
                  const open = host.id === openId;
                  return (
                    <Drawer
                      key={host.id}
                      host={host}
                      top={top}
                      height={h}
                      open={open}
                      dimmed={somethingOpen && !open}
                      trayDown={below >= 150 || below >= top}
                      pull={pull}
                      ledStyle={ledStyle}
                      tempLimit={tempLimit}
                      blinking={blink && inView}
                      motionSafe={motionSafe}
                      disabled={disabled}
                      tabbable={host.id === tabStop}
                      armed={armed === host.id}
                      sent={sent === host.id}
                      trayId={`${uid}-tray-${host.id}`}
                      registerFace={registerFace}
                      onToggle={(next) => setOpen(host, next)}
                      onNavigate={(event) => navigate(event, host)}
                      onFocusFace={() => setFocusId(host.id)}
                      onDrain={() => drain(host)}
                      onReboot={() => reboot(host)}
                    />
                  );
                })
              : null}
          </div>
          <div aria-hidden className="relative w-2 shrink-0">
            {Array.from({ length: units }, (_, k) => (
              <span
                key={k}
                className="absolute left-1/2 size-[3px] -translate-x-1/2 rounded-full bg-(--re-rail)"
                style={{ top: k * uh + uh / 2 - 1.5 }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
