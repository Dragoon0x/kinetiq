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
import {
  Download,
  FileImage,
  GitCompareArrows,
  ImageOff,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type RevisionVersion = {
  id: string;
  /** Who saved it. */
  author: string;
  /** When it was saved, in ms. */
  at: number;
  /** The file's size at that save, in bytes. */
  size: number;
  /** What changed, in a few words. */
  note: string;
  /** How the file looked. Omit it (or pass null) and a placeholder card says no preview was saved. */
  preview?: React.ReactNode | null;
};

export type RevisionReelStatus = "ready" | "loading" | "error";
export type RevisionReelStyle = "film" | "ticks" | "beads";
export type RevisionReelFit = "fit" | "fill" | "width";

export type RevisionReelProps = {
  /** Controlled versions, any order; they are shown oldest to newest by time. */
  versions?: RevisionVersion[];
  /** Initial versions when uncontrolled. @default defaultRevisionVersions */
  defaultVersions?: RevisionVersion[];
  /** Fires with the whole list when a restore adds a version. */
  onVersionsChange?: (versions: RevisionVersion[]) => void;
  /** Controlled version at the playhead, by id. */
  value?: string;
  /** Initial version at the playhead when uncontrolled. @default the newest */
  defaultValue?: string;
  /** Fires from the drag, tap or key that moved the playhead to a new version. */
  onValueChange?: (id: string) => void;
  /** Restore was pressed (or Enter). Return a promise to hold the card up while it saves; a rejection shows a failed card. */
  onRestore?: (version: RevisionVersion) => void | Promise<unknown>;
  /** Two versions were marked (C, C) and opened side by side, older first. */
  onCompare?: (older: RevisionVersion, newer: RevisionVersion) => void;
  /** Download was pressed (or D) for the version at the playhead. */
  onDownload?: (version: RevisionVersion) => void;
  /** Whether the history has arrived. @default "ready" */
  status?: RevisionReelStatus;
  /** "Try again" was pressed after the history failed to load. */
  onRetry?: () => void;
  /** The moment ages count from, in ms — never read from the clock. @default defaultRevisionNow */
  now?: number;
  /** The name a restore is saved under. @default "You" */
  author?: string;
  /** The file's name, shown in the header and naming the surface. @default "Waylight launch poster" */
  fileName?: string;
  /** How the reel is drawn: film frames, ticks placed by time, or beads on a thread. @default "film" */
  reelStyle?: RevisionReelStyle;
  /** How the preview sits in its pane: whole, cropped to fill, or fit to width and scrolled. @default "fit" */
  previewFit?: RevisionReelFit;
  /** Playhead, marks, the current card and Restore, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Height of the surface in px. @default 540 */
  height?: number;
  /** Nothing can be scrubbed, marked, restored or downloaded. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                Poster art                                */
/* ----------------------------------------------------------------------- */

const FitContext = React.createContext<RevisionReelFit>("fit");

/**
 * The default file: a night-market poster drawn in code, one step further
 * along at each save. It is deliberately fixed art — a printed poster looks
 * the same on a light page and a dark one — so its colours are literals.
 */
function PosterArt({ step }: { step: number }) {
  const fit = React.useContext(FitContext);
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const warm = step >= 3;
  const m = step >= 8 ? 24 : 18;
  const w = 300 - 2 * m;
  const skyH = step >= 1 ? 196 : 170;
  const sunR = 24 + Math.min(step, 6) * 2;
  const sunX = step >= 2 ? 150 : 212;
  const ground = m + skyH;
  const headY = step >= 5 ? ground + 62 : ground + 74;
  const ink = step >= 10 ? "oklch(0.3 0.07 35)" : "oklch(0.25 0.03 260)";
  const qr = [
    0b1110111, 0b1010101, 0b1110111, 0b0001000, 0b1101011, 0b0110110, 0b1011101,
  ];
  return (
    <svg
      viewBox="0 0 300 400"
      aria-hidden
      preserveAspectRatio={fit === "fill" ? "xMidYMid slice" : "xMidYMid meet"}
      className={cn(
        "block",
        fit === "width" ? "h-auto w-full" : "h-full w-full",
      )}
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0"
            stopColor={warm ? "oklch(0.66 0.12 40)" : "oklch(0.62 0.08 250)"}
          />
          <stop
            offset="1"
            stopColor={warm ? "oklch(0.88 0.09 80)" : "oklch(0.88 0.04 225)"}
          />
        </linearGradient>
      </defs>
      <rect width="300" height="400" fill="oklch(0.97 0.012 85)" />
      <rect x={m} y={m} width={w} height={skyH} fill={`url(#${id}-sky)`} />
      <circle
        cx={sunX}
        cy={m + Math.round(skyH * 0.5)}
        r={sunR}
        fill="oklch(0.93 0.12 88)"
      />
      {step >= 4 ? (
        <path
          d={`M${m} ${ground} L${m} ${ground - 52} Q 110 ${ground - 96} 186 ${ground - 58} T ${300 - m} ${ground - 70} L ${300 - m} ${ground} Z`}
          fill="oklch(0.56 0.07 170)"
        />
      ) : null}
      <path
        d={`M${m} ${ground} L${m} ${ground - 34} Q 96 ${ground - 70} 160 ${ground - 36} T ${300 - m} ${ground - 44} L ${300 - m} ${ground} Z`}
        fill="oklch(0.4 0.06 175)"
      />
      {step >= 4
        ? [0, 1, 2, 3, 4, 5, 6].map((i) => (
            <circle
              key={i}
              cx={m + 22 + i * Math.round((w - 44) / 6)}
              cy={ground - 10}
              r={2.5}
              fill="oklch(0.92 0.14 85)"
            />
          ))
        : null}
      <text
        x="150"
        y={headY}
        textAnchor="middle"
        fontSize={step >= 2 ? 44 : 38}
        fontWeight={800}
        letterSpacing={step >= 10 ? 1 : step >= 6 ? -0.5 : 2}
        fill={ink}
      >
        WAYLIGHT
      </text>
      <text
        x="150"
        y={headY + 24}
        textAnchor="middle"
        fontSize="10"
        fontWeight={600}
        letterSpacing="2.5"
        fill={ink}
        opacity="0.75"
      >
        NIGHT MARKET · BASIN PIER
      </text>
      {step >= 7 ? (
        <text
          x="150"
          y={headY + 42}
          textAnchor="middle"
          fontSize="9"
          letterSpacing="1.5"
          fill={ink}
          opacity="0.6"
        >
          FRI 24 OCT · 19:00
        </text>
      ) : null}
      {step >= 7 ? (
        <g opacity="0.85">
          <circle cx={m + 10} cy={400 - m - 12} r="7" fill={ink} />
          <rect
            x={m + 22}
            y={400 - m - 15}
            width="42"
            height="6"
            rx="2"
            fill={ink}
          />
        </g>
      ) : null}
      {step >= 9
        ? qr.map((row, r) =>
            [0, 1, 2, 3, 4, 5, 6].map((c) =>
              (row >>> (6 - c)) & 1 ? (
                <rect
                  key={`${r}-${c}`}
                  x={300 - m - 42 + c * 6}
                  y={400 - m - 42 + r * 6}
                  width="6"
                  height="6"
                  fill={ink}
                />
              ) : null,
            ),
          )
        : null}
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Friday 9 October 2026, 16:00 UTC. */
export const defaultRevisionNow = Date.UTC(2026, 9, 9, 16, 0);

const NOTES: [string, number, number, string][] = [
  ["Ines", 10 * DAY + 3 * HOUR, 2.4, "First layout"],
  ["Mara", 9 * DAY + 5 * HOUR, 2.9, "Taller sky, bigger sun"],
  ["Mara", 9 * DAY + 2 * HOUR, 3.0, "Headline set larger"],
  ["Tomas", 7 * DAY + 6 * HOUR, 3.3, "Warmer palette"],
  ["Tomas", 7 * DAY + 4 * HOUR, 3.6, "Second hill, pier lights"],
  ["Priya", 6 * DAY + 1 * HOUR, 3.6, "Imported from print vendor"],
  ["Ines", 4 * DAY + 7 * HOUR, 3.7, "Tighter headline"],
  ["Kenji", 3 * DAY + 2 * HOUR, 3.9, "Date and logo lockup"],
  ["Kenji", 3 * DAY + 1 * HOUR, 3.9, "Margins realigned"],
  ["Mara", 1 * DAY + 4 * HOUR, 4.2, "Ticket code"],
  ["Ines", 5 * HOUR, 4.3, "Warm ink for type"],
  ["Ines", 2 * HOUR, 4.4, "Final type pass"],
];

/** Twelve saves of a launch poster over ten days; the sixth has no preview. */
export const defaultRevisionVersions: RevisionVersion[] = NOTES.map(
  ([author, ago, mb, note], i) => ({
    id: `rev-${i + 1}`,
    author,
    at: defaultRevisionNow - ago,
    size: Math.round(mb * 1e6),
    note,
    preview: i === 5 ? null : <PosterArt step={Math.min(i, 10)} />,
  }),
);

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const CARD_W = 128;
const INSET = 20;
const FAN_H = 92;
const ROW_H = 52;
/** The fan's bell: spacing far from the playhead, extra spacing at it, and its width in versions. */
const FAR = 18;
const BELL = 142;
const SIGMA = 1.3;
const SQRT_PI_2 = Math.sqrt(Math.PI) / 2;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

/** Abramowitz and Stegun 7.1.26: plenty for a spacing curve. */
function erf(x: number): number {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-a * a);
  return s * y;
}

function ago(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / MIN));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

const dayOf = (at: number) => {
  const d = new Date(at);
  return `${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
};

const sizeOf = (bytes: number) =>
  bytes >= 1e6
    ? `${(bytes / 1e6).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1e3))} KB`;

/** Where each version sits along the reel, 0 to 1. Ticks are placed by time, never closer than a minimum gap. */
function reelPlaces(list: RevisionVersion[], style: RevisionReelStyle) {
  const n = list.length;
  if (n <= 1) return list.map(() => 0.5);
  if (style !== "ticks") return list.map((_, i) => r3(i / (n - 1)));
  const first = list[0]?.at ?? 0;
  const span = Math.max(1, (list[n - 1]?.at ?? 0) - first);
  const gap = Math.min(0.045, 0.5 / (n - 1));
  const raw: number[] = [];
  list.forEach((v, i) => {
    const t = (v.at - first) / span;
    raw.push(i === 0 ? 0 : Math.max(t, (raw[i - 1] ?? 0) + gap));
  });
  const last = raw[n - 1] ?? 1;
  return raw.map((v) => r3(v / last));
}

/** A fractional version index to a place along the reel. */
function placeAt(us: number[], p: number): number {
  if (us.length === 0) return 0.5;
  const i = clamp(Math.floor(p), 0, us.length - 1);
  const a = us[i] ?? 0;
  const b = us[i + 1] ?? a;
  return a + (b - a) * clamp01(p - i);
}

/** A place along the reel back to a fractional version index. */
function indexAt(us: number[], f: number): number {
  const n = us.length;
  if (n <= 1) return 0;
  for (let i = 0; i < n - 1; i += 1) {
    const a = us[i] ?? 0;
    const b = us[i + 1] ?? 1;
    if (f <= b || i === n - 2)
      return i + clamp01((f - a) / Math.max(1e-6, b - a));
  }
  return n - 1;
}

type CardPose = {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  z: number;
  opacity: number;
};

/**
 * The deck. Each card's centre is the integral of a spacing curve from the
 * playhead: tight far away, a bell of extra room around it — a closed form
 * (an erf), so a card's place is one evaluation per frame, never a sum.
 */
function pose(
  i: number,
  p: number,
  n: number,
  w: number,
  us: number[],
  motionSafe: boolean,
): CardPose {
  const d = i - p;
  const z = 100 - Math.round(Math.abs(d) * 10);
  if (!motionSafe || n <= 1) {
    const spread =
      n > 1 ? Math.min(CARD_W + 8, Math.max(8, (w - CARD_W - 8) / (n - 1))) : 0;
    const left = (w - (spread * (n - 1) + CARD_W)) / 2;
    return {
      x: r2(left + i * spread),
      y: 0,
      rotate: 0,
      scale: 1,
      z,
      opacity: 1,
    };
  }
  const half = CARD_W / 2 + 4;
  const anchor = clamp(
    INSET + placeAt(us, p) * (w - 2 * INSET),
    half,
    Math.max(half, w - half),
  );
  const centre = anchor + FAR * d + BELL * SIGMA * SQRT_PI_2 * erf(d / SIGMA);
  const g = Math.exp(-d * d);
  return {
    x: r2(centre - CARD_W / 2),
    y: r2(-8 * g),
    rotate: r2(clamp(d * 2.5, -7, 7)),
    scale: r3(0.93 + 0.07 * g),
    z,
    opacity: r3(1 - Math.min(0.45, Math.abs(d) * 0.07)),
  };
}

/** Only ever called from handlers and effects. */
const stampNow = () => performance.now();

type Flight = { id: string; from: string; t: number };

function FanCard({
  version,
  index,
  count,
  pos,
  width,
  us,
  motionSafe,
  current,
  marked,
  lifted,
  flight,
  nodeOf,
  register,
  onPick,
  now,
}: {
  version: RevisionVersion;
  index: number;
  count: number;
  pos: MotionValue<number>;
  width: MotionValue<number>;
  us: number[];
  motionSafe: boolean;
  current: boolean;
  marked: boolean;
  lifted: boolean;
  flight: Flight | null;
  nodeOf: (id: string) => HTMLElement | undefined;
  register: (id: string, node: HTMLElement | null) => void;
  onPick: () => void;
  now: number;
}) {
  const at = ([p, w]: unknown[]) =>
    pose(index, Number(p ?? 0), count, Number(w ?? 640), us, motionSafe);
  const values = [pos, width] as MotionValue<number>[];
  const x = useTransform(values, (v) => at(v).x);
  const y = useTransform(values, (v) => at(v).y);
  const rotate = useTransform(values, (v) => at(v).rotate);
  const scale = useTransform(values, (v) => at(v).scale);
  const zIndex = useTransform(values, (v) => at(v).z);
  const opacity = useTransform(values, (v) => at(v).opacity);
  // Far from the playhead a card is only its tab: the words fade out, so the
  // stacked deck reads as a row of version numbers rather than torn text.
  const detail = useTransform(pos, (p) =>
    r3(clamp01(1.8 - Math.abs(index - p))),
  );

  const flyRef = React.useRef<HTMLDivElement | null>(null);
  React.useLayoutEffect(() => {
    const node = flyRef.current;
    if (!node || !flight || flight.id !== version.id || !motionSafe) return;
    if (stampNow() - flight.t > 900) return;
    const from = nodeOf(flight.from);
    if (!from) return;
    const a = from.getBoundingClientRect();
    const b = node.getBoundingClientRect();
    const dx = Math.round(a.left - b.left);
    const dy = Math.round(a.top - b.top);
    // Carried across on glide, set down with one crisp overshoot on snap.
    const controls = [
      animate(node, { x: [dx, 0] }, springs.glide),
      animate(node, { y: [dy - 12, 0] }, { ...springs.snap, delay: 0.12 }),
    ];
    return () => {
      for (const c of controls) c.complete();
    };
  }, [flight, version.id, motionSafe, nodeOf]);

  return (
    <motion.div
      className="absolute bottom-2.5 left-0"
      style={{
        x,
        y,
        rotate,
        scale,
        zIndex,
        opacity,
        originX: 0.5,
        originY: 1,
      }}
    >
      <div ref={flyRef}>
        <motion.div
          ref={(node: HTMLDivElement | null) => register(version.id, node)}
          initial={false}
          animate={{ y: lifted && motionSafe ? -12 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
          onClick={onPick}
          className={cn(
            "flex h-16 cursor-pointer flex-col justify-between rounded-3 border bg-card px-2.5 py-2 text-left shadow-[0_4px_14px_color-mix(in_oklab,black_10%,transparent)] transition-[border-color,box-shadow] duration-150",
            current
              ? "border-(--rr-accent) shadow-[0_0_0_1px_var(--rr-accent),0_6px_18px_color-mix(in_oklab,black_14%,transparent)]"
              : "border-hairline-strong hover:border-ink-3",
            lifted &&
              "shadow-[0_0_0_1px_var(--rr-accent),0_14px_28px_color-mix(in_oklab,black_22%,transparent)]",
          )}
          style={{ width: CARD_W }}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1">
              <span
                className={cn(
                  "font-mono text-[11px] font-medium tabular-nums",
                  current ? "text-(--rr-accent)" : "text-foreground",
                )}
              >
                v{index + 1}
              </span>
              {marked ? (
                <span className="size-1.5 rounded-full bg-(--rr-accent)" />
              ) : null}
            </span>
            <motion.span
              className="font-mono text-[10px] text-ink-3 tabular-nums"
              style={{ opacity: detail }}
            >
              {ago(version.at, now).replace(" ago", "")}
            </motion.span>
          </span>
          <motion.span
            className="flex min-w-0 flex-col gap-0.5"
            style={{ opacity: detail }}
          >
            <span className="truncate text-[11px] leading-4 text-foreground">
              {version.note}
            </span>
            <span className="truncate text-[10px] leading-3 text-ink-3">
              {version.author}
            </span>
          </motion.span>
        </motion.div>
      </div>
    </motion.div>
  );
}

/**
 * The placeholder a failed restore leaves at the top of the stack: where the
 * new version would have landed, dashed and in the danger tone.
 */
function FailedCard({
  index,
  count,
  pos,
  width,
  us,
  motionSafe,
}: {
  index: number;
  count: number;
  pos: MotionValue<number>;
  width: MotionValue<number>;
  us: number[];
  motionSafe: boolean;
}) {
  const at = ([p, w]: unknown[]) => {
    const wide = Number(w ?? 640);
    const pp = pose(count, Number(p ?? 0), count + 1, wide, us, motionSafe);
    return { ...pp, x: Math.min(pp.x, Math.round(wide - CARD_W - 4)) };
  };
  const values = [pos, width] as MotionValue<number>[];
  const x = useTransform(values, (v) => at(v).x);
  const y = useTransform(values, (v) => at(v).y);
  const rotate = useTransform(values, (v) => at(v).rotate);
  return (
    <motion.div
      className="absolute bottom-2.5 left-0"
      style={{ x, y, rotate, zIndex: 150, originX: 0.5, originY: 1 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: durations.base, ease: easings.enter }}
    >
      <div
        className="flex h-16 flex-col justify-between rounded-3 border border-dashed border-[color-mix(in_oklab,var(--danger)_55%,transparent)] bg-[color-mix(in_oklab,var(--danger)_7%,var(--card))] px-2.5 py-2"
        style={{ width: CARD_W }}
      >
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-danger">
          <TriangleAlert className="size-3 shrink-0" />
          Restore failed
        </span>
        <span className="truncate text-[11px] leading-4 text-foreground">
          v{index + 1} wasn&apos;t restored
        </span>
        <span className="text-[10px] leading-3 text-ink-3">
          Nothing changed
        </span>
      </div>
    </motion.div>
  );
}

function Placeholder({
  icon,
  title,
  detail,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  title: string;
  detail?: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div className="flex h-full w-full items-center-safe justify-center-safe p-4">
      <div
        className={cn(
          "flex w-full max-w-60 flex-col items-center gap-2 rounded-3 border border-dashed px-4 py-6 text-center",
          tone === "danger"
            ? "border-[color-mix(in_oklab,var(--danger)_45%,transparent)] bg-[color-mix(in_oklab,var(--danger)_6%,var(--card))]"
            : "border-hairline-strong bg-card",
        )}
      >
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-full",
            tone === "danger"
              ? "bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] text-danger"
              : "bg-surface-2 text-ink-3",
          )}
        >
          {icon}
        </span>
        <p className="text-[13px] font-medium text-foreground">{title}</p>
        {detail ? <p className="text-[11px] text-ink-3">{detail}</p> : null}
      </div>
    </div>
  );
}

function PreviewLayer({
  version,
  index,
  pos,
  locked,
  fit,
}: {
  version: RevisionVersion;
  index: number;
  pos: MotionValue<number>;
  locked: boolean;
  fit: RevisionReelFit;
}) {
  // The higher of the two versions on show fades over the lower one, so a
  // scrub is a true dissolve and never shows the pane through both.
  const opacity = useTransform(pos, (p) =>
    locked ? 1 : r3(clamp01(1 - Math.max(0, index - p))),
  );
  const missing = version.preview === undefined || version.preview === null;
  return (
    <motion.div
      className={cn(
        "[grid-area:1/1]",
        fit === "width" ? "px-6 py-4" : fit === "fit" ? "h-full p-4" : "h-full",
      )}
      style={{ opacity, zIndex: index + 1 }}
    >
      {missing ? (
        <div className="h-full bg-surface-1">
          <Placeholder
            icon={<ImageOff aria-hidden className="size-4" />}
            title={`No preview was saved for v${index + 1}`}
            detail={`${sizeOf(version.size)} · ${version.author}`}
          />
        </div>
      ) : (
        <div
          className={cn(
            "mx-auto h-full w-full",
            fit === "fit" &&
              "drop-shadow-[0_6px_16px_color-mix(in_oklab,black_16%,transparent)]",
            "[&>img]:h-full [&>img]:w-full",
            fit === "fill"
              ? "[&>img]:object-cover"
              : fit === "width"
                ? "[&>img]:h-auto"
                : "[&>img]:object-contain",
          )}
        >
          {version.preview}
        </div>
      )}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The reel                                 */
/* ----------------------------------------------------------------------- */

type Phase =
  | { kind: "idle" }
  | { kind: "restoring"; id: string }
  | { kind: "failed"; id: string };

/**
 * A version history you scrub like footage. A preview of the file sits over
 * a deck of version cards and a reel along the foot. Dragging the playhead
 * follows the finger 1:1 and dissolves the preview from one save into the
 * next by its fractional position, while the deck fans open around it — a
 * bell of extra room, a tilt away from the playhead and a lift for the card
 * at it, all read from one motion value. Let go and the playhead is thrown
 * to the version it would come to rest on, settling there on snap with the
 * release velocity; a tap glides there.
 *
 * Restore lifts the card while the host saves; then a new newest version is
 * born where that card was, carried to the top of the stack on glide and set
 * down on snap. C marks a version; a second mark opens the two side by side.
 * The reel is a slider (Left and Right step, Page keys jump five, Home and
 * End, Enter restores, C marks, D downloads, Escape closes the comparison);
 * at phone widths it becomes a listbox of versions with the same keys. Under
 * reduced motion the deck holds still and the playhead moves at once, but the
 * preview still dissolves — the preview is the information.
 */
export function RevisionReel({
  versions,
  defaultVersions,
  onVersionsChange,
  value,
  defaultValue,
  onValueChange,
  onRestore,
  onCompare,
  onDownload,
  status = "ready",
  onRetry,
  now = defaultRevisionNow,
  author = "You",
  fileName = "Waylight launch poster",
  reelStyle = "film",
  previewFit = "fit",
  accent = "var(--accent-bright)",
  height = 540,
  disabled = false,
  className,
}: RevisionReelProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";

  /* ------------------------------- state -------------------------------- */

  const [own, setOwn] = React.useState<RevisionVersion[]>(
    () => defaultVersions ?? defaultRevisionVersions,
  );
  const raw = versions ?? own;
  const list = React.useMemo(() => [...raw].sort((a, b) => a.at - b.at), [raw]);
  const n = list.length;
  const us = React.useMemo(
    () => reelPlaces(list, reelStyle),
    [list, reelStyle],
  );

  const [ownIndex, setOwnIndex] = React.useState(() => {
    const at = defaultValue ? list.findIndex((v) => v.id === defaultValue) : -1;
    return at === -1 ? Math.max(0, n - 1) : at;
  });
  const controlledAt =
    value !== undefined ? list.findIndex((v) => v.id === value) : -1;
  const index = clamp(
    controlledAt !== -1 ? controlledAt : ownIndex,
    0,
    Math.max(0, n - 1),
  );
  const current = list[index];

  const [marked, setMarked] = React.useState<string[]>([]);
  const [comparing, setComparing] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });
  const [flight, setFlight] = React.useState<Flight | null>(null);
  const [lock, setLock] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /* ---------------------------- the playhead ---------------------------- */

  const pos = useMotionValue(index);
  const width = useMotionValue(640);
  const running = React.useRef<AnimationPlaybackControls | null>(null);
  const shown = React.useRef(index);
  const [base, setBase] = React.useState(index);
  const baseRef = React.useRef(index);
  useMotionValueEvent(pos, "change", (p) => {
    const f = clamp(Math.floor(p + 1e-6), 0, Math.max(0, n - 1));
    if (f !== baseRef.current) {
      baseRef.current = f;
      setBase(f);
    }
  });

  const move = React.useCallback(
    (
      to: number,
      how: "glide" | "snap" | "jump",
      velocity = 0,
      onDone?: () => void,
    ) => {
      running.current?.stop();
      if (!motionSafe || how === "jump") {
        pos.jump(to);
        onDone?.();
        return;
      }
      running.current = animate(pos, to, {
        ...(how === "snap" ? springs.snap : springs.glide),
        velocity,
        onComplete: onDone,
      });
    },
    [motionSafe, pos],
  );

  // A host that moves `value` gets the same glide a key would.
  React.useEffect(() => {
    if (shown.current === index) return;
    shown.current = index;
    move(index, "glide");
  }, [index, move]);

  React.useEffect(() => () => running.current?.stop(), []);

  const goTo = (
    to: number,
    how: "glide" | "snap" | "jump" = "glide",
    velocity = 0,
  ) => {
    if (n === 0) return;
    const target = clamp(Math.round(to), 0, n - 1);
    setLock(null);
    shown.current = target;
    move(target, how, velocity);
    if (target !== index) {
      if (value === undefined) setOwnIndex(target);
      const v = list[target];
      if (v) onValueChange?.(v.id);
    }
  };

  /* ------------------------------ measuring ------------------------------ */

  const [strip, setStrip] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!strip) return;
    const measure = () => width.set(Math.round(strip.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(strip);
    return () => ro.disconnect();
  }, [strip, width]);

  const cardNodes = React.useRef(new Map<string, HTMLElement>());
  const register = React.useCallback((id: string, node: HTMLElement | null) => {
    if (node) cardNodes.current.set(id, node);
    else cardNodes.current.delete(id);
  }, []);
  const nodeOf = React.useCallback(
    (id: string) => cardNodes.current.get(id),
    [],
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const rowNodes = React.useRef(new Map<string, HTMLElement>());
  const [focusAsk, setFocusAsk] = React.useState<{
    id: string;
    n: number;
  } | null>(null);
  React.useEffect(() => {
    if (focusAsk) rowNodes.current.get(focusAsk.id)?.focus();
  }, [focusAsk]);

  /* ------------------------------ actions ------------------------------- */

  const locked = disabled || !ready || n === 0;

  const commitList = (next: RevisionVersion[]) => {
    if (versions === undefined) setOwn(next);
    onVersionsChange?.(next);
  };

  const succeed = (from: RevisionVersion, fromIndex: number) => {
    const newest = list[n - 1];
    const version: RevisionVersion = {
      id: `${idBase}-r${n + 1}`,
      author,
      at: Math.max(now, newest?.at ?? now) + MIN,
      size: from.size,
      note: `Restored from v${fromIndex + 1}`,
      preview: from.preview,
    };
    commitList([...list, version]);
    setPhase({ kind: "idle" });
    setFlight({ id: version.id, from: from.id, t: stampNow() });
    // The preview already shows what was restored; hold it while the
    // playhead travels, so the saves in between never flash past.
    setLock(version.id);
    shown.current = n;
    if (value === undefined) setOwnIndex(n);
    onValueChange?.(version.id);
    move(n, "glide", 0, () => setLock(null));
    say(`Restored v${fromIndex + 1} as v${n + 1}.`);
  };

  const restore = () => {
    if (locked || !current || phase.kind === "restoring") return;
    if (index === n - 1 && phase.kind !== "failed") {
      say(`v${index + 1} is already the latest version.`);
      return;
    }
    const from = current;
    const fromIndex = index;
    const result = onRestore?.(from);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setPhase({ kind: "restoring", id: from.id });
      say(`Restoring v${fromIndex + 1}.`);
      (result as Promise<unknown>).then(
        () => succeed(from, fromIndex),
        () => {
          setPhase({ kind: "failed", id: from.id });
          say(`Restore of v${fromIndex + 1} didn't finish. Nothing changed.`);
        },
      );
    } else {
      succeed(from, fromIndex);
    }
  };

  const retryFailed = () => {
    if (phase.kind !== "failed") return;
    const at = list.findIndex((v) => v.id === phase.id);
    if (at === -1) {
      setPhase({ kind: "idle" });
      return;
    }
    if (at !== index) goTo(at);
    const from = list[at];
    if (!from) return;
    const result = onRestore?.(from);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setPhase({ kind: "restoring", id: from.id });
      (result as Promise<unknown>).then(
        () => succeed(from, at),
        () => setPhase({ kind: "failed", id: from.id }),
      );
    } else succeed(from, at);
  };

  const mark = () => {
    if (locked || !current) return;
    if (marked.includes(current.id)) {
      setMarked(marked.filter((id) => id !== current.id));
      say(`v${index + 1} unmarked.`);
      return;
    }
    const next = [...marked.slice(-1), current.id];
    setMarked(next);
    if (next.length < 2) {
      say(`v${index + 1} marked. Mark one more to compare.`);
      return;
    }
    const pair = next
      .map((id) => list.findIndex((v) => v.id === id))
      .sort((a, b) => a - b);
    const older = list[pair[0] ?? 0];
    const newer = list[pair[1] ?? 0];
    if (older && newer) {
      setComparing(true);
      say(`Comparing v${(pair[0] ?? 0) + 1} and v${(pair[1] ?? 0) + 1}.`);
      onCompare?.(older, newer);
    }
  };

  const closeCompare = () => {
    setComparing(false);
    setMarked([]);
    say("Comparison closed.");
  };

  const download = () => {
    if (locked || !current) return;
    say(`Downloading v${index + 1}.`);
    onDownload?.(current);
  };

  /* ------------------------------ keyboard ------------------------------ */

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
    list_ = false,
  ) => {
    if (n === 0) return;
    const mod = event.ctrlKey || event.metaKey || event.altKey;
    let to: number | null = null;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        to = index - 1;
        break;
      case "ArrowRight":
      case "ArrowUp":
        to = index + 1;
        break;
      case "PageUp":
        to = index + 5;
        break;
      case "PageDown":
        to = index - 5;
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = n - 1;
        break;
      case "Enter":
        event.preventDefault();
        restore();
        return;
      case "Escape":
        if (comparing || marked.length > 0) {
          // Ours: the comparison closes, and nothing around the reel does.
          event.preventDefault();
          if (comparing) closeCompare();
          else setMarked([]);
        }
        return;
      default:
        break;
    }
    if (to !== null) {
      event.preventDefault();
      if (locked) return;
      const target = clamp(to, 0, n - 1);
      goTo(target, "glide");
      const v = list[target];
      if (list_ && v) setFocusAsk((f) => ({ id: v.id, n: (f?.n ?? 0) + 1 }));
      return;
    }
    if (mod) return;
    if (event.key === "c" || event.key === "C") {
      event.preventDefault();
      mark();
    } else if (event.key === "d" || event.key === "D") {
      event.preventDefault();
      download();
    }
  };

  /* -------------------------------- drag -------------------------------- */

  const grip = React.useRef<{ left: number; w: number } | null>(null);
  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled: locked,
    onStart: () => {
      running.current?.stop();
      setLock(null);
      const rect = trackRef.current?.getBoundingClientRect();
      grip.current = rect ? { left: rect.left, w: rect.width } : null;
    },
    onMove: ({ point }) => {
      const g = grip.current;
      if (!g || n <= 1) return;
      const usable = Math.max(1, g.w - 2 * INSET);
      const px = point.x - g.left - INSET;
      const per = usable / (n - 1);
      let p: number;
      if (px < 0) p = rubberband(px, usable * 0.4) / per;
      else if (px > usable)
        p = n - 1 + rubberband(px - usable, usable * 0.4) / per;
      else p = indexAt(us, px / usable);
      pos.set(r3(p));
    },
    onEnd: ({ velocity }) => {
      const g = grip.current;
      grip.current = null;
      if (!g || n <= 1) return;
      const per = Math.max(1, (g.w - 2 * INSET) / (n - 1));
      const v = velocity.x / per;
      const landing = project(pos.get(), v, 0.99);
      goTo(clamp(Math.round(landing), 0, n - 1), "snap", v);
    },
    onCancel: () => {
      grip.current = null;
      goTo(index, "snap");
    },
    onTap: (event) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || n <= 1) return;
      const f =
        (event.clientX - rect.left - INSET) /
        Math.max(1, rect.width - 2 * INSET);
      goTo(indexAt(us, clamp01(f)), "glide");
    },
  });

  /* ------------------------------- render ------------------------------- */

  const playLeft = useTransform(
    pos,
    (p) => `calc(${INSET}px + ${r3(placeAt(us, p))} * (100% - ${2 * INSET}px))`,
  );
  const rowY = useTransform(pos, (p) => r2((n - 1 - p) * ROW_H));

  const layerIds =
    lock && list.some((v) => v.id === lock)
      ? [list.findIndex((v) => v.id === lock)]
      : [base, base + 1].filter((i) => i >= 0 && i < n);

  const pair = marked
    .map((id) => list.findIndex((v) => v.id === id))
    .filter((i) => i !== -1)
    .sort((a, b) => a - b);

  const label = current
    ? `Version ${index + 1} of ${n}, ${current.author}, ${ago(current.at, now)}: ${current.note}`
    : "No versions";

  const failedAt =
    phase.kind === "failed" ? list.findIndex((v) => v.id === phase.id) : -1;

  const headerButton = cn(
    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 border border-hairline px-2 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-50 aria-disabled:hover:bg-transparent @min-[30rem]:px-2.5",
    FOCUS_RING,
  );

  const preview = (
    <FitContext.Provider value={previewFit}>
      <div
        className={cn(
          "relative h-full w-full bg-[color-mix(in_oklab,var(--foreground)_3%,var(--card))]",
          previewFit === "width"
            ? "[scrollbar-width:thin] overflow-y-auto overscroll-contain"
            : "overflow-clip",
        )}
      >
        {status === "loading" ? (
          <div
            aria-hidden
            className="flex h-full items-center-safe justify-center-safe p-4"
          >
            <div className="flex aspect-[3/4] h-full max-h-full flex-col gap-2 rounded-2 bg-surface-2 p-4">
              <span className="h-1/2 rounded-1 bg-surface-1" />
              <span className="h-3 w-3/4 self-center rounded-full bg-surface-1" />
              <span className="h-2 w-1/2 self-center rounded-full bg-surface-1" />
            </div>
          </div>
        ) : status === "error" ? (
          <div className="flex h-full flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The history didn&apos;t load.
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
        ) : n === 0 ? (
          <Placeholder
            icon={<FileImage aria-hidden className="size-4" />}
            title="No saved versions yet"
          />
        ) : (
          <div className="grid h-full grid-rows-[minmax(0,1fr)]">
            {layerIds.map((i) => {
              const v = list[i];
              if (!v) return null;
              return (
                <PreviewLayer
                  key={i % 2 === 0 ? "even" : "odd"}
                  version={v}
                  index={i}
                  pos={pos}
                  locked={lock !== null}
                  fit={previewFit}
                />
              );
            })}
          </div>
        )}

        <AnimatePresence>
          {comparing && pair.length === 2 ? (
            <motion.div
              key="compare"
              className="absolute inset-0 z-[40] grid grid-cols-2 grid-rows-[minmax(0,1fr)] gap-px bg-hairline"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{
                opacity: 0,
                transition: { duration: durations.fast, ease: easings.exit },
              }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              {pair.map((i, side) => {
                const v = list[i];
                if (!v) return null;
                return (
                  <motion.figure
                    key={v.id}
                    className="relative flex flex-col overflow-clip bg-[color-mix(in_oklab,var(--foreground)_3%,var(--card))]"
                    initial={{
                      x: motionSafe
                        ? side === 0
                          ? distances.step
                          : -distances.step
                        : 0,
                    }}
                    animate={{ x: 0 }}
                    transition={motionSafe ? springs.glide : { duration: 0 }}
                  >
                    <figcaption className="flex h-8 shrink-0 items-center gap-1.5 border-b border-hairline px-3 text-[11px] text-ink-2">
                      <span className="font-mono font-medium text-(--rr-accent)">
                        v{i + 1}
                      </span>
                      <span className="truncate">
                        {v.author} · {ago(v.at, now)}
                      </span>
                    </figcaption>
                    <div className="flex-1 overflow-hidden">
                      {v.preview === undefined || v.preview === null ? (
                        <Placeholder
                          icon={<ImageOff aria-hidden className="size-4" />}
                          title={`No preview for v${i + 1}`}
                        />
                      ) : (
                        <div className="h-full p-3 [&>img]:h-full [&>img]:w-full [&>img]:object-contain">
                          <FitContext.Provider value="fit">
                            {v.preview}
                          </FitContext.Provider>
                        </div>
                      )}
                    </div>
                  </motion.figure>
                );
              })}
              <button
                type="button"
                onClick={closeCompare}
                className={cn(
                  "absolute top-1 right-1 inline-flex h-6 items-center gap-1 rounded-2 border border-hairline bg-popover px-2 text-[11px] text-ink-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <X aria-hidden className="size-3" />
                Done
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {current && ready && !comparing ? (
          <p className="pointer-events-none absolute bottom-2 left-2 z-[30] hidden max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-2 border border-hairline bg-popover/90 px-2 py-1 text-[11px] text-ink-2 shadow-sm @min-[34rem]:inline-flex">
            <span className="font-mono font-medium text-(--rr-accent)">
              v{index + 1}
            </span>
            <span className="truncate">
              {current.author} · {ago(current.at, now)}
            </span>
            {index === n - 1 ? (
              <span className="rounded-full bg-(--rr-wash) px-1.5 text-[10px] text-(--rr-accent)">
                Latest
              </span>
            ) : null}
          </p>
        ) : null}

        <AnimatePresence>
          {phase.kind === "failed" ? (
            <motion.div
              key="failed"
              role="alert"
              className="absolute inset-x-2 top-2 z-[45] flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-2 border border-[color-mix(in_oklab,var(--danger)_40%,transparent)] bg-popover px-3 py-2 text-[12px] shadow-md"
              initial={{ opacity: 0, y: motionSafe ? -distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                transition: { duration: durations.fast, ease: easings.exit },
              }}
              transition={
                motionSafe
                  ? { y: springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              <TriangleAlert
                aria-hidden
                className="size-3.5 shrink-0 text-danger"
              />
              <span className="min-w-0 flex-1 text-foreground">
                Restore of v{failedAt + 1} didn&apos;t finish. Nothing changed.
              </span>
              <span className="flex gap-1.5">
                <button
                  type="button"
                  onClick={retryFailed}
                  className={cn(
                    "inline-flex h-7 items-center rounded-2 border border-hairline px-2 text-[11px] text-foreground hover:bg-surface-2",
                    FOCUS_RING,
                  )}
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => setPhase({ kind: "idle" })}
                  className={cn(
                    "inline-flex h-7 items-center rounded-2 px-2 text-[11px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  Dismiss
                </button>
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </FitContext.Provider>
  );

  const reel = (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={locked && status !== "ready" ? -1 : 0}
      aria-label="Version"
      aria-valuemin={1}
      aria-valuemax={Math.max(1, n)}
      aria-valuenow={index + 1}
      aria-valuetext={label}
      aria-describedby={hintId}
      aria-disabled={locked || undefined}
      onKeyDown={(event) => onKeyDown(event)}
      {...drag}
      className={cn(
        "relative h-14 shrink-0 touch-pan-y select-none",
        locked ? "cursor-default" : "cursor-pointer",
        FOCUS_IN,
        "rounded-3",
      )}
    >
      {status === "loading" ? (
        <span
          aria-hidden
          className="absolute inset-x-5 top-1/2 h-3 -translate-y-1/2 rounded-full bg-surface-2"
        />
      ) : reelStyle === "film" ? (
        <>
          <span
            aria-hidden
            className="absolute inset-x-1 top-2 bottom-2 rounded-2 bg-surface-2"
          >
            <span
              className="absolute inset-x-2 top-1 h-1"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(to right, var(--card) 0 4px, transparent 4px 10px)",
              }}
            />
            <span
              className="absolute inset-x-2 bottom-1 h-1"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(to right, var(--card) 0 4px, transparent 4px 10px)",
              }}
            />
          </span>
          {list.map((v, i) => (
            <span
              key={v.id}
              aria-hidden
              className={cn(
                "absolute top-1/2 flex h-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-1 border border-hairline bg-card font-mono text-[9px] text-ink-3 tabular-nums",
                i === failedAt &&
                  "border-[color-mix(in_oklab,var(--danger)_60%,transparent)]",
              )}
              style={{
                left: `calc(${INSET}px + ${us[i] ?? 0} * (100% - ${2 * INSET}px))`,
                width: `min(36px, calc((100% - ${2 * INSET}px) / ${Math.max(1, n)} - 4px))`,
              }}
            >
              <span className="hidden @min-[40rem]:inline">{i + 1}</span>
              {marked.includes(v.id) ? (
                <span className="absolute -top-1 -right-1 size-2 rounded-full bg-(--rr-accent) ring-2 ring-surface-2" />
              ) : null}
            </span>
          ))}
          <motion.span
            aria-hidden
            className="absolute top-2.5 bottom-2.5 -translate-x-1/2 rounded-2 border-2 border-(--rr-accent)"
            style={{
              left: playLeft,
              width: `min(42px, calc((100% - ${2 * INSET}px) / ${Math.max(1, n)} + 2px))`,
            }}
          />
        </>
      ) : reelStyle === "ticks" ? (
        <>
          <span
            aria-hidden
            className="absolute inset-x-5 top-5 h-px bg-hairline-strong"
          />
          {list.map((v, i) => {
            const prev = list[i - 1];
            const newDay = !prev || dayOf(prev.at) !== dayOf(v.at);
            return (
              <span
                key={v.id}
                aria-hidden
                className="absolute top-3 flex -translate-x-1/2 flex-col items-center"
                style={{
                  left: `calc(${INSET}px + ${us[i] ?? 0} * (100% - ${2 * INSET}px))`,
                }}
              >
                <span
                  className={cn(
                    "w-px",
                    marked.includes(v.id)
                      ? "h-5 w-0.5 bg-(--rr-accent)"
                      : "h-4 bg-ink-3",
                    i === failedAt && "bg-danger",
                  )}
                />
                {newDay ? (
                  <span className="mt-1 font-mono text-[9px] whitespace-nowrap text-ink-3">
                    {dayOf(v.at)}
                  </span>
                ) : null}
              </span>
            );
          })}
          <motion.span
            aria-hidden
            className="absolute top-1 h-7 w-0.5 -translate-x-1/2 rounded-full bg-(--rr-accent)"
            style={{ left: playLeft }}
          >
            <span className="absolute -top-0.5 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-(--rr-accent)" />
          </motion.span>
        </>
      ) : (
        <>
          <span
            aria-hidden
            className="absolute inset-x-5 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-hairline-strong"
          />
          {list.map((v, i) => (
            <span
              key={v.id}
              aria-hidden
              className={cn(
                "absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full",
                marked.includes(v.id)
                  ? "bg-(--rr-accent) ring-2 ring-(--rr-wash)"
                  : i === failedAt
                    ? "bg-danger"
                    : "bg-ink-3",
              )}
              style={{
                left: `calc(${INSET}px + ${us[i] ?? 0} * (100% - ${2 * INSET}px))`,
              }}
            />
          ))}
          <motion.span
            aria-hidden
            className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--rr-accent) shadow-[0_0_0_4px_var(--rr-wash)]"
            style={{ left: playLeft }}
          />
        </>
      )}
    </div>
  );

  const fan = (
    <div
      ref={setStrip}
      aria-hidden
      className="relative shrink-0 overflow-clip [contain:paint]"
      style={{
        height: FAN_H,
        maskImage:
          "linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent)",
      }}
    >
      {status === "loading"
        ? [0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="absolute bottom-2.5 h-16 rounded-3 border border-dashed border-hairline-strong bg-surface-1"
              style={{ width: CARD_W, left: `calc(${i * 22}% + 8px)` }}
            />
          ))
        : ready
          ? list.map((v, i) => (
              <FanCard
                key={v.id}
                version={v}
                index={i}
                count={n}
                pos={pos}
                width={width}
                us={us}
                motionSafe={motionSafe}
                current={i === index}
                marked={marked.includes(v.id)}
                lifted={phase.kind === "restoring" && phase.id === v.id}
                flight={flight}
                nodeOf={nodeOf}
                register={register}
                onPick={() => {
                  if (!locked) goTo(i, "glide");
                }}
                now={now}
              />
            ))
          : null}
      {ready && failedAt !== -1 ? (
        <FailedCard
          index={failedAt}
          count={n}
          pos={pos}
          width={width}
          us={us}
          motionSafe={motionSafe}
        />
      ) : null}
    </div>
  );

  const phoneList = (
    <div className="relative flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
      {ready && n > 0 ? (
        <div
          role="listbox"
          aria-label="Versions"
          aria-describedby={hintId}
          aria-disabled={locked || undefined}
          onKeyDown={(event) => onKeyDown(event, true)}
          className="relative"
        >
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-[1] border-l-[3px] border-(--rr-accent) bg-(--rr-wash)"
            style={{ height: ROW_H, y: rowY }}
          />
          {[...list].reverse().map((v) => {
            const i = list.indexOf(v);
            const on = i === index;
            return (
              <div
                key={v.id}
                ref={(node) => {
                  if (node) rowNodes.current.set(v.id, node);
                  else rowNodes.current.delete(v.id);
                }}
                role="option"
                aria-selected={on}
                aria-label={`Version ${i + 1}, ${v.author}, ${ago(v.at, now)}: ${v.note}${marked.includes(v.id) ? ", marked" : ""}`}
                tabIndex={on ? 0 : -1}
                onClick={() => {
                  if (!locked) goTo(i, "glide");
                }}
                className={cn(
                  "relative z-[2] flex cursor-pointer items-center gap-3 border-b border-hairline px-4",
                  FOCUS_IN,
                )}
                style={{ height: ROW_H }}
              >
                <span
                  className={cn(
                    "w-8 shrink-0 font-mono text-[12px] font-medium tabular-nums",
                    on ? "text-(--rr-accent)" : "text-ink-2",
                  )}
                >
                  v{i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] text-foreground">
                    {v.note}
                  </span>
                  <span className="truncate text-[11px] text-ink-3">
                    {v.author} · {ago(v.at, now)}
                  </span>
                </span>
                {marked.includes(v.id) ? (
                  <span className="size-2 shrink-0 rounded-full bg-(--rr-accent)" />
                ) : null}
                {i === n - 1 ? (
                  <span className="shrink-0 rounded-full bg-(--rr-wash) px-1.5 text-[10px] text-(--rr-accent)">
                    Latest
                  </span>
                ) : (
                  <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                    {sizeOf(v.size)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : status === "loading" ? (
        <div aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-hairline px-4"
              style={{ height: ROW_H }}
            >
              <span className="h-3 w-7 rounded-full bg-surface-2" />
              <span className="h-3 flex-1 rounded-full bg-surface-2" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  const restoring = phase.kind === "restoring";
  const atLatest = index === n - 1;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--rr-accent" as string]: accent,
        ["--rr-wash" as string]: `color-mix(in oklab, ${accent} 14%, transparent)`,
      }}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="hidden size-8 shrink-0 items-center justify-center rounded-2 bg-surface-2 text-ink-2 @min-[24rem]:flex"
          >
            <FileImage className="size-4" />
          </span>
          <div className="min-w-0">
            <p id={titleId} className="truncate text-sm font-semibold">
              {fileName}
            </p>
            <p className="truncate text-[11px] text-ink-3">
              {ready
                ? `${n} ${n === 1 ? "version" : "versions"}${current ? ` · ${sizeOf(current.size)}` : ""}`
                : status === "loading"
                  ? "Loading history"
                  : "History unavailable"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-label="Download this version"
            aria-disabled={locked || undefined}
            onClick={download}
            className={headerButton}
          >
            <Download aria-hidden className="size-3.5" />
            <span aria-hidden className="hidden @min-[40rem]:inline">
              Download
            </span>
          </button>
          <button
            type="button"
            aria-label={
              marked.length === 0
                ? "Mark this version to compare"
                : `Mark a second version to compare, ${marked.length} of 2 marked`
            }
            aria-pressed={current ? marked.includes(current.id) : false}
            aria-disabled={locked || undefined}
            onClick={mark}
            className={cn(
              headerButton,
              "aria-pressed:border-(--rr-accent) aria-pressed:text-(--rr-accent)",
            )}
          >
            <GitCompareArrows aria-hidden className="size-3.5" />
            <span aria-hidden className="hidden @min-[30rem]:inline">
              Compare
            </span>
            {marked.length > 0 ? (
              <span aria-hidden className="font-mono text-[10px] tabular-nums">
                {marked.length}/2
              </span>
            ) : null}
          </button>
          <button
            type="button"
            aria-disabled={locked || atLatest || restoring || undefined}
            aria-busy={restoring || undefined}
            onClick={restore}
            className={cn(
              "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3 text-xs font-medium text-white transition-opacity aria-disabled:opacity-45",
              FOCUS_RING,
            )}
            // A filled button is pigment: the accent's hue at a fixed depth,
            // so white type reads on it in both themes and every accent.
            style={{ backgroundColor: `oklch(from ${accent} 0.52 c h)` }}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            {restoring ? "Restoring…" : "Restore"}
          </button>
        </div>
      </header>

      <p id={hintId} className="sr-only">
        Left and Right step through versions, Page Up and Page Down jump five,
        Home and End go to the first and latest. Enter restores, C marks a
        version and a second mark compares, D downloads, Escape closes the
        comparison.
      </p>

      {/* Tablet and up: preview, deck, reel. */}
      <div className="hidden flex-1 flex-col overflow-hidden @min-[34rem]:flex">
        <figure
          aria-label={current ? `Preview of version ${index + 1}` : "Preview"}
          className="relative flex-1 overflow-hidden border-b border-hairline"
        >
          {preview}
        </figure>
        <div className="px-4 pt-1">{fan}</div>
        <div className="border-t border-hairline px-4 py-1.5">{reel}</div>
      </div>

      {/* Phone: preview over a list of versions. */}
      <div className="flex flex-1 flex-col overflow-hidden @min-[34rem]:hidden">
        <figure
          aria-label={current ? `Preview of version ${index + 1}` : "Preview"}
          className="relative h-44 shrink-0 overflow-hidden border-b border-hairline"
        >
          {preview}
        </figure>
        {phoneList}
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
