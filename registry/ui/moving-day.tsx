"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Merge,
  Package,
  PackageCheck,
  PackageOpen,
  Play,
  RotateCcw,
  SkipForward,
  Square,
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

export type MovingField = { id: string; label: string };

/** How a box's size is counted: items, or megabytes. */
export type MovingMeasure = "count" | "size";

export type MovingConflict = {
  id: string;
  /** "Duplicate contacts". */
  title: string;
  /** One sentence on what clashed. */
  detail: string;
  /** How many items are caught in it. */
  count: number;
};

export type MovingResolution = "merge" | "skip" | "both";

/** One box in the old place, and the room it unpacks into. */
export type MovingBox = {
  id: string;
  /** The box's name, e.g. "Contacts". */
  label: string;
  /** The room it goes to in the new place, e.g. "People". */
  room: string;
  /** How much is in it: items, or megabytes when `measure` is "size". Leave it out for a box that is not counted. */
  count?: number;
  /** @default "count" */
  measure?: MovingMeasure;
  /** What one item is called: { one: "contact", other: "contacts" }. */
  noun?: { one: string; other: string };
  /** A line under the name for a box without a count: what it holds. */
  detail?: string;
  /** The old fields, which are matched to the room's. */
  fields: MovingField[];
  /** The room's fields, which old ones map to. */
  targets: MovingField[];
  /** For the default simulator: a conflict it raises at `at` (0 to 1) of the way through. */
  conflict?: MovingConflict & { at: number };
};

/** `boxId:fieldId` to a target field id. A field with no key, or an empty one, is not mapped. */
export type MovingMapping = Record<string, string>;

export type MovingMappingChange = {
  boxId: string;
  fieldId: string;
  /** Null when the field was set to not mapped. */
  target: string | null;
};

export type MovingChange = { id: string; included: boolean };

export type MovingResult = {
  /** Items that arrived. */
  moved: number;
  /** Items merged into ones already there. */
  merged: number;
  /** Items left behind on purpose. */
  skipped: number;
};

export type MovingRunContext = {
  /** Aborted when Stop is pressed or the surface unmounts. */
  signal: AbortSignal;
  /** How long the host would like the box to take, in ms, from `pace`. */
  budget: number;
  /** This box's field ids to target ids; null where a field is not mapped. */
  mapping: Record<string, string | null>;
  /** Report how far along the box is, 0 to 1. */
  progress: (fraction: number) => void;
  /** Pause for a decision; resolves with the choice, rejects if the move is stopped. */
  conflict: (conflict: MovingConflict) => Promise<MovingResolution>;
};

/** Moves one box: resolves with what arrived, rejects with why it did not. */
export type MovingRun = (
  box: MovingBox,
  context: MovingRunContext,
) => Promise<MovingResult>;

export type MovingSummary = {
  boxes: number;
  /** Items moved across every counted box. */
  items: number;
  /** Megabytes moved across every sized box. */
  megabytes: number;
  merged: number;
  skipped: number;
  /** Fields that were not mapped, across the boxes moved. */
  unmapped: number;
  results: Record<string, MovingResult>;
};

export type MovingArc = "arc" | "straight" | "fade";
export type MovingDensity = "compact" | "cozy" | "roomy";
export type MovingStatus = "ready" | "loading" | "error";
export type MovingStep = "pack" | "map" | "move" | "done";

