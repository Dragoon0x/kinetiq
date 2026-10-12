"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Cable,
  GripVertical,
  HardDrive,
  type LucideIcon,
  Network,
  Plug,
  RotateCcw,
  Server,
  Terminal,
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

export type RackFace = "front" | "rear" | "schematic";
export type RackAccent = "cobalt" | "signal" | "amber" | "graphite";
export type RackHealth = "ok" | "warn" | "down" | "unknown";
export type RackDeviceKind =
  "switch" | "server" | "storage" | "patch" | "pdu" | "console" | "blank";
export type RackFeed = "A" | "B" | "A+B";
export type RackStatus = "ready" | "loading" | "error";
export type RackTab = "status" | "ports" | "power";

/** A run of units: the lowest one and how many, counted up from the floor. */
export type RackRun = { bottom: number; height: number };

export type RackDevice = {
  id: string;
  /** Shown on the faceplate, e.g. "Core switch 1". */
  name: string;
  /** Vendor and model, e.g. "Fernmoor FX-4832". */
  model: string;
  kind: RackDeviceKind;
  /** The lowest unit it occupies; U1 is the floor. */
  bottom: number;
  /** Units tall. */
  height: number;
  /** Draw in watts; what the budget bar sums. */
  watts: number;
  health: RackHealth;
  /** Data ports (outlets on a PDU): how many there are and how many are patched. */
  ports?: { total: number; used: number };
  /** Inlet temperature in degrees C. */
  temperature?: number;
  /** When it last reported, in ms. */
  lastSeen?: number;
  /** Which power feed it hangs off. */
  feed?: RackFeed;
};

export type RackMove = { id: string; from: number; to: number };

