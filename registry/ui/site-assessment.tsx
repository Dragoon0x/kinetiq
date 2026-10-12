"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Camera,
  Check,
  Crosshair,
  ImageIcon,
  MapPin,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Upload,
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

export type SiteFeatureKind = "boundary" | "building" | "access" | "tree";

/** One drawn thing on the plan: a polygon, or a tree given as one point and a radius. */
export type SiteFeature = {
  id: string;
  kind: SiteFeatureKind;
  /** Named in announcements: a pin is placed "near the Main house". */
  label: string;
  /** Corners in plan units; a tree gives its centre. */
  points: [number, number][];
  /** A tree's canopy radius, in plan units. */
  radius?: number;
};

/** A schematic plot: a drawing size and the features inside it. */
export type SitePlan = {
  id: string;
  /** The site's name, shown under the title. */
  label: string;
  /** Drawing width, in plan units. */
  width: number;
  /** Drawing height, in plan units. */
  height: number;
  features: SiteFeature[];
};

export type SiteTone = "ink" | "success" | "warn" | "danger";

export type SiteSeverity = {
  id: string;
  label: string;
  /** The colour its pins and badges take. */
  tone: SiteTone;
};

export type SiteFinding = {
  id: string;
  /** Pin position, in plan units. */
  x: number;
  y: number;
  title: string;
  /** A severity id. */
  severity: string;
  note: string;
  /** The attached photo's name, or null for an empty slot. */
  photo: string | null;
};

export type SiteChangeKind = "add" | "remove" | "edit" | "move";
export type SiteChange = { kind: SiteChangeKind; id: string };

export type SiteStatus = "ready" | "loading" | "error";
export type SitePlanStyle = "line" | "filled" | "blueprint";
export type SitePinStyle = "drop" | "dot" | "tag";
export type SiteDensity = "compact" | "cozy" | "roomy";

