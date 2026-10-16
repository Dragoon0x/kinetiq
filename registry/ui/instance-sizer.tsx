"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Archive,
  BellRing,
  Ban,
  ChevronLeft,
  HardDrive,
  MapPin,
  Network,
  Power,
  RotateCcw,
  Server,
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

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type InstanceSizerStep = "region" | "size" | "addons" | "summary";
export type InstanceSizerRackStyle = "line" | "solid" | "plan";
export type InstanceSizerDensity = "compact" | "regular" | "roomy";
export type InstanceSizerStatus = "ready" | "loading" | "error";
/** Where an add-on lives on the rack: a shelf, a unit, a panel, or the beacon on top. */
export type InstanceSizerPart = "storage" | "backup" | "network" | "beacon";

export type InstanceSizerRegion = {
  id: string;
  name: string;
  /** The region's short code. */
  code: string;
  /** How far it is from the visitor, as a short note. */
  latency?: string;
  /** Price multiplier for sizes in this region; 1 is the list price. */
  factor: number;
};

export type InstanceSizerSize = {
  id: string;
  name: string;
  /** Virtual CPUs. */
  cpu: number;
  /** Memory in GB. */
  memory: number;
  /** Rack units the server takes: one sled per unit. */
  units: number;
  /** Monthly list price before the region's factor. */
  price: number;
  /** A short tag beside the name, e.g. "Popular". */
  tag?: string;
  /** Region id → why this size is not offered there. */
  unavailable?: Record<string, string>;
};

export type InstanceSizerAddon = {
  id: string;
  name: string;
  description: string;
  /** Monthly price. */
  price: number;
  /** What it adds to the rack. */
  part: InstanceSizerPart;
};

export type InstanceSizerConfig = {
  region: string;
  size: string;
  addons: string[];
};