export type MovingDayProps = {
  /** How a box travels: along a short arc, in a straight line, or by cross-fading into its room. @default "arc" */
  arcStyle?: MovingArc;
  /** Seconds each box takes to unpack, handed to `run` as its budget. @default 2.5 */
  pace?: number;
  /** Card padding, type size and row gaps. @default "cozy" */
  density?: MovingDensity;
  /** The boxes in the old place, each with its room. @default defaultMovingBoxes */
  boxes?: MovingBox[];
  /** Controlled: the ids of the boxes included in the move. */
  value?: string[];
  /** Initial included ids when uncontrolled. @default defaultMovingValue */
  defaultValue?: string[];
  /** Fires from the press or key that included or left a box, with every included id. */
  onChange?: (value: string[], change: MovingChange) => void;
  /** Controlled field mapping. */
  mapping?: MovingMapping;
  /** Initial mapping when uncontrolled. @default defaultMovingMapping */
  defaultMapping?: MovingMapping;
  /** Fires from a mapping row's select, with the whole mapping. */
  onMappingChange?: (
    mapping: MovingMapping,
    change: MovingMappingChange,
  ) => void;
  /** Moves one box; called for each included box in turn. @default defaultMovingRun */
  run?: MovingRun;
  /** Start the move was pressed, with the boxes about to go. */
  onStart?: (boxes: MovingBox[]) => void;
  /** A box arrived and unpacked. */
  onBoxMoved?: (box: MovingBox, result: MovingResult) => void;
  /** A conflict was answered. */
  onResolve?: (
    box: MovingBox,
    conflict: MovingConflict,
    resolution: MovingResolution,
  ) => void;
  /** Every included box has moved; the summary is showing. */
  onComplete?: (summary: MovingSummary) => void;
  /** Stop was pressed mid-move. */
  onStop?: () => void;
  /** Whether the old place has answered. @default "ready" */
  status?: MovingStatus;
  /** "Try again" was pressed after the old place could not be reached. */
  onRetry?: () => void;
  /** The heading. @default "Moving day" */
  title?: string;
  /** The old place's name. @default "The old system" */
  source?: string;
  /** The new place's name. @default "Basinworks" */
  destination?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the steps scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be included, mapped or moved. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** Four boxes from the old system, bound for Basinworks. */
export const defaultMovingBoxes: MovingBox[] = [
  {
    id: "contacts",
    label: "Contacts",
    room: "People",
    count: 1240,
    noun: { one: "contact", other: "contacts" },
    fields: [
      { id: "name", label: "Full name" },
      { id: "email", label: "Email" },
      { id: "phone", label: "Phone" },
      { id: "company", label: "Company" },
      { id: "fax", label: "Fax" },
    ],
    targets: [
      { id: "name", label: "Name" },
      { id: "email", label: "Email" },
      { id: "phone", label: "Phone" },
      { id: "org", label: "Organisation" },
      { id: "notes", label: "Notes" },
    ],
    conflict: {
      id: "duplicates",
      at: 0.55,
      count: 38,
      title: "Duplicate contacts",
      detail:
        "38 contacts in this box already exist in People, matched by email.",
    },
  },
  {
    id: "projects",
    label: "Projects",
    room: "Projects",
    count: 86,
    noun: { one: "project", other: "projects" },
    fields: [
      { id: "name", label: "Name" },
      { id: "owner", label: "Owner" },
      { id: "due", label: "Due date" },
      { id: "stage", label: "Stage" },
      { id: "billing", label: "Billing code" },
    ],
    targets: [
      { id: "title", label: "Title" },
      { id: "lead", label: "Lead" },
      { id: "due", label: "Due" },
      { id: "status", label: "Status" },
      { id: "tags", label: "Tags" },
    ],
  },
  {
    id: "files",
    label: "Files",
    room: "Library",
    count: 3200,
    measure: "size",
    fields: [
      { id: "path", label: "Path" },
      { id: "owner", label: "Owner" },
      { id: "modified", label: "Modified" },
    ],
    targets: [
      { id: "folder", label: "Folder" },
      { id: "owner", label: "Owner" },
      { id: "updated", label: "Updated" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    room: "Workspace",
    detail: "Time zone, week start, currency",
    noun: { one: "setting", other: "settings" },
    fields: [
      { id: "tz", label: "Time zone" },
      { id: "week", label: "Week start" },
      { id: "currency", label: "Currency" },
    ],
    targets: [
      { id: "tz", label: "Time zone" },
      { id: "week", label: "Week start" },
      { id: "currency", label: "Currency" },
      { id: "locale", label: "Locale" },
    ],
  },
];

export const defaultMovingValue: string[] = [
  "contacts",
  "projects",
  "files",
  "settings",
];

/** Every field matched but two: Fax and Billing code have nowhere to go. */
export const defaultMovingMapping: MovingMapping = {
  "contacts:name": "name",
  "contacts:email": "email",
  "contacts:phone": "phone",
  "contacts:company": "org",
  "projects:name": "title",
  "projects:owner": "lead",
  "projects:due": "due",
  "projects:stage": "status",
  "files:path": "folder",
  "files:owner": "owner",
  "files:modified": "updated",
  "settings:tz": "tz",
  "settings:week": "week",
  "settings:currency": "currency",
};

const TICKS = 20;

/**
 * Moves a box on timers: twenty ticks across the budget, raising the box's
 * seeded conflict on the way if it has one, and waiting while the tab is
 * hidden so nothing arrives unseen.
 */
export const defaultMovingRun: MovingRun = (box, context) =>
  new Promise<MovingResult>((resolve, reject) => {
    const { signal, budget, mapping, progress, conflict } = context;
    const total =
      box.count ?? Object.values(mapping).filter((t) => t !== null).length;
    const tick = Math.max(10, budget / TICKS);
    let i = 0;
    let raised = false;
    let merged = 0;
    let skipped = 0;
    let timer: number | null = null;
    let resume: (() => void) | null = null;

    const cleanup = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      if (resume) document.removeEventListener("visibilitychange", resume);
      resume = null;
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new Error("Stopped"));
    };
    signal.addEventListener("abort", abort, { once: true });

    const step = () => {
      timer = null;
      if (signal.aborted) return;
      if (typeof document !== "undefined" && document.hidden) {
        resume = () => {
          if (document.hidden) return;
          if (resume) document.removeEventListener("visibilitychange", resume);
          resume = null;
          timer = window.setTimeout(step, tick);
        };
        document.addEventListener("visibilitychange", resume);
        return;
      }
      i += 1;
      const fraction = i / TICKS;
      if (box.conflict && !raised && fraction >= box.conflict.at) {
        raised = true;
        const found = box.conflict;
        progress(found.at);
        conflict(found).then(
          (resolution) => {
            if (signal.aborted) return;
            if (resolution === "merge") merged = found.count;
            if (resolution === "skip") skipped = found.count;
            timer = window.setTimeout(step, tick);
          },
          () => {},
        );
        return;
      }
      progress(Math.min(1, fraction));
      if (i >= TICKS) {
        cleanup();
        resolve({
          moved: Math.max(0, total - merged - skipped),
          merged,
          skipped,
        });
        return;
      }
      timer = window.setTimeout(step, tick);
    };
    timer = window.setTimeout(step, tick);
  });

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;

const STEPS: { id: MovingStep; label: string }[] = [
  { id: "pack", label: "Pack" },
  { id: "map", label: "Map" },
  { id: "move", label: "Move" },
  { id: "done", label: "Done" },
];
const STEP_INDEX: Record<MovingStep, number> = {
  pack: 0,
  map: 1,
  move: 2,
  done: 3,
};

const DENSITY: Record<
  MovingDensity,
  { card: string; stack: string; text: string; sub: string; slot: string }
> = {
  compact: {
    card: "px-2.5 py-1.5",
    stack: "gap-1.5",
    text: "text-[12px]",
    sub: "text-[10px]",
    slot: "px-2.5 py-1.5",
  },
  cozy: {
    card: "px-3 py-2",
    stack: "gap-2",
    text: "text-[13px]",
    sub: "text-[11px]",
    slot: "px-3 py-2",
  },
  roomy: {
    card: "px-3.5 py-3",
    stack: "gap-2.5",
    text: "text-sm",
    sub: "text-[12px]",
    slot: "px-3.5 py-2.5",
  },
};

type Stage = "packed" | "flying" | "unpacking" | "done" | "failed";

type Rect = { x: number; y: number; w: number; h: number };
type Flight = { id: string; seq: number; from: Rect; to: Rect };

type ActiveConflict = {
  boxId: string;
  conflict: MovingConflict;
  resolve: (resolution: MovingResolution) => void;
};

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const withCommas = (n: number) =>
  String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Megabytes as "3.2 GB" or "640 MB". */
const formatSize = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)} GB` : `${Math.round(n)} MB`;

/** "1,240", or "3.2 GB" for a sized box. */
const formatAmount = (box: MovingBox, n: number) =>
  box.measure === "size" ? formatSize(n) : withCommas(n);

const nounFor = (box: MovingBox, n: number) =>
  box.noun ? (n === 1 ? box.noun.one : box.noun.other) : "items";

/** "1,240 contacts", "3.2 GB", or the box's own detail line. */
const describeBox = (box: MovingBox) =>
  box.count === undefined
    ? (box.detail ?? "")
    : box.measure === "size"
      ? formatAmount(box, box.count)
      : `${withCommas(box.count)} ${nounFor(box, box.count)}`;

const mappingFor = (box: MovingBox, mapping: MovingMapping) => {
  const out: Record<string, string | null> = {};
  for (const field of box.fields) {
    const target = mapping[`${box.id}:${field.id}`] ?? "";
    out[field.id] =
      target !== "" && box.targets.some((t) => t.id === target) ? target : null;
  }
  return out;
};

const unmappedCount = (box: MovingBox, mapping: MovingMapping) =>
  Object.values(mappingFor(box, mapping)).filter((t) => t === null).length;

const summarise = (box: MovingBox, result: MovingResult) => {
  const parts: string[] = [];
  if (box.count === undefined)
    parts.push(`${result.moved} ${nounFor(box, result.moved)}`);
  else if (box.measure === "size") parts.push(formatAmount(box, result.moved));
  else parts.push(`${withCommas(result.moved)} ${nounFor(box, result.moved)}`);
  if (result.merged > 0) parts.push(`${withCommas(result.merged)} merged`);
  if (result.skipped > 0) parts.push(`${withCommas(result.skipped)} skipped`);
  return parts.join(", ");
};

const without = <T,>(record: Record<string, T>, key: string) => {
  const next = { ...record };
  delete next[key];
  return next;
};

const RESOLUTION_WORD: Record<MovingResolution, string> = {
  merge: "Merged",
  skip: "Skipped",
  both: "Kept both for",
};

/* ----------------------------------------------------------------------- */
/*                               Rolling text                               */
/* ----------------------------------------------------------------------- */

/** Digits roll on `springs.snap`; commas, points and units stay put. */
function Roll({
  text,
  motionSafe,
  className,
}: {
  text: string;
  motionSafe: boolean;
  className?: string;
}) {
  const chars = text.split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      <span className="invisible w-0">0</span>
      {chars.map((c, i) => {
        // Keyed from the end, so a digit that joins at the front rolls in
        // without the rest re-mounting.
        const key = chars.length - 1 - i;
        if (!/\d/.test(c)) {
          return (
            <span key={`s${key}`} className="whitespace-pre">
              {c}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative inline-block overflow-hidden"
            style={{ width: "1ch", height: `${DIGIT_H}em` }}
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col items-center"
              initial={false}
              animate={{ y: `${-r3(Number(c) * DIGIT_H)}em` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((n) => (
                <span key={n} style={{ height: `${DIGIT_H}em` }}>
                  {n}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Tick                                   */
/* ----------------------------------------------------------------------- */

function Tick({
  checked,
  motionSafe,
  className,
}: {
  checked: boolean;
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-1 border transition-colors duration-150",
        checked
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-hairline-strong bg-transparent",
        className,
      )}
    >
      {checked ? (
        <svg viewBox="0 0 14 14" className="size-3">
          <motion.path
            d="M3 7.4 5.8 10 11 4.2"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={motionSafe ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={motionSafe ? springs.flick : { duration: 0 }}
          />
        </svg>
      ) : null}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Box face                                 */
/* ----------------------------------------------------------------------- */

function BoxFace({
  box,
  included,
  density,
  motionSafe,
  dim,
}: {
  box: MovingBox;
  included: boolean;
  density: MovingDensity;
  motionSafe: boolean;
  dim: boolean;
}) {
  const d = DENSITY[density];
  return (
    <motion.div
      className="flex min-w-0 flex-1 items-center gap-2.5"
      initial={false}
      animate={{ opacity: dim ? 0.35 : included ? 1 : 0.6 }}
      transition={{ duration: durations.base, ease: easings.enter }}
    >
      <Tick checked={included} motionSafe={motionSafe} />
      <Package
        aria-hidden
        className={cn(
          "size-4 shrink-0",
          included ? "text-cobalt-bright" : "text-ink-3",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-medium", d.text)}>{box.label}</p>
        <p className={cn("truncate text-ink-3", d.sub)}>{describeBox(box)}</p>
      </div>
    </motion.div>
  );
}

type BoxOptionProps = {
  box: MovingBox;
  included: boolean;
  stage: Stage;
  failure: string | undefined;
  packing: boolean;
  density: MovingDensity;
  motionSafe: boolean;
  disabled: boolean;
  tabIndex: number;
  hintId: string;
  nodeRef: (node: HTMLDivElement | null) => void;
  onToggle: () => void;
  onFocus: () => void;
  onNav: (event: React.KeyboardEvent) => void;
};

function BoxOption({
  box,
  included,
  stage,
  failure,
  packing,
  density,
  motionSafe,
  disabled,
  tabIndex,
  hintId,
  nodeRef,
  onToggle,
  onFocus,
  onNav,
}: BoxOptionProps) {
  const d = DENSITY[density];
  const departed =
    stage === "flying" || stage === "unpacking" || stage === "done";
  const interactive = packing && !disabled;
  const tag = !included
    ? packing
      ? null
      : "Staying"
    : stage === "done"
      ? "Moved"
      : stage === "flying"
        ? "Lifting"
        : stage === "unpacking"
          ? "Unpacking"
          : stage === "failed"
            ? "Failed"
            : null;
  return (
    <div
      ref={nodeRef}
      role="option"
      aria-selected={included}
      aria-disabled={!interactive || undefined}
      aria-describedby={packing ? hintId : undefined}
      aria-label={`${box.label}, ${describeBox(box)}${tag ? `, ${tag.toLowerCase()}` : ""}${failure ? `: ${failure}` : ""}`}
      tabIndex={tabIndex}
      onFocus={onFocus}
      onClick={() => {
        if (interactive) onToggle();
      }}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          if (interactive) onToggle();
          return;
        }
        onNav(event);
      }}
      className={cn(
        "relative flex items-center rounded-3 border text-left transition-colors duration-200",
        d.card,
        departed
          ? "border-dashed border-hairline bg-transparent"
          : included
            ? "border-hairline-strong bg-surface-1"
            : "border-hairline bg-transparent",
        interactive && "cursor-pointer hover:bg-surface-2",
        stage === "failed" &&
          "border-[color-mix(in_oklab,var(--danger)_45%,transparent)]",
        FOCUS_RING,
      )}
    >
      <BoxFace
        box={box}
        included={included}
        density={density}
        motionSafe={motionSafe}
        dim={departed}
      />
      <AnimatePresence initial={false}>
        {tag ? (
          <motion.span
            key={tag}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast }}
            className={cn(
              "ml-2 shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase",
              stage === "done"
                ? "text-success"
                : stage === "failed"
                  ? "text-danger"
                  : "text-ink-3",
            )}
          >
            {tag}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Flyer                                   */
/* ----------------------------------------------------------------------- */

/**
 * The box in the air: one spring (`glide`) drives its progress from the old
 * place to its room, and the path — an arc that bows away from the line,
 * with a small tilt and lift at its crest, or a straight line — is read off
 * that one value.
 */
function Flyer({
  flight,
  arcStyle,
  onArrive,
  children,
}: {
  flight: Flight;
  arcStyle: MovingArc;
  onArrive: (seq: number) => void;
  children: React.ReactNode;
}) {
  const p = useMotionValue(0);
  const { from, to, seq } = flight;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const lift = arcStyle === "arc" ? clamp(Math.hypot(dx, dy) * 0.2, 14, 56) : 0;
  const bow = Math.sign(horizontal ? 1 : dx || 1);

  const x = useTransform(p, (v) =>
    r3(from.x + dx * v - (horizontal ? 0 : bow * lift * Math.sin(Math.PI * v))),
  );
  const y = useTransform(p, (v) =>
    r3(from.y + dy * v - (horizontal ? lift * Math.sin(Math.PI * v) : 0)),
  );
  const width = useTransform(p, (v) => r3(from.w + (to.w - from.w) * v));
  const rotate = useTransform(p, (v) =>
    arcStyle === "arc"
      ? r3(
          (horizontal ? Math.sign(dx || 1) : -bow) *
            2.5 *
            Math.sin(Math.PI * v),
        )
      : 0,
  );
  const scale = useTransform(p, (v) =>
    r3(1 + (arcStyle === "arc" ? 0.04 : 0.02) * Math.sin(Math.PI * v)),
  );

  const arrive = React.useRef(onArrive);
  React.useEffect(() => {
    arrive.current = onArrive;
  });

  React.useEffect(() => {
    const controls = animate(p, 1, {
      ...springs.glide,
      delay: durations.fast,
      onComplete: () => arrive.current(seq),
    });
    return () => controls.stop();
  }, [p, seq]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-20"
      style={{ x, y, width, rotate, scale, height: from.h }}
    >
      {children}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Room                                   */
/* ----------------------------------------------------------------------- */

type RoomProps = {
  box: MovingBox;
  included: boolean;
  stage: Stage;
  progress: number | undefined;
  result: MovingResult | undefined;
  failure: string | undefined;
  conflict: ActiveConflict | null;
  density: MovingDensity;
  motionSafe: boolean;
  disabled: boolean;
  slotRef: (node: HTMLDivElement | null) => void;
  firstConflictRef: React.RefObject<HTMLButtonElement | null>;
};

function Room({
  box,
  included,
  stage,
  progress,
  result,
  failure,
  conflict,
  density,
  motionSafe,
  disabled,
  slotRef,
  firstConflictRef,
}: RoomProps) {
  const d = DENSITY[density];
  const landed = stage === "unpacking" || stage === "done";
  const done = stage === "done";
  const p = done ? 1 : clamp(progress ?? 0, 0, 1);
  const paused = conflict !== null;
  const counted = included && box.count !== undefined;
  const shown = counted
    ? done && result
      ? result.moved
      : (box.count ?? 0) * p
    : 0;
  const word = done
    ? "Moved"
    : paused
      ? "Paused"
      : stage === "unpacking"
        ? "Unpacking"
        : "";
  const choice = cn(
    "inline-flex h-7 items-center gap-1 rounded-2 border border-hairline bg-card px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-surface-2",
    disabled && "cursor-not-allowed opacity-60",
    FOCUS_RING,
  );

  return (
    <li className="flex flex-col">
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <p className={cn("min-w-0 truncate font-medium", d.text)}>{box.room}</p>
        {counted ? (
          <p
            className={cn(
              "flex shrink-0 items-baseline gap-1 font-mono tabular-nums",
              d.sub,
              done ? "text-success" : "text-ink-3",
            )}
          >
            <span className="sr-only">
              {formatAmount(box, shown)} of {formatAmount(box, box.count ?? 0)}
            </span>
            <Roll text={formatAmount(box, shown)} motionSafe={motionSafe} />
            <span aria-hidden>of {formatAmount(box, box.count ?? 0)}</span>
          </p>
        ) : done ? (
          <p
            className={cn("shrink-0 font-mono text-success", d.sub)}
            aria-hidden
          >
            in
          </p>
        ) : null}
      </div>
      <div
        ref={slotRef}
        className={cn(
          "relative mt-1 rounded-3 border transition-colors duration-200",
          d.slot,
          landed
            ? "border-hairline-strong bg-surface-1"
            : "border-dashed border-hairline",
          !included && "opacity-60",
        )}
      >
        <AnimatePresence initial={false} mode="wait">
          {landed ? (
            <motion.div
              key="card"
              initial={
                motionSafe
                  ? { scale: 0.94, y: -distances.nudge, opacity: 0.4 }
                  : { opacity: 0 }
              }
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? {
                      scale: springs.recoil,
                      y: springs.recoil,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: durations.fast }
              }
              style={{ originY: 1 }}
              className="flex flex-col"
            >
              <div className="flex items-center gap-2.5">
                {done ? (
                  <PackageCheck
                    aria-hidden
                    className="size-4 shrink-0 text-success"
                  />
                ) : (
                  <PackageOpen
                    aria-hidden
                    className={cn(
                      "size-4 shrink-0",
                      paused ? "text-warn" : "text-cobalt-bright",
                    )}
                  />
                )}
                <p
                  className={cn("min-w-0 flex-1 truncate font-medium", d.text)}
                >
                  {box.label}
                </p>
                <span
                  className={cn(
                    "shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase",
                    done ? "text-success" : paused ? "text-warn" : "text-ink-3",
                  )}
                >
                  {word}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={`${box.label} unpacking`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(p * 100)}
                className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-2"
              >
                <motion.div
                  className={cn(
                    "h-full w-full rounded-full transition-colors duration-200",
                    done
                      ? "bg-success"
                      : paused
                        ? "bg-warn"
                        : "bg-cobalt-bright",
                  )}
                  style={{ originX: 0 }}
                  initial={false}
                  animate={{ scaleX: p }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              </div>
              <AnimatePresence initial={false}>
                {done && result ? (
                  <motion.p
                    key="done"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                    }}
                    className={cn("mt-1.5 text-ink-2", d.sub)}
                  >
                    {summarise(box, result)} moved
                  </motion.p>
                ) : null}
                {conflict ? (
                  <motion.div
                    key="conflict"
                    role="group"
                    aria-label={`${conflict.conflict.title}. ${conflict.conflict.detail}`}
                    initial={{
                      opacity: 0,
                      y: motionSafe ? -distances.nudge : 0,
                    }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.snap,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: durations.fast }
                    }
                    className="mt-2 rounded-2 border border-[color-mix(in_oklab,var(--warn)_45%,transparent)] bg-[color-mix(in_oklab,var(--warn)_10%,transparent)] p-2"
                  >
                    <p
                      className={cn(
                        "flex items-center gap-1.5 font-medium text-foreground",
                        d.sub,
                      )}
                    >
                      <TriangleAlert
                        aria-hidden
                        className="size-3.5 shrink-0 text-warn"
                      />
                      {conflict.conflict.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-2">
                      {conflict.conflict.detail}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        ref={firstConflictRef}
                        type="button"
                        aria-disabled={disabled || undefined}
                        onClick={() => {
                          if (!disabled) conflict.resolve("merge");
                        }}
                        className={choice}
                      >
                        <Merge aria-hidden className="size-3" />
                        Merge
                      </button>
                      <button
                        type="button"
                        aria-disabled={disabled || undefined}
                        onClick={() => {
                          if (!disabled) conflict.resolve("skip");
                        }}
                        className={choice}
                      >
                        <SkipForward aria-hidden className="size-3" />
                        Skip
                      </button>
                      <button
                        type="button"
                        aria-disabled={disabled || undefined}
                        onClick={() => {
                          if (!disabled) conflict.resolve("both");
                        }}
                        className={choice}
                      >
                        <Copy aria-hidden className="size-3" />
                        Keep both
                      </button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast }}
              className={cn(
                "truncate",
                d.sub,
                stage === "failed" ? "text-danger" : "text-ink-3",
              )}
            >
              {!included
                ? "Not this time"
                : stage === "flying"
                  ? "On its way"
                  : stage === "failed"
                    ? (failure ?? "Did not make it")
                    : "Empty"}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A migration as a moving day. The old place is on the left, its boxes a
 * listbox with a tick to include each; the new place on the right, its rooms
 * empty and dashed. Map matches every old field to a new one with a native
 * select per row and flags the rows with nowhere to go. Start the move then
 * carries each box across in turn: it lifts, glides along a short arc to its
 * room on `springs.glide` (one spring drives the whole path), lands on
 * `springs.recoil`, and unpacks — the room's count rolls on `springs.snap`
 * while a bar fills, and a check draws on `springs.flick` when it is in. A box
 * that hits a conflict pauses with Merge, Skip and Keep both; the bar turns
 * amber until one is pressed. When the last box is in, a summary lands with
 * the totals.
 *
 * The boxes are one listbox: Up/Down and Home/End move, Space or Enter
 * includes or leaves a box. Mapping rows are native selects. Start, Stop and
 * the conflict's choices are buttons, and every step of the move is announced.
 * Under reduced motion, or with `arcStyle` "fade", nothing flies: a box fades
 * from the old place and appears in its room; counts and bars still change.
 * A box never flies while the tab is hidden or the surface is off screen —
 * it is placed in its room at once.
 */
export function MovingDay({
  arcStyle = "arc",
  pace = 2.5,
  density = "cozy",
  boxes = defaultMovingBoxes,
  value,
  defaultValue = defaultMovingValue,
  onChange,
  mapping,
  defaultMapping = defaultMovingMapping,
  onMappingChange,
  run = defaultMovingRun,
  onStart,
  onBoxMoved,
  onResolve,
  onComplete,
  onStop,
  status = "ready",
  onRetry,
  title = "Moving day",
  source = "The old system",
  destination = "Basinworks",
  label,
  height = 540,
  disabled = false,
  className,
}: MovingDayProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const oldId = `${uid}-old`;
  const newId = `${uid}-new`;

  const [step, setStep] = React.useState<MovingStep>("pack");
  const [dir, setDir] = React.useState(1);
  const [own, setOwn] = React.useState<string[]>(defaultValue);
  const included = value ?? own;
  const [ownMapping, setOwnMapping] =
    React.useState<MovingMapping>(defaultMapping);
  const map = mapping ?? ownMapping;

  const [stages, setStages] = React.useState<Record<string, Stage>>({});
  const [progress, setProgress] = React.useState<Record<string, number>>({});
  const [results, setResults] = React.useState<Record<string, MovingResult>>(
    {},
  );
  const [failures, setFailures] = React.useState<Record<string, string>>({});
  const [conflict, setConflict] = React.useState<ActiveConflict | null>(null);
  const [flight, setFlight] = React.useState<Flight | null>(null);
  const [moving, setMoving] = React.useState(false);
  const [current, setCurrent] = React.useState<{
    id: string;
    index: number;
    of: number;
  } | null>(null);
  const [activeBox, setActiveBox] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const boxNodes = React.useRef(new Map<string, HTMLDivElement>());
  const slotNodes = React.useRef(new Map<string, HTMLDivElement>());
  const firstConflictRef = React.useRef<HTMLButtonElement | null>(null);
  const primaryRef = React.useRef<HTMLButtonElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const timers = React.useRef<number[]>([]);
  const alive = React.useRef(true);
  const onScreen = React.useRef(true);
  const tabShown = React.useRef(true);
  const resultsRef = React.useRef<Record<string, MovingResult>>({});
  const flightDone = React.useRef<(() => void) | null>(null);
  const flightSeq = React.useRef(0);
  const conflictReject = React.useRef<((reason: Error) => void) | null>(null);
  const conflictHadFocus = React.useRef(false);

  // The latest props and preference, for the move loop that spans renders.
  const latest = React.useRef({
    run,
    pace,
    arcStyle,
    motionSafe,
    map,
    onStart,
    onBoxMoved,
    onResolve,
    onComplete,
  });
  React.useEffect(() => {
    latest.current = {
      run,
      pace,
      arcStyle,
      motionSafe,
      map,
      onStart,
      onBoxMoved,
      onResolve,
      onComplete,
    };
  });

  const ready = status === "ready";
  const inert = disabled || !ready;
  const d = DENSITY[density];

  /* -------------------------------- data ------------------------------- */

  const includedBoxes = boxes.filter((b) => included.includes(b.id));
  const doneCount = includedBoxes.filter((b) => results[b.id]).length;
  const unmapped = includedBoxes.reduce((n, b) => n + unmappedCount(b, map), 0);
  const activeId =
    activeBox && boxes.some((b) => b.id === activeBox)
      ? activeBox
      : (boxes[0]?.id ?? null);
  const packing = step === "pack";

  /* ------------------------------ lifetime ----------------------------- */

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
      conflictReject.current?.(new Error("Unmounted"));
      conflictReject.current = null;
      for (const id of timers.current) window.clearTimeout(id);
      timers.current = [];
    };
  }, []);

  // A box only flies while someone could see it land.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onVisibility = () => {
      tabShown.current = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);
    let watcher: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        onScreen.current = Boolean(entry?.isIntersecting);
      });
      watcher.observe(root);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      watcher?.disconnect();
    };
  }, []);

  // A conflict takes focus only from someone already working in the surface.
  React.useEffect(() => {
    if (!conflict) return;
    const root = rootRef.current;
    if (root && root.contains(document.activeElement)) {
      conflictHadFocus.current = true;
      firstConflictRef.current?.focus({ preventScroll: true });
    } else {
      conflictHadFocus.current = false;
    }
  }, [conflict]);

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const id = window.setTimeout(() => {
        timers.current = timers.current.filter((t) => t !== id);
        resolve();
      }, ms);
      timers.current.push(id);
    });

  const say = (text: string) => {
    if (alive.current) setAnnouncement(text);
  };

  /* ------------------------------- packing ----------------------------- */

  const goTo = (next: MovingStep) => {
    setDir(STEP_INDEX[next] >= STEP_INDEX[step] ? 1 : -1);
    setStep(next);
  };

  const toggle = (id: string) => {
    if (inert || !packing) return;
    const box = boxes.find((b) => b.id === id);
    if (!box) return;
    const was = included.includes(id);
    const next = was
      ? included.filter((k) => k !== id)
      : boxes
          .filter((b) => b.id === id || included.includes(b.id))
          .map((b) => b.id);
    if (value === undefined) setOwn(next);
    onChange?.(next, { id, included: !was });
    say(
      `${box.label} ${was ? "left behind" : "included"}. ${next.length} of ${boxes.length} boxes packed.`,
    );
  };

  const onNav = (event: React.KeyboardEvent, id: string) => {
    const i = boxes.findIndex((b) => b.id === id);
    let to = -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") to = i + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = boxes.length - 1;
    else return;
    event.preventDefault();
    const target = boxes[clamp(to, 0, boxes.length - 1)];
    if (target) boxNodes.current.get(target.id)?.focus();
  };

  /* ------------------------------- mapping ----------------------------- */

  const setMapping = (box: MovingBox, field: MovingField, target: string) => {
    if (inert) return;
    const key = `${box.id}:${field.id}`;
    const next = { ...map };
    if (target === "") delete next[key];
    else next[key] = target;
    if (mapping === undefined) setOwnMapping(next);
    onMappingChange?.(next, {
      boxId: box.id,
      fieldId: field.id,
      target: target === "" ? null : target,
    });
    const to = box.targets.find((t) => t.id === target);
    say(
      to
        ? `${field.label} mapped to ${to.label}.`
        : `${field.label} not mapped; it stays behind.`,
    );
  };

  /* -------------------------------- moving ----------------------------- */

  const fly = (box: MovingBox) =>
    new Promise<void>((resolve) => {
      const L = latest.current;
      const root = rootRef.current;
      const from = boxNodes.current.get(box.id);
      const to = slotNodes.current.get(box.id);
      setStages((s) => ({ ...s, [box.id]: "flying" }));
      const seen = onScreen.current && tabShown.current;
      if (
        !L.motionSafe ||
        L.arcStyle === "fade" ||
        !seen ||
        !root ||
        !from ||
        !to
      ) {
        // A cross-fade needs a beat to be seen; an unseen box needs none.
        void wait(seen && L.motionSafe ? durations.base * 1000 : 0).then(
          resolve,
        );
        return;
      }
      to.scrollIntoView?.({ block: "nearest" });
      const rr = root.getBoundingClientRect();
      const fr = from.getBoundingClientRect();
      const tr = to.getBoundingClientRect();
      flightSeq.current += 1;
      flightDone.current = resolve;
      setFlight({
        id: box.id,
        seq: flightSeq.current,
        from: {
          x: fr.left - rr.left,
          y: fr.top - rr.top,
          w: fr.width,
          h: fr.height,
        },
        to: {
          x: tr.left - rr.left,
          y: tr.top - rr.top,
          w: tr.width,
          h: tr.height,
        },
      });
    });

  const onArrive = (seq: number) => {
    if (seq !== flightSeq.current) return;
    const done = flightDone.current;
    flightDone.current = null;
    setFlight(null);
    done?.();
  };

  const finish = () => {
    const L = latest.current;
    const got = resultsRef.current;
    const moved = includedBoxes.filter((b) => got[b.id]);
    const summary: MovingSummary = {
      boxes: moved.length,
      items: moved.reduce(
        (n, b) =>
          b.measure === "size" || b.count === undefined
            ? n
            : n + (got[b.id]?.moved ?? 0),
        0,
      ),
      megabytes: moved.reduce(
        (n, b) => (b.measure === "size" ? n + (got[b.id]?.moved ?? 0) : n),
        0,
      ),
      merged: moved.reduce((n, b) => n + (got[b.id]?.merged ?? 0), 0),
      skipped: moved.reduce((n, b) => n + (got[b.id]?.skipped ?? 0), 0),
      unmapped: moved.reduce((n, b) => n + unmappedCount(b, L.map), 0),
      results: got,
    };
    goTo("done");
    say(
      `All moved: ${summary.boxes} ${summary.boxes === 1 ? "box" : "boxes"}, ${withCommas(summary.items)} items, ${formatSize(summary.megabytes)}. ${summary.unmapped} ${summary.unmapped === 1 ? "field" : "fields"} left behind.`,
    );
    L.onComplete?.(summary);
  };

  const start = () => {
    if (inert || moving) return;
    const queue = includedBoxes.filter((b) => !resultsRef.current[b.id]);
    if (queue.length === 0) {
      finish();
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setMoving(true);
    setFailures({});
    latest.current.onStart?.(queue);
    const gone = () => ac.signal.aborted || !alive.current;

    void (async () => {
      let stopped = false;
      for (let i = 0; i < queue.length; i += 1) {
        const box = queue[i];
        if (!box || gone()) {
          stopped = true;
          break;
        }
        setCurrent({ id: box.id, index: i, of: queue.length });
        say(
          `Moving ${box.label} to ${box.room}, box ${i + 1} of ${queue.length}.`,
        );
        await fly(box);
        if (gone()) {
          stopped = true;
          break;
        }
        setStages((s) => ({ ...s, [box.id]: "unpacking" }));
        setProgress((p) => ({ ...p, [box.id]: 0 }));
        let quarter = 0;
        try {
          const result = await latest.current.run(box, {
            signal: ac.signal,
            budget: Math.max(200, latest.current.pace * 1000),
            mapping: mappingFor(box, latest.current.map),
            progress: (fraction) => {
              if (gone()) return;
              const v = clamp(fraction, 0, 1);
              setProgress((p) => ({ ...p, [box.id]: v }));
              const q = Math.floor(v * 4);
              if (q > quarter && q < 4) {
                quarter = q;
                say(`${box.label}: ${q * 25} percent.`);
              }
            },
            conflict: (found) =>
              new Promise<MovingResolution>((resolve, reject) => {
                if (gone()) {
                  reject(new Error("Stopped"));
                  return;
                }
                conflictReject.current = reject;
                setConflict({
                  boxId: box.id,
                  conflict: found,
                  resolve: (resolution) => {
                    conflictReject.current = null;
                    setConflict(null);
                    if (conflictHadFocus.current) {
                      primaryRef.current?.focus({ preventScroll: true });
                    }
                    latest.current.onResolve?.(box, found, resolution);
                    say(
                      `${RESOLUTION_WORD[resolution]} ${found.count} ${nounFor(box, found.count)}. ${box.label} continues.`,
                    );
                    resolve(resolution);
                  },
                });
                say(
                  `${box.label} paused: ${found.title}. ${found.detail} Merge, skip, or keep both.`,
                );
              }),
          });
          if (gone()) {
            stopped = true;
            break;
          }
          resultsRef.current = { ...resultsRef.current, [box.id]: result };
          setResults(resultsRef.current);
          setProgress((p) => ({ ...p, [box.id]: 1 }));
          setStages((s) => ({ ...s, [box.id]: "done" }));
          latest.current.onBoxMoved?.(box, result);
          say(`${box.label} is in: ${summarise(box, result)}.`);
        } catch (error) {
          if (gone()) {
            stopped = true;
            break;
          }
          const message =
            error instanceof Error && error.message
              ? error.message
              : "The move failed.";
          setStages((s) => ({ ...s, [box.id]: "failed" }));
          setFailures((f) => ({ ...f, [box.id]: message }));
          setProgress((p) => without(p, box.id));
          say(`${box.label} did not move: ${message}`);
          stopped = true;
          break;
        }
      }
      if (!alive.current) return;
      if (abortRef.current === ac) abortRef.current = null;
      setMoving(false);
      setCurrent(null);
      if (!stopped) {
        await wait(durations.slow * 1000);
        if (alive.current) finish();
      }
    })();
  };

  const stop = () => {
    const ac = abortRef.current;
    if (!ac) return;
    ac.abort();
    abortRef.current = null;
    conflictReject.current?.(new Error("Stopped"));
    conflictReject.current = null;
    setConflict(null);
    const landing = flightDone.current;
    flightDone.current = null;
    setFlight(null);
    landing?.();
    if (current) {
      setStages((s) => without(s, current.id));
      setProgress((p) => without(p, current.id));
    }
    setMoving(false);
    setCurrent(null);
    say(`Stopped. ${doneCount} of ${includedBoxes.length} boxes moved.`);
    onStop?.();
  };

  const startOver = () => {
    if (abortRef.current) stop();
    resultsRef.current = {};
    setResults({});
    setStages({});
    setProgress({});
    setFailures({});
    setConflict(null);
    setFlight(null);
    goTo("pack");
    say("Back at the old place. Nothing has moved.");
  };

  /* ------------------------------- render ------------------------------ */

  const flying = flight ? boxes.find((b) => b.id === flight.id) : undefined;
  const currentBox = current
    ? boxes.find((b) => b.id === current.id)
    : undefined;
  const failedAny = Object.keys(failures).length > 0;
  const panelKey = step === "map" ? "map" : step === "done" ? "done" : "places";

  const button = cn(
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
    FOCUS_RING,
  );
  const primary = cn(
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
    FOCUS_RING,
  );
  const selectClass = cn(
    "h-8 w-full min-w-0 cursor-pointer appearance-none rounded-2 border bg-card pr-7 pl-2.5 text-[12px] text-foreground transition-colors [&>option]:bg-popover [&>option]:text-foreground",
    FOCUS_RING,
  );

  const places = (
    <div className="grid grid-cols-1 gap-4 px-4 py-3 @min-[40rem]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @min-[40rem]:gap-3">
      <section aria-labelledby={oldId} className="min-w-0">
        <p
          id={oldId}
          className="mb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {source}
        </p>
        <div
          role="listbox"
          aria-labelledby={oldId}
          aria-multiselectable
          aria-disabled={!packing || inert || undefined}
          className={cn("flex flex-col", d.stack)}
        >
          {boxes.map((box) => (
            <BoxOption
              key={box.id}
              box={box}
              included={included.includes(box.id)}
              stage={stages[box.id] ?? "packed"}
              failure={failures[box.id]}
              packing={packing}
              density={density}
              motionSafe={motionSafe}
              disabled={inert}
              tabIndex={activeId === box.id ? 0 : -1}
              hintId={hintId}
              nodeRef={(node) => {
                if (node) boxNodes.current.set(box.id, node);
                else boxNodes.current.delete(box.id);
              }}
              onToggle={() => toggle(box.id)}
              onFocus={() => setActiveBox(box.id)}
              onNav={(event) => onNav(event, box.id)}
            />
          ))}
        </div>
      </section>
      <div
        aria-hidden
        className="hidden items-start justify-center pt-7 @min-[40rem]:flex"
      >
        <ArrowRight className="size-4 text-ink-3" />
      </div>
      <section aria-labelledby={newId} className="min-w-0">
        <p
          id={newId}
          className="mb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {destination}
        </p>
        <ul role="list" className={cn("flex flex-col", d.stack)}>
          {boxes.map((box) => (
            <Room
              key={box.id}
              box={box}
              included={included.includes(box.id)}
              stage={stages[box.id] ?? "packed"}
              progress={progress[box.id]}
              result={results[box.id]}
              failure={failures[box.id]}
              conflict={conflict?.boxId === box.id ? conflict : null}
              density={density}
              motionSafe={motionSafe}
              disabled={inert}
              slotRef={(node) => {
                if (node) slotNodes.current.set(box.id, node);
                else slotNodes.current.delete(box.id);
              }}
              firstConflictRef={firstConflictRef}
            />
          ))}
        </ul>
      </section>
    </div>
  );

  const mapPanel = (
    <div className="flex flex-col gap-4 px-4 py-3">
      {includedBoxes.map((box) => {
        const mapped = box.fields.length - unmappedCount(box, map);
        return (
          <fieldset
            key={box.id}
            className="flex min-w-0 flex-col gap-1.5 rounded-3 border border-hairline p-3"
          >
            <legend className="flex max-w-full items-center gap-1.5 px-1">
              <span className={cn("truncate font-medium", d.text)}>
                {box.label}
              </span>
              <ArrowRight aria-hidden className="size-3 shrink-0 text-ink-3" />
              <span className={cn("truncate font-medium", d.text)}>
                {box.room}
              </span>
              <span className="ml-1 shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                {mapped} of {box.fields.length}
              </span>
            </legend>
            {box.fields.map((field) => {
              const key = `${box.id}:${field.id}`;
              const raw = map[key] ?? "";
              const target = box.targets.some((t) => t.id === raw) ? raw : "";
              const open = target === "";
              const selectId = `${uid}-${box.id}-${field.id}`;
              return (
                <div
                  key={field.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1.3fr)] items-center gap-2"
                >
                  <label
                    htmlFor={selectId}
                    className={cn("min-w-0 truncate", d.text)}
                  >
                    {field.label}
                  </label>
                  <ArrowRight
                    aria-hidden
                    className={cn(
                      "size-3.5 shrink-0",
                      open ? "text-warn" : "text-ink-3",
                    )}
                  />
                  <div className="relative flex min-w-0 items-center">
                    <select
                      id={selectId}
                      value={target}
                      disabled={inert}
                      aria-invalid={open || undefined}
                      onChange={(event) =>
                        setMapping(box, field, event.currentTarget.value)
                      }
                      className={cn(
                        selectClass,
                        open
                          ? "border-[color-mix(in_oklab,var(--warn)_55%,transparent)] text-warn"
                          : "border-hairline",
                      )}
                    >
                      <option value="">Not mapped</option>
                      {box.targets.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <span
                      aria-hidden
                      className="pointer-events-none absolute right-2 flex items-center"
                    >
                      {open ? (
                        <TriangleAlert className="size-3.5 text-warn" />
                      ) : (
                        <ChevronDown className="size-3.5 text-ink-3" />
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </fieldset>
        );
      })}
      <p className={cn("flex items-center gap-1.5 text-ink-2", d.sub)}>
        {unmapped > 0 ? (
          <>
            <TriangleAlert
              aria-hidden
              className="size-3.5 shrink-0 text-warn"
            />
            {unmapped} {unmapped === 1 ? "field has" : "fields have"} nowhere to
            go and will stay behind.
          </>
        ) : (
          <>
            <Check aria-hidden className="size-3.5 shrink-0 text-success" />
            Every field has a place.
          </>
        )}
      </p>
    </div>
  );

  const movedBoxes = includedBoxes.filter((b) => results[b.id]);
  const totals = {
    items: movedBoxes.reduce(
      (n, b) =>
        b.measure === "size" || b.count === undefined
          ? n
          : n + (results[b.id]?.moved ?? 0),
      0,
    ),
    megabytes: movedBoxes.reduce(
      (n, b) => (b.measure === "size" ? n + (results[b.id]?.moved ?? 0) : n),
      0,
    ),
    merged: movedBoxes.reduce((n, b) => n + (results[b.id]?.merged ?? 0), 0),
    skipped: movedBoxes.reduce((n, b) => n + (results[b.id]?.skipped ?? 0), 0),
    unmapped: movedBoxes.reduce((n, b) => n + unmappedCount(b, map), 0),
  };
  const tiles: { label: string; value: string }[] = [
    { label: "Boxes", value: String(movedBoxes.length) },
    { label: "Items", value: withCommas(totals.items) },
    { label: "Data", value: formatSize(totals.megabytes) },
    { label: "Merged", value: withCommas(totals.merged) },
    { label: "Skipped", value: withCommas(totals.skipped) },
    { label: "Left behind", value: `${totals.unmapped} fields` },
  ];
  const stepTile = cascade(tiles.length);

  const donePanel = (
    <div className="flex flex-col gap-4 px-4 py-4">
      <motion.div
        initial={
          motionSafe
            ? { scale: 0.94, y: distances.step, opacity: 0 }
            : { opacity: 0 }
        }
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={
          motionSafe
            ? {
                scale: springs.recoil,
                y: springs.recoil,
                opacity: { duration: durations.fast },
              }
            : { duration: durations.base }
        }
        className="flex items-center gap-3"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-3 bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-success">
          <PackageCheck aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Everything is in</p>
          <p className={cn("text-ink-2", d.sub)}>
            {movedBoxes.length} {movedBoxes.length === 1 ? "box" : "boxes"}{" "}
            unpacked in {destination}.
          </p>
        </div>
      </motion.div>
      <dl className="grid grid-cols-2 gap-2 @min-[30rem]:grid-cols-3 @min-[48rem]:grid-cols-6">
        {tiles.map((tile, i) => (
          <motion.div
            key={tile.label}
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              y: motionSafe
                ? { ...springs.glide, delay: r3(i * stepTile) }
                : { duration: 0 },
              opacity: {
                duration: durations.base,
                ease: easings.enter,
                delay: motionSafe ? r3(i * stepTile) : 0,
              },
            }}
            className="flex min-w-0 flex-col gap-0.5 rounded-3 border border-hairline bg-surface-1 px-3 py-2"
          >
            <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {tile.label}
            </dt>
            <dd className="truncate font-mono text-[13px] text-foreground tabular-nums">
              {tile.value}
            </dd>
          </motion.div>
        ))}
      </dl>
      <ul role="list" aria-label="Boxes moved" className="flex flex-col">
        {movedBoxes.map((box, i) => {
          const result = results[box.id];
          const left = unmappedCount(box, map);
          return (
            <motion.li
              key={box.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: durations.base,
                ease: easings.enter,
                delay: motionSafe ? r3(0.2 + i * stepTile) : 0,
              }}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-hairline py-2 @min-[30rem]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]",
                d.text,
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{box.label}</span>
                <ArrowRight
                  aria-hidden
                  className="size-3 shrink-0 text-ink-3"
                />
                <span className="truncate text-ink-2">{box.room}</span>
              </span>
              <span
                className={cn(
                  "hidden truncate text-ink-2 @min-[30rem]:block",
                  d.sub,
                )}
              >
                {result ? summarise(box, result) : ""}
              </span>
              <span
                className={cn(
                  "shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase",
                  left > 0 ? "text-warn" : "text-success",
                )}
              >
                {left > 0 ? `${left} left behind` : "complete"}
              </span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );

  const footerText = !ready
    ? ""
    : step === "pack"
      ? `${includedBoxes.length} of ${boxes.length} boxes packed`
      : step === "map"
        ? unmapped > 0
          ? `${unmapped} ${unmapped === 1 ? "field" : "fields"} unmapped`
          : "Every field mapped"
        : step === "move"
          ? moving && current && currentBox
            ? `Moving ${currentBox.label} to ${currentBox.room}, ${current.index + 1} of ${current.of}`
            : failedAny
              ? `Stopped: ${doneCount} of ${includedBoxes.length} in`
              : doneCount > 0
                ? `${doneCount} of ${includedBoxes.length} boxes in`
                : `${includedBoxes.length} ${includedBoxes.length === 1 ? "box" : "boxes"} ready to go`
          : `${movedBoxes.length} ${movedBoxes.length === 1 ? "box" : "boxes"} in`;

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
      <p id={hintId} className="sr-only">
        Space includes or leaves a box. Up and Down move between boxes.
      </p>

      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 pt-3 pb-2.5">
        <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
          {title}
        </p>
        <ol aria-label="Steps" className="flex items-center gap-3">
          {STEPS.map((s) => {
            const on = step === s.id;
            const passed = STEP_INDEX[s.id] < STEP_INDEX[step];
            return (
              <li
                key={s.id}
                aria-current={on ? "step" : undefined}
                className="relative flex items-center gap-1 pb-1"
              >
                {passed ? (
                  <Check aria-hidden className="size-3 text-success" />
                ) : null}
                <span
                  className={cn(
                    "font-mono text-[10px] tracking-[0.08em] uppercase transition-colors",
                    on
                      ? "text-foreground"
                      : passed
                        ? "text-ink-2"
                        : "text-ink-3",
                  )}
                >
                  {s.label}
                </span>
                {on ? (
                  <motion.span
                    aria-hidden
                    layoutId={motionSafe ? `${uid}-step` : undefined}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                    className="absolute inset-x-0 bottom-0 h-px bg-cobalt-bright"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </header>

      <div className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain border-t border-hairline">
        {status === "loading" ? (
          <div
            aria-hidden
            className="grid grid-cols-1 gap-4 px-4 py-3 @min-[40rem]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @min-[40rem]:gap-3"
          >
            {[0, 1].map((col) => (
              <div key={col} className={cn("flex flex-col", d.stack)}>
                <span className="mb-1.5 h-3 w-24 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
                {Array.from({ length: 4 }, (_, i) => (
                  <span
                    key={i}
                    className="h-12 rounded-3 bg-surface-2 motion-safe:animate-pulse"
                    style={{ animationDelay: `${(col * 4 + i) * 70}ms` }}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : status === "error" ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              {source} can&apos;t be reached.
            </p>
            <p className="text-[12px] text-ink-3">
              Nothing has been packed yet.
            </p>
            {onRetry ? (
              <button type="button" onClick={onRetry} className={button}>
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            ) : null}
          </div>
        ) : boxes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <PackageOpen aria-hidden className="size-5 text-ink-3" />
            <p className="text-sm text-foreground">Nothing to move</p>
            <p className="text-[12px] text-ink-3">
              {source} has no boxes to bring over.
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={panelKey}
              initial={{ opacity: 0, x: motionSafe ? dir * distances.step : 0 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                x: motionSafe ? springs.glide : { duration: 0 },
                opacity: { duration: durations.base, ease: easings.enter },
              }}
            >
              {panelKey === "map"
                ? mapPanel
                : panelKey === "done"
                  ? donePanel
                  : places}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {ready && boxes.length > 0 ? (
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline px-4 py-2.5">
          <p
            className={cn(
              "min-w-0 flex-1 truncate text-[12px]",
              failedAny && step === "move" ? "text-danger" : "text-ink-2",
            )}
          >
            {footerText}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {step === "pack" ? (
              <button
                ref={primaryRef}
                type="button"
                aria-disabled={inert || includedBoxes.length === 0 || undefined}
                onClick={() => {
                  if (!inert && includedBoxes.length > 0) goTo("map");
                }}
                className={primary}
              >
                Map fields
                <ArrowRight aria-hidden className="size-3.5" />
              </button>
            ) : step === "map" ? (
              <>
                <button
                  type="button"
                  onClick={() => goTo("pack")}
                  className={button}
                >
                  Back
                </button>
                <button
                  ref={primaryRef}
                  type="button"
                  aria-disabled={inert || undefined}
                  onClick={() => {
                    if (!inert) goTo("move");
                  }}
                  className={primary}
                >
                  Continue
                  <ArrowRight aria-hidden className="size-3.5" />
                </button>
              </>
            ) : step === "move" ? (
              moving ? (
                <button
                  ref={primaryRef}
                  type="button"
                  onClick={stop}
                  className={button}
                >
                  <Square aria-hidden className="size-3 fill-current" />
                  Stop
                </button>
              ) : (
                <>
                  {doneCount === 0 ? (
                    <button
                      type="button"
                      onClick={() => goTo("map")}
                      className={button}
                    >
                      Back
                    </button>
                  ) : null}
                  <button
                    ref={primaryRef}
                    type="button"
                    aria-disabled={inert || undefined}
                    onClick={start}
                    className={primary}
                  >
                    <Play aria-hidden className="size-3.5 fill-current" />
                    {failedAny
                      ? "Try again"
                      : doneCount > 0
                        ? "Resume the move"
                        : "Start the move"}
                  </button>
                </>
              )
            ) : (
              <button
                ref={primaryRef}
                type="button"
                onClick={startOver}
                className={button}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Start over
              </button>
            )}
          </div>
        </footer>
      ) : null}

      {flight && flying ? (
        <Flyer
          key={flight.seq}
          flight={flight}
          arcStyle={arcStyle}
          onArrive={onArrive}
        >
          <div
            className={cn(
              "flex h-full items-center rounded-3 border border-hairline-strong bg-card shadow-[0_18px_40px_-16px_color-mix(in_oklab,black_55%,transparent)]",
              d.card,
            )}
          >
            <BoxFace
              box={flying}
              included
              density={density}
              motionSafe={false}
              dim={false}
            />
          </div>
        </Flyer>
      ) : null}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
