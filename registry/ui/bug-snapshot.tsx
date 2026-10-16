"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Bug,
  Camera,
  EyeOff,
  Highlighter,
  Plus,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type BugBoxKind = "highlight" | "redact";

/** A box on the screenshot, in percent of its width and height. */
export type BugBox = {
  id: string;
  kind: BugBoxKind;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type BugEnvironmentItem = { id: string; label: string; value: string };
export type BugCategory = { id: string; label: string };
export type BugSeverityTone = "neutral" | "accent" | "warn" | "danger";
export type BugSeverity = { id: string; label: string; tone?: BugSeverityTone };

export type BugDraft = {
  category: string;
  severity: string;
  happened: string;
  expected: string;
};

export type BugReport = BugDraft & {
  /** The environment rows still in the report. */
  environment: BugEnvironmentItem[];
  highlights: BugBox[];
  redactions: BugBox[];
};

export type BugCaptureStyle = "flash" | "shutter" | "lift";
export type BugDensity = "compact" | "regular" | "roomy";
export type BugStatus = "ready" | "loading" | "error";

export type BugSnapshotProps = {
  /** The page the capture shows, drawn into a 16:10 frame: an `<svg viewBox>` or an element that fills its box. @default the Basinworks usage report */
  page?: React.ReactNode;
  /** Names the page in the frame's bar and the report header. @default "Basinworks · Usage report" */
  pageLabel?: string;
  /** Areas redacted automatically on every capture, in percent of the page. @default the signed-in address chip */
  sensitiveAreas?: BugBox[];
  /** Environment rows sent with the report; each can be removed. @default defaultBugEnvironment */
  environment?: BugEnvironmentItem[];
  /** The kinds of problem offered. @default defaultBugCategories */
  categories?: BugCategory[];
  /** Severity steps, mildest first. @default defaultBugSeverities */
  severities?: BugSeverity[];
  /** The draft the form starts from. @default first category, "medium" severity, empty text */
  defaultDraft?: Partial<BugDraft>;
  /** Fires with the whole draft whenever a field, category or severity changes. */
  onDraftChange?: (draft: BugDraft) => void;
  /** Controlled: the report is open. Opening captures the page. */
  open?: boolean;
  /** Initial open state when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from the button that opened or closed the report. */
  onOpenChange?: (open: boolean) => void;
  /** A capture has landed in the form. */
  onCapture?: () => void;
  /** Fires with every redaction box after one is added, moved or removed, and after a capture. */
  onRedact?: (redactions: BugBox[]) => void;
  /** Send was pressed with a valid report. Return a promise to show the upload; call `progress(0–1)` to drive the bar. A rejection keeps the draft. A resolved string is shown as the reference. */
  onSubmit?: (
    report: BugReport,
    progress: (fraction: number) => void,
  ) => void | Promise<unknown>;
  /** How the capture announces itself: a white flash, a closing shutter, or the page lifting off. @default "flash" */
  captureStyle?: BugCaptureStyle;
  /** Control height, padding and type: 28, 32 or 36px controls. @default "regular" */
  density?: BugDensity;
  /** Highlight strokes, washes, badges and the landing flash — any CSS colour. @default "var(--warn)" */
  highlightColor?: string;
  /** Tallest the surface grows before the report scrolls inside it, px. @default 540 */
  maxHeight?: number;
  /** Whether the environment details have been read. @default "ready" */
  status?: BugStatus;
  /** "Try again" was pressed after the environment failed to read. */
  onRetry?: () => void;
  /** The report's heading and accessible name. @default "Report a bug" */
  title?: string;
  /** Nothing can be opened, drawn or sent. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultBugEnvironment: BugEnvironmentItem[] = [
  { id: "app", label: "App version", value: "Basinworks 4.12.0" },
  { id: "workspace", label: "Workspace", value: "coldbrook-ops" },
  { id: "page", label: "Page", value: "/reports/usage?range=q3" },
  { id: "screen", label: "Screen", value: "1440 × 900 at 2×" },
  { id: "browser", label: "Browser", value: "Desktop, version 128" },
  { id: "zone", label: "Time zone", value: "UTC+01:00" },
  { id: "account", label: "Signed in as", value: "m.okafor@coldbrook.test" },
];

export const defaultBugCategories: BugCategory[] = [
  { id: "display", label: "Looks wrong" },
  { id: "data", label: "Wrong numbers" },
  { id: "broken", label: "Does not work" },
  { id: "slow", label: "Slow" },
  { id: "other", label: "Other" },
];

export const defaultBugSeverities: BugSeverity[] = [
  { id: "low", label: "Low", tone: "neutral" },
  { id: "medium", label: "Medium", tone: "accent" },
  { id: "high", label: "High", tone: "warn" },
  { id: "blocker", label: "Blocker", tone: "danger" },
];

/** The signed-in address in the default page's top bar. */
export const defaultBugSensitiveAreas: BugBox[] = [
  { id: "auto-account", kind: "redact", x: 72.5, y: 2, w: 20.5, h: 6 },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

type Rect = { x: number; y: number; w: number; h: number };
type View = "page" | "report" | "sent";
type Flight = { n: number; style: BugCaptureStyle; safe: boolean };
type Upload = "idle" | "uploading" | "failed";

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Severity dots are pigment: one lightness in both themes. */
const TONE: Record<BugSeverityTone, string> = {
  neutral: "oklch(from var(--ink-3) 0.62 0.02 h)",
  accent: "oklch(from var(--accent-bright) 0.64 0.17 h)",
  warn: "oklch(from var(--warn) 0.78 0.14 h)",
  danger: "oklch(from var(--danger) 0.64 0.2 h)",
};

const DENSITY: Record<
  BugDensity,
  {
    control: string;
    text: string;
    pad: string;
    gap: string;
    stack: string;
    field: string;
    row: string;
  }
> = {
  compact: {
    control: "h-7",
    text: "text-[12px]",
    pad: "p-3",
    gap: "gap-3",
    stack: "gap-3",
    field: "px-2.5 py-1.5",
    row: "py-1",
  },
  regular: {
    control: "h-8",
    text: "text-[13px]",
    pad: "p-4",
    gap: "gap-4",
    stack: "gap-3.5",
    field: "px-3 py-2",
    row: "py-1.5",
  },
  roomy: {
    control: "h-9",
    text: "text-[13px]",
    pad: "p-5",
    gap: "gap-5",
    stack: "gap-4",
    field: "px-3 py-2.5",
    row: "py-2",
  },
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

/** A smallest box worth keeping, percent: anything under it was a slip. */
const MIN_BOX = 3;

const pigmentOf = (color: string) => `oklch(from ${color} 0.8 c h)`;

const autoBoxes = (areas: BugBox[]): BugBox[] =>
  areas.map((a, i) => ({ ...a, id: a.id || `auto-${i}`, kind: "redact" }));

/* ----------------------------------------------------------------------- */
/*                               The page art                               */
/* ----------------------------------------------------------------------- */

const BAR_VALUES = [0.36, 0.48, 0.42, 0.55, 0.63, 0.58, 0.71, 0.79, 1];
const SEAT_VALUES = [0.5, 0.52, 0.55, 0.57, 0.6, 0.64, 0.66, 0.7, 0.72];
const MONTH_LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S"];

/**
 * Basinworks' usage report, drawn: a top bar with the signed-in address, a
 * sidebar, three figures, a monthly chart whose last value is written over
 * its own legend, and a seat table with a "−0 seats" row. Every colour is a
 * token, so the capture reads in either theme.
 */
export function BasinworksUsagePage() {
  const base = 276;
  const seats = SEAT_VALUES.map(
    (v, i) => `${160 + i * 48 + 13},${r2(base - v * 60)}`,
  ).join(" ");
  return (
    <svg
      viewBox="0 0 640 400"
      role="img"
      aria-label="Basinworks usage report"
      className="block size-full font-sans select-none"
    >
      <rect width="640" height="400" className="fill-card" />
      <rect width="640" height="40" className="fill-surface-0" />
      <line x1="0" y1="40.5" x2="640" y2="40.5" className="stroke-hairline" />
      <rect
        x="16"
        y="12"
        width="16"
        height="16"
        rx="4"
        className="fill-cobalt-bright"
      />
      <rect
        x="20"
        y="19"
        width="8"
        height="2.5"
        rx="1.25"
        className="fill-card"
      />
      <text
        x="40"
        y="24.5"
        fontSize="12"
        fontWeight="600"
        className="fill-foreground"
      >
        Basinworks
      </text>
      <text x="140" y="24" fontSize="10" className="fill-ink-3">
        Overview
      </text>
      <text
        x="204"
        y="24"
        fontSize="10"
        fontWeight="600"
        className="fill-foreground"
      >
        Usage
      </text>
      <rect
        x="204"
        y="37"
        width="29"
        height="2"
        rx="1"
        className="fill-cobalt-bright"
      />
      <text x="258" y="24" fontSize="10" className="fill-ink-3">
        Billing
      </text>
      <rect
        x="468"
        y="11"
        width="124"
        height="18"
        rx="9"
        className="fill-surface-2"
      />
      <text x="478" y="23.2" fontSize="8.5" className="fill-ink-2">
        m.okafor@coldbrook.test
      </text>
      <circle cx="616" cy="20" r="10" className="fill-cobalt-wash" />
      <text
        x="616"
        y="22.8"
        fontSize="7.5"
        fontWeight="600"
        textAnchor="middle"
        className="fill-cobalt-bright"
      >
        MO
      </text>

      <rect x="0" y="41" width="120" height="359" className="fill-surface-0" />
      <line
        x1="120.5"
        y1="41"
        x2="120.5"
        y2="400"
        className="stroke-hairline"
      />
      <text
        x="16"
        y="64"
        fontSize="7.5"
        fontWeight="600"
        letterSpacing="1"
        className="fill-ink-3"
      >
        REPORTS
      </text>
      <rect
        x="8"
        y="74"
        width="104"
        height="22"
        rx="6"
        className="fill-cobalt-wash"
      />
      <text
        x="18"
        y="88.5"
        fontSize="10"
        fontWeight="600"
        className="fill-cobalt-bright"
      >
        Usage
      </text>
      {["Seats", "Exports", "Storage"].map((label, i) => (
        <text
          key={label}
          x="18"
          y={114 + i * 22}
          fontSize="10"
          className="fill-ink-2"
        >
          {label}
        </text>
      ))}
      <text
        x="16"
        y="196"
        fontSize="7.5"
        fontWeight="600"
        letterSpacing="1"
        className="fill-ink-3"
      >
        WORKSPACE
      </text>
      {["Members", "Settings"].map((label, i) => (
        <text
          key={label}
          x="18"
          y={218 + i * 22}
          fontSize="10"
          className="fill-ink-2"
        >
          {label}
        </text>
      ))}

      <text
        x="140"
        y="70"
        fontSize="16"
        fontWeight="600"
        className="fill-foreground"
      >
        Usage report
      </text>
      <text x="140" y="86" fontSize="9" className="fill-ink-3">
        Q3 2026 · all workspaces
      </text>
      <rect
        x="540"
        y="60"
        width="76"
        height="22"
        rx="6"
        className="fill-card stroke-hairline-strong"
      />
      <text
        x="578"
        y="74.5"
        fontSize="8.5"
        textAnchor="middle"
        className="fill-ink-2"
      >
        Last 90 days
      </text>

      {[
        { label: "Active seats", value: "248", delta: "+6%" },
        { label: "Exports", value: "1,204", delta: "+18%" },
        { label: "Storage", value: "3.2 TB", delta: "+2%" },
      ].map((tile, i) => {
        const x = 140 + i * 162;
        return (
          <g key={tile.label}>
            <rect
              x={x}
              y="98"
              width="152"
              height="54"
              rx="8"
              className="fill-surface-0 stroke-hairline"
            />
            <text x={x + 12} y="116" fontSize="8.5" className="fill-ink-3">
              {tile.label}
            </text>
            <text
              x={x + 12}
              y="140"
              fontSize="16"
              fontWeight="600"
              className="fill-foreground"
            >
              {tile.value}
            </text>
            <text
              x={x + 140}
              y="140"
              fontSize="8.5"
              textAnchor="end"
              className="fill-success"
            >
              {tile.delta}
            </text>
          </g>
        );
      })}

      <rect
        x="140"
        y="164"
        width="476"
        height="126"
        rx="8"
        className="fill-surface-0 stroke-hairline"
      />
      <text
        x="152"
        y="182"
        fontSize="9.5"
        fontWeight="600"
        className="fill-foreground"
      >
        Exports by month
      </text>
      {[212, 244].map((y) => (
        <line
          key={y}
          x1="152"
          y1={y}
          x2="604"
          y2={y}
          strokeDasharray="2 3"
          className="stroke-hairline-strong"
        />
      ))}
      {BAR_VALUES.map((v, i) => {
        const h = r2(v * 96);
        return (
          <rect
            key={i}
            x={160 + i * 48}
            y={r2(base - h)}
            width="26"
            height={h}
            rx="3"
            className="fill-cobalt-bright"
            opacity={i === BAR_VALUES.length - 1 ? 1 : 0.78}
          />
        );
      })}
      <polyline
        points={seats}
        fill="none"
        strokeWidth="1.5"
        strokeLinejoin="round"
        className="stroke-ink-3"
        opacity="0.7"
      />
      <line
        x1="152"
        y1={base + 0.5}
        x2="604"
        y2={base + 0.5}
        className="stroke-hairline-strong"
      />
      {MONTH_LETTERS.map((m, i) => (
        <text
          key={i}
          x={160 + i * 48 + 13}
          y="287"
          fontSize="7.5"
          textAnchor="middle"
          className="fill-ink-3"
        >
          {m}
        </text>
      ))}
      <rect
        x="528"
        y="174.5"
        width="8"
        height="8"
        rx="2"
        className="fill-cobalt-bright"
      />
      <text x="540" y="181.5" fontSize="8.5" className="fill-ink-2">
        Exports
      </text>
      <rect
        x="574"
        y="174.5"
        width="8"
        height="8"
        rx="2"
        className="fill-ink-3"
        opacity="0.6"
      />
      <text x="586" y="181.5" fontSize="8.5" className="fill-ink-2">
        Seats
      </text>
      {/* The bug: the last value is printed straight over the legend. */}
      <text
        x="557"
        y="178"
        fontSize="10"
        fontWeight="600"
        textAnchor="middle"
        className="fill-foreground"
      >
        1,204
      </text>

      <rect
        x="140"
        y="300"
        width="476"
        height="90"
        rx="8"
        className="fill-surface-0 stroke-hairline"
      />
      {[
        { x: 152, label: "Customer", anchor: "start" as const },
        { x: 352, label: "Plan", anchor: "start" as const },
        { x: 520, label: "Seats", anchor: "end" as const },
        { x: 604, label: "Change", anchor: "end" as const },
      ].map((c) => (
        <text
          key={c.label}
          x={c.x}
          y="317"
          fontSize="8"
          fontWeight="600"
          textAnchor={c.anchor}
          className="fill-ink-3"
        >
          {c.label}
        </text>
      ))}
      {[
        { name: "Coldbrook Labs", plan: "Team", seats: "42", change: "+4" },
        {
          name: "Fieldline Freight",
          plan: "Starter",
          seats: "18",
          change: "+1",
        },
        { name: "Waylight Studio", plan: "Team", seats: "−0", change: "—" },
      ].map((row, i) => {
        const y = 341 + i * 18;
        const broken = row.seats === "−0";
        return (
          <g key={row.name}>
            <line
              x1="152"
              y1={y - 13.5}
              x2="604"
              y2={y - 13.5}
              className="stroke-hairline"
            />
            <text x="152" y={y} fontSize="9" className="fill-foreground">
              {row.name}
            </text>
            <text x="352" y={y} fontSize="9" className="fill-ink-2">
              {row.plan}
            </text>
            <text
              x="520"
              y={y}
              fontSize="9"
              textAnchor="end"
              fontWeight={broken ? 600 : 400}
              className={broken ? "fill-danger" : "fill-foreground"}
            >
              {row.seats}
            </text>
            <text
              x="604"
              y={y}
              fontSize="9"
              textAnchor="end"
              className={broken ? "fill-ink-3" : "fill-success"}
            >
              {row.change}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

/**
 * One box on the screenshot. Its geometry lives in motion values: a drag
 * moves it 1:1, keys and host changes glide it there, and the committed
 * numbers go back to the form only when the hand lets go.
 */
function BoxMark({
  box,
  label,
  number,
  color,
  hintId,
  motionSafe,
  disabled,
  surface,
  register,
  onChange,
  onRemove,
}: {
  box: BugBox;
  label: string;
  number: number;
  color: string;
  hintId: string;
  motionSafe: boolean;
  disabled: boolean;
  surface: React.RefObject<HTMLDivElement | null>;
  register: (id: string, node: HTMLButtonElement | null) => void;
  onChange: (box: BugBox) => void;
  onRemove: (id: string) => void;
}) {
  const x = useMotionValue(box.x);
  const y = useMotionValue(box.y);
  const w = useMotionValue(box.w);
  const h = useMotionValue(box.h);
  const left = useTransform(x, (v) => `${r2(v)}%`);
  const top = useTransform(y, (v) => `${r2(v)}%`);
  const width = useTransform(w, (v) => `${r2(v)}%`);
  const height = useTransform(h, (v) => `${r2(v)}%`);
  const held = React.useRef<{ x: number; y: number; rw: number; rh: number }>(
    null,
  );
  const [dragging, setDragging] = React.useState(false);

  // Keys and host updates arrive as props; the box glides to them. A drag in
  // progress owns the values, so nothing tugs it from under the finger.
  React.useEffect(() => {
    if (dragging) return;
    const t = motionSafe ? springs.glide : { duration: 0 };
    const running = [
      animate(x, box.x, t),
      animate(y, box.y, t),
      animate(w, box.w, t),
      animate(h, box.h, t),
    ];
    return () => {
      for (const c of running) c.stop();
    };
  }, [box.x, box.y, box.w, box.h, dragging, motionSafe, x, y, w, h]);

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: () => {
      const r = surface.current?.getBoundingClientRect();
      held.current = {
        x: x.get(),
        y: y.get(),
        rw: r?.width ?? 1,
        rh: r?.height ?? 1,
      };
      setDragging(true);
    },
    onMove: ({ offset }) => {
      const s = held.current;
      if (!s) return;
      x.set(r2(clamp(s.x + (offset.x / s.rw) * 100, 0, 100 - w.get())));
      y.set(r2(clamp(s.y + (offset.y / s.rh) * 100, 0, 100 - h.get())));
    },
    onEnd: () => {
      held.current = null;
      setDragging(false);
      onChange({ ...box, x: r2(x.get()), y: r2(y.get()) });
    },
    onCancel: () => {
      held.current = null;
      setDragging(false);
    },
  });

  const redact = box.kind === "redact";
  return (
    <motion.button
      ref={(node) => register(box.id, node)}
      type="button"
      aria-label={`${label}, ${Math.round(box.x)}% across, ${Math.round(box.y)}% down, ${Math.round(box.w)}% wide, ${Math.round(box.h)}% tall`}
      aria-describedby={hintId}
      disabled={disabled}
      {...drag}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 5 : 1;
        const move = (dx: number, dy: number) => {
          event.preventDefault();
          if (event.altKey) {
            onChange({
              ...box,
              w: r2(clamp(box.w + dx, MIN_BOX, 100 - box.x)),
              h: r2(clamp(box.h + dy, MIN_BOX, 100 - box.y)),
            });
          } else {
            onChange({
              ...box,
              x: r2(clamp(box.x + dx, 0, 100 - box.w)),
              y: r2(clamp(box.y + dy, 0, 100 - box.h)),
            });
          }
        };
        if (event.key === "ArrowLeft") move(-step, 0);
        else if (event.key === "ArrowRight") move(step, 0);
        else if (event.key === "ArrowUp") move(0, -step);
        else if (event.key === "ArrowDown") move(0, step);
        else if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          onRemove(box.id);
        }
      }}
      className={cn(
        "absolute touch-none rounded-[3px] select-none",
        dragging ? "z-[3] cursor-grabbing" : "z-[2] cursor-grab",
        FOCUS_RING,
      )}
      style={{ left, top, width, height }}
    >
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-[3px]"
        initial={motionSafe ? { opacity: 0, scale: 1.08 } : { opacity: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={
          motionSafe
            ? { scale: springs.flick, opacity: { duration: durations.fast } }
            : { duration: durations.fast }
        }
        style={
          redact
            ? { backgroundColor: "var(--foreground)" }
            : {
                backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
                boxShadow: `inset 0 0 0 2px ${color}`,
              }
        }
      />
      {redact ? (
        <EyeOff
          aria-hidden
          className="absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 text-background"
        />
      ) : (
        <motion.span
          aria-hidden
          className="absolute -top-2 -left-2 flex size-4 items-center justify-center rounded-full font-mono text-[9px] leading-none font-semibold text-[oklch(0.22_0.02_258)] tabular-nums"
          style={{ backgroundColor: pigmentOf(color) }}
          initial={motionSafe ? { scale: 0.4, opacity: 0 } : { opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={
            motionSafe
              ? { scale: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {number}
        </motion.span>
      )}
    </motion.button>
  );
}

/** A radiogroup of equal segments with one indicator that slides on snap. */
function Segments<T extends string>({
  options,
  value,
  onChange,
  labelledBy,
  motionSafe,
  disabled,
  control,
  render,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  labelledBy: string;
  motionSafe: boolean;
  disabled: boolean;
  control: string;
  render?: (option: { id: T; label: string }) => React.ReactNode;
}) {
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const at = Math.max(
    0,
    options.findIndex((o) => o.id === value),
  );
  const n = Math.max(1, options.length);
  const pick = (i: number) => {
    const o = options[(i + n) % n];
    if (!o) return;
    onChange(o.id);
    nodes.current.get(o.id)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className={cn(
        "relative grid w-full rounded-2 border border-hairline bg-surface-0 p-0.5",
        control,
      )}
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      <motion.span
        aria-hidden
        className="absolute inset-y-0.5 rounded-[5px] border border-hairline-strong bg-card shadow-sm"
        initial={false}
        animate={{ left: `calc(${r2((at / n) * 100)}% + 2px)` }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
        style={{ width: `calc(${r2(100 / n)}% - 4px)` }}
      />
      {options.map((o, i) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            ref={(node) => {
              if (node) nodes.current.set(o.id, node);
              else nodes.current.delete(o.id);
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                pick(i + 1);
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                pick(i - 1);
              } else if (event.key === "Home") {
                event.preventDefault();
                pick(0);
              } else if (event.key === "End") {
                event.preventDefault();
                pick(n - 1);
              }
            }}
            className={cn(
              "relative z-[1] flex min-w-0 items-center justify-center gap-1.5 rounded-[5px] px-1.5 text-[12px] transition-colors duration-150",
              on
                ? "font-medium text-foreground"
                : "text-ink-2 hover:text-foreground",
              "disabled:cursor-not-allowed",
              FOCUS_RING,
            )}
          >
            {render ? render(o) : <span className="truncate">{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The component                              */
/* ----------------------------------------------------------------------- */

/**
 * A bug report that starts from the page it is about. "Report a bug" captures
 * the page: it flashes (or a shutter closes, or it lifts toward you), then a
 * copy of the page shrinks along a straight path into the form's thumbnail
 * slot on `springs.glide` and drops into it on `springs.recoil`, while the
 * form's sections rise 8px into place around it in `cascade()` order.
 *
 * On the thumbnail a drag draws a box from the press point — a highlight in
 * `highlightColor` or an opaque redaction — and every box is a button that
 * arrow keys move and Alt with an arrow resizes; "Add box" is the keyboard
 * way to draw one. The signed-in address is redacted by itself. Environment
 * rows can be removed and restored. Send turns into its own progress bar
 * that follows what the host reports, or creeps toward 90% if it reports
 * nothing; a failed upload keeps every word, box and choice. Under reduced
 * motion the capture is a cross-fade and nothing travels, but the progress,
 * boxes and states all still show.
 */
export function BugSnapshot({
  page,
  pageLabel = "Basinworks · Usage report",
  sensitiveAreas = defaultBugSensitiveAreas,
  environment = defaultBugEnvironment,
  categories = defaultBugCategories,
  severities = defaultBugSeverities,
  defaultDraft,
  onDraftChange,
  open,
  defaultOpen = false,
  onOpenChange,
  onCapture,
  onRedact,
  onSubmit,
  captureStyle = "flash",
  density = "regular",
  highlightColor = "var(--warn)",
  maxHeight = 540,
  status = "ready",
  onRetry,
  title = "Report a bug",
  disabled = false,
  className,
}: BugSnapshotProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const catId = `${uid}-cat`;
  const sevId = `${uid}-sev`;
  const toolId = `${uid}-tool`;
  const happenedId = `${uid}-happened`;
  const happenedErrorId = `${uid}-happened-error`;
  const expectedId = `${uid}-expected`;
  const envId = `${uid}-env`;
  const d = DENSITY[density] ?? DENSITY.regular;
  const pageNode = page ?? <BasinworksUsagePage />;

  /* -------------------------------- state -------------------------------- */

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = open ?? ownOpen;
  const [view, setView] = React.useState<View>(isOpen ? "report" : "page");
  const [seenOpen, setSeenOpen] = React.useState(isOpen);
  const [captures, setCaptures] = React.useState(0);
  const [flight, setFlight] = React.useState<Flight | null>(null);
  const [boxes, setBoxes] = React.useState<BugBox[]>(() =>
    isOpen ? autoBoxes(sensitiveAreas) : [],
  );
  const [tool, setTool] = React.useState<BugBoxKind>("highlight");
  const [draft, setDraft] = React.useState<BugDraft>(() => ({
    category: defaultDraft?.category ?? categories[0]?.id ?? "",
    severity:
      defaultDraft?.severity ??
      (severities.some((s) => s.id === "medium")
        ? "medium"
        : (severities[0]?.id ?? "")),
    happened: defaultDraft?.happened ?? "",
    expected: defaultDraft?.expected ?? "",
  }));
  const [missing, setMissing] = React.useState(false);
  const [removed, setRemoved] = React.useState<string[]>([]);
  const [upload, setUpload] = React.useState<Upload>("idle");
  const [pct, setPct] = React.useState(0);
  const [reference, setReference] = React.useState("");
  const [landN, setLandN] = React.useState(0);
  const [retakeN, setRetakeN] = React.useState(0);
  const [drawing, setDrawing] = React.useState<BugBoxKind | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // Opening captures and closing returns to the page, whoever changed it: a
  // press here, or the host. Decided in render so the report and the copy in
  // flight arrive in the same commit.
  if (seenOpen !== isOpen) {
    setSeenOpen(isOpen);
    if (isOpen) {
      setView("report");
      setBoxes(autoBoxes(sensitiveAreas));
      setUpload("idle");
      setCaptures(captures + 1);
      setFlight({ n: captures + 1, style: captureStyle, safe: motionSafe });
    } else {
      setView("page");
      setFlight(null);
    }
  }

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const slotRef = React.useRef<HTMLDivElement | null>(null);
  const flyerRef = React.useRef<HTMLDivElement | null>(null);
  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  /** Where the page frame was on screen when Report was pressed. */
  const pressRect = React.useRef<DOMRect | null>(null);
  const boxNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const focusAsk = React.useRef<string | null>(null);
  const nextBox = React.useRef(1);
  const uploadToken = React.useRef(0);
  const creep = React.useRef<AnimationPlaybackControls | null>(null);

  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fs = useMotionValue(1);
  const progress = useMotionValue(0);
  // The bar and its words follow the motion value every frame; the
  // progressbar's value is state, so it moves in 5% steps, not 60 renders a
  // second.
  useMotionValueEvent(progress, "change", (v) =>
    setPct(Math.round(clamp(v, 0, 1) * 20) * 5),
  );
  const pctText = useTransform(
    progress,
    (v) => `Uploading ${Math.round(clamp(v, 0, 1) * 100)}%`,
  );

  const draftBox = {
    x: useMotionValue(0),
    y: useMotionValue(0),
    w: useMotionValue(0),
    h: useMotionValue(0),
  };
  const draftLeft = useTransform(draftBox.x, (v) => `${r2(v)}%`);
  const draftTop = useTransform(draftBox.y, (v) => `${r2(v)}%`);
  const draftWidth = useTransform(draftBox.w, (v) => `${r2(v)}%`);
  const draftHeight = useTransform(draftBox.h, (v) => `${r2(v)}%`);
  const drawStart = React.useRef<{
    x: number;
    y: number;
    rect: DOMRect;
  } | null>(null);

  /* ------------------------------ callbacks ------------------------------ */

  const setOpen = (next: boolean) => {
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  const writeDraft = (patch: Partial<BugDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onDraftChange?.(next);
  };

  const writeBoxes = (next: BugBox[], redactionsChanged: boolean) => {
    setBoxes(next);
    if (redactionsChanged) onRedact?.(next.filter((b) => b.kind === "redact"));
  };

  /** Landing work that belongs to whichever render is current. */
  const latest = React.useRef({
    land: (soft: boolean) => void soft,
  });
  React.useEffect(() => {
    latest.current.land = (soft) => {
      setFlight(null);
      // Without the flight the capture still says it happened: a soft
      // flash on the thumbnail.
      if (soft) setRetakeN((n) => n + 1);
      setLandN((n) => n + 1);
      onCapture?.();
      onRedact?.(autoBoxes(sensitiveAreas));
      say(
        "Screenshot attached. Draw a box around the problem, or use Add box.",
      );
    };
  });

  const openReport = () => {
    if (disabled) return;
    pressRect.current = frameRef.current?.getBoundingClientRect() ?? null;
    focusAsk.current = "title";
    setOpen(true);
  };

  const closeReport = () => {
    focusAsk.current = "report";
    setOpen(false);
    say("Report closed. Your draft is kept.");
  };

  /* ------------------------------- capture ------------------------------- */

  React.useLayoutEffect(() => {
    if (!flight) return;
    const root = rootRef.current;
    const slot = slotRef.current;
    const flyer = flyerRef.current;
    const press = pressRect.current;
    if (!flight.safe || !root || !slot || !flyer || !press) {
      // Reduced motion, or a host that opened the report with no frame on
      // screen: the report cross-fades in and the capture lands with it.
      const t = window.setTimeout(() => latest.current.land(true), 160);
      return () => window.clearTimeout(t);
    }
    const rootBox = root.getBoundingClientRect();
    const slotBox = slot.getBoundingClientRect();
    // Measured against the root as it is NOW, after the report has changed
    // its height: the copy starts exactly where the page was on screen.
    const from: Rect = {
      x: press.left - rootBox.left,
      y: press.top - rootBox.top,
      w: press.width,
      h: press.height,
    };
    const to: Rect = {
      x: slotBox.left - rootBox.left,
      y: slotBox.top - rootBox.top,
      w: slotBox.width,
      h: slotBox.height,
    };
    const s = to.w / Math.max(1, from.w);
    fx.jump(r2(from.x));
    fy.jump(r2(from.y));
    fs.jump(1);
    // Motion paints the first frame from the values it rendered with; write
    // the start straight onto the node so that frame is already in place.
    flyer.style.width = `${r2(from.w)}px`;
    flyer.style.height = `${r2(from.h)}px`;
    flyer.style.transform = `translateX(${r2(from.x)}px) translateY(${r2(from.y)}px)`;
    flyer.style.visibility = "visible";

    const running: AnimationPlaybackControls[] = [];
    const lift = 12;
    const big = s * 1.03;
    const bigX = to.x - (to.w * 0.03) / 2;
    let dropped = false;
    const drop = () => {
      if (dropped) return;
      dropped = true;
      running.push(
        animate(0, 1, {
          ...springs.recoil,
          onUpdate: (q) => {
            fx.set(r2(lerp(bigX, to.x, q)));
            fy.set(r2(lerp(to.y - lift, to.y, q)));
            fs.set(Number(lerp(big, s, q).toFixed(4)));
          },
          onComplete: () => latest.current.land(false),
        }),
      );
    };
    if (flight.style === "lift") {
      // Lifted toward you before it goes: a 2.5% rise about its centre.
      running.push(
        animate(0, 1, {
          ...springs.flick,
          onUpdate: (k) => {
            fs.set(Number(lerp(1, 1.025, k).toFixed(4)));
            fx.set(r2(from.x - from.w * 0.0125 * k));
            fy.set(r2(from.y - from.h * 0.0125 * k));
          },
        }),
      );
    }
    const delay =
      flight.style === "shutter" ? 200 : flight.style === "lift" ? 170 : 120;
    const t = window.setTimeout(() => {
      const s0 = fs.get();
      const x0 = fx.get();
      const y0 = fy.get();
      running.push(
        animate(0, 1, {
          ...springs.glide,
          onUpdate: (p) => {
            fx.set(r2(lerp(x0, bigX, p)));
            fy.set(r2(lerp(y0, to.y - lift, p)));
            fs.set(Number(lerp(s0, big, p).toFixed(4)));
            // The drop takes over before the glide's long tail: one beat.
            if (p > 0.97) drop();
          },
          onComplete: drop,
        }),
      );
    }, delay);
    return () => {
      window.clearTimeout(t);
      for (const c of running) c.stop();
    };
  }, [flight, fx, fy, fs]);

  const retake = () => {
    if (disabled || flight) return;
    const next = autoBoxes(sensitiveAreas);
    writeBoxes(next, true);
    setRetakeN((n) => n + 1);
    onCapture?.();
    say("Captured again. Earlier boxes were cleared.");
  };

  /* -------------------------------- boxes -------------------------------- */

  const highlightNumber = (id: string) =>
    boxes.filter((b) => b.kind === "highlight").findIndex((b) => b.id === id) +
    1;
  const redactNumber = (id: string) =>
    boxes.filter((b) => b.kind === "redact").findIndex((b) => b.id === id) + 1;
  const boxLabel = (b: BugBox) =>
    b.kind === "highlight"
      ? `Highlight ${highlightNumber(b.id)}`
      : `Redaction ${redactNumber(b.id)}`;

  const addBox = (box: Omit<BugBox, "id">, focus: boolean) => {
    const id = `box-${nextBox.current}`;
    nextBox.current += 1;
    const next = [...boxes, { ...box, id }];
    writeBoxes(next, box.kind === "redact");
    if (focus) focusAsk.current = `box:${id}`;
    const n =
      next.filter((b) => b.kind === box.kind).findIndex((b) => b.id === id) + 1;
    say(
      box.kind === "highlight"
        ? `Highlight ${n} added.`
        : `Redaction ${n} added.`,
    );
  };

  const changeBox = (box: BugBox) => {
    const prev = boxes.find((b) => b.id === box.id);
    if (
      prev &&
      prev.x === box.x &&
      prev.y === box.y &&
      prev.w === box.w &&
      prev.h === box.h
    ) {
      return;
    }
    writeBoxes(
      boxes.map((b) => (b.id === box.id ? box : b)),
      box.kind === "redact",
    );
  };

  const removeBox = (id: string) => {
    const at = boxes.findIndex((b) => b.id === id);
    const gone = boxes[at];
    if (!gone) return;
    const label = boxLabel(gone);
    const next = boxes.filter((b) => b.id !== id);
    writeBoxes(next, gone.kind === "redact");
    const neighbour = next[Math.min(at, next.length - 1)];
    focusAsk.current = neighbour ? `box:${neighbour.id}` : "add";
    if (neighbour) boxNodes.current.get(neighbour.id)?.focus();
    say(`${label} removed.`);
  };

  const addAtCentre = () => {
    if (disabled) return;
    const offset = (boxes.length % 5) * 3;
    addBox(
      tool === "highlight"
        ? { kind: tool, x: 38 + offset, y: 40 + offset, w: 24, h: 18 }
        : { kind: tool, x: 40 + offset, y: 44 + offset, w: 20, h: 8 },
      true,
    );
  };

  const draw = useDrag({
    threshold: 3,
    disabled: disabled || view !== "report",
    onStart: ({ point, offset }) => {
      const surface = surfaceRef.current;
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      const sx = clamp(
        ((point.x - offset.x - rect.left) / rect.width) * 100,
        0,
        100,
      );
      const sy = clamp(
        ((point.y - offset.y - rect.top) / rect.height) * 100,
        0,
        100,
      );
      drawStart.current = { x: sx, y: sy, rect };
      draftBox.x.jump(r2(sx));
      draftBox.y.jump(r2(sy));
      draftBox.w.jump(0);
      draftBox.h.jump(0);
      setDrawing(tool);
    },
    onMove: ({ point }) => {
      const s = drawStart.current;
      if (!s) return;
      const px = clamp(((point.x - s.rect.left) / s.rect.width) * 100, 0, 100);
      const py = clamp(((point.y - s.rect.top) / s.rect.height) * 100, 0, 100);
      draftBox.x.set(r2(Math.min(s.x, px)));
      draftBox.y.set(r2(Math.min(s.y, py)));
      draftBox.w.set(r2(Math.abs(px - s.x)));
      draftBox.h.set(r2(Math.abs(py - s.y)));
    },
    onEnd: () => {
      const s = drawStart.current;
      drawStart.current = null;
      const kind = drawing ?? tool;
      setDrawing(null);
      if (!s) return;
      const w = draftBox.w.get();
      const h = draftBox.h.get();
      if (w < MIN_BOX || h < MIN_BOX) return;
      addBox(
        {
          kind,
          x: r2(draftBox.x.get()),
          y: r2(draftBox.y.get()),
          w: r2(w),
          h: r2(h),
        },
        false,
      );
    },
    onCancel: () => {
      drawStart.current = null;
      setDrawing(null);
    },
  });

  /* ----------------------------- environment ----------------------------- */

  const removeEnv = (item: BugEnvironmentItem) => {
    if (disabled) return;
    const at = environment.findIndex((e) => e.id === item.id);
    const left = environment.filter(
      (e) => e.id !== item.id && !removed.includes(e.id),
    );
    // Focus stays in the list: the next row down, else the one above, else
    // the Restore button that has just appeared.
    const after = left.find(
      (e) => environment.findIndex((x) => x.id === e.id) > at,
    );
    const neighbour = after ?? left[left.length - 1];
    setRemoved([...removed, item.id]);
    focusAsk.current = neighbour ? `env:${neighbour.id}` : "restore";
    say(`${item.label} will not be sent.`);
  };

  const restoreEnv = () => {
    if (disabled) return;
    const n = removed.length;
    setRemoved([]);
    say(`${plural(n, "detail", "details")} restored.`);
  };

  /* ------------------------------- upload -------------------------------- */

  const stopCreep = () => {
    creep.current?.stop();
    creep.current = null;
  };

  React.useEffect(() => {
    const token = uploadToken;
    const running = creep;
    return () => {
      // Late answers to an unmounted form are ignored.
      token.current += 1;
      running.current?.stop();
    };
  }, []);

  const submit = () => {
    if (disabled || upload === "uploading") return;
    if (!draft.happened.trim()) {
      setMissing(true);
      document.getElementById(happenedId)?.focus();
      say("Say what happened before sending.");
      return;
    }
    const report: BugReport = {
      ...draft,
      environment: environment.filter((e) => !removed.includes(e.id)),
      highlights: boxes.filter((b) => b.kind === "highlight"),
      redactions: boxes.filter((b) => b.kind === "redact"),
    };
    const token = ++uploadToken.current;
    stopCreep();
    progress.jump(0);
    const ownReference = `BS-${2046 + token}`;
    const finish = (ref: unknown) => {
      if (token !== uploadToken.current) return;
      stopCreep();
      const done = () => {
        if (token !== uploadToken.current) return;
        setReference(typeof ref === "string" && ref ? ref : ownReference);
        setUpload("idle");
        setView("sent");
        focusAsk.current = "back";
        say(
          `Report sent. Reference ${typeof ref === "string" && ref ? ref : ownReference}.`,
        );
      };
      if (motionSafe) {
        creep.current = animate(progress, 1, {
          ...springs.glide,
          onComplete: done,
        });
      } else {
        progress.jump(1);
        done();
      }
    };
    const result = onSubmit?.(report, (fraction) => {
      if (token !== uploadToken.current) return;
      stopCreep();
      const target = clamp(fraction, progress.get(), 0.99);
      creep.current = motionSafe
        ? animate(progress, target, springs.glide)
        : animate(progress, target, { duration: 0 });
    });
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setUpload("uploading");
      say("Uploading the report.");
      // With nobody reporting progress the bar still moves, slower and
      // slower, so it never looks stuck — and never claims to be done.
      creep.current = animate(progress, 0.9, {
        duration: 9,
        ease: [0.12, 0.7, 0.3, 1],
      });
      (result as Promise<unknown>).then(finish, () => {
        if (token !== uploadToken.current) return;
        stopCreep();
        creep.current = animate(progress, 0, {
          duration: durations.base,
          ease: easings.exit,
        });
        setUpload("failed");
        say("Upload failed. Your draft is kept.");
      });
    } else {
      setUpload("uploading");
      finish(undefined);
    }
  };

  const backToPage = () => {
    setDraft((prev) => ({
      category: prev.category,
      severity: prev.severity,
      happened: "",
      expected: "",
    }));
    setBoxes([]);
    setRemoved([]);
    setMissing(false);
    progress.jump(0);
    setOpen(false);
    focusAsk.current = "report";
  };

  /* ------------------------------ focusing ------------------------------- */

  /** Focus that must follow a swap lands on the node as it arrives. */
  const claim = (key: string) => (node: HTMLElement | null) => {
    if (node && focusAsk.current === key) {
      focusAsk.current = null;
      node.focus({ preventScroll: key === "title" });
    }
  };

  const registerBox = (id: string, node: HTMLButtonElement | null) => {
    if (node) {
      boxNodes.current.set(id, node);
      if (focusAsk.current === `box:${id}`) {
        focusAsk.current = null;
        node.focus();
      }
    } else boxNodes.current.delete(id);
  };

  /* ------------------------------- render -------------------------------- */

  const highlights = boxes.filter((b) => b.kind === "highlight").length;
  const redactions = boxes.filter((b) => b.kind === "redact").length;
  const kept = environment.filter((e) => !removed.includes(e.id));
  const uploading = upload === "uploading";
  const hidden = flight !== null && flight.safe;
  const enter = (i: number) => ({
    initial: motionSafe
      ? { opacity: 0, y: distances.step }
      : { opacity: 0, y: 0 },
    animate: { opacity: 1, y: 0 },
    transition: {
      y: motionSafe
        ? { ...springs.glide, delay: 0.14 + i * cascade(3) }
        : { duration: 0 },
      opacity: {
        duration: motionSafe ? durations.base : durations.fast,
        ease: easings.enter,
        delay: motionSafe ? 0.14 + i * cascade(3) : 0,
      },
    },
  });
  const sevTone = (id: string) =>
    TONE[severities.find((s) => s.id === id)?.tone ?? "neutral"];

  const label = "text-[11px] font-medium tracking-[0.02em] text-ink-2";
  const quiet = cn(
    "inline-flex shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors",
    "enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:opacity-50",
    d.control,
    FOCUS_RING,
  );
  const area = cn(
    "w-full resize-none rounded-2 border bg-surface-0 text-foreground transition-colors placeholder:text-ink-3",
    "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-ring",
    d.text,
    d.field,
  );

  const thumbnail = (
    interactive: boolean,
    slot?: React.Ref<HTMLDivElement>,
  ) => (
    <div
      ref={slot}
      className="relative aspect-[16/10] w-full overflow-clip rounded-3 border border-hairline-strong bg-card"
      style={interactive && hidden ? { opacity: 0 } : undefined}
    >
      <div aria-hidden inert className="pointer-events-none absolute inset-0">
        {pageNode}
      </div>
      {interactive ? (
        <div
          ref={surfaceRef}
          role="group"
          aria-label="Screenshot. Draw a box with the pointer, or use Add box."
          className="absolute inset-0"
        >
          <div
            aria-hidden
            {...draw}
            className={cn(
              "absolute inset-0 touch-none",
              disabled ? "cursor-not-allowed" : "cursor-crosshair",
            )}
          />
          {boxes.map((b) => (
            <BoxMark
              key={b.id}
              box={b}
              label={boxLabel(b)}
              number={highlightNumber(b.id)}
              color={highlightColor}
              hintId={hintId}
              motionSafe={motionSafe}
              disabled={disabled}
              surface={surfaceRef}
              register={registerBox}
              onChange={changeBox}
              onRemove={removeBox}
            />
          ))}
          {drawing ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute z-[4] rounded-[3px]"
              style={{
                left: draftLeft,
                top: draftTop,
                width: draftWidth,
                height: draftHeight,
                ...(drawing === "redact"
                  ? {
                      backgroundColor:
                        "color-mix(in oklab, var(--foreground) 82%, transparent)",
                    }
                  : {
                      backgroundColor: `color-mix(in oklab, ${highlightColor} 10%, transparent)`,
                      boxShadow: `inset 0 0 0 1.5px ${highlightColor}`,
                    }),
              }}
            />
          ) : null}
        </div>
      ) : (
        boxes.map((b) => (
          <span
            key={b.id}
            aria-hidden
            className="absolute rounded-[2px]"
            style={{
              left: `${r2(b.x)}%`,
              top: `${r2(b.y)}%`,
              width: `${r2(b.w)}%`,
              height: `${r2(b.h)}%`,
              ...(b.kind === "redact"
                ? { backgroundColor: "var(--foreground)" }
                : {
                    backgroundColor: `color-mix(in oklab, ${highlightColor} 14%, transparent)`,
                    boxShadow: `inset 0 0 0 1.5px ${highlightColor}`,
                  }),
            }}
          />
        ))
      )}
      {interactive ? (
        <>
          <motion.span
            key={`land-${landN}`}
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[5] rounded-3"
            style={{ boxShadow: `inset 0 0 0 2px ${highlightColor}` }}
            initial={{ opacity: landN > 0 ? 1 : 0 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: easings.enter }}
          />
          <motion.span
            key={`retake-${retakeN}`}
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[5] bg-[oklch(1_0_0)]"
            initial={{ opacity: 0 }}
            animate={
              retakeN > 0
                ? { opacity: [0, motionSafe ? 0.85 : 0.25, 0] }
                : { opacity: 0 }
            }
            transition={{
              duration: 0.34,
              times: [0, 0.18, 1],
              ease: "easeOut",
            }}
          />
        </>
      ) : null}
    </div>
  );

  const pageView = (
    <div className={cn("flex flex-col", d.pad)}>
      <div
        className="mx-auto w-full overflow-clip rounded-3 border border-hairline bg-surface-0"
        // The frame is 16:10 under a 32px bar: capped so it fits maxHeight.
        style={{ maxWidth: Math.round((maxHeight - 82) * 1.6) }}
      >
        <div className="flex h-8 items-center gap-2 border-b border-hairline px-3">
          <span aria-hidden className="flex shrink-0 gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-2 rounded-full bg-hairline-strong"
              />
            ))}
          </span>
          <span className="min-w-0 truncate text-[11px] text-ink-3">
            {pageLabel}
          </span>
        </div>
        <div ref={frameRef} className="relative aspect-[16/10] w-full">
          <div className="absolute inset-0">{pageNode}</div>
          <button
            ref={claim("report")}
            type="button"
            onClick={openReport}
            disabled={disabled}
            className={cn(
              "absolute bottom-2.5 left-2.5 inline-flex h-8 items-center gap-1.5 rounded-full bg-primary pr-3.5 pl-3 text-[12px] font-medium text-primary-foreground shadow-[0_6px_18px_-6px_color-mix(in_oklab,black_45%,transparent)] transition-transform",
              "enabled:hover:-translate-y-px enabled:active:translate-y-0 disabled:opacity-50",
              FOCUS_RING,
            )}
          >
            <Bug aria-hidden className="size-3.5 shrink-0" />
            Report a bug
          </button>
        </div>
      </div>
    </div>
  );

  const fields = (
    <motion.div
      className={cn("flex min-w-0 flex-col [grid-area:fields]", d.stack)}
      {...enter(1)}
    >
      <div className="flex flex-col gap-1.5">
        <span id={catId} className={label}>
          Category
        </span>
        <div
          role="radiogroup"
          aria-labelledby={catId}
          className="flex flex-wrap gap-1.5"
        >
          {categories.map((c, i) => {
            const on = c.id === draft.category;
            const tabbable =
              on ||
              (!categories.some((x) => x.id === draft.category) && i === 0);
            const go = (j: number) => {
              const n = categories.length;
              const next = categories[(j + n) % n];
              if (!next) return;
              writeDraft({ category: next.id });
              const el = document.getElementById(`${uid}-cat-${next.id}`);
              el?.focus();
            };
            return (
              <button
                key={c.id}
                id={`${uid}-cat-${c.id}`}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={tabbable ? 0 : -1}
                disabled={disabled}
                onClick={() => writeDraft({ category: c.id })}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                    event.preventDefault();
                    go(i + 1);
                  } else if (
                    event.key === "ArrowLeft" ||
                    event.key === "ArrowUp"
                  ) {
                    event.preventDefault();
                    go(i - 1);
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    go(0);
                  } else if (event.key === "End") {
                    event.preventDefault();
                    go(categories.length - 1);
                  }
                }}
                className={cn(
                  "inline-flex items-center rounded-full border px-3 text-[12px] transition-colors duration-150",
                  d.control,
                  on
                    ? "border-transparent bg-foreground text-background"
                    : "border-hairline-strong text-ink-2 enabled:hover:text-foreground",
                  "disabled:opacity-50",
                  FOCUS_RING,
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span id={sevId} className={label}>
          Severity
        </span>
        <Segments
          options={severities.map((s) => ({ id: s.id, label: s.label }))}
          value={draft.severity}
          onChange={(id) => writeDraft({ severity: id })}
          labelledBy={sevId}
          motionSafe={motionSafe}
          disabled={disabled}
          control={d.control}
          render={(o) => (
            <>
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: sevTone(o.id) }}
              />
              <span className="truncate">{o.label}</span>
            </>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={happenedId} className={label}>
          What happened
        </label>
        <textarea
          id={happenedId}
          rows={3}
          value={draft.happened}
          disabled={disabled}
          aria-invalid={missing || undefined}
          aria-describedby={missing ? happenedErrorId : undefined}
          placeholder="The last bar's number is printed over the legend."
          onChange={(event) => {
            const text = event.currentTarget.value;
            if (text.trim()) setMissing(false);
            writeDraft({ happened: text });
          }}
          className={cn(
            area,
            missing ? "border-danger" : "border-hairline-strong",
          )}
        />
        {missing ? (
          <p
            id={happenedErrorId}
            className="flex items-center gap-1.5 text-[11px] text-danger"
          >
            <TriangleAlert aria-hidden className="size-3 shrink-0" />
            Say what happened, in a line or two.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={expectedId} className={label}>
          What you expected
        </label>
        <textarea
          id={expectedId}
          rows={2}
          value={draft.expected}
          disabled={disabled}
          placeholder="Label above the bar, clear of the legend."
          onChange={(event) => {
            const text = event.currentTarget.value;
            writeDraft({ expected: text });
          }}
          className={cn(area, "border-hairline-strong")}
        />
      </div>
    </motion.div>
  );

  const envList = (
    <motion.div
      className="flex min-w-0 flex-col gap-1.5 [grid-area:env]"
      {...enter(2)}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span id={envId} className={label}>
          Environment
        </span>
        {removed.length > 0 && status === "ready" ? (
          <button
            ref={claim("restore")}
            type="button"
            onClick={restoreEnv}
            disabled={disabled}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-2 px-1.5 text-[11px] text-cobalt-bright transition-colors enabled:hover:bg-cobalt-wash",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3 shrink-0" />
            Restore {removed.length}
          </button>
        ) : (
          <span className="text-[11px] text-ink-3">Sent with the report</span>
        )}
      </div>
      {status === "loading" ? (
        <ul aria-busy className="flex flex-col">
          {[64, 48, 72, 56].map((wid, i) => (
            <li
              key={i}
              aria-hidden
              className="flex h-7 items-center gap-3 border-b border-hairline last:border-b-0"
            >
              <span className="h-2 w-16 shrink-0 rounded-full bg-surface-2 motion-safe:animate-pulse" />
              <span
                className="h-2 rounded-full bg-surface-2 motion-safe:animate-pulse"
                style={{ width: `${wid}%` }}
              />
            </li>
          ))}
          <li className="sr-only">Reading the environment</li>
        </ul>
      ) : status === "error" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2 border border-hairline px-3 py-2 text-[12px] text-ink-2">
          <TriangleAlert
            aria-hidden
            className="size-3.5 shrink-0 text-danger"
          />
          <span className="min-w-0 flex-1">
            Could not read the environment.
          </span>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={disabled}
              className={cn(quiet, "h-7")}
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : (
        <ul aria-labelledby={envId} className="flex flex-col">
          {environment.map((item) => {
            const gone = removed.includes(item.id);
            return (
              <motion.li
                key={item.id}
                aria-hidden={gone || undefined}
                inert={gone}
                initial={false}
                animate={{ height: gone ? 0 : "auto", opacity: gone ? 0 : 1 }}
                transition={
                  motionSafe
                    ? {
                        height: springs.glide,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: 0 }
                }
                className="overflow-clip"
              >
                <div
                  className={cn(
                    "flex items-center gap-2 border-b border-hairline",
                    d.row,
                  )}
                >
                  <span className="w-[5.5rem] shrink-0 truncate text-[11px] text-ink-3">
                    {item.label}
                  </span>
                  <span
                    title={item.value}
                    className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground"
                  >
                    {item.value}
                  </span>
                  <button
                    ref={claim(`env:${item.id}`)}
                    type="button"
                    aria-label={`Remove ${item.label} from the report`}
                    disabled={disabled}
                    onClick={() => removeEnv(item)}
                    className={cn(
                      "inline-flex size-6 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </motion.div>
  );

  const reportView = (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-hairline px-4 py-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-2 text-warn"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--warn) 14%, transparent)",
          }}
        >
          <Bug className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            ref={claim("title")}
            id={titleId}
            tabIndex={-1}
            className="truncate text-sm font-semibold outline-none"
          >
            {title}
          </p>
          <p className="truncate text-[11px] text-ink-3">{pageLabel}</p>
        </div>
        <button
          type="button"
          aria-label="Close the report"
          onClick={closeReport}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <X aria-hidden className="size-4" />
        </button>
      </header>

      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
        <div
          className={cn(
            "grid grid-cols-[minmax(0,1fr)] [grid-template-areas:'shot'_'fields'_'env'] @min-[40rem]/bug-snapshot:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] @min-[40rem]/bug-snapshot:grid-rows-[auto_1fr] @min-[40rem]/bug-snapshot:[grid-template-areas:'shot_fields'_'env_fields']",
            d.pad,
            d.gap,
          )}
        >
          <motion.div
            className="flex min-w-0 flex-col gap-2 [grid-area:shot]"
            {...enter(0)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={label}>Screenshot</span>
              <span className="truncate font-mono text-[10px] tracking-[0.04em] text-ink-3 tabular-nums">
                {plural(highlights, "highlight", "highlights")} · {redactions}{" "}
                hidden
              </span>
            </div>
            {thumbnail(true, slotRef)}
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="max-w-full min-w-[9rem] flex-1 basis-[9rem] @min-[40rem]/bug-snapshot:max-w-[12rem]">
                <span id={toolId} className="sr-only">
                  Drawing tool
                </span>
                <Segments
                  options={[
                    { id: "highlight" as const, label: "Highlight" },
                    { id: "redact" as const, label: "Redact" },
                  ]}
                  value={tool}
                  onChange={setTool}
                  labelledBy={toolId}
                  motionSafe={motionSafe}
                  disabled={disabled}
                  control={d.control}
                  render={(o) => (
                    <>
                      {o.id === "highlight" ? (
                        <Highlighter
                          aria-hidden
                          className="size-3.5 shrink-0"
                        />
                      ) : (
                        <EyeOff aria-hidden className="size-3.5 shrink-0" />
                      )}
                      <span className="truncate">{o.label}</span>
                    </>
                  )}
                />
              </div>
              <button
                ref={claim("add")}
                type="button"
                onClick={addAtCentre}
                disabled={disabled}
                className={quiet}
              >
                <Plus aria-hidden className="size-3.5 shrink-0" />
                Add box
              </button>
              <button
                type="button"
                onClick={retake}
                disabled={disabled}
                aria-label="Retake: capture the page again"
                title="Retake"
                className={cn(quiet, "aspect-square justify-center px-0")}
              >
                <Camera aria-hidden className="size-3.5 shrink-0" />
              </button>
            </div>
          </motion.div>
          {fields}
          {envList}
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline px-4 py-3">
        <div className="min-w-0 flex-1 text-[12px]">
          {upload === "failed" ? (
            <p className="flex items-center gap-1.5 text-danger">
              <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
              <span className="min-w-0">
                Upload failed. Your draft is kept.
              </span>
            </p>
          ) : uploading ? (
            <p className="truncate text-ink-2 tabular-nums">
              Sending the screenshot and{" "}
              {plural(kept.length, "detail", "details")}
              <span
                role="progressbar"
                aria-label="Upload"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                className="sr-only"
              />
            </p>
          ) : (
            <p className="truncate text-ink-3">
              Draft · {kept.length} of {environment.length} details
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={submit}
          aria-disabled={uploading || disabled || undefined}
          aria-busy={uploading || undefined}
          className={cn(
            "relative isolate inline-grid shrink-0 items-center overflow-clip rounded-2 bg-primary px-4 text-[12px] font-medium text-primary-foreground transition-opacity",
            d.control,
            disabled && "opacity-50",
            FOCUS_RING,
          )}
        >
          <motion.span
            aria-hidden
            className="absolute inset-0 -z-[1] origin-left"
            style={{
              scaleX: progress,
              backgroundColor:
                "color-mix(in oklab, var(--primary-foreground) 24%, transparent)",
            }}
          />
          {/* Every label in one cell: the button keeps the widest one's width. */}
          {["Send report", "Uploading 100%", "Try again"].map((text, i) => {
            const shown = uploading
              ? i === 1
              : upload === "failed"
                ? i === 2
                : i === 0;
            return (
              <span
                key={text}
                aria-hidden={!shown || undefined}
                className={cn(
                  "text-center whitespace-nowrap tabular-nums [grid-area:1/1]",
                  shown ? "visible" : "invisible",
                )}
              >
                {i === 1 ? <motion.span>{pctText}</motion.span> : text}
              </span>
            );
          })}
        </button>
      </footer>
    </>
  );

  const sentView = (
    <motion.div
      className="flex flex-col items-center gap-4 px-5 py-7 text-center"
      initial={motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        motionSafe
          ? { y: springs.glide, opacity: { duration: durations.base } }
          : { duration: durations.fast }
      }
    >
      <svg aria-hidden viewBox="0 0 40 40" className="size-10 text-success">
        <circle
          cx="20"
          cy="20"
          r="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.3"
        />
        <motion.path
          d="M12.5 20.5 L18 26 L28 14.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: motionSafe ? 0 : 1 }}
          animate={{ pathLength: 1 }}
          transition={
            motionSafe ? { ...springs.flick, delay: 0.12 } : { duration: 0 }
          }
        />
      </svg>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">Report sent</p>
        <p className="text-[12px] text-ink-2">
          Reference{" "}
          <span className="font-mono text-foreground">{reference}</span>. The
          team replies in your Basinworks inbox.
        </p>
      </div>
      <div className="w-44 max-w-full">{thumbnail(false)}</div>
      <button
        ref={claim("back")}
        type="button"
        onClick={backToPage}
        className={quiet}
      >
        Back to the page
      </button>
    </motion.div>
  );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={title}
      className={cn(
        "@container/bug-snapshot relative isolate flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ maxHeight }}
    >
      <p id={hintId} className="sr-only">
        Arrow keys move the box, Shift moves it further, Alt with an arrow
        resizes it, Delete removes it.
      </p>

      {view === "page" ? pageView : view === "report" ? reportView : sentView}

      {flight?.safe ? (
        <motion.div
          ref={flyerRef}
          aria-hidden
          className="pointer-events-none invisible absolute top-0 left-0 z-20 overflow-clip rounded-3 border border-hairline-strong bg-card shadow-[0_22px_48px_-16px_color-mix(in_oklab,black_50%,transparent)]"
          style={{ x: fx, y: fy, scale: fs, originX: 0, originY: 0 }}
        >
          <div inert className="absolute inset-0">
            {pageNode}
          </div>
          {flight.style === "flash" ? (
            <motion.span
              className="absolute inset-0 bg-[oklch(1_0_0)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.92, 0] }}
              transition={{
                duration: 0.36,
                times: [0, 0.16, 1],
                ease: "easeOut",
              }}
            />
          ) : flight.style === "shutter" ? (
            <>
              <motion.span
                className="absolute inset-x-0 top-0 h-1/2 origin-top bg-foreground"
                initial={{ scaleY: 0 }}
                animate={{ scaleY: [0, 1, 0] }}
                transition={{
                  duration: 0.34,
                  times: [0, 0.45, 1],
                  ease: easings.move,
                }}
              />
              <motion.span
                className="absolute inset-x-0 bottom-0 h-1/2 origin-bottom bg-foreground"
                initial={{ scaleY: 0 }}
                animate={{ scaleY: [0, 1, 0] }}
                transition={{
                  duration: 0.34,
                  times: [0, 0.45, 1],
                  ease: easings.move,
                }}
              />
            </>
          ) : (
            <motion.span
              className="absolute inset-0 bg-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.08, 0] }}
              transition={{ duration: 0.4, times: [0, 0.3, 1] }}
            />
          )}
        </motion.div>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