export type InstanceSizerProps = {
  /** Where the environment can run. @default defaultInstanceSizerRegions */
  regions?: InstanceSizerRegion[];
  /** Server sizes, smallest first. @default defaultInstanceSizerSizes */
  sizes?: InstanceSizerSize[];
  /** Optional extras. @default defaultInstanceSizerAddons */
  addons?: InstanceSizerAddon[];
  /** Controlled configuration. */
  value?: InstanceSizerConfig;
  /** Initial configuration when uncontrolled. @default defaultInstanceSizerConfig */
  defaultValue?: InstanceSizerConfig;
  /** Fires from the card, switch or key that changed the configuration. */
  onValueChange?: (config: InstanceSizerConfig) => void;
  /** Controlled step. */
  step?: InstanceSizerStep;
  /** The step to open on when uncontrolled. @default "region" */
  defaultStep?: InstanceSizerStep;
  /** Fires from Next, Back, the stepper or a Change link with the step asked for. */
  onStepChange?: (step: InstanceSizerStep) => void;
  /** Fires from Provision with the configuration and its monthly estimate. */
  onProvision?: (config: InstanceSizerConfig, monthly: number) => void;
  /** How the rack is drawn: hairline, solid metal faces, or a dashed plan. @default "line" */
  rackStyle?: InstanceSizerRackStyle;
  /** Card padding and type size. @default "regular" */
  density?: InstanceSizerDensity;
  /** Rings, lights, the estimate and Provision — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The cabinet's height in rack units, 10 to 20. @default 12 */
  rackUnits?: number;
  /** Formats every amount. @default US dollars with cents */
  format?: (amount: number) => string;
  /** The environment's name, shown in the summary. @default "telemetry-prod" */
  environment?: string;
  /** The wizard's heading. @default "New environment" */
  title?: string;
  /** Whether the catalogue has arrived. @default "ready" */
  status?: InstanceSizerStatus;
  /** "Try again" was pressed after the catalogue failed to load. */
  onRetry?: () => void;
  /** Height of the surface in px; the step body scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be chosen or provisioned. @default false */
  disabled?: boolean;
  /** Classes for the surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultInstanceSizerRegions: InstanceSizerRegion[] = [
  {
    id: "hn-1",
    name: "Harbour North",
    code: "hn-1",
    latency: "9 ms",
    factor: 1,
  },
  {
    id: "cv-1",
    name: "Coldbrook Valley",
    code: "cv-1",
    latency: "14 ms",
    factor: 1.06,
  },
  { id: "fl-2", name: "Fenlands", code: "fl-2", latency: "27 ms", factor: 0.9 },
  {
    id: "bs-3",
    name: "Basin South",
    code: "bs-3",
    latency: "38 ms",
    factor: 0.94,
  },
];

export const defaultInstanceSizerSizes: InstanceSizerSize[] = [
  { id: "s1", name: "Small", cpu: 2, memory: 4, units: 1, price: 24 },
  {
    id: "m1",
    name: "Medium",
    cpu: 4,
    memory: 16,
    units: 2,
    price: 68,
    tag: "Popular",
  },
  { id: "l1", name: "Large", cpu: 8, memory: 32, units: 3, price: 132 },
  {
    id: "x1",
    name: "X-Large",
    cpu: 16,
    memory: 64,
    units: 5,
    price: 268,
    unavailable: { "fl-2": "Fenlands has no 16-core hosts until January." },
  },
  {
    id: "c1",
    name: "Compute",
    cpu: 32,
    memory: 128,
    units: 7,
    price: 520,
    unavailable: {
      "fl-2": "Fenlands has no 32-core hosts.",
      "bs-3": "Basin South is full for 32-core hosts this month.",
    },
  },
];

export const defaultInstanceSizerAddons: InstanceSizerAddon[] = [
  {
    id: "backups",
    name: "Nightly backups",
    description: "Kept 30 days, restored in place.",
    price: 14,
    part: "backup",
  },
  {
    id: "network",
    name: "Private network",
    description: "A patch panel to your other environments.",
    price: 9,
    part: "network",
  },
  {
    id: "storage",
    name: "Extra storage",
    description: "500 GB on its own drive shelf.",
    price: 22,
    part: "storage",
  },
  {
    id: "alerts",
    name: "Uptime alerts",
    description: "Pages the on-call when checks fail.",
    price: 5,
    part: "beacon",
  },
];

export const defaultInstanceSizerConfig: InstanceSizerConfig = {
  region: "hn-1",
  size: "m1",
  addons: ["backups"],
};

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const STEPS: InstanceSizerStep[] = ["region", "size", "addons", "summary"];
const STEP_LABEL: Record<InstanceSizerStep, string> = {
  region: "Region",
  size: "Size",
  addons: "Add-ons",
  summary: "Summary",
};
const STEP_TITLE: Record<InstanceSizerStep, string> = {
  region: "Where should it run?",
  size: "How big should it be?",
  addons: "Anything else?",
  summary: "Check and provision",
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const cents = (v: number) => Math.round(v * 100) / 100;
const grouped = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Dollars by hand: a locale lookup during render would not survive hydration. */
const usd = (amount: number) => {
  const c = Math.round(Math.abs(amount) * 100);
  return `${amount < 0 ? "−" : ""}$${grouped(Math.floor(c / 100))}.${String(c % 100).padStart(2, "0")}`;
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const DENSITY: Record<
  InstanceSizerDensity,
  { px: string; py: string; gap: string; card: string; body: string }
> = {
  compact: {
    px: "px-3",
    py: "py-2.5",
    gap: "gap-1.5",
    card: "px-2.5 py-2",
    body: "text-[12px] leading-[18px]",
  },
  regular: {
    px: "px-4",
    py: "py-3",
    gap: "gap-2",
    card: "px-3 py-2.5",
    body: "text-[13px] leading-5",
  },
  roomy: {
    px: "px-5",
    py: "py-4",
    gap: "gap-3",
    card: "px-3.5 py-3.5",
    body: "text-sm leading-6",
  },
};

const PART_ICON: Record<InstanceSizerPart, typeof Archive> = {
  storage: HardDrive,
  backup: Archive,
  network: Network,
  beacon: BellRing,
};
const PART_UNITS: Record<InstanceSizerPart, number> = {
  storage: 2,
  backup: 1,
  network: 1,
  beacon: 0,
};

function sizePrice(size: InstanceSizerSize, region?: InstanceSizerRegion) {
  return cents(size.price * (region?.factor ?? 1));
}

/** The monthly total for a configuration. Exported so a host can quote it elsewhere. */
export function estimateInstanceSizer(
  config: InstanceSizerConfig,
  regions: InstanceSizerRegion[] = defaultInstanceSizerRegions,
  sizes: InstanceSizerSize[] = defaultInstanceSizerSizes,
  addons: InstanceSizerAddon[] = defaultInstanceSizerAddons,
): number {
  const region = regions.find((r) => r.id === config.region);
  const size = sizes.find((s) => s.id === config.size);
  const extra = addons
    .filter((a) => config.addons.includes(a.id))
    .reduce((sum, a) => sum + a.price, 0);
  return cents((size ? sizePrice(size, region) : 0) + extra);
}

const factorNote = (factor: number) =>
  Math.abs(factor - 1) < 0.005
    ? "List price"
    : `${factor > 1 ? "+" : "−"}${Math.round(Math.abs(factor - 1) * 100)}%`;

/* ----------------------------------------------------------------------- */
/*                                The odometer                              */
/* ----------------------------------------------------------------------- */

/**
 * One digit's wheel. It turns the way the total moved — up through 9 → 0
 * when the total grows, down when it shrinks — on snap, then quietly
 * re-centres onto the first copy of the strip.
 */
function Wheel({
  digit,
  dir,
  line,
  motionSafe,
}: {
  digit: number;
  dir: number;
  line: number;
  motionSafe: boolean;
}) {
  const y = useMotionValue(-digit * line);
  const from = React.useRef(digit);
  React.useEffect(() => {
    const prev = from.current;
    from.current = digit;
    // Anything left mid-roll on the second copy comes back to the first.
    const at = -y.get() / line;
    if (at > 9.5) y.jump(-(at - 10) * line);
    if (prev === digit) {
      y.jump(-digit * line);
      return;
    }
    if (!motionSafe) {
      y.jump(-digit * line);
      return;
    }
    let target = digit;
    if (dir >= 0 && digit < prev) target = digit + 10;
    if (dir < 0 && digit > prev) y.jump(-(prev + 10) * line);
    const ctl = animate(y, -target * line, {
      ...springs.snap,
      onComplete: () => y.jump(-digit * line),
    });
    return () => ctl.stop();
  }, [digit, dir, line, motionSafe, y]);
  return (
    <span
      className="relative inline-block overflow-hidden"
      style={{ height: line, width: "1ch" }}
    >
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{ y }}
      >
        {Array.from({ length: 20 }, (_, i) => (
          <span
            key={i}
            className="block text-center"
            style={{ height: line, lineHeight: `${line}px` }}
          >
            {i % 10}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

function Odometer({
  value,
  format,
  size,
  motionSafe,
}: {
  value: number;
  format: (n: number) => string;
  size: number;
  motionSafe: boolean;
}) {
  const [seen, setSeen] = React.useState({ value, dir: 1 });
  if (seen.value !== value) {
    setSeen({ value, dir: value >= seen.value ? 1 : -1 });
  }
  const text = format(value);
  const chars = text.split("");
  const line = Math.round(size * 1.2);
  return (
    <span
      aria-hidden
      className="inline-flex items-start font-mono font-medium tabular-nums"
      style={{ fontSize: size, height: line, lineHeight: `${line}px` }}
    >
      {chars.map((c, i) => {
        const fromRight = chars.length - i;
        return /\d/.test(c) ? (
          <Wheel
            key={`d${fromRight}`}
            digit={Number(c)}
            dir={seen.dir}
            line={line}
            motionSafe={motionSafe}
          />
        ) : (
          <span key={`c${fromRight}${c}`}>{c}</span>
        );
      })}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  The rack                                */
/* ----------------------------------------------------------------------- */

type RackLook = {
  rackStyle: InstanceSizerRackStyle;
  unit: number;
  narrow: boolean;
};

function faceClass(look: RackLook, invalid = false) {
  if (invalid)
    return "border border-dashed border-danger/60 bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--danger)_18%,transparent)_0_2px,transparent_2px_5px)]";
  if (look.rackStyle === "solid")
    return "border border-hairline-strong bg-surface-2 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--foreground)_10%,transparent)]";
  if (look.rackStyle === "plan")
    return "border border-dashed border-(--is-accent)/70 bg-(--is-wash)";
  return "border border-[color-mix(in_oklab,var(--foreground)_38%,transparent)] bg-transparent";
}

/** Vents: a few short rules, as many as the face has room for. */
function Vents({ look, count }: { look: RackLook; count: number }) {
  return (
    <span aria-hidden className="flex min-w-0 flex-1 items-center gap-[3px]">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-[45%] w-px shrink-0 rounded-full",
            look.rackStyle === "plan" ? "bg-(--is-accent)/60" : "bg-ink-3/60",
          )}
        />
      ))}
    </span>
  );
}

function Led({
  lit,
  powered,
  delay,
  powerDelay,
  motionSafe,
  arrive,
  small,
}: {
  small: boolean;
  lit: boolean;
  powered: boolean;
  delay: number;
  powerDelay: number;
  motionSafe: boolean;
  arrive: boolean;
}) {
  return (
    <motion.span
      aria-hidden
      className={cn(
        "shrink-0 rounded-full transition-[background-color,box-shadow] duration-300",
        small ? "size-[3px]" : "size-[5px]",
        powered
          ? "bg-(--is-power) shadow-[0_0_6px_var(--is-power)]"
          : lit
            ? "bg-(--is-accent)"
            : "bg-ink-3/50",
      )}
      style={{ transitionDelay: powered ? `${powerDelay}ms` : "0ms" }}
      initial={arrive && motionSafe ? { scale: 0.2, opacity: 0.2 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={
        motionSafe ? { ...springs.flick, delay: delay + 0.2 } : { duration: 0 }
      }
    />
  );
}

type Change = { from: number; to: number };

/**
 * A cabinet with numbered rails. The server is one sled per unit, slid in
 * from the right bottom-up on snap and pulled out top-down on the exit
 * ease; storage, backups and the patch panel hold fixed slots so a toggle
 * never shifts the rest, and alerts light the beacon on the roof.
 */
function Rack({
  rackUnits,
  sizeUnits,
  parts,
  look,
  powered,
  invalid,
  motionSafe,
  label,
}: {
  rackUnits: number;
  sizeUnits: number;
  parts: Set<InstanceSizerPart>;
  look: RackLook;
  powered: boolean;
  invalid: boolean;
  motionSafe: boolean;
  label: string;
}) {
  const [seen, setSeen] = React.useState<Change>({
    from: sizeUnits,
    to: sizeUnits,
  });
  if (seen.to !== sizeUnits) setSeen({ from: seen.to, to: sizeUnits });
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    const id = window.requestAnimationFrame(() => setArmed(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const u = look.unit;
  const serverBase = 4;
  const room = Math.max(0, rackUnits - serverBase);
  const shown = Math.min(sizeUnits, room);
  const pad = look.narrow ? 3 : 5;
  const rail = look.narrow ? 0 : 16;
  const step = cascade(Math.max(2, Math.abs(seen.to - seen.from) + 1));

  const slot = (fromU: number, units: number): React.CSSProperties => ({
    bottom: pad + (fromU - 1) * u,
    height: units * u - 1,
  });

  const sledRow = (k: number) => {
    const isNew = k >= seen.from && seen.to > seen.from;
    const delay = isNew ? (k - seen.from) * step : 0;
    return (
      <motion.div
        key={`sled-${k}`}
        custom={seen}
        className={cn(
          "absolute inset-x-0 flex items-center gap-1 overflow-hidden rounded-[2px]",
          look.narrow ? "px-0.5" : "px-1.5",
          faceClass(look, invalid),
        )}
        style={slot(serverBase + k, 1)}
        variants={{
          enter: { opacity: 0, x: motionSafe ? 18 : 0 },
          seated: { opacity: 1, x: 0 },
          leave: (c: Change) => ({
            opacity: 0,
            x: motionSafe ? 18 : 0,
            transition: {
              ...exitFor(durations.fast),
              delay: motionSafe ? Math.max(0, c.from - 1 - k) * step : 0,
            },
          }),
        }}
        initial={armed ? "enter" : false}
        animate="seated"
        exit="leave"
        transition={
          motionSafe
            ? {
                x: { ...springs.snap, delay },
                opacity: { duration: durations.fast, delay },
              }
            : { duration: durations.fast }
        }
      >
        {!look.narrow ? (
          <span
            aria-hidden
            className="size-[3px] shrink-0 rounded-full bg-ink-3/70"
          />
        ) : null}
        <Vents look={look} count={look.narrow ? 3 : 6} />
        <Led
          small={look.narrow}
          lit={!invalid}
          powered={powered}
          delay={delay}
          powerDelay={Math.round((k + 4) * 60)}
          motionSafe={motionSafe}
          arrive={armed && isNew}
        />
      </motion.div>
    );
  };

  const part = (kind: InstanceSizerPart, fromU: number, order: number) => {
    const units = PART_UNITS[kind];
    return (
      <motion.div
        key={kind}
        className={cn(
          "absolute inset-x-0 flex items-center gap-1 overflow-hidden rounded-[2px]",
          look.narrow ? "px-0.5" : "px-1.5",
          faceClass(look),
        )}
        style={slot(fromU, units)}
        initial={armed ? { opacity: 0, x: motionSafe ? 18 : 0 } : false}
        animate={{ opacity: 1, x: 0 }}
        exit={{
          opacity: 0,
          x: motionSafe ? 18 : 0,
          transition: exitFor(durations.fast),
        }}
        transition={
          motionSafe
            ? { x: springs.snap, opacity: { duration: durations.fast } }
            : { duration: durations.fast }
        }
      >
        {kind === "network" ? (
          <span
            aria-hidden
            className="flex min-w-0 flex-1 items-center gap-[2px]"
          >
            {Array.from({ length: look.narrow ? 4 : 8 }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-[50%] w-[4px] shrink-0 rounded-[1px] border",
                  look.rackStyle === "plan"
                    ? "border-(--is-accent)/60"
                    : "border-ink-3/60",
                )}
              />
            ))}
          </span>
        ) : kind === "storage" ? (
          <span
            aria-hidden
            className="grid min-w-0 flex-1 grid-cols-4 gap-[2px] self-stretch py-[2px]"
          >
            {Array.from({ length: 4 }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "rounded-[1px] border",
                  look.rackStyle === "plan"
                    ? "border-(--is-accent)/60"
                    : "border-ink-3/50",
                )}
              />
            ))}
          </span>
        ) : (
          <span aria-hidden className="flex min-w-0 flex-1 items-center">
            <span
              className={cn(
                "h-[3px] w-1/2 rounded-full",
                look.rackStyle === "plan"
                  ? "bg-(--is-accent)/60"
                  : "bg-ink-3/50",
              )}
            />
          </span>
        )}
        <Led
          small={look.narrow}
          lit
          powered={powered}
          delay={0}
          powerDelay={Math.round(order * 60)}
          motionSafe={motionSafe}
          arrive={armed}
        />
      </motion.div>
    );
  };

  const innerHeight = rackUnits * u + pad * 2;

  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "flex flex-col items-stretch",
        look.narrow ? "w-[4.75rem]" : "w-full",
      )}
    >
      <div aria-hidden className="flex h-3 items-end justify-center">
        <motion.span
          className={cn(
            "h-2 w-5 rounded-t-full border border-b-0 transition-[background-color,box-shadow,border-color] duration-300",
            parts.has("beacon")
              ? "border-transparent bg-(--is-accent) shadow-[0_-2px_10px_color-mix(in_oklab,var(--is-accent)_60%,transparent)]"
              : "border-hairline-strong bg-transparent",
          )}
          initial={false}
          animate={{ scaleY: parts.has("beacon") ? 1 : 0.6 }}
          style={{ originY: 1 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        />
      </div>
      <div
        aria-hidden
        className={cn(
          "relative rounded-2 border",
          look.rackStyle === "plan"
            ? "border-dashed border-(--is-accent)/70 bg-[linear-gradient(var(--is-grid)_1px,transparent_1px),linear-gradient(90deg,var(--is-grid)_1px,transparent_1px)] bg-[size:8px_8px]"
            : look.rackStyle === "solid"
              ? "border-hairline-strong bg-surface-1"
              : "border-hairline-strong",
        )}
        style={{ height: innerHeight }}
      >
        {/* Rails, numbered every other unit from the bottom. */}
        {!look.narrow
          ? Array.from({ length: rackUnits }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "absolute left-0 flex items-center justify-center font-mono text-[8px] tabular-nums",
                  look.rackStyle === "plan"
                    ? "text-(--is-accent)"
                    : "text-ink-3",
                )}
                style={{ bottom: pad + i * u, height: u, width: rail }}
              >
                {i % 2 === 0 ? i + 1 : ""}
              </span>
            ))
          : null}
        <div
          className="absolute"
          style={{
            left: rail + (look.narrow ? 3 : 2),
            right: look.narrow ? 3 : 6,
            top: 0,
            bottom: 0,
          }}
        >
          {/* Blank plates where nothing is mounted. */}
          {Array.from({ length: look.narrow ? 0 : rackUnits }, (_, i) => (
            <span
              key={i}
              className="absolute inset-x-0 rounded-[2px] border border-dashed border-hairline"
              style={{ bottom: pad + i * u, height: u - 1 }}
            />
          ))}
          <AnimatePresence initial={false} custom={seen}>
            {parts.has("storage") ? part("storage", 1, 0) : null}
            {parts.has("backup") ? part("backup", 3, 2) : null}
            {Array.from({ length: shown }, (_, k) => sledRow(k))}
            {parts.has("network")
              ? part("network", rackUnits, rackUnits)
              : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                              Choice cards                                */
/* ----------------------------------------------------------------------- */

/** Roving radio group: arrows move and select (skipping what cannot be chosen), Home and End jump. */
function useRoving(
  ids: string[],
  selectable: (id: string) => boolean,
  onSelect: (id: string) => void,
) {
  const refs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const onKeyDown = (event: React.KeyboardEvent, id: string) => {
    const n = ids.length;
    const at = ids.indexOf(id);
    const seek = (from: number, by: number) => {
      for (let k = 1; k <= n; k++) {
        const candidate = ids[(((from + by * k) % n) + n) % n];
        if (candidate && selectable(candidate)) return candidate;
      }
      return undefined;
    };
    const first = ids.find(selectable);
    const last = [...ids].reverse().find(selectable);
    const next =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? seek(at, 1)
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? seek(at, -1)
          : event.key === "Home"
            ? first
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    if (!next) return;
    refs.current.get(next)?.focus();
    onSelect(next);
  };
  return { refs, onKeyDown };
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

const BUTTON =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3 text-[12px] font-medium transition-colors";
const PRIMARY =
  "bg-(--is-solid) text-primary-foreground hover:bg-(--is-solid)/90 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-(--is-solid)";
const QUIET =
  "border border-input bg-surface-1 text-foreground hover:bg-surface-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-surface-1";

/**
 * A provisioning wizard — region, size, add-ons, summary — beside a small
 * server rack and the monthly estimate. Choosing a size grows or shrinks the
 * rack unit by unit: new sleds slide in from the right bottom-up on
 * `springs.snap`, a `cascade` apart, each status light blinking on `flick`
 * as it seats, and a smaller size pulls the extra sleds out top-down on the
 * exit ease. Add-ons that take space take fixed slots (a drive shelf, a
 * backup unit, a patch panel) and uptime alerts light the beacon on the
 * roof, while the estimate rolls digit by digit on snap, each wheel turning
 * the way the total moved. Provisioning sweeps every light to green.
 *
 * Every choice is a radio card with roving focus (arrows move and select,
 * Home and End jump); a size a region does not offer is dimmed with its
 * reason, skipped by the arrows and named in the group's description. In a
 * narrow container the rack shrinks into a band above the choices. Under
 * reduced motion sleds fade in place, lights switch without a blink and
 * digits swap — the rack still fills and the total still changes.
 */
export function InstanceSizer({
  regions = defaultInstanceSizerRegions,
  sizes = defaultInstanceSizerSizes,
  addons = defaultInstanceSizerAddons,
  value,
  defaultValue = defaultInstanceSizerConfig,
  onValueChange,
  step,
  defaultStep = "region",
  onStepChange,
  onProvision,
  rackStyle = "line",
  density = "regular",
  accent = "var(--accent-bright)",
  rackUnits = 12,
  format = usd,
  environment = "telemetry-prod",
  title = "New environment",
  status = "ready",
  onRetry,
  height = 540,
  disabled = false,
  className,
}: InstanceSizerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const d = DENSITY[density] ?? DENSITY.regular;
  const units = clamp(Math.round(rackUnits), 10, 20);

  const [own, setOwn] = React.useState<InstanceSizerConfig>(defaultValue);
  const config = value ?? own;
  const [ownStep, setOwnStep] = React.useState<InstanceSizerStep>(defaultStep);
  const current = step ?? ownStep;
  const index = Math.max(0, STEPS.indexOf(current));
  const [visited, setVisited] = React.useState(() =>
    Math.max(0, STEPS.indexOf(step ?? defaultStep)),
  );
  if (index > visited) setVisited(index);
  const [shown, setShown] = React.useState({ step: current, dir: 1 });
  if (shown.step !== current) {
    setShown({
      step: current,
      dir: STEPS.indexOf(current) >= STEPS.indexOf(shown.step) ? 1 : -1,
    });
  }
  const [phase, setPhase] = React.useState<"draft" | "provisioning" | "ready">(
    "draft",
  );
  const [attempted, setAttempted] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const wantFocus = React.useRef(false);
  const timers = React.useRef(new Set<number>());
  const chipLand = useMotionValue(0);
  const chipCtl = React.useRef<AnimationPlaybackControls | null>(null);

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
      chipCtl.current?.stop();
    };
  }, []);

  const region = regions.find((r) => r.id === config.region);
  const size = sizes.find((s) => s.id === config.size);
  const blockedReason = (s: InstanceSizerSize) =>
    region ? s.unavailable?.[region.id] : undefined;
  const sizeProblem = !size
    ? "Choose a size."
    : blockedReason(size)
      ? `${size.name} is not offered in ${region?.name ?? "this region"}. Choose another size.`
      : null;
  const chosenAddons = addons.filter((a) => config.addons.includes(a.id));
  const monthly = estimateInstanceSizer(config, regions, sizes, addons);
  const ready = status === "ready";
  const locked = disabled || phase !== "draft" || !ready;
  const parts = new Set(chosenAddons.map((a) => a.part));

  const say = (text: string) => setAnnouncement(text);

  const update = (next: InstanceSizerConfig, spoken: string) => {
    if (locked) return;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    const total = estimateInstanceSizer(next, regions, sizes, addons);
    say(`${spoken} Estimate ${format(total)} a month.`);
  };

  const goTo = (next: InstanceSizerStep) => {
    if (next === current) return;
    wantFocus.current = true;
    if (step === undefined) setOwnStep(next);
    say(
      `Step ${STEPS.indexOf(next) + 1} of ${STEPS.length}: ${STEP_LABEL[next]}.`,
    );
    onStepChange?.(next);
  };

  const problemOf = (s: InstanceSizerStep) => {
    if (s === "region") return region ? null : "Choose a region.";
    if (s === "size") return sizeProblem;
    return null;
  };

  const advanceTo = (target: number) => {
    if (disabled || !ready) return;
    for (let i = index; i < target; i++) {
      const s = STEPS[i];
      if (!s) return;
      const problem = problemOf(s);
      if (problem) {
        setAttempted(true);
        say(problem);
        if (s !== current) goTo(s);
        return;
      }
    }
    // A size the new region does not offer is caught before the summary.
    if (target >= STEPS.indexOf("summary") && sizeProblem) {
      setAttempted(true);
      say(sizeProblem);
      goTo("size");
      return;
    }
    const next = STEPS[target];
    if (next) goTo(next);
  };

  const provision = () => {
    if (locked) return;
    if (sizeProblem || !region) {
      advanceTo(STEPS.length - 1);
      return;
    }
    setPhase("provisioning");
    say(`Provisioning ${environment}.`);
    onProvision?.(config, monthly);
    const t = window.setTimeout(
      () => {
        timers.current.delete(t);
        setPhase("ready");
        say(`${environment} is ready.`);
        if (motionSafe) {
          chipCtl.current?.stop();
          chipLand.jump(-distances.step);
          chipCtl.current = animate(chipLand, 0, springs.recoil);
        }
      },
      motionSafe ? 1400 : 300,
    );
    timers.current.add(t);
  };

  const headingRef = React.useCallback((node: HTMLHeadingElement | null) => {
    if (node && wantFocus.current) {
      wantFocus.current = false;
      node.focus({ preventScroll: true });
    }
  }, []);

  const chooseRegion = (id: string) => {
    if (locked || id === config.region) return;
    const r = regions.find((x) => x.id === id);
    if (!r) return;
    const clash = size?.unavailable?.[id];
    update(
      { ...config, region: id },
      `${r.name}.${clash ? ` ${size?.name ?? "This size"} is not offered here.` : ""}`,
    );
  };
  const chooseSize = (id: string) => {
    if (locked || id === config.size) return;
    const s = sizes.find((x) => x.id === id);
    if (!s || blockedReason(s)) return;
    update(
      { ...config, size: id },
      `${s.name}, ${s.units} ${s.units === 1 ? "unit" : "units"}.`,
    );
  };
  const toggleAddon = (id: string) => {
    if (locked) return;
    const a = addons.find((x) => x.id === id);
    if (!a) return;
    const on = config.addons.includes(id);
    update(
      {
        ...config,
        addons: on
          ? config.addons.filter((x) => x !== id)
          : addons
              .filter((x) => x.id === id || config.addons.includes(x.id))
              .map((x) => x.id),
      },
      `${a.name} ${on ? "off" : "on"}.`,
    );
  };

  const regionRoving = useRoving(
    regions.map((r) => r.id),
    () => !locked,
    (id) => chooseRegion(id),
  );
  const sizeRoving = useRoving(
    sizes.map((s) => s.id),
    (id) => {
      const s = sizes.find((x) => x.id === id);
      return Boolean(s && !locked && !blockedReason(s));
    },
    (id) => chooseSize(id),
  );

  /* --------------------------- rack and estimate ------------------------- */

  const rackLabel = `Rack: ${size ? `${size.name} server in ${Math.min(size.units, units - 4)} of ${units} units` : "no server"}${
    chosenAddons.length
      ? `, with ${chosenAddons.map((a) => a.name.toLowerCase()).join(", ")}`
      : ""
  }${phase === "ready" ? ", powered on" : ""}.`;

  const rackFor = (narrow: boolean) => (
    <Rack
      rackUnits={units}
      sizeUnits={size?.units ?? 0}
      parts={parts}
      look={{ rackStyle, unit: narrow ? 5 : 15, narrow }}
      powered={phase === "ready"}
      invalid={Boolean(size && blockedReason(size))}
      motionSafe={motionSafe}
      label={rackLabel}
    />
  );

  const figure = (sz: number) => (
    <span className="flex items-baseline gap-1 text-foreground">
      <Odometer
        value={monthly}
        format={format}
        size={sz}
        motionSafe={motionSafe}
      />
      <span className="text-[11px] text-ink-3">/ mo</span>
      <span className="sr-only">{format(monthly)} a month</span>
    </span>
  );

  const statusChip = (
    <motion.span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 font-mono text-[10px] tracking-[0.08em] uppercase",
        phase === "ready"
          ? "border-(--is-power)/50 text-(--is-power-ink)"
          : phase === "provisioning"
            ? "border-(--is-accent)/50 text-(--is-accent)"
            : "border-hairline text-ink-3",
      )}
      style={{ y: chipLand }}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      <span className="sr-only @min-[22rem]/instance-sizer:not-sr-only">
        {phase === "ready"
          ? "Ready"
          : phase === "provisioning"
            ? "Provisioning"
            : "Draft"}
      </span>
    </motion.span>
  );

  /* ------------------------------- panels ------------------------------ */

  const radioCard = (
    checked: boolean,
    blocked: boolean,
    children: React.ReactNode,
  ) => (
    <>
      {checked ? (
        <motion.span
          layoutId={`${uid}-${current}-ring`}
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-3 border-2 border-(--is-accent)"
          transition={motionSafe ? springs.snap : { duration: 0 }}
        />
      ) : null}
      <span
        aria-hidden
        className={cn(
          "relative mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
          checked ? "border-(--is-accent)" : "border-hairline-strong",
          blocked && "opacity-50",
        )}
      >
        {checked ? (
          <motion.span
            className="size-2 rounded-full bg-(--is-accent)"
            initial={motionSafe ? { scale: 0.3 } : false}
            animate={{ scale: 1 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          />
        ) : null}
      </span>
      {children}
    </>
  );

  const cardClass = (checked: boolean, blocked: boolean) =>
    cn(
      "relative flex w-full items-start gap-3 rounded-3 border text-left transition-colors",
      d.card,
      FOCUS,
      checked
        ? "border-transparent bg-(--is-wash)"
        : "border-hairline bg-surface-1 hover:border-hairline-strong hover:bg-surface-2",
      blocked &&
        "cursor-not-allowed bg-surface-1 hover:border-hairline hover:bg-surface-1",
      locked && !blocked && "cursor-default",
    );

  const regionPanel = (
    <div
      role="radiogroup"
      aria-labelledby={`${uid}-h-region`}
      className={cn("grid @min-[30rem]/instance-sizer:grid-cols-2", d.gap)}
    >
      {regions.map((r) => {
        const checked = r.id === config.region;
        const clash = size?.unavailable?.[r.id];
        return (
          <button
            key={r.id}
            ref={(node) => {
              regionRoving.refs.current.set(r.id, node);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-disabled={locked || undefined}
            tabIndex={checked ? 0 : -1}
            onClick={() => chooseRegion(r.id)}
            onKeyDown={(event) => regionRoving.onKeyDown(event, r.id)}
            className={cardClass(checked, false)}
          >
            {radioCard(
              checked,
              false,
              <span className="relative flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-foreground">
                    {r.name}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-3">
                    {r.code}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-ink-3">
                  <span className="inline-flex items-center gap-1">
                    <MapPin aria-hidden className="size-3 shrink-0" />
                    {r.latency ?? "—"}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{factorNote(r.factor)}</span>
                </span>
                {clash && size ? (
                  <span className="flex items-center gap-1 text-[11px] text-warn">
                    <Ban aria-hidden className="size-3 shrink-0" />
                    No {size.name} here
                  </span>
                ) : null}
              </span>,
            )}
          </button>
        );
      })}
    </div>
  );

  const blockedNoteId = `${uid}-blocked`;
  const blockedSizes = sizes.filter((s) => blockedReason(s));
  const sizePanel = (
    <div className={cn("flex flex-col", d.gap)}>
      <div
        role="radiogroup"
        aria-labelledby={`${uid}-h-size`}
        aria-describedby={blockedSizes.length ? blockedNoteId : undefined}
        className={cn("flex flex-col", d.gap)}
      >
        {sizes.map((s) => {
          const checked = s.id === config.size;
          const reason = blockedReason(s);
          const tabbable =
            checked ||
            (!sizes.some((x) => x.id === config.size && !blockedReason(x)) &&
              s.id === sizes.find((x) => !blockedReason(x))?.id);
          return (
            <button
              key={s.id}
              ref={(node) => {
                sizeRoving.refs.current.set(s.id, node);
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-disabled={locked || Boolean(reason) || undefined}
              tabIndex={tabbable ? 0 : -1}
              onClick={() => chooseSize(s.id)}
              onKeyDown={(event) => sizeRoving.onKeyDown(event, s.id)}
              className={cardClass(checked, Boolean(reason))}
            >
              {radioCard(
                checked,
                Boolean(reason),
                <span className="relative flex min-w-0 flex-1 flex-col gap-1">
                  <span
                    className={cn(
                      "flex items-center justify-between gap-3",
                      reason && "opacity-55",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium text-foreground">
                        {s.name}
                      </span>
                      {s.tag ? (
                        <span className="inline-flex h-4 shrink-0 items-center rounded-full bg-(--is-wash) px-1.5 font-mono text-[9px] tracking-[0.06em] text-(--is-accent) uppercase">
                          {s.tag}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-mono text-[12px] text-foreground tabular-nums">
                      {format(sizePrice(s, region))}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-3",
                      reason && "opacity-55",
                    )}
                  >
                    <span>
                      {s.cpu} vCPU · {s.memory} GB
                    </span>
                    <span aria-hidden className="flex items-center gap-[2px]">
                      {Array.from({ length: s.units }, (_, i) => (
                        <span
                          key={i}
                          className={cn(
                            "h-2 w-1.5 rounded-[1px]",
                            checked ? "bg-(--is-accent)" : "bg-ink-3/40",
                          )}
                        />
                      ))}
                    </span>
                    <span>{s.units}U</span>
                  </span>
                  {reason ? (
                    <span className="flex items-start gap-1 text-[11px] leading-4 text-warn">
                      <Ban aria-hidden className="mt-0.5 size-3 shrink-0" />
                      <span className="min-w-0">{reason}</span>
                    </span>
                  ) : null}
                </span>,
              )}
            </button>
          );
        })}
      </div>
      {blockedSizes.length ? (
        <p id={blockedNoteId} className="sr-only">
          {blockedSizes
            .map((s) => `${s.name} is not offered: ${blockedReason(s)}`)
            .join(" ")}
        </p>
      ) : null}
    </div>
  );

  const addonsPanel = (
    <div className={cn("grid @min-[30rem]/instance-sizer:grid-cols-2", d.gap)}>
      {addons.map((a) => {
        const on = config.addons.includes(a.id);
        const Icon = PART_ICON[a.part];
        return (
          <button
            key={a.id}
            type="button"
            role="switch"
            aria-checked={on}
            aria-disabled={locked || undefined}
            aria-describedby={`${uid}-a-${a.id}`}
            onClick={() => toggleAddon(a.id)}
            className={cn(
              "relative flex w-full items-start gap-3 rounded-3 border text-left transition-colors",
              d.card,
              FOCUS,
              on
                ? "border-(--is-accent)/60 bg-(--is-wash)"
                : "border-hairline bg-surface-1 hover:border-hairline-strong hover:bg-surface-2",
              locked && "cursor-default",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "inline-flex size-7 shrink-0 items-center justify-center rounded-2 transition-colors",
                on
                  ? "bg-(--is-accent) text-primary-foreground"
                  : "bg-surface-2 text-ink-2",
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-foreground">
                  {a.name}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-ink-2 tabular-nums">
                  +{format(a.price)}
                </span>
              </span>
              <span
                id={`${uid}-a-${a.id}`}
                className="text-[11px] leading-4 text-ink-3"
              >
                {a.description}
              </span>
            </span>
            <span
              aria-hidden
              className={cn(
                "relative mt-0.5 inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors",
                on
                  ? "border-transparent bg-(--is-accent)"
                  : "border-hairline-strong bg-surface-2",
              )}
            >
              <motion.span
                className="absolute size-3 rounded-full bg-background shadow-sm"
                initial={false}
                animate={{ x: on ? 13 : 1 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );

  const summaryRow = (
    label: string,
    valueText: string,
    to: InstanceSizerStep,
  ) => (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <dt className="w-20 shrink-0 font-mono text-[10px] leading-5 tracking-[0.06em] text-ink-3 uppercase">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-foreground">{valueText}</dd>
      <button
        type="button"
        onClick={() => {
          if (!locked) goTo(to);
        }}
        aria-label={`Change ${label.toLowerCase()}`}
        aria-disabled={locked || undefined}
        className={cn(
          "-my-1 inline-flex h-7 shrink-0 items-center rounded-2 px-2 text-[12px] font-medium text-(--is-accent) transition-colors hover:bg-(--is-wash) aria-disabled:opacity-40 aria-disabled:hover:bg-transparent",
          FOCUS,
        )}
      >
        Change
      </button>
    </div>
  );

  const summaryPanel = (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-col divide-y divide-hairline rounded-3 border border-hairline">
        {summaryRow(
          "Region",
          region ? `${region.name} · ${region.code}` : "None",
          "region",
        )}
        {summaryRow(
          "Size",
          size
            ? `${size.name} · ${size.cpu} vCPU · ${size.memory} GB · ${size.units}U`
            : "None",
          "size",
        )}
        {summaryRow(
          "Add-ons",
          chosenAddons.length
            ? chosenAddons.map((a) => a.name).join(", ")
            : "None",
          "addons",
        )}
      </dl>
      <div className="flex flex-col gap-1 rounded-3 bg-surface-1 px-3 py-2.5">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {environment}
        </span>
        <p className="text-[12px] text-ink-2">
          {phase === "ready"
            ? "Provisioned. Every unit is powered and reporting."
            : phase === "provisioning"
              ? "Racking the units and powering on…"
              : `Billed monthly from today at ${format(monthly)}. Change anything above first.`}
        </p>
      </div>
    </div>
  );

  const panels: Record<InstanceSizerStep, React.ReactNode> = {
    region: regionPanel,
    size: sizePanel,
    addons: addonsPanel,
    summary: summaryPanel,
  };

  const problem = attempted ? problemOf(current) : null;
  const problemId = `${uid}-problem`;

  const body =
    status === "loading" ? (
      <div aria-busy="true" className={cn("flex flex-col gap-2", d.px, d.py)}>
        <p className="sr-only">Loading sizes and prices.</p>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} aria-hidden className="h-14 rounded-3 bg-surface-2" />
        ))}
      </div>
    ) : status === "error" ? (
      <div className="flex h-full flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">
          Sizes and prices did not load.
        </p>
        <p className="max-w-xs text-[12px] text-ink-3">
          Nothing was provisioned. Try again in a moment.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(BUTTON, QUIET, FOCUS)}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : (
      <AnimatePresence initial={false} mode="popLayout" custom={shown.dir}>
        <motion.section
          key={current}
          custom={shown.dir}
          aria-labelledby={`${uid}-h-${current}`}
          variants={{
            enter: (dir: number) => ({
              opacity: 0,
              x: motionSafe ? dir * distances.shift : 0,
            }),
            shown: { opacity: 1, x: 0 },
            leave: (dir: number) => ({
              opacity: 0,
              x: motionSafe ? -dir * distances.shift : 0,
              transition: exitFor(durations.fast),
            }),
          }}
          initial="enter"
          animate="shown"
          exit="leave"
          transition={
            motionSafe
              ? {
                  x: springs.glide,
                  opacity: { duration: durations.base, ease: easings.enter },
                }
              : { duration: durations.fast }
          }
          className={cn("flex w-full flex-col gap-3", d.px, d.py)}
        >
          <h3
            ref={headingRef}
            id={`${uid}-h-${current}`}
            tabIndex={-1}
            className="rounded-1 text-[13px] font-semibold text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            {STEP_TITLE[current]}
          </h3>
          {panels[current]}
        </motion.section>
      </AnimatePresence>
    );

  const nextLabel =
    current === "summary"
      ? phase === "ready"
        ? "Provisioned"
        : phase === "provisioning"
          ? "Provisioning…"
          : "Provision"
      : `Next: ${STEP_LABEL[STEPS[index + 1] ?? "summary"]}`;

  return (
    <div
      role="region"
      aria-label={title}
      className={cn(
        "@container/instance-sizer flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        d.body,
        className,
      )}
      style={
        {
          height,
          "--is-accent": accent,
          "--is-wash": `color-mix(in oklab, ${accent} 10%, transparent)`,
          "--is-grid": `color-mix(in oklab, ${accent} 9%, transparent)`,
          "--is-solid": `oklch(from ${accent} 0.52 c h)`,
          "--is-power": "oklch(from var(--success) 0.74 c h)",
          "--is-power-ink": "var(--success)",
        } as React.CSSProperties
      }
    >
      <header
        className={cn(
          "flex shrink-0 items-center justify-between gap-3 border-b border-hairline py-3",
          d.px,
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="hidden size-8 shrink-0 items-center justify-center rounded-2 bg-surface-2 text-ink-2 @min-[24rem]/instance-sizer:inline-flex">
            <Server aria-hidden className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{title}</h2>
            <p className="truncate text-[11px] text-ink-3">
              Gaugeworks · <span className="font-mono">{environment}</span>
            </p>
          </div>
        </div>
        {statusChip}
      </header>

      <nav
        aria-label="Provisioning steps"
        className={cn("shrink-0 border-b border-hairline py-2.5", d.px)}
      >
        <ol className="flex items-center gap-2">
          {STEPS.map((s, i) => {
            const here = i === index;
            const done =
              i < index || (i <= visited && i !== index && !problemOf(s));
            const reachable = !here && i <= Math.max(visited, index + 1);
            const node = (
              <>
                <span
                  className={cn(
                    "relative inline-flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] tabular-nums transition-colors",
                    here
                      ? "border-(--is-accent) text-(--is-accent)"
                      : done
                        ? "border-transparent bg-(--is-accent) text-primary-foreground"
                        : "border-hairline-strong text-ink-3",
                  )}
                >
                  <span aria-hidden>{i + 1}</span>
                  {here ? (
                    <motion.span
                      layoutId={`${uid}-step`}
                      aria-hidden
                      className="absolute -inset-1 rounded-full border border-(--is-accent)/40"
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  ) : null}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "hidden truncate text-[12px] @min-[34rem]/instance-sizer:inline",
                    here ? "font-medium text-foreground" : "text-ink-2",
                  )}
                >
                  {STEP_LABEL[s]}
                </span>
                <span className="sr-only">
                  {`${STEP_LABEL[s]}, step ${i + 1} of ${STEPS.length}${here ? ", current" : ""}`}
                </span>
              </>
            );
            return (
              <li
                key={s}
                aria-current={here ? "step" : undefined}
                className={cn(
                  "flex min-w-0 items-center gap-2",
                  i < STEPS.length - 1 && "flex-1",
                )}
              >
                {reachable ? (
                  <button
                    type="button"
                    onClick={() => (i < index ? goTo(s) : advanceTo(i))}
                    aria-disabled={disabled || undefined}
                    className={cn(
                      "flex min-w-0 items-center gap-2 rounded-full pr-1",
                      FOCUS,
                    )}
                  >
                    {node}
                  </button>
                ) : (
                  <span className="flex min-w-0 items-center gap-2">
                    {node}
                  </span>
                )}
                {i < STEPS.length - 1 ? (
                  <span
                    aria-hidden
                    className="relative h-px min-w-3 flex-1 overflow-hidden bg-hairline-strong"
                  >
                    <motion.span
                      className="absolute inset-0 bg-(--is-accent)"
                      style={{ originX: 0 }}
                      initial={false}
                      animate={{ scaleX: i < index ? 1 : 0 }}
                      transition={motionSafe ? springs.glide : { duration: 0 }}
                    />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* The rack shrinks into a band above the choices in a narrow container. */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-4 border-b border-hairline py-2.5 @min-[34rem]/instance-sizer:hidden",
          !ready && "hidden",
          d.px,
        )}
      >
        {rackFor(true)}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Monthly estimate
          </span>
          {figure(20)}
          <span className="truncate text-[11px] text-ink-3">
            {size?.name ?? "No size"} · {region?.name ?? "No region"}
          </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
          {body}
        </div>
        <aside
          aria-label="Rack and estimate"
          className={cn(
            "hidden w-[11.5rem] shrink-0 [scrollbar-width:thin] flex-col gap-4 overflow-y-auto overscroll-contain border-l border-hairline bg-surface-1 px-4 py-4",
            ready && "@min-[34rem]/instance-sizer:flex",
          )}
        >
          {rackFor(false)}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Monthly estimate
            </span>
            {figure(22)}
            <ul className="mt-1 flex flex-col gap-0.5 text-[11px] text-ink-3">
              {size ? (
                <li className="flex justify-between gap-2">
                  <span className="truncate">{size.name}</span>
                  <span className="font-mono tabular-nums">
                    {format(sizePrice(size, region))}
                  </span>
                </li>
              ) : null}
              {chosenAddons.map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span className="truncate">{a.name}</span>
                  <span className="font-mono tabular-nums">
                    {format(a.price)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <footer
        className={cn(
          "flex shrink-0 flex-col gap-2 border-t border-hairline py-3",
          d.px,
        )}
      >
        {problem ? (
          <p
            id={problemId}
            className="flex min-w-0 items-center gap-1.5 text-[12px] leading-4 text-danger"
          >
            <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
            <span className="min-w-0">{problem}</span>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              const prev = STEPS[index - 1];
              if (!disabled && ready && prev) goTo(prev);
            }}
            aria-disabled={disabled || !ready || index === 0 || undefined}
            className={cn(
              BUTTON,
              "px-2 text-ink-2 hover:bg-surface-2 hover:text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent",
              FOCUS,
            )}
          >
            <ChevronLeft aria-hidden className="size-3.5" />
            Back
          </button>
          <button
            type="button"
            onClick={() =>
              current === "summary" ? provision() : advanceTo(index + 1)
            }
            aria-disabled={
              disabled ||
              !ready ||
              (current === "summary" && phase !== "draft") ||
              undefined
            }
            aria-describedby={problem ? problemId : undefined}
            className={cn(BUTTON, PRIMARY, FOCUS)}
          >
            {current === "summary" ? (
              <Power aria-hidden className="size-3.5" />
            ) : null}
            {nextLabel}
          </button>
        </div>
      </footer>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