export type RackElevationProps = {
  /** Which face is drawn: front plates with vents and switch ports, the rear with server ports and power inlets, or a plain line schematic. @default "front" */
  face?: RackFace;
  /** Rack height in units; U1 is the floor. Devices above the top are listed, not drawn. @default 42 */
  units?: number;
  /** Selection ring, drop target and port tint: a named token, or any CSS colour. @default "cobalt" */
  accent?: RackAccent | (string & {});
  /** Controlled devices with their positions. */
  devices?: RackDevice[];
  /** Initial devices when uncontrolled. @default defaultRackDevices */
  defaultDevices?: RackDevice[];
  /** A device landed in a new run, from a drop or a keyboard Space; with the whole list after the move. */
  onMove?: (move: RackMove, devices: RackDevice[]) => void;
  /** Controlled selected device id; null for none. */
  selected?: string | null;
  /** Initial selection when uncontrolled. @default "sw-core-1" */
  defaultSelected?: string | null;
  /** The selection changed, from a press or an arrow key. */
  onSelect?: (id: string | null, device: RackDevice | null) => void;
  /** Watts the rack's feeds can supply; the bar at the foot fills against it. @default 5000 */
  powerBudget?: number;
  /** The moment "last seen" ages count from, in ms — never read from the clock. @default defaultRackNow */
  now?: number;
  /** Whether the rack's inventory has arrived. @default "ready" */
  status?: RackStatus;
  /** Retry was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Rack C-07" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the rack scrolls inside it. @default 560 */
  height?: number;
  /** Read only: devices can be selected and inspected but not moved. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;

/** Monday 12 October 2026, 09:30 UTC — the morning walk-round. */
export const defaultRackNow = Date.UTC(2026, 9, 12, 9, 30);
const NOW = defaultRackNow;

/** Basinworks rack C-07: network at the top, pump hosts mid-rack, storage and the PDU on the floor. */
export const defaultRackDevices: RackDevice[] = [
  {
    id: "pp-a",
    name: "Patch panel A",
    model: "Basinworks PP-48",
    kind: "patch",
    bottom: 42,
    height: 1,
    watts: 0,
    health: "ok",
    ports: { total: 48, used: 36 },
    lastSeen: NOW - 3 * MIN,
  },
  {
    id: "sw-core-1",
    name: "Core switch 1",
    model: "Fernmoor FX-4832",
    kind: "switch",
    bottom: 41,
    height: 1,
    watts: 210,
    health: "ok",
    ports: { total: 48, used: 41 },
    temperature: 38,
    lastSeen: NOW - MIN,
    feed: "A+B",
  },
  {
    id: "sw-core-2",
    name: "Core switch 2",
    model: "Fernmoor FX-4832",
    kind: "switch",
    bottom: 40,
    height: 1,
    watts: 205,
    health: "warn",
    ports: { total: 48, used: 38 },
    temperature: 47,
    lastSeen: NOW - MIN,
    feed: "A+B",
  },
  {
    id: "sw-leaf-1",
    name: "Leaf switch",
    model: "Fernmoor FX-2410",
    kind: "switch",
    bottom: 38,
    height: 1,
    watts: 120,
    health: "ok",
    ports: { total: 24, used: 19 },
    temperature: 36,
    lastSeen: NOW - 2 * MIN,
    feed: "A",
  },
  {
    id: "blank-34",
    name: "Blank",
    model: "1U filler",
    kind: "blank",
    bottom: 34,
    height: 1,
    watts: 0,
    health: "unknown",
  },
  {
    id: "arr-scratch",
    name: "Scratch array",
    model: "Coldbrook S2-12",
    kind: "storage",
    bottom: 27,
    height: 4,
    watts: 380,
    health: "ok",
    ports: { total: 4, used: 2 },
    temperature: 35,
    lastSeen: NOW - 4 * MIN,
    feed: "A+B",
  },
  {
    id: "kvm",
    name: "Console",
    model: "Basinworks KV-8",
    kind: "console",
    bottom: 24,
    height: 1,
    watts: 25,
    health: "ok",
    ports: { total: 8, used: 5 },
    temperature: 31,
    lastSeen: NOW - 12 * MIN,
    feed: "B",
  },
  {
    id: "blank-21",
    name: "Blank",
    model: "2U filler",
    kind: "blank",
    bottom: 21,
    height: 2,
    watts: 0,
    health: "unknown",
  },
  {
    id: "srv-tel-1",
    name: "Telemetry node 1",
    model: "Coldbrook C1",
    kind: "server",
    bottom: 19,
    height: 1,
    watts: 240,
    health: "ok",
    ports: { total: 4, used: 2 },
    temperature: 39,
    lastSeen: NOW - MIN,
    feed: "A",
  },
  {
    id: "srv-tel-2",
    name: "Telemetry node 2",
    model: "Coldbrook C1",
    kind: "server",
    bottom: 18,
    height: 1,
    watts: 235,
    health: "warn",
    ports: { total: 4, used: 2 },
    temperature: 49,
    lastSeen: NOW - MIN,
    feed: "B",
  },
  {
    id: "srv-pump-1",
    name: "Pump host 1",
    model: "Coldbrook C2",
    kind: "server",
    bottom: 14,
    height: 2,
    watts: 480,
    health: "ok",
    ports: { total: 4, used: 3 },
    temperature: 41,
    lastSeen: NOW - MIN,
    feed: "A+B",
  },
  {
    id: "srv-pump-2",
    name: "Pump host 2",
    model: "Coldbrook C2",
    kind: "server",
    bottom: 12,
    height: 2,
    watts: 470,
    health: "ok",
    ports: { total: 4, used: 3 },
    temperature: 40,
    lastSeen: NOW - 2 * MIN,
    feed: "A+B",
  },
  {
    id: "srv-pump-3",
    name: "Pump host 3",
    model: "Coldbrook C2",
    kind: "server",
    bottom: 10,
    height: 2,
    watts: 455,
    health: "down",
    ports: { total: 4, used: 3 },
    lastSeen: NOW - 118 * MIN,
    feed: "A+B",
  },
  {
    id: "srv-model",
    name: "Model host",
    model: "Coldbrook C2 GPU",
    kind: "server",
    bottom: 7,
    height: 2,
    watts: 520,
    health: "ok",
    ports: { total: 4, used: 2 },
    temperature: 44,
    lastSeen: NOW - MIN,
    feed: "A+B",
  },
  {
    id: "arr-archive",
    name: "Archive array",
    model: "Coldbrook S4-24",
    kind: "storage",
    bottom: 3,
    height: 4,
    watts: 620,
    health: "ok",
    ports: { total: 8, used: 4 },
    temperature: 36,
    lastSeen: NOW - 5 * MIN,
    feed: "A+B",
  },
  {
    id: "pdu-a",
    name: "PDU A",
    model: "Basinworks PD-24",
    kind: "pdu",
    bottom: 1,
    height: 2,
    watts: 0,
    health: "ok",
    ports: { total: 24, used: 17 },
    temperature: 29,
    lastSeen: NOW - MIN,
    feed: "A",
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const ACCENTS: Record<RackAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  amber: "var(--warn)",
  graphite: "var(--ink-2)",
};

const HEALTH_COLOR: Record<RackHealth, string> = {
  ok: "var(--success)",
  warn: "var(--warn)",
  down: "var(--danger)",
  unknown: "var(--ink-3)",
};

const HEALTH_WORD: Record<RackHealth, string> = {
  ok: "Healthy",
  warn: "Warning",
  down: "Down",
  unknown: "No signal",
};

/** Seconds per pulse of the health dot: trouble beats faster. */
const HEALTH_BEAT: Record<RackHealth, number> = {
  ok: 2.2,
  warn: 1.4,
  down: 0.9,
  unknown: 0,
};

const KIND_WORD: Record<RackDeviceKind, string> = {
  switch: "Switch",
  server: "Server",
  storage: "Storage",
  patch: "Patch panel",
  pdu: "PDU",
  console: "Console",
  blank: "Blank",
};

const KIND_ICON: Record<RackDeviceKind, LucideIcon | null> = {
  switch: Network,
  server: Server,
  storage: HardDrive,
  patch: Cable,
  pdu: Plug,
  console: Terminal,
  blank: null,
};

const TABS: { id: RackTab; label: string }[] = [
  { id: "status", label: "Status" },
  { id: "ports", label: "Ports" },
  { id: "power", label: "Power" },
];

/** Rack padding above U-top and below U1, in px. */
const PAD = 8;
/** The U-number gutter's width. */
const GUTTER = 28;
/** Each rail's width. */
const RAIL = 7;
const MIN_U = 16;
const MAX_U = 24;
const DRAG_THRESHOLD = 4;
/** Within this many px of the viewport's edge a drag scrolls it. */
const EDGE = 28;
/** How long the outline of a vacated run lingers, in ms. */
const VACATE_MS = 650;

const HATCH =
  "repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in oklab, var(--ink-3) 24%, transparent) 4px 5px)";
const VENT =
  "radial-gradient(circle, color-mix(in oklab, var(--ink) 24%, transparent) 0.7px, transparent 0.9px)";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Number(v.toFixed(3));

const noopSubscribe = () => () => {};

/** The 0-based slot index from the top of the rack that a run begins at. */
const topOf = (run: RackRun, units: number) =>
  units - (run.bottom + run.height - 1);

const overlaps = (a: RackRun, b: RackRun) =>
  a.bottom <= b.bottom + b.height - 1 && b.bottom <= a.bottom + a.height - 1;

/** Whether a run lies inside the rack and clear of every device but `ignoreId`. */
export const fitsRun = (
  devices: RackDevice[],
  run: RackRun,
  units: number,
  ignoreId?: string,
) =>
  run.bottom >= 1 &&
  run.bottom + run.height - 1 <= units &&
  devices.every((d) => d.id === ignoreId || !overlaps(d, run));

/** Every empty run in the rack, floor first, for hosts placing a new device. */
export const freeRuns = (devices: RackDevice[], units: number): RackRun[] => {
  const taken = new Array<boolean>(units + 1).fill(false);
  for (const d of devices) {
    for (let u = d.bottom; u < d.bottom + d.height; u += 1) {
      if (u >= 1 && u <= units) taken[u] = true;
    }
  }
  const runs: RackRun[] = [];
  let start: number | null = null;
  for (let u = 1; u <= units + 1; u += 1) {
    const free = u <= units && !taken[u];
    if (free && start === null) start = u;
    if (!free && start !== null) {
      runs.push({ bottom: start, height: u - start });
      start = null;
    }
  }
  return runs;
};

/** Sums the draw of every device, for hosts that show a total elsewhere. */
export const rackDraw = (devices: RackDevice[]) =>
  devices.reduce((sum, d) => sum + Math.max(0, d.watts), 0);

/** Top of the rack first. */
const byPosition = (a: RackRun, b: RackRun) =>
  b.bottom + b.height - (a.bottom + a.height);

/** "U14–U15", or "U41" for one unit. */
const unitLabel = (run: RackRun) =>
  run.height === 1
    ? `U${run.bottom}`
    : `U${run.bottom}–U${run.bottom + run.height - 1}`;

/** The same, in words a screen reader says well. */
const unitWords = (run: RackRun) =>
  run.height === 1
    ? `U${run.bottom}`
    : `U${run.bottom} to U${run.bottom + run.height - 1}`;

const ageWords = (now: number, at: number | undefined) => {
  if (at === undefined) return "never";
  const ms = Math.max(0, now - at);
  if (ms < MIN) return "moments ago";
  if (ms < 60 * MIN) return `${Math.round(ms / MIN)} min ago`;
  if (ms < 24 * 60 * MIN) return `${Math.round(ms / (60 * MIN))} h ago`;
  return `${Math.round(ms / (24 * 60 * MIN))} d ago`;
};

const fmtW = (w: number) => Math.round(w).toLocaleString("en-US");

const portNoun = (d: RackDevice) => (d.kind === "pdu" ? "outlets" : "ports");

/** Whether the drawn face shows this device's port row. */
const showsPorts = (face: RackFace, d: RackDevice) => {
  if (face === "schematic" || !d.ports || d.kind === "blank") return false;
  const frontPorts = d.kind === "switch" || d.kind === "patch";
  return face === "front" ? frontPorts : !frontPorts;
};

/* ----------------------------------------------------------------------- */
/*                              Small pieces                                */
/* ----------------------------------------------------------------------- */

function HealthDot({
  health,
  pulse,
  motionSafe,
  className,
}: {
  health: RackHealth;
  /** Beat while true; the ring is still while it is not. */
  pulse: boolean;
  motionSafe: boolean;
  className?: string;
}) {
  const color = HEALTH_COLOR[health];
  const beat = HEALTH_BEAT[health];
  const live = pulse && motionSafe && beat > 0;
  return (
    <span
      aria-hidden
      className={cn("relative inline-block size-2.5 rounded-full", className)}
      style={{ backgroundColor: color }}
    >
      <motion.span
        className="absolute inset-0 rounded-full"
        style={{ boxShadow: `0 0 0 1.5px ${color}` }}
        initial={false}
        animate={
          live
            ? { scale: [1, 2.6], opacity: [0.7, 0] }
            : { scale: 1, opacity: 0 }
        }
        transition={
          live
            ? {
                duration: beat * 0.6,
                ease: easings.enter,
                repeat: Infinity,
                repeatDelay: beat * 0.4,
              }
            : { duration: durations.fast }
        }
      />
      {!motionSafe && beat > 0 ? (
        <span
          className="absolute -inset-[3px] rounded-full opacity-40"
          style={{ boxShadow: `0 0 0 1px ${color}` }}
        />
      ) : null}
    </span>
  );
}

function PortStrip({
  ports,
  max = 24,
  className,
}: {
  ports: { total: number; used: number };
  max?: number;
  className?: string;
}) {
  const n = Math.max(1, Math.min(ports.total, max));
  const used = Math.round(
    (clamp(ports.used, 0, ports.total) / ports.total) * n,
  );
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center gap-px", className)}
    >
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className="h-[5px] w-[4px] rounded-[1px]"
          style={{
            backgroundColor:
              i < used
                ? "var(--re-accent)"
                : "color-mix(in oklab, var(--ink-3) 45%, transparent)",
          }}
        />
      ))}
    </span>
  );
}