export type SiteAssessmentProps = {
  /** How the plan is drawn: hairlines on the card, washed fills, or a blueprint with a grid. @default "line" */
  planStyle?: SitePlanStyle;
  /** The pins' shape: a numbered marker standing on its point, a flat numbered dot, or a tag that also carries the title. @default "drop" */
  pinStyle?: SitePinStyle;
  /** Section padding, type size and control heights. @default "cozy" */
  density?: SiteDensity;
  /** The site plan; null means none was uploaded yet and the plan panel offers a drop zone. @default defaultSitePlan */
  plan?: SitePlan | null;
  /** The severities a finding can take, in radio order; the first is a new finding's. @default defaultSiteSeverities */
  severities?: SiteSeverity[];
  /** Controlled findings, in pin order. */
  findings?: SiteFinding[];
  /** Initial findings when uncontrolled. @default defaultSiteFindings */
  defaultFindings?: SiteFinding[];
  /** Fires with every finding after a pin is placed, moved or removed or a field changes. */
  onChange?: (findings: SiteFinding[], change: SiteChange) => void;
  /** Submit was pressed with every finding titled. */
  onSubmit?: (findings: SiteFinding[]) => void;
  /** The empty plan panel's button was pressed. */
  onUploadPlan?: () => void;
  /** A photo slot was pressed; return a name to store there, or nothing to store a placeholder. */
  onAttachPhoto?: (finding: SiteFinding) => string | void;
  /** Whether the plan and findings have arrived. @default "ready" */
  status?: SiteStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Site assessment" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the form scrolls inside it. @default 540 */
  height?: number;
  /** Read only: no pin can be placed or moved and no field changes. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** Lot 14 on Harrow Lane: a house with a drive, a shed and two trees. */
export const defaultSitePlan: SitePlan = {
  id: "lot-14",
  label: "Lot 14, Harrow Lane",
  width: 400,
  height: 300,
  features: [
    {
      id: "plot",
      kind: "boundary",
      label: "Plot boundary",
      points: [
        [16, 16],
        [384, 16],
        [384, 250],
        [16, 250],
      ],
    },
    {
      id: "lane",
      kind: "access",
      label: "Harrow Lane",
      points: [
        [0, 262],
        [400, 262],
        [400, 300],
        [0, 300],
      ],
    },
    {
      id: "drive",
      kind: "access",
      label: "Driveway",
      points: [
        [150, 250],
        [186, 250],
        [186, 200],
        [150, 200],
      ],
    },
    {
      id: "house",
      kind: "building",
      label: "Main house",
      points: [
        [130, 80],
        [270, 80],
        [270, 160],
        [210, 160],
        [210, 200],
        [130, 200],
      ],
    },
    {
      id: "shed",
      kind: "building",
      label: "Shed",
      points: [
        [300, 180],
        [360, 180],
        [360, 230],
        [300, 230],
      ],
    },
    {
      id: "oak",
      kind: "tree",
      label: "Oak",
      points: [[66, 214]],
      radius: 24,
    },
    {
      id: "birch",
      kind: "tree",
      label: "Birch",
      points: [[330, 92]],
      radius: 16,
    },
  ],
};

export const defaultSiteSeverities: SiteSeverity[] = [
  { id: "note", label: "Note", tone: "ink" },
  { id: "attention", label: "Attention", tone: "warn" },
  { id: "hazard", label: "Hazard", tone: "danger" },
];

/** Three findings from the Fieldline survey of Lot 14. */
export const defaultSiteFindings: SiteFinding[] = [
  {
    id: "f1",
    x: 196,
    y: 198,
    title: "Cracked lintel on the south face",
    severity: "hazard",
    note: "Spalling above the kitchen window; render loose to the touch.",
    photo: "IMG_0412.jpg",
  },
  {
    id: "f2",
    x: 150,
    y: 236,
    title: "Oak roots lifting the drive",
    severity: "attention",
    note: "",
    photo: null,
  },
  {
    id: "f3",
    x: 330,
    y: 204,
    title: "Moss on the shed roof",
    severity: "note",
    note: "Cosmetic. Felt is sound underneath.",
    photo: null,
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Pins are pigment: a hue at a fixed lightness so `--bg-0` text reads on it in both themes. */
const PIGMENT: Record<SiteTone, string> = {
  ink: "var(--ink)",
  success: "oklch(from var(--success) 0.58 0.13 h)",
  warn: "oklch(from var(--warn) 0.62 0.15 h)",
  danger: "oklch(from var(--danger) 0.58 0.19 h)",
};

const PLAN_VARS: Record<SitePlanStyle, Record<string, string>> = {
  line: {
    "--sa-bg": "transparent",
    "--sa-grid": "transparent",
    "--sa-line": "var(--ink-2)",
    "--sa-faint": "var(--ink-3)",
    "--sa-fill": "transparent",
    "--sa-access": "transparent",
    "--sa-tree": "var(--success)",
    "--sa-tree-fill": "transparent",
    "--sa-label": "var(--ink-3)",
    "--sa-cross": "var(--accent-bright)",
  },
  filled: {
    "--sa-bg": "var(--bg-1)",
    "--sa-grid": "transparent",
    "--sa-line": "var(--ink-2)",
    "--sa-faint": "var(--ink-3)",
    "--sa-fill": "color-mix(in oklab, var(--ink) 12%, transparent)",
    "--sa-access": "color-mix(in oklab, var(--ink) 6%, transparent)",
    "--sa-tree": "var(--success)",
    "--sa-tree-fill": "color-mix(in oklab, var(--success) 22%, transparent)",
    "--sa-label": "var(--ink-2)",
    "--sa-cross": "var(--accent-bright)",
  },
  blueprint: {
    "--sa-bg": "oklch(from var(--accent) 0.38 0.11 h)",
    "--sa-grid": "color-mix(in oklab, white 14%, transparent)",
    "--sa-line": "color-mix(in oklab, white 90%, transparent)",
    "--sa-faint": "color-mix(in oklab, white 55%, transparent)",
    "--sa-fill": "color-mix(in oklab, white 10%, transparent)",
    "--sa-access": "color-mix(in oklab, white 7%, transparent)",
    "--sa-tree": "color-mix(in oklab, white 82%, transparent)",
    "--sa-tree-fill": "color-mix(in oklab, white 8%, transparent)",
    "--sa-label": "color-mix(in oklab, white 78%, transparent)",
    "--sa-cross": "white",
  },
};

const DENSITY: Record<
  SiteDensity,
  {
    pad: string;
    gap: string;
    control: string;
    area: string;
    seg: string;
    tile: number;
  }
> = {
  compact: {
    pad: "p-2.5",
    gap: "gap-2",
    control: "h-7 px-2 text-[12px]",
    area: "px-2 py-1.5 text-[12px]",
    seg: "h-6 px-2 text-[11px]",
    tile: 48,
  },
  cozy: {
    pad: "p-3",
    gap: "gap-2.5",
    control: "h-8 px-2.5 text-[13px]",
    area: "px-2.5 py-2 text-[13px]",
    seg: "h-7 px-2.5 text-[12px]",
    tile: 56,
  },
  roomy: {
    pad: "p-4",
    gap: "gap-3",
    control: "h-9 px-3 text-sm",
    area: "px-3 py-2.5 text-sm",
    seg: "h-8 px-3 text-[13px]",
    tile: 64,
  },
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;
const DRAG_SLOP = 4;
const PARTS = 3;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const noopSubscribe = () => () => {};

let seq = 0;
const nextId = () => {
  seq += 1;
  return `sf-${seq.toString(36)}`;
};

const centroid = (f: SiteFeature): [number, number] => {
  if (f.points.length === 0) return [0, 0];
  let sx = 0;
  let sy = 0;
  for (const p of f.points) {
    sx += p[0];
    sy += p[1];
  }
  return [sx / f.points.length, sy / f.points.length];
};

/** The feature a point sits closest to, by centre; the boundary only when nothing else is drawn. */
const nearestFeature = (plan: SitePlan, x: number, y: number) => {
  let best: SiteFeature | null = null;
  let bestD = Infinity;
  for (const f of plan.features) {
    if (f.kind === "boundary") continue;
    const [cx, cy] = centroid(f);
    const d = Math.hypot(cx - x, cy - y) - (f.radius ?? 0);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best ?? plan.features[0] ?? null;
};

const placeWords = (
  plan: SitePlan | null | undefined,
  x: number,
  y: number,
) => {
  if (!plan) return "";
  const near = nearestFeature(plan, x, y);
  const across = Math.round((x / plan.width) * 100);
  const down = Math.round((y / plan.height) * 100);
  return `${near ? `near the ${near.label}, ` : ""}${across} across, ${down} down`;
};

/** How many of a finding's three parts (title, photo, note) are filled. */
export const siteCompleteness = (finding: SiteFinding) =>
  (finding.title.trim() ? 1 : 0) +
  (finding.photo ? 1 : 0) +
  (finding.note.trim() ? 1 : 0);

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
/* ----------------------------------------------------------------------- */

function Roll({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const digits = String(Math.max(0, Math.round(value))).split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      <span className="invisible w-0">0</span>
      {digits.map((d, i) => (
        <span
          key={digits.length - 1 - i}
          className="relative inline-block overflow-hidden"
          style={{ width: "1ch", height: `${DIGIT_H}em` }}
        >
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col items-center"
            initial={false}
            animate={{ y: `${-r3(Number(d) * DIGIT_H)}em` }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            {DIGITS.map((n) => (
              <span key={n} style={{ height: `${DIGIT_H}em` }}>
                {n}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Plan art                                 */
/* ----------------------------------------------------------------------- */

function Label({
  x,
  y,
  size,
  children,
}: {
  x: number;
  y: number;
  size: number;
  children: React.ReactNode;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontSize={size}
      fontFamily="var(--font-mono, ui-monospace, monospace)"
      fill="var(--sa-label)"
      stroke="none"
    >
      {children}
    </text>
  );
}

function PlanArt({
  plan,
  planStyle,
  gridId,
}: {
  plan: SitePlan;
  planStyle: SitePlanStyle;
  gridId: string;
}) {
  const W = plan.width;
  const H = plan.height;
  const cell = W / 16;
  const font = Math.max(7, Math.round(W / 46));
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="block h-full w-full overflow-hidden rounded-3"
    >
      {planStyle === "blueprint" ? (
        <defs>
          <pattern
            id={gridId}
            width={cell}
            height={cell}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${cell} 0 L 0 0 0 ${cell}`}
              fill="none"
              stroke="var(--sa-grid)"
              strokeWidth={0.6}
            />
          </pattern>
        </defs>
      ) : null}
      <rect width={W} height={H} fill="var(--sa-bg)" />
      {planStyle === "blueprint" ? (
        <rect width={W} height={H} fill={`url(#${gridId})`} />
      ) : null}
      {plan.features.map((f) => {
        const pts = f.points.map((p) => p.join(",")).join(" ");
        const [cx, cy] = centroid(f);
        if (f.kind === "tree") {
          const r = f.radius ?? 12;
          const [tx, ty] = f.points[0] ?? [cx, cy];
          return (
            <g key={f.id}>
              <circle
                cx={tx}
                cy={ty}
                r={r}
                fill="var(--sa-tree-fill)"
                stroke="var(--sa-tree)"
                strokeWidth={1.2}
                strokeDasharray={planStyle === "line" ? "3 2" : undefined}
              />
              <circle cx={tx} cy={ty} r={1.6} fill="var(--sa-tree)" />
              <Label x={tx} y={ty + r + font + 1} size={font}>
                {f.label}
              </Label>
            </g>
          );
        }
        if (f.kind === "boundary") {
          return (
            <polygon
              key={f.id}
              points={pts}
              fill="none"
              stroke="var(--sa-faint)"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          );
        }
        if (f.kind === "access") {
          return (
            <g key={f.id}>
              <polygon
                points={pts}
                fill="var(--sa-access)"
                stroke="var(--sa-faint)"
                strokeWidth={0.8}
              />
              <Label x={cx} y={cy + font * 0.35} size={font}>
                {f.label}
              </Label>
            </g>
          );
        }
        return (
          <g key={f.id}>
            <polygon
              points={pts}
              fill="var(--sa-fill)"
              stroke="var(--sa-line)"
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
            <Label x={cx} y={cy + font * 0.35} size={font}>
              {f.label}
            </Label>
          </g>
        );
      })}
      {/* North arrow and a scale bar: drawing furniture. */}
      <g
        transform={`translate(${W - 22} 14)`}
        fill="none"
        stroke="var(--sa-faint)"
        strokeWidth={1}
      >
        <path d="M0 14 L0 0 M-4 5 L0 0 L4 5" strokeLinecap="round" />
        <Label x={0} y={26} size={font}>
          N
        </Label>
      </g>
      <g
        transform={`translate(${W - 64} ${H - 12})`}
        stroke="var(--sa-faint)"
        strokeWidth={1}
      >
        <path d="M0 0 L40 0 M0 -3 L0 3 M20 -2 L20 2 M40 -3 L40 3" />
        <Label x={20} y={-5} size={font - 1}>
          10 m
        </Label>
      </g>
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Pin                                    */
/* ----------------------------------------------------------------------- */

type PinProps = {
  finding: SiteFinding;
  n: number;
  severity: SiteSeverity | undefined;
  pinStyle: SitePinStyle;
  plan: SitePlan;
  active: boolean;
  pulseSeq: number | null;
  dragging: boolean;
  landed: boolean;
  tabIndex: number;
  disabled: boolean;
  motionSafe: boolean;
  nodeRef: (node: HTMLButtonElement | null) => void;
  onPress: () => void;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerEnd: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onPulseDone: () => void;
};

function Pin({
  finding,
  n,
  severity,
  pinStyle,
  plan,
  active,
  pulseSeq,
  dragging,
  landed,
  tabIndex,
  disabled,
  motionSafe,
  nodeRef,
  onPress,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
  onKeyDown,
  onPulseDone,
}: PinProps) {
  const pigment = PIGMENT[severity?.tone ?? "ink"];
  const left = `${r3((finding.x / plan.width) * 100)}%`;
  const top = `${r3((finding.y / plan.height) * 100)}%`;
  const anchor =
    pinStyle === "drop"
      ? "-translate-x-1/2 -translate-y-full"
      : pinStyle === "dot"
        ? "-translate-x-1/2 -translate-y-1/2"
        : "-translate-x-1 -translate-y-1/2";
  const label = `Pin ${n}: ${finding.title.trim() || "Untitled finding"}, ${severity?.label ?? finding.severity}`;
  const lift = dragging ? 1.22 : active ? 1.12 : 1;
  // Where a ring centres: the marker's head, the dot, or the tag's point.
  const ringAt = {
    left: pinStyle === "tag" ? 4 : "50%",
    top: pinStyle === "drop" ? 13 : "50%",
  };

  return (
    <motion.div
      className="absolute"
      initial={false}
      animate={{ left, top }}
      transition={dragging || !motionSafe ? { duration: 0 } : springs.snap}
      style={{ zIndex: dragging ? 30 : active ? 20 : 10 }}
    >
      <motion.button
        ref={nodeRef}
        type="button"
        tabIndex={tabIndex}
        aria-label={label}
        aria-current={active ? "true" : undefined}
        aria-disabled={disabled || undefined}
        onClick={onPress}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
        initial={motionSafe ? { scale: 0, opacity: 0 } : { opacity: 0 }}
        animate={{
          scale: motionSafe ? lift : 1,
          y: motionSafe && dragging ? -distances.nudge : 0,
          opacity: 1,
        }}
        exit={{ opacity: 0, transition: exitFor(durations.fast) }}
        transition={
          motionSafe
            ? {
                scale: dragging
                  ? springs.snap
                  : landed
                    ? springs.recoil
                    : springs.snap,
                y: springs.snap,
                opacity: { duration: durations.fast },
              }
            : { duration: durations.fast }
        }
        className={cn(
          "pointer-events-auto relative block touch-none select-none",
          anchor,
          disabled
            ? "cursor-default"
            : dragging
              ? "cursor-grabbing"
              : "cursor-grab",
          FOCUS_RING,
        )}
        style={{
          ["--sa-pin" as string]: pigment,
          transformOrigin:
            pinStyle === "drop"
              ? "50% 100%"
              : pinStyle === "dot"
                ? "50% 50%"
                : "4px 50%",
        }}
      >
        {/* The pulse: one ring on snap when the pin's section takes focus. */}
        <AnimatePresence>
          {pulseSeq !== null && motionSafe ? (
            <motion.span
              key={pulseSeq}
              aria-hidden
              className="pointer-events-none absolute rounded-full border-2"
              style={{
                ...ringAt,
                borderColor: pigment,
                width: 22,
                height: 22,
                x: "-50%",
                y: "-50%",
              }}
              initial={{ scale: 0.6, opacity: 0.9 }}
              animate={{ scale: 2.6, opacity: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                scale: springs.snap,
                opacity: { duration: durations.slow, ease: easings.exit },
              }}
              onAnimationComplete={onPulseDone}
            />
          ) : null}
        </AnimatePresence>
        {/* Under reduced motion the active pin wears a still halo instead. */}
        {!motionSafe ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute rounded-full border-2 transition-opacity duration-150",
              active ? "opacity-70" : "opacity-0",
            )}
            style={{
              ...ringAt,
              borderColor: pigment,
              width: 34,
              height: 34,
              transform: "translate(-50%, -50%)",
            }}
          />
        ) : null}

        {pinStyle === "drop" ? (
          <span className="relative block h-8 w-[26px]">
            <svg
              aria-hidden
              viewBox="0 0 26 32"
              className="absolute inset-0 size-full drop-shadow-[0_2px_3px_color-mix(in_oklab,black_30%,transparent)]"
            >
              <path
                d="M13 1C6.4 1 1 6.4 1 12.6 1 20.8 13 31 13 31S25 20.8 25 12.6C25 6.4 19.6 1 13 1Z"
                fill="var(--sa-pin)"
                stroke="var(--bg-0)"
                strokeWidth={1.5}
                className="transition-[fill] duration-200"
              />
            </svg>
            <motion.span
              key={finding.severity}
              initial={motionSafe ? { scale: 1.35 } : false}
              animate={{ scale: 1 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
              className="absolute inset-x-0 top-[5px] text-center font-mono text-[11px] leading-[15px] font-semibold text-(--bg-0) tabular-nums"
            >
              {n}
            </motion.span>
          </span>
        ) : pinStyle === "dot" ? (
          <motion.span
            key={finding.severity}
            initial={motionSafe ? { scale: 1.3 } : false}
            animate={{ scale: 1 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
            className="flex size-[22px] items-center justify-center rounded-full border-2 border-(--bg-0) bg-(--sa-pin) font-mono text-[11px] font-semibold text-(--bg-0) tabular-nums shadow-[0_2px_4px_color-mix(in_oklab,black_30%,transparent)] transition-colors duration-200"
          >
            {n}
          </motion.span>
        ) : (
          <span className="relative flex h-5 items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full border border-(--bg-0) bg-(--sa-pin) transition-colors duration-200"
            />
            <motion.span
              key={finding.severity}
              initial={motionSafe ? { scale: 1.15 } : false}
              animate={{ scale: 1 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
              className="flex h-5 max-w-[9.5rem] items-center gap-1 rounded-full border border-(--bg-0) bg-(--sa-pin) px-1.5 font-mono text-[10px] font-semibold text-(--bg-0) shadow-[0_2px_4px_color-mix(in_oklab,black_30%,transparent)] transition-colors duration-200"
              style={{ transformOrigin: "0 50%" }}
            >
              <span className="tabular-nums">{n}</span>
              <span className="hidden min-w-0 truncate font-sans font-medium @min-[40rem]:inline">
                {finding.title.trim() || "Untitled"}
              </span>
            </motion.span>
          </span>
        )}
      </motion.button>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Section                                 */
/* ----------------------------------------------------------------------- */

type FindingCardProps = {
  finding: SiteFinding;
  n: number;
  severities: SiteSeverity[];
  density: SiteDensity;
  active: boolean;
  inert: boolean;
  motionSafe: boolean;
  uid: string;
  plan: SitePlan | null | undefined;
  sectionRef: (node: HTMLElement | null) => void;
  titleRef: (node: HTMLInputElement | null) => void;
  onActivate: () => void;
  onPatch: (patch: Partial<SiteFinding>, words: string) => void;
  onAttach: () => void;
  onRemove: () => void;
};

function FindingCard({
  finding,
  n,
  severities,
  density,
  active,
  inert,
  motionSafe,
  uid,
  plan,
  sectionRef,
  titleRef,
  onActivate,
  onPatch,
  onAttach,
  onRemove,
}: FindingCardProps) {
  const d = DENSITY[density];
  const sev = severities.find((s) => s.id === finding.severity);
  const pigment = PIGMENT[sev?.tone ?? "ink"];
  const done = siteCompleteness(finding);
  const headingId = `${uid}-h-${finding.id}`;
  const titleId = `${uid}-t-${finding.id}`;
  const noteId = `${uid}-n-${finding.id}`;
  const meterId = `${uid}-m-${finding.id}`;
  const controlClass =
    "w-full rounded-2 border border-hairline-strong bg-surface-0 text-foreground transition-colors placeholder:text-ink-3 hover:border-ink-3 disabled:cursor-not-allowed disabled:opacity-70";

  return (
    <section
      ref={sectionRef}
      id={`${uid}-s-${finding.id}`}
      tabIndex={-1}
      aria-labelledby={headingId}
      onFocusCapture={onActivate}
      className={cn(
        "relative flex flex-col rounded-3 border border-hairline bg-surface-0 transition-colors duration-200",
        d.pad,
        d.gap,
        FOCUS_RING,
      )}
      style={{
        ["--sa-sev" as string]: pigment,
        ["--sa-sev-line" as string]: `color-mix(in oklab, ${pigment} 45%, transparent)`,
        borderColor: active ? "var(--sa-sev-line)" : undefined,
      }}
    >
      <div className="flex items-center gap-2">
        <motion.span
          key={finding.severity}
          aria-hidden
          initial={motionSafe ? { scale: 1.3 } : false}
          animate={{ scale: 1 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-(--sa-sev) font-mono text-[11px] font-semibold text-(--bg-0) tabular-nums transition-colors duration-200"
        >
          {n}
        </motion.span>
        <h3 id={headingId} className="sr-only">
          Finding {n}
          {finding.title.trim() ? `: ${finding.title}` : ""}
          {plan ? `, ${placeWords(plan, finding.x, finding.y)}` : ""}
        </h3>
        <label htmlFor={titleId} className="sr-only">
          Finding {n} title
        </label>
        <input
          ref={titleRef}
          id={titleId}
          type="text"
          value={finding.title}
          disabled={inert}
          placeholder="What did you find?"
          autoComplete="off"
          onChange={(event) =>
            onPatch(
              { title: event.target.value },
              `Finding ${n} title changed.`,
            )
          }
          className={cn(
            controlClass,
            d.control,
            "min-w-0 flex-1 font-medium",
            FOCUS_RING,
          )}
        />
        <span
          className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums"
          aria-hidden
        >
          {done}/{PARTS}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove finding ${n}`}
          aria-disabled={inert || undefined}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors",
            inert
              ? "cursor-not-allowed"
              : "hover:bg-surface-2 hover:text-danger",
            FOCUS_RING,
          )}
        >
          <Trash2 aria-hidden className="size-3.5" />
        </button>
      </div>

      {/* Completeness: title, photo, note. */}
      <div
        id={meterId}
        role="meter"
        aria-label={`Finding ${n} completeness`}
        aria-valuemin={0}
        aria-valuemax={PARTS}
        aria-valuenow={done}
        aria-valuetext={`${done} of ${PARTS} parts: ${
          [
            finding.title.trim() ? "title" : null,
            finding.photo ? "photo" : null,
            finding.note.trim() ? "note" : null,
          ]
            .filter(Boolean)
            .join(", ") || "none yet"
        }`}
        className="h-1 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <motion.div
          className="h-full rounded-full"
          initial={false}
          animate={{
            width: `${(done / PARTS) * 100}%`,
            backgroundColor:
              done === PARTS ? "var(--success)" : "var(--accent-bright)",
          }}
          transition={
            motionSafe
              ? {
                  width: springs.glide,
                  backgroundColor: { duration: durations.base },
                }
              : { duration: durations.fast }
          }
        />
      </div>

      <div
        role="radiogroup"
        aria-label={`Finding ${n} severity`}
        className="flex flex-wrap gap-1"
      >
        {severities.map((s) => {
          const checked = s.id === finding.severity;
          const p = PIGMENT[s.tone];
          return (
            <label
              key={s.id}
              className={cn(
                "relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border font-medium transition-colors",
                d.seg,
                checked
                  ? "border-(--sa-opt-line) bg-(--sa-opt-wash) text-foreground"
                  : "border-hairline-strong text-ink-2 hover:bg-surface-2",
                inert && "cursor-not-allowed",
                "outline-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-solid",
              )}
              style={{
                ["--sa-opt" as string]: p,
                ["--sa-opt-line" as string]: `color-mix(in oklab, ${p} 55%, transparent)`,
                ["--sa-opt-wash" as string]: `color-mix(in oklab, ${p} 14%, transparent)`,
              }}
            >
              <input
                type="radio"
                name={`${uid}-sev-${finding.id}`}
                value={s.id}
                checked={checked}
                disabled={inert}
                onChange={() =>
                  onPatch(
                    { severity: s.id },
                    `Finding ${n} severity ${s.label}.`,
                  )
                }
                className="sr-only"
              />
              <span aria-hidden className="size-2 rounded-full bg-(--sa-opt)" />
              {s.label}
            </label>
          );
        })}
      </div>

      <div className={cn("flex items-start", d.gap)}>
        {finding.photo ? (
          <div
            className="relative flex shrink-0 flex-col items-center justify-center gap-1 rounded-2 border border-hairline bg-surface-2 text-ink-2"
            style={{ width: d.tile, height: d.tile }}
          >
            <ImageIcon aria-hidden className="size-4" />
            <span className="sr-only">Photo attached: {finding.photo}</span>
            <span
              aria-hidden
              className="max-w-full truncate px-1 font-mono text-[9px] text-ink-3"
            >
              {finding.photo}
            </span>
            <button
              type="button"
              aria-label={`Remove photo ${finding.photo} from finding ${n}`}
              aria-disabled={inert || undefined}
              onClick={() => {
                if (!inert)
                  onPatch({ photo: null }, `Finding ${n} photo removed.`);
              }}
              className={cn(
                "absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full border border-hairline bg-card text-ink-2 transition-colors hover:text-danger",
                FOCUS_RING,
              )}
            >
              <X aria-hidden className="size-2.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAttach}
            aria-label={`Attach a photo to finding ${n}`}
            aria-disabled={inert || undefined}
            className={cn(
              "flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-2 border border-dashed border-hairline-strong text-ink-3 transition-colors",
              inert
                ? "cursor-not-allowed"
                : "hover:border-ink-3 hover:text-ink-2",
              FOCUS_RING,
            )}
            style={{ width: d.tile, height: d.tile }}
          >
            <Camera aria-hidden className="size-4" />
            <span className="font-mono text-[9px] tracking-[0.08em] uppercase">
              Photo
            </span>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <label htmlFor={noteId} className="sr-only">
            Finding {n} note
          </label>
          <textarea
            id={noteId}
            value={finding.note}
            disabled={inert}
            rows={2}
            placeholder="Add a note"
            onChange={(event) =>
              onPatch(
                { note: event.target.value },
                `Finding ${n} note changed.`,
              )
            }
            className={cn(
              controlClass,
              d.area,
              "resize-none leading-snug",
              FOCUS_RING,
            )}
            style={{ height: d.tile }}
          />
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Stage = { w: number; h: number };
type Press = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  ox: number;
  oy: number;
  moved: boolean;
};
type FocusReq = {
  kind: "pin" | "title" | "section" | "plan" | "add";
  id: string | null;
  seq: number;
};

/**
 * A field survey beside its site plan. The plan is a schematic plot — a
 * boundary, buildings, access and trees drawn from a small description — with
 * one numbered pin per finding; the form beside it has one section per pin,
 * each with a title, a severity, a photo slot and a note, and a slim meter
 * that fills as the three parts are given.
 *
 * Focusing a section finds its pin: one ring pulses out of it on
 * `springs.snap` and the pin lifts a little, then holds still; pressing a pin
 * scrolls its section into view and hands it focus. Add finding arms the
 * plan — a crosshair follows the pointer, or arrows walk it — and a press
 * drops a new pin that lands on `springs.recoil` while its section glides in
 * at the foot of the form on `springs.glide`. Pins can be dragged to a better
 * spot and settle on recoil when let go; a severity change retints the pin
 * and its badge with a small bump on snap, a removed finding leaves on the
 * exit ease and the rest renumber and close up on glide, and the footer's
 * counts by severity roll with every change.
 *
 * The plan is an application region: arrows move the crosshair, Enter drops
 * it, Escape cancels; the pins are one roving stop (arrows between them,
 * Enter opens the section, Shift+arrows nudge, Delete removes); the form is
 * native. Under reduced motion no ring travels and nothing glides: the active
 * pin wears a still halo, sections appear in place, scrolling is instant, and
 * every count, colour and announcement still changes.
 */
export function SiteAssessment({
  planStyle = "line",
  pinStyle = "drop",
  density = "cozy",
  plan = defaultSitePlan,
  severities = defaultSiteSeverities,
  findings,
  defaultFindings = defaultSiteFindings,
  onChange,
  onSubmit,
  onUploadPlan,
  onAttachPhoto,
  status = "ready",
  onRetry,
  title = "Site assessment",
  label,
  height = 540,
  disabled = false,
  className,
}: SiteAssessmentProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const planHintId = `${uid}-plan-hint`;
  const gridId = `${uid}-grid`;
  const d = DENSITY[density];

  const [own, setOwn] = React.useState<SiteFinding[]>(defaultFindings);
  const current = findings ?? own;
  const ready = status === "ready";
  const inert = disabled || !ready;
  const hasPlan = ready && !!plan;

  const [placing, setPlacing] = React.useState(false);
  const [cross, setCross] = React.useState<{ x: number; y: number } | null>(
    null,
  );
  const [active, setActive] = React.useState<string | null>(null);
  const [pulse, setPulse] = React.useState<{ id: string; seq: number } | null>(
    null,
  );
  const [drag, setDrag] = React.useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [landed, setLanded] = React.useState<string | null>(null);
  const [stage, setStage] = React.useState<Stage | null>(null);
  const [focusReq, setFocusReq] = React.useState<FocusReq | null>(null);
  const [submitted, setSubmitted] = React.useState<number | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration, so the sections already on
  // the page never glide in; true for findings that arrive later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const formRef = React.useRef<HTMLDivElement | null>(null);
  const addRef = React.useRef<HTMLButtonElement | null>(null);
  const pinNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const sectionNodes = React.useRef(new Map<string, HTMLElement>());
  const titleNodes = React.useRef(new Map<string, HTMLInputElement>());
  const press = React.useRef<Press | null>(null);
  const dragRef = React.useRef<{ x: number; y: number } | null>(null);
  const suppressClick = React.useRef(false);
  const handledFocus = React.useRef(0);
  const photoSeq = React.useRef(0);

  const planW = plan?.width ?? 0;
  const planH = plan?.height ?? 0;

  /* ----------------------------- measuring ----------------------------- */

  React.useEffect(() => {
    const panel = panelRef.current;
    if (
      !panel ||
      !hasPlan ||
      planW <= 0 ||
      planH <= 0 ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }
    const measure = () => {
      const cs = getComputedStyle(panel);
      const w =
        panel.clientWidth -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight);
      const h =
        panel.clientHeight -
        parseFloat(cs.paddingTop) -
        parseFloat(cs.paddingBottom);
      if (w <= 0 || h <= 0) return;
      const ratio = planW / planH;
      let fw = w;
      let fh = w / ratio;
      if (fh > h) {
        fh = h;
        fw = h * ratio;
      }
      const next = { w: Math.floor(fw), h: Math.floor(fh) };
      setStage((prev) =>
        prev && prev.w === next.w && prev.h === next.h ? prev : next,
      );
    };
    const ro = new ResizeObserver(measure);
    ro.observe(panel);
    return () => ro.disconnect();
  }, [hasPlan, planW, planH]);

  /* ------------------------------- changes ----------------------------- */

  const commit = (next: SiteFinding[], change: SiteChange, words: string) => {
    if (findings === undefined) setOwn(next);
    onChange?.(next, change);
    if (words) setAnnouncement(words);
  };

  const patch = (id: string, p: Partial<SiteFinding>, words: string) => {
    if (inert) return;
    const next = current.map((f) => (f.id === id ? { ...f, ...p } : f));
    commit(next, { kind: "edit", id }, words);
  };

  const move = (id: string, x: number, y: number, words: string) => {
    if (inert || !plan) return;
    const cx = clamp(Math.round(x), 0, plan.width);
    const cy = clamp(Math.round(y), 0, plan.height);
    const next = current.map((f) => (f.id === id ? { ...f, x: cx, y: cy } : f));
    commit(next, { kind: "move", id }, words);
  };

  const indexOf = (id: string) => current.findIndex((f) => f.id === id);

  const activate = (id: string, force: boolean) => {
    if (!force && active === id) return;
    setActive(id);
    setPulse((p) => ({ id, seq: (p?.seq ?? 0) + 1 }));
  };

  const add = (x: number, y: number) => {
    if (inert || !plan) return;
    const id = nextId();
    const cx = clamp(Math.round(x), 0, plan.width);
    const cy = clamp(Math.round(y), 0, plan.height);
    const finding: SiteFinding = {
      id,
      x: cx,
      y: cy,
      title: "",
      severity: severities[0]?.id ?? "",
      note: "",
      photo: null,
    };
    const next = [...current, finding];
    setPlacing(false);
    setCross(null);
    setLanded(id);
    activate(id, true);
    commit(
      next,
      { kind: "add", id },
      `Finding ${next.length} placed ${placeWords(plan, cx, cy)}. Give it a title.`,
    );
    setFocusReq((f) => ({ kind: "title", id, seq: (f?.seq ?? 0) + 1 }));
  };

  const remove = (id: string, from: "pin" | "section") => {
    if (inert) return;
    const i = indexOf(id);
    if (i < 0) return;
    const next = current.filter((f) => f.id !== id);
    const neighbour = next[Math.min(i, next.length - 1)] ?? null;
    if (active === id) setActive(neighbour?.id ?? null);
    setPulse(null);
    commit(
      next,
      { kind: "remove", id },
      `Finding ${i + 1} removed. ${next.length} ${next.length === 1 ? "finding" : "findings"} left.`,
    );
    setFocusReq((f) => ({
      kind:
        from === "pin"
          ? neighbour
            ? "pin"
            : "plan"
          : neighbour
            ? "title"
            : "add",
      id: neighbour?.id ?? null,
      seq: (f?.seq ?? 0) + 1,
    }));
  };

  const attach = (finding: SiteFinding) => {
    if (inert) return;
    const n = indexOf(finding.id) + 1;
    const given = onAttachPhoto?.(finding);
    photoSeq.current += 1;
    const name =
      typeof given === "string" && given
        ? given
        : `IMG_${String(4120 + photoSeq.current).padStart(4, "0")}.jpg`;
    patch(
      finding.id,
      { photo: name },
      `Photo ${name} attached to finding ${n}.`,
    );
  };

  const cancelPlacing = () => {
    setPlacing(false);
    setCross(null);
    setAnnouncement("Placing cancelled.");
  };

  const startPlacing = () => {
    if (inert || !plan) return;
    setPlacing(true);
    setCross((c) => c ?? { x: plan.width / 2, y: plan.height / 2 });
    setAnnouncement(
      "Placing a finding. Click the plan, or move the crosshair with arrows and press Enter.",
    );
  };

  const titled = current.every((f) => f.title.trim().length > 0);
  const canSubmit = !inert && current.length > 0 && titled;
  const untitled = current.filter((f) => !f.title.trim()).length;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit?.(current);
    setSubmitted((s) => (s ?? 0) + 1);
    setAnnouncement(
      `Assessment submitted with ${current.length} ${current.length === 1 ? "finding" : "findings"}.`,
    );
  };

  /* ------------------------------- focus ------------------------------- */

  const scrollToSection = (id: string) => {
    const form = formRef.current;
    const node = sectionNodes.current.get(id);
    if (!form || !node) return;
    const fr = form.getBoundingClientRect();
    const nr = node.getBoundingClientRect();
    if (nr.top >= fr.top + 4 && nr.bottom <= fr.bottom - 4) return;
    const top = form.scrollTop + (nr.top - fr.top) - 6;
    form.scrollTo({ top, behavior: motionSafe ? "smooth" : "auto" });
  };

  React.useLayoutEffect(() => {
    if (!focusReq || handledFocus.current === focusReq.seq) return;
    handledFocus.current = focusReq.seq;
    const opts = { preventScroll: true } as const;
    if (focusReq.kind === "plan") stageRef.current?.focus(opts);
    else if (focusReq.kind === "add") addRef.current?.focus(opts);
    else if (focusReq.id) {
      if (focusReq.kind === "pin")
        pinNodes.current.get(focusReq.id)?.focus(opts);
      else if (focusReq.kind === "title") {
        titleNodes.current.get(focusReq.id)?.focus(opts);
        scrollToSection(focusReq.id);
      } else {
        sectionNodes.current.get(focusReq.id)?.focus(opts);
        scrollToSection(focusReq.id);
      }
    }
  });

  const pressPin = (id: string) => {
    activate(id, true);
    setFocusReq((f) => ({ kind: "section", id, seq: (f?.seq ?? 0) + 1 }));
  };

  /* ------------------------------- pointer ----------------------------- */

  const toPlan = (clientX: number, clientY: number) => {
    const node = stageRef.current;
    if (!node || !plan) return null;
    const r = node.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return {
      x: clamp(((clientX - r.left) / r.width) * plan.width, 0, plan.width),
      y: clamp(((clientY - r.top) / r.height) * plan.height, 0, plan.height),
    };
  };

  const onStageMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!placing || press.current) return;
    const p = toPlan(event.clientX, event.clientY);
    if (p) setCross(p);
  };

  const onStageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!placing || inert) return;
    if (
      event.target !== event.currentTarget &&
      (event.target as HTMLElement).closest("button")
    ) {
      return;
    }
    const p = toPlan(event.clientX, event.clientY);
    if (p) add(p.x, p.y);
  };

  const onPinDown = (
    id: string,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (inert || !plan || event.button !== 0) return;
    const f = current.find((x) => x.id === id);
    if (!f) return;
    press.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      ox: f.x,
      oy: f.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPinMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    const node = stageRef.current;
    if (!p || !node || !plan || p.pointerId !== event.pointerId) return;
    const dx = event.clientX - p.startX;
    const dy = event.clientY - p.startY;
    if (!p.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    p.moved = true;
    const r = node.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const at = {
      x: clamp(p.ox + (dx / r.width) * plan.width, 0, plan.width),
      y: clamp(p.oy + (dy / r.height) * plan.height, 0, plan.height),
    };
    dragRef.current = at;
    setDrag({ id: p.id, ...at });
  };

  const onPinEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || p.pointerId !== event.pointerId) return;
    press.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!p.moved) return;
    // The click that follows a drag is not a press.
    suppressClick.current = event.type === "pointerup";
    const at = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    setLanded(p.id);
    if (at && event.type === "pointerup") {
      move(
        p.id,
        at.x,
        at.y,
        `Pin ${indexOf(p.id) + 1} moved ${placeWords(plan, at.x, at.y)}.`,
      );
    }
  };

  /* ------------------------------ keyboard ----------------------------- */

  const onPlanKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || inert || !plan) return;
    const step = ((event.shiftKey ? 4 : 1) * plan.width) / 40;
    const base = cross ?? { x: plan.width / 2, y: plan.height / 2 };
    let next: { x: number; y: number } | null = null;
    if (event.key === "ArrowLeft") next = { x: base.x - step, y: base.y };
    else if (event.key === "ArrowRight") next = { x: base.x + step, y: base.y };
    else if (event.key === "ArrowUp") next = { x: base.x, y: base.y - step };
    else if (event.key === "ArrowDown") next = { x: base.x, y: base.y + step };
    if (next) {
      event.preventDefault();
      const c = {
        x: clamp(next.x, 0, plan.width),
        y: clamp(next.y, 0, plan.height),
      };
      setPlacing(true);
      setCross(c);
      setAnnouncement(`Crosshair ${placeWords(plan, c.x, c.y)}.`);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!placing) startPlacing();
      else add(base.x, base.y);
      return;
    }
    if (event.key === "Escape" && placing) {
      event.preventDefault();
      event.stopPropagation();
      cancelPlacing();
    }
  };

  const onPinKey = (
    id: string,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (!plan) return;
    const i = indexOf(id);
    const n = current.length;
    const arrow =
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight" ||
      event.key === "ArrowUp" ||
      event.key === "ArrowDown";
    if (arrow && event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      if (inert) return;
      const f = current[i];
      if (!f) return;
      const step = plan.width / 50;
      const x =
        f.x +
        (event.key === "ArrowRight"
          ? step
          : event.key === "ArrowLeft"
            ? -step
            : 0);
      const y =
        f.y +
        (event.key === "ArrowDown"
          ? step
          : event.key === "ArrowUp"
            ? -step
            : 0);
      setLanded(null);
      move(id, x, y, `Pin ${i + 1} moved ${placeWords(plan, x, y)}.`);
      return;
    }
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = n - 1;
    else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      event.stopPropagation();
      remove(id, "pin");
      return;
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      stageRef.current?.focus({ preventScroll: true });
      return;
    } else return;
    event.preventDefault();
    event.stopPropagation();
    const target = current[clamp(to, 0, n - 1)];
    if (target) {
      setActive(target.id);
      pinNodes.current.get(target.id)?.focus({ preventScroll: true });
    }
  };

  /* ------------------------------- render ------------------------------ */

  const sevById = new Map(severities.map((s) => [s.id, s]));
  const counts = severities.map((s) => ({
    s,
    n: current.filter((f) => f.severity === s.id).length,
  }));
  const complete = current.filter((f) => siteCompleteness(f) === PARTS).length;
  const pinStop =
    active && current.some((f) => f.id === active)
      ? active
      : (current[0]?.id ?? null);
  const step = cascade(Math.min(current.length, 8));

  const vars: Record<string, string> = { ...PLAN_VARS[planStyle] };

  const planPanel = (
    <div
      ref={panelRef}
      className={cn(
        "relative flex min-h-0 shrink-0 items-center justify-center p-3",
        "h-[220px] @min-[40rem]:h-auto @min-[40rem]:min-h-0 @min-[40rem]:flex-1",
      )}
    >
      {status === "loading" ? (
        <div
          aria-hidden
          className="h-full w-full rounded-3 bg-surface-2 motion-safe:animate-pulse"
        />
      ) : !plan ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-3 border border-dashed border-hairline-strong px-4 text-center">
          <Upload aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-foreground">No site plan yet</p>
          <p className="text-[12px] text-ink-3">
            Drop a plan here, or choose one to place findings on.
          </p>
          <button
            type="button"
            onClick={() => {
              if (!disabled) onUploadPlan?.();
            }}
            aria-disabled={disabled || undefined}
            className={cn(
              "mt-1 inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            <Upload aria-hidden className="size-3.5" />
            Choose a plan
          </button>
        </div>
      ) : (
        <div
          ref={stageRef}
          role="application"
          aria-roledescription="site plan"
          aria-label={`Site plan of ${plan.label}, ${current.length} ${current.length === 1 ? "pin" : "pins"}${placing ? ", placing a finding" : ""}`}
          aria-describedby={planHintId}
          tabIndex={inert ? -1 : 0}
          onKeyDown={onPlanKey}
          onPointerMove={onStageMove}
          onClick={onStageClick}
          className={cn(
            "relative rounded-3",
            placing && !inert && "cursor-crosshair",
            FOCUS_RING,
          )}
          style={
            stage
              ? { width: stage.w, height: stage.h }
              : {
                  width: "100%",
                  aspectRatio: `${plan.width} / ${plan.height}`,
                  maxHeight: "100%",
                }
          }
        >
          <div
            className={cn(
              "absolute inset-0 overflow-hidden rounded-3 border transition-colors duration-200",
              placing
                ? "border-[color-mix(in_oklab,var(--accent-bright)_55%,transparent)]"
                : "border-hairline",
            )}
          >
            <PlanArt plan={plan} planStyle={planStyle} gridId={gridId} />
          </div>

          {/* Crosshair while placing. */}
          <AnimatePresence>
            {placing && cross ? (
              <motion.div
                key="cross"
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-hidden rounded-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast, ease: easings.enter }}
              >
                <motion.span
                  className="absolute inset-y-0 w-px"
                  style={{ backgroundColor: "var(--sa-cross)", opacity: 0.6 }}
                  initial={false}
                  animate={{ left: `${r3((cross.x / plan.width) * 100)}%` }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
                <motion.span
                  className="absolute inset-x-0 h-px"
                  style={{ backgroundColor: "var(--sa-cross)", opacity: 0.6 }}
                  initial={false}
                  animate={{ top: `${r3((cross.y / plan.height) * 100)}%` }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
                <motion.span
                  className="absolute size-4 rounded-full border-2"
                  style={{
                    borderColor: "var(--sa-cross)",
                    x: "-50%",
                    y: "-50%",
                  }}
                  initial={false}
                  animate={{
                    left: `${r3((cross.x / plan.width) * 100)}%`,
                    top: `${r3((cross.y / plan.height) * 100)}%`,
                  }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div
            role="group"
            aria-label="Pins"
            className="pointer-events-none absolute inset-0"
          >
            <AnimatePresence initial={false}>
              {current.map((f, i) => {
                const at = drag && drag.id === f.id ? drag : f;
                return (
                  <Pin
                    key={f.id}
                    finding={at === f ? f : { ...f, x: at.x, y: at.y }}
                    n={i + 1}
                    severity={sevById.get(f.severity)}
                    pinStyle={pinStyle}
                    plan={plan}
                    active={active === f.id}
                    pulseSeq={pulse && pulse.id === f.id ? pulse.seq : null}
                    dragging={drag?.id === f.id}
                    landed={landed === f.id}
                    tabIndex={!inert && pinStop === f.id ? 0 : -1}
                    disabled={inert}
                    motionSafe={motionSafe}
                    nodeRef={(node) => {
                      if (node) pinNodes.current.set(f.id, node);
                      else pinNodes.current.delete(f.id);
                    }}
                    onPress={() => {
                      if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                      }
                      pressPin(f.id);
                    }}
                    onPointerDown={(event) => onPinDown(f.id, event)}
                    onPointerMove={onPinMove}
                    onPointerEnd={onPinEnd}
                    onKeyDown={(event) => onPinKey(f.id, event)}
                    onPulseDone={() =>
                      setPulse((p) => (p && p.id === f.id ? null : p))
                    }
                  />
                );
              })}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {placing ? (
              <motion.p
                key="placing"
                className="pointer-events-none absolute top-2 left-2 z-40 flex items-center gap-1.5 rounded-full border border-hairline bg-popover px-2 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase shadow-[0_6px_18px_-8px_color-mix(in_oklab,black_45%,transparent)]"
                initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? { ...springs.snap, opacity: { duration: durations.fast } }
                    : { duration: durations.fast }
                }
              >
                <Crosshair aria-hidden className="size-3 text-cobalt-bright" />
                Click to place
                <span className="hidden @min-[30rem]:inline">
                  {" "}
                  · Esc cancels
                </span>
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      )}
    </div>
  );

  const formPanel = (
    <div
      ref={formRef}
      className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-hairline @min-[40rem]:border-t-0 @min-[40rem]:border-l"
    >
      {status === "loading" ? (
        <div aria-hidden className="flex flex-col gap-2.5 p-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-3 border border-hairline p-3"
              style={{ animationDelay: `${i * 110}ms` }}
            >
              <span className="h-7 w-3/4 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
              <span className="h-1 w-full rounded-full bg-surface-2 motion-safe:animate-pulse" />
              <span className="h-12 w-full rounded-2 bg-surface-2 motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
      ) : current.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-center">
          <MapPin aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-foreground">No findings yet</p>
          <p className="text-[12px] text-ink-3">
            {plan
              ? "Press Add finding, then click the plan where it is."
              : "Add a plan first, then place findings on it."}
          </p>
        </div>
      ) : (
        <ol
          aria-label="Findings"
          className={cn("relative flex flex-col", d.gap, d.pad)}
        >
          <AnimatePresence initial={false}>
            {current.map((f, i) => (
              <motion.li
                key={f.id}
                layout={motionSafe ? "position" : false}
                initial={
                  live
                    ? {
                        height: 0,
                        opacity: 0,
                        y: motionSafe ? distances.step : 0,
                      }
                    : false
                }
                animate={{ height: "auto", opacity: 1, y: 0 }}
                exit={{
                  height: 0,
                  opacity: 0,
                  transition: exitFor(durations.base),
                }}
                transition={{
                  layout: springs.glide,
                  height: motionSafe ? springs.glide : { duration: 0 },
                  y: motionSafe
                    ? { ...springs.glide, delay: r3(Math.min(i, 8) * step) }
                    : { duration: 0 },
                  opacity: { duration: durations.base, ease: easings.enter },
                }}
                onAnimationComplete={() => {
                  if (landed === f.id && focusReq?.id === f.id)
                    scrollToSection(f.id);
                }}
                className="-m-1 overflow-hidden p-1"
              >
                <FindingCard
                  finding={f}
                  n={i + 1}
                  severities={severities}
                  density={density}
                  active={active === f.id}
                  inert={inert}
                  motionSafe={motionSafe}
                  uid={uid}
                  plan={plan}
                  sectionRef={(node) => {
                    if (node) sectionNodes.current.set(f.id, node);
                    else sectionNodes.current.delete(f.id);
                  }}
                  titleRef={(node) => {
                    if (node) titleNodes.current.set(f.id, node);
                    else titleNodes.current.delete(f.id);
                  }}
                  onActivate={() => activate(f.id, false)}
                  onPatch={(p, words) => patch(f.id, p, words)}
                  onAttach={() => attach(f)}
                  onRemove={() => remove(f.id, "section")}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </div>
  );

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === "Escape" && placing) {
          event.preventDefault();
          cancelPlacing();
        }
      }}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ...vars }}
    >
      <p id={planHintId} className="sr-only">
        Arrows move a crosshair, Enter drops a pin there, Escape cancels. Tab
        reaches the pins: arrows move between them, Enter opens a pin&apos;s
        section, Shift and arrows nudge it, Delete removes it.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2.5">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {ready && plan
              ? plan.label
              : status === "loading"
                ? "Loading"
                : "No plan"}
            {ready ? (
              <>
                {" "}
                · {current.length}{" "}
                {current.length === 1 ? "finding" : "findings"}
              </>
            ) : null}
          </p>
        </div>
        <button
          ref={addRef}
          type="button"
          onClick={() => (placing ? cancelPlacing() : startPlacing())}
          aria-pressed={placing}
          aria-disabled={inert || !plan || undefined}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1 rounded-2 border px-2 text-xs transition-colors",
            placing
              ? "border-[color-mix(in_oklab,var(--accent-bright)_45%,transparent)] bg-cobalt-wash text-cobalt-bright"
              : inert || !plan
                ? "cursor-not-allowed border-hairline text-ink-3"
                : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          {placing ? (
            <X aria-hidden className="size-3.5" />
          ) : (
            <Plus aria-hidden className="size-3.5" />
          )}
          {placing ? "Cancel" : "Add finding"}
        </button>
      </header>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 border-t border-hairline px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The survey didn&apos;t load.
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
      ) : (
        <div className="flex min-h-0 flex-1 flex-col border-t border-hairline @min-[40rem]:grid @min-[40rem]:grid-cols-[minmax(0,11fr)_minmax(0,13fr)] @min-[40rem]:grid-rows-[minmax(0,1fr)]">
          {planPanel}
          {formPanel}
        </div>
      )}

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-hairline px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {counts.map(({ s, n }) => (
            <p
              key={s.id}
              className="flex items-center gap-1.5 text-[12px] text-ink-2"
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: PIGMENT[s.tone] }}
              />
              <span className="sr-only">
                {n} {s.label.toLowerCase()}
              </span>
              <Roll
                value={n}
                motionSafe={motionSafe}
                className="font-mono text-[12px] text-foreground"
              />
              <span aria-hidden className="hidden @min-[30rem]:inline">
                {s.label}
              </span>
            </p>
          ))}
          <p className="hidden text-[12px] text-ink-3 @min-[40rem]:block">
            <span className="sr-only">
              {complete} of {current.length} complete
            </span>
            <span aria-hidden>
              {complete}/{current.length} complete
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AnimatePresence>
            {submitted !== null ? (
              <motion.span
                key={submitted}
                aria-hidden
                initial={
                  motionSafe ? { scale: 0.6, opacity: 0 } : { opacity: 0 }
                }
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        scale: springs.recoil,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
                className="flex items-center gap-1 font-mono text-[10px] tracking-[0.08em] text-success uppercase"
              >
                <Check aria-hidden className="size-3" />
                Sent
              </motion.span>
            ) : null}
          </AnimatePresence>
          <button
            type="button"
            onClick={submit}
            aria-disabled={!canSubmit || undefined}
            title={
              !canSubmit && untitled > 0
                ? `${untitled} ${untitled === 1 ? "finding needs" : "findings need"} a title`
                : undefined
            }
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-xs font-medium transition-colors",
              canSubmit
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "cursor-not-allowed bg-surface-2 text-ink-3",
              FOCUS_RING,
            )}
          >
            Submit
          </button>
        </div>
      </footer>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