function PsuBlocks({ feed }: { feed: RackFeed | undefined }) {
  const n = feed === "A+B" ? 2 : 1;
  return (
    <span aria-hidden className="flex shrink-0 items-center gap-0.5">
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className="h-[7px] w-[11px] rounded-[1px] border border-hairline-strong"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--ink-3) 18%, transparent)",
          }}
        />
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Device block                               */
/* ----------------------------------------------------------------------- */

type DeviceBlockProps = {
  device: RackDevice;
  face: RackFace;
  uH: number;
  /** The top of the block in px from the top of U-top. */
  y: number;
  carried: boolean;
  /** Following a pointer: placed where it is, no spring. */
  pointerCarried: boolean;
  selected: boolean;
  tabIndex: number;
  /** Changes when the block should shake back from a refused drop. */
  shakeSeq: number;
  motionSafe: boolean;
  disabled: boolean;
  optionId: string;
  hintId: string;
  nodeRef: (node: HTMLDivElement | null) => void;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
  onClick: () => void;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
};

function DeviceBlock({
  device: d,
  face,
  uH,
  y,
  carried,
  pointerCarried,
  selected,
  tabIndex,
  shakeSeq,
  motionSafe,
  disabled,
  optionId,
  hintId,
  nodeRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onClick,
  onFocus,
  onKeyDown,
}: DeviceBlockProps) {
  const blank = d.kind === "blank";
  const tall = d.height >= 2;
  const Icon = KIND_ICON[d.kind];
  const ports = showsPorts(face, d) && d.ports ? d.ports : null;
  const vent =
    face === "front" && (d.kind === "server" || d.kind === "storage");
  const psu =
    face === "rear" && !blank && d.kind !== "patch" && d.kind !== "pdu";

  const faceClass = blank
    ? "border-dashed border-hairline-strong text-ink-3"
    : face === "front"
      ? "border-hairline-strong bg-surface-2 text-foreground"
      : face === "rear"
        ? "border-[color-mix(in_oklab,var(--ink)_18%,var(--hairline-strong))] text-foreground"
        : "border-ink-3 bg-transparent text-foreground";

  const shadows: string[] = [];
  if (selected) shadows.push("0 0 0 1.5px var(--re-accent)");
  if (carried) {
    shadows.push(
      "0 10px 24px -10px color-mix(in oklab, black 50%, transparent)",
    );
  }

  const text = face === "schematic" ? "font-mono uppercase" : "";
  const nameSize = tall ? "text-[12px]" : "text-[11px]";

  return (
    <motion.div
      ref={nodeRef}
      role="option"
      id={optionId}
      aria-selected={selected}
      aria-label={`${d.name}, ${KIND_WORD[d.kind].toLowerCase()}, ${unitWords(d)}, ${d.watts} watts, ${HEALTH_WORD[d.health].toLowerCase()}${carried ? ", picked up" : ""}`}
      aria-describedby={hintId}
      tabIndex={tabIndex}
      initial={false}
      animate={{ y, scale: carried ? 1.012 : 1 }}
      transition={{
        y: pointerCarried || !motionSafe ? { duration: 0 } : springs.glide,
        scale: motionSafe ? springs.flick : { duration: 0 },
      }}
      style={{
        top: 1,
        height: d.height * uH - 2,
        boxShadow: shadows.length ? shadows.join(", ") : undefined,
        backgroundImage: blank ? HATCH : undefined,
        backgroundColor:
          !blank && face === "rear"
            ? "color-mix(in oklab, var(--ink) 9%, var(--bg-2))"
            : undefined,
      }}
      className={cn(
        "absolute inset-x-0 overflow-hidden rounded-1 border select-none",
        faceClass,
        carried ? "z-20 cursor-grabbing" : "z-10",
        !carried && (disabled ? "cursor-default" : "cursor-grab"),
        FOCUS_RING,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      onClick={onClick}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
    >
      {/* Keyed so a refused drop remounts it one step aside; the recoil
          spring then brings it home with the shake that says "no". */}
      <motion.div
        key={shakeSeq}
        initial={shakeSeq > 0 && motionSafe ? { x: distances.step } : false}
        animate={{ x: 0 }}
        transition={springs.recoil}
        className="flex h-full items-stretch"
      >
        <span
          data-grip
          className={cn(
            "flex w-4 shrink-0 touch-none items-center justify-center",
            blank ? "text-ink-3/60" : "text-ink-3",
          )}
        >
          <GripVertical aria-hidden className="size-3" />
        </span>

        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col justify-center pr-2",
            text,
          )}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            {blank ? (
              <span className="size-1.5 shrink-0 rounded-full border border-ink-3/60" />
            ) : (
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: HEALTH_COLOR[d.health] }}
              />
            )}
            {Icon && tall ? (
              <Icon aria-hidden className="size-3 shrink-0 text-ink-3" />
            ) : null}
            <span
              className={cn(
                "min-w-0 flex-1 truncate leading-none font-medium",
                nameSize,
              )}
            >
              {d.name}
            </span>
            {!tall && ports ? (
              <PortStrip ports={ports} className="hidden @min-[30rem]:flex" />
            ) : null}
            {!tall && psu ? <PsuBlocks feed={d.feed} /> : null}
            {!tall && !ports && !blank ? (
              <span className="hidden truncate text-[10px] text-ink-3 @min-[44rem]:inline">
                {d.model}
              </span>
            ) : null}
            {!blank ? (
              <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                {d.watts} W
              </span>
            ) : (
              <span className="shrink-0 font-mono text-[10px] text-ink-3">
                {d.height}U
              </span>
            )}
          </div>
          {tall ? (
            <div className="mt-1 flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-[10px] leading-none text-ink-3">
                {d.model}
              </span>
              {ports ? (
                <PortStrip ports={ports} className="hidden @min-[30rem]:flex" />
              ) : null}
              {psu ? <PsuBlocks feed={d.feed} /> : null}
            </div>
          ) : null}
        </div>

        {vent ? (
          <span
            aria-hidden
            className="hidden w-[18%] shrink-0 opacity-70 @min-[30rem]:block"
            style={{
              backgroundImage: VENT,
              backgroundSize: "4px 4px",
              maskImage:
                "linear-gradient(to right, transparent, black 30%, black)",
            }}
          />
        ) : null}
      </motion.div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Detail panel                               */
/* ----------------------------------------------------------------------- */

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-right text-[12px] text-foreground tabular-nums">
        {children}
      </dd>
    </div>
  );
}

function Meter({
  value,
  tone,
  motionSafe,
}: {
  /** 0–1. */
  value: number;
  tone: string;
  motionSafe: boolean;
}) {
  return (
    <div
      aria-hidden
      className="h-1 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: tone }}
        initial={false}
        animate={{ width: `${r3(clamp(value, 0, 1) * 100)}%` }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      />
    </div>
  );
}

type DetailPanelProps = {
  device: RackDevice | null;
  empty: boolean;
  tab: RackTab;
  onTab: (tab: RackTab) => void;
  rackDraw: number;
  budget: number;
  now: number;
  awake: boolean;
  motionSafe: boolean;
  uid: string;
};

function DetailPanel({
  device: d,
  empty,
  tab,
  onTab,
  rackDraw: total,
  budget,
  now,
  awake,
  motionSafe,
  uid,
}: DetailPanelProps) {
  const tabNodes = React.useRef(new Map<RackTab, HTMLButtonElement>());

  const onTabKey = (event: React.KeyboardEvent, current: RackTab) => {
    const i = TABS.findIndex((t) => t.id === current);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = TABS.length - 1;
    else return;
    event.preventDefault();
    const target = TABS[(to + TABS.length) % TABS.length];
    if (!target) return;
    onTab(target.id);
    tabNodes.current.get(target.id)?.focus();
  };

  if (!d) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-5 py-6 text-center">
        <Server aria-hidden className="size-4 text-ink-3" />
        <p className="text-[12px] text-ink-2">
          {empty ? "Nothing to inspect yet." : "Select a device to inspect it."}
        </p>
      </div>
    );
  }

  const Icon = KIND_ICON[d.kind];
  const blank = d.kind === "blank";
  const temp = d.temperature;
  const tempTone =
    temp === undefined
      ? "var(--ink-3)"
      : temp >= 55
        ? "var(--danger)"
        : temp >= 45
          ? "var(--warn)"
          : "var(--success)";
  const share = total > 0 ? d.watts / total : 0;
  const ofBudget = budget > 0 ? d.watts / budget : 0;
  const panelId = `${uid}-panel`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start gap-2.5 px-3.5 pt-3 pb-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-2 border border-hairline bg-surface-1 text-ink-2">
          {Icon ? (
            <Icon aria-hidden className="size-3.5" />
          ) : (
            <span
              aria-hidden
              className="size-3 rounded-[2px] border border-dashed border-ink-3"
            />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] leading-tight font-semibold">
            {d.name}
          </p>
          <p className="truncate font-mono text-[10px] text-ink-3">
            {d.model} · {unitLabel(d)} · {d.height}U
          </p>
        </div>
        {!blank ? (
          <p className="flex shrink-0 items-center gap-1.5 pt-1 text-[11px] text-ink-2">
            <HealthDot
              health={d.health}
              pulse={awake}
              motionSafe={motionSafe}
            />
            <span className="hidden @min-[48rem]:inline">
              {HEALTH_WORD[d.health]}
            </span>
          </p>
        ) : null}
      </div>

      <div
        role="tablist"
        aria-label="Device detail"
        className="relative mx-3.5 flex shrink-0 gap-1 border-b border-hairline"
      >
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              ref={(node) => {
                if (node) tabNodes.current.set(t.id, node);
                else tabNodes.current.delete(t.id);
              }}
              type="button"
              role="tab"
              id={`${uid}-tab-${t.id}`}
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              onClick={() => onTab(t.id)}
              onKeyDown={(event) => onTabKey(event, t.id)}
              className={cn(
                "relative -mb-px px-1.5 pt-1 pb-1.5 text-[11px] font-medium transition-colors",
                active ? "text-foreground" : "text-ink-3 hover:text-ink-2",
                FOCUS_RING,
              )}
            >
              {t.label}
              {active ? (
                <motion.span
                  aria-hidden
                  layoutId={`${uid}-tab-ink`}
                  className="absolute inset-x-0 -bottom-px h-0.5 rounded-full"
                  style={{ backgroundColor: "var(--re-accent)" }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={`${d.id}:${tab}`}
            id={panelId}
            role="tabpanel"
            aria-labelledby={`${uid}-tab-${tab}`}
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              y: motionSafe ? springs.glide : { duration: 0 },
              opacity: { duration: durations.fast, ease: easings.enter },
            }}
            className="px-3.5 py-3"
          >
            {tab === "status" ? (
              <dl className="flex flex-col gap-2.5">
                <Row label="Health">
                  {blank ? "Filler" : HEALTH_WORD[d.health]}
                </Row>
                <div className="flex flex-col gap-1.5">
                  <Row label="Inlet temp">
                    {temp === undefined ? "No reading" : `${temp} C`}
                  </Row>
                  {!blank ? (
                    <Meter
                      value={temp === undefined ? 0 : temp / 60}
                      tone={tempTone}
                      motionSafe={motionSafe}
                    />
                  ) : null}
                </div>
                <Row label="Last seen">
                  {blank ? "Not monitored" : ageWords(now, d.lastSeen)}
                </Row>
                <Row label="Position">
                  {unitLabel(d)} · {d.height}U
                </Row>
                <Row label="Kind">{KIND_WORD[d.kind]}</Row>
              </dl>
            ) : tab === "ports" ? (
              <div className="flex flex-col gap-2.5">
                {d.ports ? (
                  <>
                    <p className="text-[12px] text-foreground tabular-nums">
                      {d.ports.used} of {d.ports.total} {portNoun(d)}{" "}
                      <span className="text-ink-3">
                        {d.kind === "pdu" ? "live" : "patched"}
                      </span>
                    </p>
                    <div
                      aria-hidden
                      className="flex flex-wrap gap-0.5"
                      style={{ maxWidth: 24 * 10 }}
                    >
                      {Array.from({ length: d.ports.total }, (_, i) => (
                        <motion.span
                          key={i}
                          className="size-2 rounded-[2px]"
                          initial={
                            motionSafe
                              ? { opacity: 0, scale: 0.6 }
                              : { opacity: 1, scale: 1 }
                          }
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{
                            ...springs.flick,
                            delay: r3(i * cascade(d.ports?.total ?? 1) * 0.5),
                          }}
                          style={{
                            backgroundColor:
                              i < (d.ports?.used ?? 0)
                                ? "var(--re-accent)"
                                : "transparent",
                            boxShadow:
                              i < (d.ports?.used ?? 0)
                                ? undefined
                                : "inset 0 0 0 1px var(--hairline-strong)",
                          }}
                        />
                      ))}
                    </div>
                    <Meter
                      value={d.ports.used / Math.max(1, d.ports.total)}
                      tone="var(--re-accent)"
                      motionSafe={motionSafe}
                    />
                  </>
                ) : (
                  <p className="text-[12px] text-ink-2">
                    {blank ? "A filler has no ports." : "No ports recorded."}
                  </p>
                )}
              </div>
            ) : (
              <dl className="flex flex-col gap-2.5">
                <Row label="Draw">{fmtW(d.watts)} W</Row>
                <div className="flex flex-col gap-1.5">
                  <Row label="Of rack draw">{Math.round(share * 100)}%</Row>
                  <Meter
                    value={share}
                    tone="var(--re-accent)"
                    motionSafe={motionSafe}
                  />
                </div>
                <Row label="Of budget">{Math.round(ofBudget * 100)}%</Row>
                <Row label="Feed">
                  {d.feed ?? (d.kind === "pdu" ? "Supplies A" : "Unpowered")}
                </Row>
              </dl>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Power bar                                 */
/* ----------------------------------------------------------------------- */

function PowerBar({
  devices,
  budget,
  selectedId,
  motionSafe,
}: {
  /** Top of the rack first. */
  devices: RackDevice[];
  budget: number;
  selectedId: string | null;
  motionSafe: boolean;
}) {
  const total = rackDraw(devices);
  const over = budget > 0 && total > budget;
  const scale = budget > 0 ? (over ? 100 / total : 100 / budget) : 0;
  const pct = budget > 0 ? Math.round((total / budget) * 100) : 0;
  const drawing = devices.filter((d) => d.watts > 0);
  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-t border-hairline px-4 pt-2.5 pb-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Power budget
        </p>
        <p
          className={cn(
            "text-[12px] tabular-nums",
            over ? "text-danger" : "text-foreground",
          )}
        >
          {fmtW(total)} W{" "}
          <span className="text-ink-3">of {fmtW(budget)} W</span>
          <span className="ml-1.5 font-mono text-[11px] text-ink-2">
            {pct}%
          </span>
        </p>
      </div>
      <div
        role="meter"
        aria-label="Power drawn against the budget"
        aria-valuemin={0}
        aria-valuemax={budget}
        aria-valuenow={Math.min(total, Math.max(budget, total))}
        aria-valuetext={`${fmtW(total)} watts of ${fmtW(budget)}, ${pct} percent${over ? ", over budget" : ""}`}
        className={cn(
          "relative h-2 w-full overflow-hidden rounded-full",
          over
            ? "bg-[color-mix(in_oklab,var(--danger)_16%,var(--bg-2))]"
            : "bg-surface-2",
        )}
      >
        <div className="absolute inset-y-0 left-0 flex w-full">
          {drawing.map((d) => (
            <motion.span
              key={d.id}
              layout={motionSafe ? true : false}
              transition={{ layout: springs.glide }}
              className="h-full shrink-0 border-r border-card last:border-r-0"
              style={{
                width: `${r3(d.watts * scale)}%`,
                backgroundColor:
                  d.id === selectedId
                    ? "var(--re-accent)"
                    : over
                      ? "color-mix(in oklab, var(--danger) 70%, var(--ink-3))"
                      : "color-mix(in oklab, var(--ink-2) 55%, transparent)",
              }}
            />
          ))}
        </div>
        {over ? (
          <span
            aria-hidden
            className="absolute inset-y-0 w-px bg-danger"
            style={{ left: `${r3(budget * scale)}%` }}
          />
        ) : null}
      </div>
      <p className="text-[11px] text-ink-3 tabular-nums">
        {over
          ? `Over by ${fmtW(total - budget)} W`
          : `${fmtW(budget - total)} W headroom`}
        {selectedId
          ? (() => {
              const s = devices.find((d) => d.id === selectedId);
              return s && s.watts > 0 ? ` · ${s.name} is the lit segment` : "";
            })()
          : ""}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Carry = {
  id: string;
  /** The candidate run's lowest unit. */
  bottom: number;
  /** Pointer travel from the block's resting place in px; null when keys carry it. */
  offset: number | null;
};

type Drag = {
  id: string;
  pointerId: number;
  startY: number;
  startScroll: number;
  /** Which unit of the block the pointer took hold of, from its bottom. */
  grabU: number;
  height: number;
  origin: number;
  bottom: number;
  moved: boolean;
};

/**
 * A 42U rack drawn as a column of unit slots with its devices mounted in
 * runs — switches, servers, storage, a patch panel, blanks and a PDU — each
 * faceplate carrying its name, model, draw and a health dot. Drag a device
 * (or press Space on it) and it lifts on `springs.flick`; a dashed run snaps
 * along the rack on `springs.snap` to show where it would land, in the
 * accent when the units are free and in red when they are not. Let go and it
 * glides into the run on `springs.glide` while the units it left open behind
 * it; drop it on another device and it shakes back on a small
 * `springs.recoil`. A panel beside the rack inspects the selected device —
 * status, ports and power on a tablist — with its health dot beating at a
 * tempo set by its state, and a bar at the foot sums the draw against the
 * budget with the selected device's share lit.
 *
 * The rack is one listbox: Up and Down move through the devices, Space picks
 * one up, Up and Down then carry it one unit at a time, Space drops it and
 * Escape puts it back. Under reduced motion nothing travels: a device
 * appears in its new run, the candidate outline moves in place, the dot does
 * not beat, and every change is still announced.
 */
export function RackElevation({
  face = "front",
  units: unitsProp = 42,
  accent = "cobalt",
  devices,
  defaultDevices = defaultRackDevices,
  onMove,
  selected,
  defaultSelected = "sw-core-1",
  onSelect,
  powerBudget = 5000,
  now = defaultRackNow,
  status = "ready",
  onRetry,
  title = "Rack C-07",
  label,
  height = 560,
  disabled = false,
  className,
}: RackElevationProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;

  const [ownDevices, setOwnDevices] = React.useState(defaultDevices);
  const list = devices ?? ownDevices;
  const [ownSelected, setOwnSelected] = React.useState<string | null>(
    defaultSelected,
  );
  const sel = selected !== undefined ? selected : ownSelected;

  const [tab, setTab] = React.useState<RackTab>("status");
  const [carry, setCarry] = React.useState<Carry | null>(null);
  const [shake, setShake] = React.useState<{ id: string; seq: number } | null>(
    null,
  );
  const [vacated, setVacated] = React.useState<{
    run: RackRun;
    seq: number;
  } | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const [avail, setAvail] = React.useState<number | null>(null);
  const [onScreen, setOnScreen] = React.useState(true);
  const [tabVisible, setTabVisible] = React.useState(true);
  // False for the server render and hydration; true once mounted, so the
  // ports grid only cascades in for a reader who is actually watching.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  // The viewport is held twice: as state, so the measuring effect re-runs
  // when it mounts, and as a ref, so pointer handlers can scroll it.
  const [viewport, setViewport] = React.useState<HTMLDivElement | null>(null);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const bindViewport = React.useCallback((node: HTMLDivElement | null) => {
    viewportRef.current = node;
    setViewport(node);
  }, []);
  const optionNodes = React.useRef(new Map<string, HTMLDivElement>());
  const dragRef = React.useRef<Drag | null>(null);
  const vacateTimer = React.useRef<number | null>(null);
  const seq = React.useRef(0);

  const ready = status === "ready";
  const inert = disabled || !ready;
  const units = clamp(Math.round(unitsProp), 1, 99);
  const budget = Math.max(0, powerBudget);

  /* -------------------------------- data ------------------------------- */

  const placed = list
    .filter((d) => d.bottom >= 1 && d.bottom + d.height - 1 <= units)
    .sort(byPosition);
  const stranded = list.filter(
    (d) => !(d.bottom >= 1 && d.bottom + d.height - 1 <= units),
  );
  const byId = new Map(list.map((d) => [d.id, d]));
  const selectedDevice = sel ? (byId.get(sel) ?? null) : null;
  const empty = list.length === 0;
  const usedUnits = placed.reduce((n, d) => n + d.height, 0);
  const total = rackDraw(placed);

  const uH =
    avail === null
      ? MIN_U
      : clamp(Math.floor((avail - PAD * 2) / units), MIN_U, MAX_U);

  const active =
    activeId && placed.some((d) => d.id === activeId)
      ? activeId
      : sel && placed.some((d) => d.id === sel)
        ? sel
        : (placed[0]?.id ?? null);

  /* ----------------------------- observers ----------------------------- */

  React.useEffect(() => {
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setAvail(Math.floor(viewport.clientHeight));
    });
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [viewport]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onVisibility = () => setTabVisible(!document.hidden);
    onVisibility();
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

  React.useEffect(
    () => () => {
      if (vacateTimer.current !== null)
        window.clearTimeout(vacateTimer.current);
    },
    [],
  );

  /* ------------------------------ selection ---------------------------- */

  const select = (id: string | null) => {
    if (id === sel) return;
    if (selected === undefined) setOwnSelected(id);
    onSelect?.(id, id ? (byId.get(id) ?? null) : null);
  };

  const focusOption = (id: string) => {
    setActiveId(id);
    const node = optionNodes.current.get(id);
    node?.focus({ preventScroll: true });
    node?.scrollIntoView({ block: "nearest" });
  };

  /* -------------------------------- moves ------------------------------ */

  const conflictWith = (run: RackRun, ignoreId: string) =>
    placed.find((d) => d.id !== ignoreId && overlaps(d, run)) ?? null;

  const commit = (dev: RackDevice, to: number) => {
    if (to === dev.bottom) {
      setAnnouncement(`${dev.name} stays at ${unitWords(dev)}.`);
      return;
    }
    const next = list.map((d) => (d.id === dev.id ? { ...d, bottom: to } : d));
    if (devices === undefined) setOwnDevices(next);
    onMove?.({ id: dev.id, from: dev.bottom, to }, next);
    seq.current += 1;
    setVacated({
      run: { bottom: dev.bottom, height: dev.height },
      seq: seq.current,
    });
    if (vacateTimer.current !== null) window.clearTimeout(vacateTimer.current);
    vacateTimer.current = window.setTimeout(() => {
      vacateTimer.current = null;
      setVacated(null);
    }, VACATE_MS);
    setAnnouncement(
      `${dev.name} moved to ${unitWords({ bottom: to, height: dev.height })}.`,
    );
  };

  /** Lands a carried device, or refuses with a shake. True when it landed. */
  const drop = (id: string, to: number) => {
    const dev = byId.get(id);
    if (!dev) return false;
    const run = { bottom: to, height: dev.height };
    if (!fitsRun(placed, run, units, id)) {
      const other = conflictWith(run, id);
      seq.current += 1;
      setShake({ id, seq: seq.current });
      setAnnouncement(
        `${unitWords(run)} ${other ? `is taken by ${other.name}` : "is outside the rack"}. ${dev.name} stays at ${unitWords(dev)}.`,
      );
      return false;
    }
    commit(dev, to);
    return true;
  };

  const cancelCarry = (id: string) => {
    const dev = byId.get(id);
    setCarry(null);
    if (dev)
      setAnnouncement(`Put back. ${dev.name} stays at ${unitWords(dev)}.`);
  };

  /* ------------------------------- pointer ----------------------------- */

  const pointerUnit = (clientY: number, vp: HTMLDivElement) => {
    const rect = vp.getBoundingClientRect();
    const y = clientY - rect.top + vp.scrollTop - PAD;
    return units - Math.floor(y / uH);
  };

  const onPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    dev: RackDevice,
  ) => {
    const vp = viewportRef.current;
    if (inert || event.button !== 0 || !vp) return;
    const onGrip =
      (event.target as HTMLElement | null)?.closest("[data-grip]") !== null;
    // A finger on the plate scrolls the rack; only the grip carries. A mouse
    // can take hold anywhere.
    if (event.pointerType !== "mouse" && !onGrip) return;
    if (carry && carry.id !== dev.id) setCarry(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: dev.id,
      pointerId: event.pointerId,
      startY: event.clientY,
      startScroll: vp.scrollTop,
      grabU: clamp(
        pointerUnit(event.clientY, vp) - dev.bottom,
        0,
        dev.height - 1,
      ),
      height: dev.height,
      origin: dev.bottom,
      bottom: dev.bottom,
      moved: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const vp = viewportRef.current;
    if (!d || d.pointerId !== event.pointerId || !vp) return;
    const dy = event.clientY - d.startY;
    if (!d.moved) {
      if (Math.abs(dy) < DRAG_THRESHOLD) return;
      d.moved = true;
      const dev = byId.get(d.id);
      if (dev) setAnnouncement(`Picked up ${dev.name} from ${unitWords(dev)}.`);
    }
    event.preventDefault();
    // Near either edge the rack scrolls with the pointer, by a step per
    // move event rather than a loop, so nothing runs once the hand stops.
    const rect = vp.getBoundingClientRect();
    if (event.clientY < rect.top + EDGE) {
      vp.scrollTop -= Math.ceil((rect.top + EDGE - event.clientY) / 3);
    } else if (event.clientY > rect.bottom - EDGE) {
      vp.scrollTop += Math.ceil((event.clientY - rect.bottom + EDGE) / 3);
    }
    const bottom = clamp(
      pointerUnit(event.clientY, vp) - d.grabU,
      1,
      Math.max(1, units - d.height + 1),
    );
    d.bottom = bottom;
    setCarry({
      id: d.id,
      bottom,
      offset: dy + (vp.scrollTop - d.startScroll),
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (!d.moved) return; // A tap: the click that follows selects.
    setCarry(null);
    drop(d.id, d.bottom);
  };

  const onPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (d.moved) cancelCarry(d.id);
  };

  /* ------------------------------ keyboard ----------------------------- */

  const onOptionKey = (
    event: React.KeyboardEvent<HTMLDivElement>,
    dev: RackDevice,
  ) => {
    const carrying = carry?.id === dev.id && carry.offset === null;
    const maxBottom = Math.max(1, units - dev.height + 1);

    if (carrying && carry) {
      let to: number | null = null;
      if (event.key === "ArrowUp") to = Math.min(maxBottom, carry.bottom + 1);
      else if (event.key === "ArrowDown") to = Math.max(1, carry.bottom - 1);
      else if (event.key === "Home") to = maxBottom;
      else if (event.key === "End") to = 1;
      else if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (drop(dev.id, carry.bottom)) setCarry(null);
        return;
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelCarry(dev.id);
        return;
      }
      if (to === null) return;
      event.preventDefault();
      const run = { bottom: to, height: dev.height };
      setCarry({ id: dev.id, bottom: to, offset: null });
      const other = conflictWith(run, dev.id);
      setAnnouncement(
        `${unitWords(run)}${other ? `, taken by ${other.name}` : ", free"}.`,
      );
      optionNodes.current.get(dev.id)?.scrollIntoView({ block: "nearest" });
      return;
    }

    const i = placed.findIndex((d) => d.id === dev.id);
    let to = -1;
    if (event.key === "ArrowUp") to = i - 1;
    else if (event.key === "ArrowDown") to = i + 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = placed.length - 1;
    else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      select(dev.id);
      if (inert) return;
      setCarry({ id: dev.id, bottom: dev.bottom, offset: null });
      setAnnouncement(
        `Picked up ${dev.name} at ${unitWords(dev)}. Up and Down move it one unit, Space drops it, Escape puts it back.`,
      );
      return;
    } else if (event.key === "Escape" && carry) {
      event.preventDefault();
      cancelCarry(carry.id);
      return;
    } else return;
    event.preventDefault();
    const target = placed[clamp(to, 0, placed.length - 1)];
    if (!target) return;
    select(target.id);
    focusOption(target.id);
  };

  const onListBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (carry && carry.offset === null && !event.currentTarget.contains(next)) {
      cancelCarry(carry.id);
    }
  };

  /* ------------------------------- render ------------------------------ */

  const color = accent in ACCENTS ? ACCENTS[accent as RackAccent] : accent;
  const awake = onScreen && tabVisible;
  const rackHeight = units * uH + PAD * 2;
  const carryRun =
    carry && byId.get(carry.id)
      ? { bottom: carry.bottom, height: byId.get(carry.id)?.height ?? 1 }
      : null;
  const carryFits = carryRun
    ? fitsRun(placed, carryRun, units, carry?.id)
    : true;
  const carriedDevice = carry ? (byId.get(carry.id) ?? null) : null;
  const inRun = (u: number, run: RackRun | null) =>
    run !== null && u >= run.bottom && u <= run.bottom + run.height - 1;

  const rails = (
    <>
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 border-r border-hairline"
        style={{
          width: RAIL,
          backgroundImage:
            "radial-gradient(circle, var(--hairline-strong) 1px, transparent 1.4px)",
          backgroundSize: `${RAIL}px ${r3(uH / 3)}px`,
          backgroundPosition: `0 ${r3(uH / 6)}px`,
        }}
      />
      <span
        aria-hidden
        className="absolute inset-y-0 right-0 border-l border-hairline"
        style={{
          width: RAIL,
          backgroundImage:
            "radial-gradient(circle, var(--hairline-strong) 1px, transparent 1.4px)",
          backgroundSize: `${RAIL}px ${r3(uH / 3)}px`,
          backgroundPosition: `0 ${r3(uH / 6)}px`,
        }}
      />
    </>
  );

  const slotLines = {
    backgroundImage:
      "repeating-linear-gradient(to bottom, var(--hairline) 0 1px, transparent 1px 100%)",
    backgroundSize: `100% ${uH}px`,
  };

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
      style={{ height, ["--re-accent" as string]: color }}
    >
      <p id={hintId} className="sr-only">
        Space picks the device up. Up and Down then move it one unit, Space
        drops it, Escape puts it back.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          <p className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {units}U ·{" "}
            {face === "front"
              ? "Front"
              : face === "rear"
                ? "Rear"
                : "Schematic"}
          </p>
        </div>
        {ready ? (
          <p className="shrink-0 text-[12px] text-ink-2 tabular-nums">
            <span className="text-foreground">{placed.length}</span>{" "}
            <span className="hidden @min-[24rem]:inline">
              {placed.length === 1 ? "device" : "devices"} ·{" "}
            </span>
            <span className="@min-[24rem]:hidden">· </span>
            <span className="text-foreground">{usedUnits}</span> of {units}U
          </p>
        ) : null}
      </header>

      {ready && stranded.length > 0 ? (
        <p className="shrink-0 truncate px-4 pb-2 text-[11px] text-warn">
          {stranded.length === 1
            ? "1 device sits"
            : `${stranded.length} devices sit`}{" "}
          above U{units} and {stranded.length === 1 ? "is" : "are"} not drawn:{" "}
          {stranded.map((d) => d.name).join(", ")}.
        </p>
      ) : null}

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 border-t border-hairline px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The rack&apos;s inventory didn&apos;t load.
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
              Retry
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col border-t border-hairline @min-[36rem]:flex-row">
          {/* ------------------------------ rack ----------------------------- */}
          <div
            ref={bindViewport}
            className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
          >
            {status === "loading" ? (
              <div
                aria-hidden
                className="relative"
                style={{ height: Math.max(rackHeight, 240) }}
              >
                <div
                  className="absolute inset-x-2 rounded-2 border border-hairline-strong bg-surface-1"
                  style={{ top: PAD, bottom: PAD, left: GUTTER, ...slotLines }}
                >
                  {rails}
                  {[0, 1, 2, 4, 5, 8, 10, 11, 14, 15, 16, 17].map((slot, i) => (
                    <span
                      key={slot}
                      className="absolute rounded-1 bg-surface-2 motion-safe:animate-pulse"
                      style={{
                        left: RAIL + 2,
                        right: RAIL + 2,
                        top: slot * uH + 1,
                        height: (i % 3 === 2 ? 2 : 1) * uH - 2,
                        animationDelay: `${i * 70}ms`,
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="relative" style={{ height: rackHeight }}>
                {/* U numbers */}
                <div
                  aria-hidden
                  className="absolute top-0 left-0"
                  style={{ width: GUTTER, paddingTop: PAD }}
                >
                  {Array.from({ length: units }, (_, i) => {
                    const u = units - i;
                    const lit =
                      inRun(u, carryRun) ||
                      (carryRun === null &&
                        selectedDevice !== null &&
                        inRun(u, selectedDevice));
                    const gone = inRun(u, vacated?.run ?? null);
                    return (
                      <span
                        key={u}
                        className={cn(
                          "flex items-center justify-end pr-1.5 font-mono text-[9px] tabular-nums transition-colors duration-150",
                          lit
                            ? carryRun && !carryFits
                              ? "text-danger"
                              : "text-(--re-accent)"
                            : gone
                              ? "text-ink-2"
                              : "text-ink-3",
                        )}
                        style={{ height: uH }}
                      >
                        {u}
                      </span>
                    );
                  })}
                </div>

                {/* The frame */}
                <div
                  className="absolute right-2 rounded-2 border border-hairline-strong bg-surface-1"
                  style={{ top: PAD, bottom: PAD, left: GUTTER, ...slotLines }}
                >
                  {rails}
                  {/* Keyed on the unit size: a re-measure remounts every
                      block at its new place, so only a move ever glides. */}
                  <div
                    key={uH}
                    role="listbox"
                    aria-label={`${title}, devices from the top`}
                    aria-describedby={hintId}
                    aria-activedescendant={
                      active ? `${uid}-opt-${active}` : undefined
                    }
                    onBlur={onListBlur}
                    className="absolute inset-y-0"
                    style={{ left: RAIL + 1, right: RAIL + 1 }}
                  >
                    {/* The run a carried device left, held open while it is
                        away and lingering a beat after it lands elsewhere. */}
                    {carriedDevice ? (
                      <span
                        aria-hidden
                        className="absolute inset-x-0 rounded-1 border border-dashed border-hairline-strong"
                        style={{
                          top: topOf(carriedDevice, units) * uH + 1,
                          height: carriedDevice.height * uH - 2,
                        }}
                      />
                    ) : null}
                    {vacated && !carry ? (
                      <motion.span
                        key={vacated.seq}
                        aria-hidden
                        className="absolute inset-x-0 rounded-1 border border-dashed border-ink-3"
                        style={{
                          top: topOf(vacated.run, units) * uH + 1,
                          height: vacated.run.height * uH - 2,
                        }}
                        initial={{ opacity: 0.9 }}
                        animate={{ opacity: 0 }}
                        transition={{
                          duration: VACATE_MS / 1000,
                          ease: easings.exit,
                        }}
                      />
                    ) : null}

                    {/* Where the carried device would land. */}
                    <AnimatePresence>
                      {carryRun ? (
                        <motion.span
                          key="ghost"
                          aria-hidden
                          className={cn(
                            "absolute inset-x-0 z-0 rounded-1 border border-dashed",
                            carryFits
                              ? "border-(--re-accent)"
                              : "border-danger",
                          )}
                          style={{
                            top: 1,
                            height: carryRun.height * uH - 2,
                            backgroundColor: carryFits
                              ? "color-mix(in oklab, var(--re-accent) 14%, transparent)"
                              : "color-mix(in oklab, var(--danger) 14%, transparent)",
                          }}
                          initial={{
                            opacity: 0,
                            y: topOf(carryRun, units) * uH,
                          }}
                          animate={{
                            opacity: 1,
                            y: topOf(carryRun, units) * uH,
                          }}
                          exit={{
                            opacity: 0,
                            transition: exitFor(durations.fast),
                          }}
                          transition={{
                            y: motionSafe ? springs.snap : { duration: 0 },
                            opacity: {
                              duration: durations.fast,
                              ease: easings.enter,
                            },
                          }}
                        />
                      ) : null}
                    </AnimatePresence>

                    {placed.map((d) => {
                      const isCarried = carry?.id === d.id;
                      const pointerCarried =
                        isCarried && carry !== null && carry.offset !== null;
                      const restingRun =
                        isCarried && carry && carry.offset === null
                          ? { bottom: carry.bottom, height: d.height }
                          : d;
                      const top = topOf(restingRun, units) * uH;
                      const y =
                        pointerCarried && carry
                          ? top + (carry.offset ?? 0)
                          : top;
                      return (
                        <DeviceBlock
                          key={d.id}
                          device={d}
                          face={face}
                          uH={uH}
                          y={y}
                          carried={isCarried}
                          pointerCarried={pointerCarried}
                          selected={d.id === sel}
                          tabIndex={d.id === active ? 0 : -1}
                          shakeSeq={shake?.id === d.id ? shake.seq : 0}
                          motionSafe={motionSafe}
                          disabled={inert}
                          optionId={`${uid}-opt-${d.id}`}
                          hintId={hintId}
                          nodeRef={(node) => {
                            if (node) optionNodes.current.set(d.id, node);
                            else optionNodes.current.delete(d.id);
                          }}
                          onPointerDown={(event) => onPointerDown(event, d)}
                          onPointerMove={onPointerMove}
                          onPointerUp={onPointerUp}
                          onPointerCancel={onPointerCancel}
                          onClick={() => {
                            select(d.id);
                            setActiveId(d.id);
                          }}
                          onFocus={() => setActiveId(d.id)}
                          onKeyDown={(event) => onOptionKey(event, d)}
                        />
                      );
                    })}
                  </div>
                </div>

                {empty ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                    <div className="flex max-w-[16rem] flex-col items-center gap-1.5 rounded-3 border border-hairline bg-card/90 px-4 py-3 text-center backdrop-blur-sm">
                      <Server aria-hidden className="size-4 text-ink-3" />
                      <p className="text-sm text-foreground">An empty rack.</p>
                      <p className="text-[11px] text-ink-3">
                        Add the first device and it mounts here.
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* ----------------------------- panel ----------------------------- */}
          <aside
            aria-label="Device detail"
            className="flex max-h-[46%] shrink-0 flex-col border-t border-hairline bg-surface-0 @min-[36rem]:max-h-none @min-[36rem]:w-[236px] @min-[36rem]:border-t-0 @min-[36rem]:border-l @min-[48rem]:w-[280px]"
          >
            {status === "loading" ? (
              <div aria-hidden className="flex flex-col gap-2.5 px-3.5 py-3">
                {[72, 48, 88, 60, 80].map((w, i) => (
                  <span
                    key={i}
                    className="h-3 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                    style={{ width: `${w}%`, animationDelay: `${i * 90}ms` }}
                  />
                ))}
              </div>
            ) : (
              <DetailPanel
                device={selectedDevice}
                empty={empty}
                tab={tab}
                onTab={setTab}
                rackDraw={total}
                budget={budget}
                now={now}
                awake={awake && live}
                motionSafe={motionSafe}
                uid={uid}
              />
            )}
          </aside>
        </div>
      )}

      {status === "loading" ? (
        <div
          aria-hidden
          className="flex shrink-0 flex-col gap-2 border-t border-hairline px-4 pt-2.5 pb-3"
        >
          <span className="h-3 w-24 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
          <span className="h-2 w-full rounded-full bg-surface-2 motion-safe:animate-pulse" />
        </div>
      ) : status === "ready" ? (
        <PowerBar
          devices={placed}
          budget={budget}
          selectedId={sel}
          motionSafe={motionSafe}
        />
      ) : null}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
