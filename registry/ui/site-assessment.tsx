"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";
import {
  Check,
  CloudOff,
  NotebookPen,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type SiteAssessmentOption = {
  /** Stored in the answers record. Unique within its question. */
  value: string;
  /** What the option says on its pill. */
  label: string;
  /** Risk points before the question's weight: 0 is clear. */
  points: number;
};

export type SiteAssessmentQuestion = {
  id: string;
  /** Questions that share a section are grouped under its heading. */
  section?: string;
  /** The check, as the visitor reads it. */
  prompt: string;
  /** A short name for the chip and the announcements. @default the prompt */
  short?: string;
  /** One line of guidance under the prompt. */
  help?: string;
  /** How much the check counts, 1 to 3. Points are multiplied by it. */
  weight: number;
  options: SiteAssessmentOption[];
};

/** Question id → the chosen option's value. */
export type SiteAssessmentAnswers = Record<string, string>;
/** Question id → the note written against it. */
export type SiteAssessmentNotes = Record<string, string>;

export type SiteAssessmentResult = {
  answers: SiteAssessmentAnswers;
  notes: SiteAssessmentNotes;
  /** 0 to 100: the weighted points as a share of the worst possible total. */
  score: number;
  /** The band's name for that score. */
  band: string;
  /** Weighted points scored, and the most there could be. */
  points: number;
  maxPoints: number;
  /** Questions with no answer yet. */
  unanswered: string[];
};

export type SiteAssessmentDraft = {
  answers: SiteAssessmentAnswers;
  notes: SiteAssessmentNotes;
};

export type SiteAssessmentChipStyle = "solid" | "wash" | "pebble";
export type SiteAssessmentPalette = "signal" | "cobalt" | "ember" | "mono";
export type SiteAssessmentStatus = "ready" | "loading" | "error";

export type SiteAssessmentProps = {
  /** The checks, in order. @default defaultSiteAssessmentQuestions */
  questions?: SiteAssessmentQuestion[];
  /** Controlled answers: question id → option value. */
  value?: SiteAssessmentAnswers;
  /** Initial answers when uncontrolled. @default defaultSiteAssessmentAnswers */
  defaultValue?: SiteAssessmentAnswers;
  /** Fires from the press or arrow key that changed an answer, with every answer. */
  onValueChange?: (answers: SiteAssessmentAnswers) => void;
  /** Fires once per answer given, with the question, the option and every answer. */
  onAnswer?: (
    questionId: string,
    value: string,
    answers: SiteAssessmentAnswers,
  ) => void;
  /** Notes already written when the form opens. @default {} */
  defaultNotes?: SiteAssessmentNotes;
  /** Fires as a note is typed, with every note. */
  onNotesChange?: (notes: SiteAssessmentNotes) => void;
  /** Fires when the assessment is sent — at once, or when the connection returns if it was queued. */
  onSubmit?: (result: SiteAssessmentResult) => void;
  /** Fires when Submit is pressed offline: the assessment waits, and `onSubmit` follows when the connection returns. */
  onQueue?: (result: SiteAssessmentResult) => void;
  /** Fires with the whole draft after every answer or note, for a host that keeps drafts itself. */
  onDraftChange?: (draft: SiteAssessmentDraft) => void;
  /** Keeps the draft in this device's storage under this key and restores it after mount. */
  draftKey?: string;
  /** Whether the visit has a connection. Omit it to follow the browser. */
  online?: boolean;
  /** Submit only once every check has an answer. @default true */
  requireAll?: boolean;
  /** How many risk bands stripe the column and name the score, 2 to 6. @default 4 */
  bandCount?: number;
  /** Names for the bands, lowest first. @default Low · Guarded · Elevated · High (by count) */
  bandLabels?: string[];
  /** How chips are drawn in the column: solid blocks, a translucent wash, or inset pebbles. @default "solid" */
  chipStyle?: SiteAssessmentChipStyle;
  /** The band colours, lowest first: a named ramp or any CSS colours. @default "signal" */
  palette?: SiteAssessmentPalette | string[];
  /** Whether the checklist has arrived. @default "ready" */
  status?: SiteAssessmentStatus;
  /** "Try again" was pressed after the checklist failed to load. */
  onRetry?: () => void;
  /** The site's name, the form's heading. @default "Riverside pump station" */
  title?: string;
  /** The visit's start, in ms — shown in the header, never read from the clock. @default defaultSiteAssessmentNow */
  now?: number;
  /** Height of the surface in px; the questions scroll inside it. @default 520 */
  height?: number;
  /** Read only: answers, notes and Submit are locked. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** Tuesday 13 October 2026, 09:40 UTC — the crew is on site. */
export const defaultSiteAssessmentNow = Date.UTC(2026, 9, 13, 9, 40);

const opts = (...list: [string, string, number][]): SiteAssessmentOption[] =>
  list.map(([value, label, points]) => ({ value, label, points }));

/** A Fieldline pre-work visit to a riverside pump station: eight checks. */
export const defaultSiteAssessmentQuestions: SiteAssessmentQuestion[] = [
  {
    id: "route",
    section: "Access",
    prompt: "Vehicle route to the wet well",
    short: "Vehicle route",
    help: "From the gate to the lifting point, for the crane truck.",
    weight: 2,
    options: opts(
      ["clear", "Clear", 0],
      ["narrow", "Narrow", 1],
      ["blocked", "Blocked", 2],
    ),
  },
  {
    id: "lines",
    section: "Access",
    prompt: "Overhead lines near the crane path",
    short: "Overhead lines",
    help: "Anything within 10 m of the jib's reach.",
    weight: 3,
    options: opts(
      ["none", "None", 0],
      ["marked", "Marked", 1],
      ["unmarked", "Unmarked", 2],
    ),
  },
  {
    id: "isolation",
    section: "Electrical",
    prompt: "Isolation points labelled and lockable",
    short: "Isolation",
    weight: 3,
    options: opts(["yes", "Yes", 0], ["some", "Some", 1], ["no", "No", 2]),
  },
  {
    id: "panel",
    section: "Electrical",
    prompt: "Control panel enclosure",
    short: "Panel",
    help: "Door seals, cable glands and the rating plate.",
    weight: 2,
    options: opts(
      ["sound", "Sound", 0],
      ["worn", "Worn", 1],
      ["damaged", "Damaged", 2],
    ),
  },
  {
    id: "gas",
    section: "Height & entry",
    prompt: "Gas monitor for wet well entry",
    short: "Gas monitor",
    help: "Bump-tested this morning and in calibration.",
    weight: 3,
    options: opts(["ready", "Ready", 0], ["overdue", "Overdue", 2]),
  },
  {
    id: "rails",
    section: "Height & entry",
    prompt: "Guard rails on the valve platform",
    short: "Guard rails",
    weight: 2,
    options: opts(
      ["fitted", "Fitted", 0],
      ["partial", "Partial", 1],
      ["missing", "Missing", 2],
    ),
  },
  {
    id: "river",
    section: "Environment",
    prompt: "River level against the last survey",
    short: "River level",
    weight: 1,
    options: opts(
      ["below", "Below", 0],
      ["near", "Near", 1],
      ["above", "Above", 2],
    ),
  },
  {
    id: "public",
    section: "Environment",
    prompt: "Public access to the compound",
    short: "Public access",
    weight: 1,
    options: opts(
      ["locked", "Locked", 0],
      ["fenced", "Fenced", 1],
      ["open", "Open", 2],
    ),
  },
];

/** Three checks already answered on arrival: two clear, one marked line. */
export const defaultSiteAssessmentAnswers: SiteAssessmentAnswers = {
  route: "clear",
  lines: "marked",
  isolation: "yes",
};

const BAND_NAMES: Record<number, string[]> = {
  2: ["Low", "High"],
  3: ["Low", "Moderate", "High"],
  4: ["Low", "Guarded", "Elevated", "High"],
  5: ["Low", "Guarded", "Elevated", "High", "Severe"],
  6: ["Minimal", "Low", "Guarded", "Elevated", "High", "Severe"],
};

/**
 * Pigments, not text colours: each stop holds its token's hue and chroma at a
 * fixed lightness, so a filled chip reads the same on a light page as on a
 * dark one (the text tokens darken in light theme and would turn to mud).
 */
const PALETTES: Record<SiteAssessmentPalette, string[]> = {
  signal: [
    "oklch(from var(--success) 0.78 c h)",
    "oklch(from var(--warn) 0.83 c h)",
    "oklch(from var(--danger) 0.68 c h)",
  ],
  cobalt: [
    "oklch(from var(--accent-bright) 0.9 0.05 h)",
    "oklch(from var(--accent-bright) 0.75 0.12 h)",
    "oklch(from var(--accent-bright) 0.57 0.18 h)",
  ],
  ember: [
    "oklch(from var(--warn) 0.9 0.08 h)",
    "oklch(from var(--warn) 0.78 0.15 h)",
    "oklch(from var(--danger) 0.62 0.19 h)",
  ],
  mono: [
    "oklch(from var(--ink-3) 0.9 0.004 h)",
    "oklch(from var(--ink-3) 0.72 0.008 h)",
    "oklch(from var(--ink-3) 0.52 0.012 h)",
  ],
};

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

/** Fixed UTC format: a locale lookup during render would not survive hydration. */
function visitDate(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${hh}:${mm}`;
}

const WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];
const checks = (n: number) =>
  `${n <= 12 ? WORDS[n] : String(n)} ${n === 1 ? "check" : "checks"}`;

/** A colour along a ramp of stops, mixed in oklab (shading never loses its hue). */
function rampAt(stops: string[], t: number): string {
  if (stops.length === 0) return "var(--accent-bright)";
  if (stops.length === 1) return stops[0] ?? "var(--accent-bright)";
  const pos = clamp(t, 0, 1) * (stops.length - 1);
  const k = Math.min(stops.length - 2, Math.floor(pos));
  const f = pos - k;
  const a = stops[k] ?? "";
  const b = stops[k + 1] ?? a;
  if (f < 0.005) return a;
  if (f > 0.995) return b;
  return `color-mix(in oklab, ${a}, ${b} ${Math.round(f * 100)}%)`;
}

const bandNames = (count: number, labels?: string[]): string[] =>
  Array.from(
    { length: count },
    (_, i) =>
      labels?.[i] ??
      BAND_NAMES[count]?.[i] ??
      (i === 0 ? "Low" : `Band ${i + 1}`),
  );

const optionOf = (q: SiteAssessmentQuestion, value: string | undefined) =>
  value === undefined ? undefined : q.options.find((o) => o.value === value);

const maxOf = (q: SiteAssessmentQuestion) =>
  q.options.reduce((m, o) => Math.max(m, o.points), 0);

/**
 * The score for a set of answers: weighted points over the worst possible
 * total, 0 to 100, and the band it falls in. Exported so a host can show the
 * same figure elsewhere (a list of visits, a status line).
 */
export function scoreSiteAssessment(
  questions: SiteAssessmentQuestion[],
  answers: SiteAssessmentAnswers,
  bandCount = 4,
  bandLabels?: string[],
): Omit<SiteAssessmentResult, "answers" | "notes"> & { bandIndex: number } {
  let points = 0;
  let maxPoints = 0;
  const unanswered: string[] = [];
  for (const q of questions) {
    maxPoints += q.weight * maxOf(q);
    const o = optionOf(q, answers[q.id]);
    if (o) points += q.weight * o.points;
    else unanswered.push(q.id);
  }
  const score = maxPoints > 0 ? Math.round((points / maxPoints) * 100) : 0;
  const count = clamp(Math.round(bandCount), 2, 6);
  const bandIndex = Math.min(count - 1, Math.floor((score * count) / 100));
  const band = bandNames(count, bandLabels)[bandIndex] ?? "";
  return { score, band, bandIndex, points, maxPoints, unanswered };
}

/* The browser's connection, read without touching it during render. */
const subscribeOnline = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};
const getOnline = () => navigator.onLine;
const getServerOnline = () => true;

/** True from the frame after the first commit: chips born later drop in. */
function useCommitted(): boolean {
  const [committed, setCommitted] = React.useState(false);
  React.useEffect(() => {
    const id = window.requestAnimationFrame(() => setCommitted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);
  return committed;
}

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

/** The score's digits roll toward the way it moved, on snap. */
function Rolling({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const [shown, setShown] = React.useState({ value, dir: 1 });
  if (shown.value !== value) {
    setShown({ value, dir: value > shown.value ? 1 : -1 });
  }
  const dir = shown.dir;
  const text = String(value);
  return (
    <span
      aria-hidden
      className="relative inline-flex justify-start overflow-clip tabular-nums"
      style={{ width: `${text.length}ch`, height: 30 }}
    >
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.span
          key={text}
          custom={dir}
          className="inline-block"
          style={{ lineHeight: "30px" }}
          variants={{
            enter: (d: number) => ({
              opacity: 0,
              y: motionSafe ? d * 14 : 0,
            }),
            shown: { opacity: 1, y: 0 },
            leave: (d: number) => ({
              opacity: 0,
              y: motionSafe ? -d * 14 : 0,
              transition: exitFor(durations.fast),
            }),
          }}
          initial="enter"
          animate="shown"
          exit="leave"
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Height follows the content on glide, measured, so a note never jumps the list. */
function Measured({
  open,
  motionSafe,
  children,
}: {
  open: boolean;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() => setHeight(node.offsetHeight));
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return (
    <motion.div
      initial={false}
      animate={{ height: open ? height : 0, opacity: open ? 1 : 0 }}
      transition={
        motionSafe
          ? { height: springs.glide, opacity: { duration: durations.fast } }
          : { duration: 0 }
      }
      // Clipped while it moves, with room for the field's focus ring.
      style={{ overflow: "clip", overflowClipMargin: 6 }}
      aria-hidden={!open}
      inert={!open}
    >
      <div ref={setNode}>{children}</div>
    </motion.div>
  );
}

type ChipData = {
  key: string;
  /** Where the chip starts along the track, 0–100. */
  offset: number;
  /** Its length along the track, 0–100; 0 draws a seam. */
  size: number;
  points: number;
  /** The question's share of the heaviest weight, for the landing's squash. */
  heft: number;
  /** An answer that replaced another waits for the old chip to leave. */
  replaced: boolean;
};

type Look = {
  chipStyle: SiteAssessmentChipStyle;
  tint: string;
  ink: string;
};

function chipFace(look: Look): {
  className: string;
  style: React.CSSProperties;
} {
  if (look.chipStyle === "wash") {
    return {
      className: "border text-foreground",
      style: {
        backgroundColor: `color-mix(in oklab, ${look.tint} 30%, transparent)`,
        borderColor: look.tint,
      },
    };
  }
  return {
    className: "",
    style: { backgroundColor: look.tint, color: look.ink },
  };
}

/**
 * One answer's chip. The outer box holds its slot in the stack (a share of
 * the track, so no measuring) and glides when the slots below it change; the
 * inner face makes the entrance — a drop from a `step` away that lands on
 * recoil — so position and landing never fight over one transform.
 */
function Chip({
  chip,
  horizontal,
  look,
  armed,
  motionSafe,
  onLand,
}: {
  chip: ChipData;
  horizontal: boolean;
  look: Look;
  armed: boolean;
  motionSafe: boolean;
  onLand: (heft: number) => void;
}) {
  const [dropping] = React.useState(armed);
  const delay = chip.replaced ? 0.14 : 0;
  const seam = chip.size <= 0;

  React.useEffect(() => {
    if (!dropping || !motionSafe) return;
    // The stack takes the weight the moment the chip first touches it.
    const t = window.setTimeout(
      () => onLand(chip.heft),
      Math.round((delay + 0.08) * 1000),
    );
    return () => window.clearTimeout(t);
  }, [dropping, motionSafe, onLand, chip.heft, delay]);

  const slot = horizontal
    ? { left: `${r3(chip.offset)}%`, width: `${r3(chip.size)}%` }
    : {
        top: `${r3(100 - chip.offset - chip.size)}%`,
        height: `${r3(chip.size)}%`,
      };
  const face = chipFace(look);
  const pebble = look.chipStyle === "pebble";
  const travel = horizontal ? { x: distances.shift } : { y: -distances.shift };
  const rest = seam
    ? horizontal
      ? { opacity: 1, x: 0, scaleX: 0.2 }
      : { opacity: 1, y: 0, scaleY: 0.2 }
    : { opacity: 1, x: 0, y: 0 };

  return (
    <motion.div
      className={cn(
        "absolute",
        horizontal ? "inset-y-0" : "inset-x-0",
        seam && "z-10",
      )}
      initial={false}
      animate={slot}
      exit={
        motionSafe
          ? {
              opacity: 0,
              ...(horizontal ? { y: -distances.step } : { x: distances.shift }),
              transition: exitFor(durations.base),
            }
          : { opacity: 0, transition: { duration: durations.fast } }
      }
      transition={motionSafe ? springs.glide : { duration: 0 }}
    >
      <motion.div
        className={cn(
          "absolute flex items-center justify-center overflow-clip font-mono text-[10px] font-medium tabular-nums transition-colors duration-[400ms]",
          seam
            ? horizontal
              ? "inset-y-1.5 -left-[3px] w-2.5 rounded-full"
              : "inset-x-2.5 -top-[7px] h-2.5 rounded-full"
            : pebble
              ? horizontal
                ? "inset-y-1 right-px left-0.5 rounded-full"
                : "inset-x-1.5 top-0.5 bottom-px rounded-full"
              : horizontal
                ? "inset-y-0 right-px left-0"
                : "inset-x-0 top-px bottom-0",
          face.className,
        )}
        style={{
          ...face.style,
          ...(seam
            ? {
                backgroundColor: `color-mix(in oklab, ${look.ink} 70%, transparent)`,
                borderColor: "transparent",
              }
            : {}),
          originX: 0.5,
          originY: 0.5,
        }}
        initial={
          dropping
            ? motionSafe
              ? { opacity: 0, ...travel }
              : { opacity: 0 }
            : false
        }
        animate={rest}
        transition={
          motionSafe
            ? {
                x: { ...springs.recoil, delay },
                y: { ...springs.recoil, delay },
                opacity: { duration: durations.fast, delay },
                scaleX: { ...springs.recoil, delay: delay + 0.12 },
                scaleY: { ...springs.recoil, delay: delay + 0.12 },
              }
            : { duration: durations.fast, delay }
        }
      >
        {!seam && chip.size >= (horizontal ? 12 : 7) ? (
          <span>+{chip.points}</span>
        ) : null}
      </motion.div>
    </motion.div>
  );
}

/** The stack of chips inside a track: the bar's or the column's. */
function ChipStack({
  chips,
  horizontal,
  look,
  motionSafe,
}: {
  chips: ChipData[];
  horizontal: boolean;
  look: Look;
  motionSafe: boolean;
}) {
  const armed = useCommitted();
  const squash = useMotionValue(1);
  const running = React.useRef<ReturnType<typeof animate> | null>(null);

  // A heavier chip presses the stack further before it springs back.
  const onLand = React.useCallback(
    (heft: number) => {
      running.current?.stop();
      squash.jump(r3(1 - (0.012 + 0.03 * heft)));
      running.current = animate(squash, 1, springs.recoil);
    },
    [squash],
  );
  React.useEffect(() => () => running.current?.stop(), []);

  return (
    <motion.div
      className="absolute inset-0"
      style={
        horizontal
          ? { scaleX: squash, originX: 0, originY: 0.5 }
          : { scaleY: squash, originX: 0.5, originY: 1 }
      }
    >
      <AnimatePresence initial={false}>
        {chips.map((chip) => (
          <Chip
            key={chip.key}
            chip={chip}
            horizontal={horizontal}
            look={look}
            armed={armed}
            motionSafe={motionSafe}
            onLand={onLand}
          />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

/** Faint band stripes and the dashed thresholds between them. */
function Zones({
  bands,
  horizontal,
}: {
  bands: string[];
  horizontal: boolean;
}) {
  const n = bands.length;
  return (
    <>
      {bands.map((color, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute"
          style={
            horizontal
              ? {
                  top: 0,
                  bottom: 0,
                  left: `${r3((i / n) * 100)}%`,
                  width: `${r3(100 / n)}%`,
                  backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
                }
              : {
                  left: 0,
                  right: 0,
                  bottom: `${r3((i / n) * 100)}%`,
                  height: `${r3(100 / n)}%`,
                  backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
                }
          }
        />
      ))}
    </>
  );
}

function Thresholds({
  count,
  horizontal,
}: {
  count: number;
  horizontal: boolean;
}) {
  return (
    <>
      {Array.from({ length: count - 1 }, (_, i) => {
        const at = r3(((i + 1) / count) * 100);
        return (
          <span
            key={i}
            aria-hidden
            className={cn(
              "pointer-events-none absolute border-dashed border-hairline-strong",
              horizontal
                ? "-top-1 -bottom-1 border-l"
                : "-right-1.5 -left-1.5 border-t",
            )}
            style={horizontal ? { left: `${at}%` } : { bottom: `${at}%` }}
          />
        );
      })}
    </>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Question                                 */
/* ----------------------------------------------------------------------- */

function QuestionRow({
  question,
  value,
  note,
  noteOpen,
  flagged,
  uid,
  stops,
  disabled,
  motionSafe,
  onChoose,
  onToggleNote,
  onNote,
}: {
  question: SiteAssessmentQuestion;
  value: string | undefined;
  note: string;
  noteOpen: boolean;
  flagged: boolean;
  uid: string;
  stops: string[];
  disabled: boolean;
  motionSafe: boolean;
  onChoose: (value: string) => void;
  onToggleNote: (open: boolean) => void;
  onNote: (text: string) => void;
}) {
  const promptId = `${uid}-${question.id}-prompt`;
  const helpId = `${uid}-${question.id}-help`;
  const flagId = `${uid}-${question.id}-flag`;
  const noteId = `${uid}-${question.id}-note`;
  const radios = React.useRef(new Map<string, HTMLButtonElement | null>());
  const noteButton = React.useRef<HTMLButtonElement | null>(null);
  const noteField = React.useRef<HTMLTextAreaElement | null>(null);
  const wantsField = React.useRef(false);
  // Opening a note takes the writer straight into it — once the field has
  // left its inert, closed state, which is only true after the commit.
  React.useEffect(() => {
    if (!noteOpen || !wantsField.current) return;
    wantsField.current = false;
    noteField.current?.focus({ preventScroll: true });
  }, [noteOpen]);
  const chosen = optionOf(question, value);
  const n = question.options.length;
  const tabbable = chosen?.value ?? question.options[0]?.value;
  const top = maxOf(question);
  const points = chosen ? chosen.points * question.weight : null;

  const choose = (index: number) => {
    const option = question.options[((index % n) + n) % n];
    if (!option) return;
    radios.current.get(option.value)?.focus();
    if (!disabled) onChoose(option.value);
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const keys: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: n - 1,
    };
    const to = keys[event.key];
    if (to === undefined) return;
    event.preventDefault();
    choose(to);
  };

  return (
    <div
      data-question={question.id}
      className={cn(
        "flex flex-col gap-2 rounded-3 px-3 py-3 transition-shadow duration-[400ms]",
        flagged && "ring-1 ring-warn/60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          id={promptId}
          className="min-w-0 text-[13px] leading-5 font-medium text-foreground"
        >
          {question.prompt}
        </p>
        <span
          className="inline-flex h-5 shrink-0 items-center rounded-full border border-hairline px-1.5 font-mono text-[10px] text-ink-3 tabular-nums"
          title={`Counts ×${question.weight}`}
        >
          <span aria-hidden>×{question.weight}</span>
          <span className="sr-only">Weight {question.weight}</span>
        </span>
      </div>
      {question.help ? (
        <p id={helpId} className="-mt-1 text-[12px] leading-4 text-ink-3">
          {question.help}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div
          role="radiogroup"
          aria-labelledby={promptId}
          aria-describedby={
            [question.help ? helpId : "", flagged ? flagId : ""]
              .filter(Boolean)
              .join(" ") || undefined
          }
          aria-disabled={disabled || undefined}
          className="flex flex-wrap items-center gap-1.5"
        >
          {question.options.map((option, index) => {
            const checked = option.value === chosen?.value;
            const hue = rampAt(stops, top > 0 ? option.points / top : 0);
            return (
              <button
                key={option.value}
                ref={(node) => {
                  radios.current.set(option.value, node);
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={option.value === tabbable ? 0 : -1}
                onClick={() => {
                  if (!disabled) onChoose(option.value);
                }}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={cn(
                  "relative inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors",
                  FOCUS,
                  checked
                    ? "border-transparent text-foreground"
                    : "border-hairline-strong text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                {checked ? (
                  <motion.span
                    layoutId={`${uid}-${question.id}-pill`}
                    aria-hidden
                    className="absolute inset-0 rounded-full border"
                    style={{
                      backgroundColor: `color-mix(in oklab, ${hue} 32%, transparent)`,
                      borderColor: hue,
                    }}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span
                  aria-hidden
                  className="relative size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: hue }}
                />
                <span className="relative">{option.label}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              "inline-flex h-7 items-center font-mono text-[11px] tabular-nums",
              points === null
                ? "text-ink-3"
                : points === 0
                  ? "text-success"
                  : "text-foreground",
            )}
          >
            {points === null ? "—" : points === 0 ? "clear" : `+${points}`}
          </span>
          <button
            ref={noteButton}
            type="button"
            aria-expanded={noteOpen}
            aria-controls={noteId}
            aria-label={`Note on ${question.short ?? question.prompt}${
              note.trim() ? ", written" : ""
            }`}
            onClick={() => {
              wantsField.current = !noteOpen;
              onToggleNote(!noteOpen);
            }}
            className={cn(
              "relative inline-flex h-7 items-center gap-1.5 rounded-2 px-2 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
              noteOpen && "bg-surface-2 text-foreground",
            )}
          >
            <NotebookPen aria-hidden className="size-3.5 shrink-0" />
            <span aria-hidden>Note</span>
            {note.trim() ? (
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full bg-cobalt-bright"
              />
            ) : null}
          </button>
        </div>
      </div>
      {flagged ? (
        <p
          id={flagId}
          className="flex items-center gap-1.5 text-[11px] leading-4 text-warn"
        >
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          Answer this check
        </p>
      ) : null}
      <Measured open={noteOpen} motionSafe={motionSafe}>
        <textarea
          ref={noteField}
          id={noteId}
          value={note}
          rows={2}
          readOnly={disabled}
          placeholder="What did you see?"
          aria-label={`Note on ${question.short ?? question.prompt}`}
          onChange={(event) => {
            const text = event.currentTarget.value;
            onNote(text);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onToggleNote(false);
              noteButton.current?.focus();
            }
          }}
          className={cn(
            "block w-full resize-none rounded-2 border border-input bg-surface-0 px-2.5 py-1.5 text-[12px] leading-5 text-foreground placeholder:text-ink-3",
            "outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        />
      </Measured>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

type Stamp = { value: string; n: number; replaced: boolean };

/**
 * A scored site questionnaire beside the column that keeps its score. Every
 * answer drops a chip into the column — its length is the answer's weighted
 * points as a share of the worst possible total — which arrives from a
 * `step` above the stack and lands on `springs.recoil`, pressing the stack
 * down by its weight before it springs back. A clear answer drops a small
 * chip that flattens into a seam: it counted, it added nothing, and the stack
 * stays exact. The column is striped by risk band; the whole stack wears the
 * band its top reaches, so crossing a threshold is a soft colour change, and
 * the score's digits roll on `snap`. Changing an answer pulls its chip out
 * sideways on the exit ease, the chips above it glide down to close the gap,
 * and the new one drops on top.
 *
 * Each question is a real radio group (arrows move and select, Home and End
 * jump, one tab stop), with a note that opens to its measured height on glide.
 * Submit with checks unanswered takes focus to the first one; offline it
 * queues and sends when the connection returns, and with `draftKey` the
 * draft is kept in the device's storage. In a narrow container the column
 * turns into a bar across the top. Under reduced motion chips appear and
 * leave by fading, the stack re-tints at once and the digits swap — the
 * score and the fill still change, because they are the information.
 */
export function SiteAssessment({
  questions = defaultSiteAssessmentQuestions,
  value,
  defaultValue = defaultSiteAssessmentAnswers,
  onValueChange,
  onAnswer,
  defaultNotes,
  onNotesChange,
  onSubmit,
  onQueue,
  onDraftChange,
  draftKey,
  online,
  requireAll = true,
  bandCount = 4,
  bandLabels,
  chipStyle = "solid",
  palette = "signal",
  status = "ready",
  onRetry,
  title = "Riverside pump station",
  now = defaultSiteAssessmentNow,
  height = 520,
  disabled = false,
  className,
}: SiteAssessmentProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  const browserOnline = React.useSyncExternalStore(
    subscribeOnline,
    getOnline,
    getServerOnline,
  );
  const isOnline = online ?? browserOnline;

  const [own, setOwn] = React.useState<SiteAssessmentAnswers>(defaultValue);
  const answers = value ?? own;
  const [notes, setNotes] = React.useState<SiteAssessmentNotes>(
    () => defaultNotes ?? {},
  );
  const [openNotes, setOpenNotes] = React.useState<Record<string, boolean>>({});
  const [stamps, setStamps] = React.useState<{
    seq: number;
    map: Record<string, Stamp>;
  }>({ seq: 0, map: {} });
  const [phase, setPhase] = React.useState<"draft" | "queued" | "sent">(
    "draft",
  );
  const [flagged, setFlagged] = React.useState(false);
  const [restored, setRestored] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [flush, setFlush] = React.useState<{
    n: number;
    result: SiteAssessmentResult;
  } | null>(null);

  const count = clamp(Math.round(bandCount), 2, 6);
  const names = bandNames(count, bandLabels);
  const stops = Array.isArray(palette)
    ? palette
    : (PALETTES[palette] ?? PALETTES.signal);
  const bands = names.map((_, i) =>
    rampAt(stops, count > 1 ? i / (count - 1) : 0),
  );
  const scored = scoreSiteAssessment(questions, answers, count, bandLabels);
  const tint = bands[scored.bandIndex] ?? bands[0] ?? "var(--accent-bright)";
  const look: Look = {
    chipStyle,
    tint,
    ink: `oklch(from ${tint} calc(l - 0.46) c h)`,
  };
  const answeredCount = questions.length - scored.unanswered.length;
  const level =
    scored.maxPoints > 0 ? (scored.points / scored.maxPoints) * 100 : 0;

  const resultOf = (
    a: SiteAssessmentAnswers,
    n: SiteAssessmentNotes,
  ): SiteAssessmentResult => {
    const s = scoreSiteAssessment(questions, a, count, bandLabels);
    return {
      answers: a,
      notes: n,
      score: s.score,
      band: s.band,
      points: s.points,
      maxPoints: s.maxPoints,
      unanswered: s.unanswered,
    };
  };

  // A queued assessment goes the moment the connection is back: decided here,
  // in render, from the new connection state, so it is never a frame late.
  if (phase === "queued" && isOnline) {
    const result = resultOf(answers, notes);
    setPhase("sent");
    setFlush({ n: (flush?.n ?? 0) + 1, result });
    setAnnouncement(
      `Back online. Assessment sent. Score ${result.score}, ${result.band}.`,
    );
  }
  const flushed = React.useRef(0);
  React.useEffect(() => {
    if (!flush || flushed.current === flush.n) return;
    flushed.current = flush.n;
    onSubmit?.(flush.result);
  }, [flush, onSubmit]);

  /* ---------------------------- the draft --------------------------- */

  const ready = React.useRef(!draftKey);
  React.useEffect(() => {
    if (!draftKey) {
      ready.current = true;
      return;
    }
    ready.current = false;
    let stored: SiteAssessmentDraft | null = null;
    try {
      const raw = window.localStorage.getItem(draftKey);
      stored = raw ? (JSON.parse(raw) as SiteAssessmentDraft) : null;
    } catch {
      stored = null;
    }
    if (!stored || typeof stored.answers !== "object") {
      ready.current = true;
      return;
    }
    const draft = stored;
    // Applied on the next frame: the stored draft is outside data arriving.
    const id = window.requestAnimationFrame(() => {
      const kept: SiteAssessmentAnswers = {};
      for (const q of questions) {
        const v = draft.answers?.[q.id];
        if (typeof v === "string" && optionOf(q, v)) kept[q.id] = v;
      }
      if (value === undefined) setOwn(kept);
      setNotes(
        draft.notes && typeof draft.notes === "object" ? draft.notes : {},
      );
      setRestored(true);
      ready.current = true;
      onValueChange?.(kept);
    });
    return () => window.cancelAnimationFrame(id);
    // Restores once per key; later answers are written by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  React.useEffect(() => {
    if (!draftKey || !ready.current) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify({ answers, notes }));
    } catch {
      // Storage full or blocked: the draft still lives in memory.
    }
  }, [draftKey, answers, notes]);

  /* --------------------------- the handlers -------------------------- */

  const choose = (question: SiteAssessmentQuestion, next: string) => {
    if (disabled || answers[question.id] === next) return;
    const option = optionOf(question, next);
    if (!option) return;
    const had = answers[question.id] !== undefined;
    const updated = { ...answers, [question.id]: next };
    if (value === undefined) setOwn(updated);
    setStamps((s) => ({
      seq: s.seq + 1,
      map: {
        ...s.map,
        [question.id]: { value: next, n: s.seq + 1, replaced: had },
      },
    }));
    if (phase !== "draft") setPhase("draft");
    const s = scoreSiteAssessment(questions, updated, count, bandLabels);
    const add = option.points * question.weight;
    setAnnouncement(
      `${question.short ?? question.prompt}: ${option.label}, ${
        add === 0 ? "clear" : `plus ${add}`
      }. Score ${s.score}, ${s.band}.`,
    );
    onValueChange?.(updated);
    onAnswer?.(question.id, next, updated);
    onDraftChange?.({ answers: updated, notes });
  };

  const writeNote = (id: string, text: string) => {
    if (disabled) return;
    const updated = { ...notes, [id]: text };
    setNotes(updated);
    if (phase !== "draft") setPhase("draft");
    onNotesChange?.(updated);
    onDraftChange?.({ answers, notes: updated });
  };

  const submit = () => {
    if (disabled || phase !== "draft") return;
    if (requireAll && scored.unanswered.length > 0) {
      setFlagged(true);
      const first = questions.find((q) => q.id === scored.unanswered[0]);
      setAnnouncement(
        `${checks(scored.unanswered.length)} left. Answer ${
          first?.short ?? first?.prompt ?? "the first"
        } first.`.replace(/^./, (c) => c.toUpperCase()),
      );
      const node = rootRef.current?.querySelector<HTMLElement>(
        `[data-question="${first?.id ?? ""}"] [role="radio"][tabindex="0"]`,
      );
      node?.focus();
      node?.scrollIntoView({ block: "nearest" });
      return;
    }
    const result = resultOf(answers, notes);
    if (!isOnline) {
      setPhase("queued");
      setAnnouncement(
        "Offline. The assessment is queued and sends when you are back online.",
      );
      onQueue?.(result);
      return;
    }
    setPhase("sent");
    setAnnouncement(`Assessment sent. Score ${result.score}, ${result.band}.`);
    onSubmit?.(result);
  };

  /* ----------------------------- the chips --------------------------- */

  const order = new Map(questions.map((q, i) => [q.id, i]));
  const rank = (q: SiteAssessmentQuestion) => {
    const stamp = stamps.map[q.id];
    return stamp && stamp.value === answers[q.id]
      ? 1000 + stamp.n
      : (order.get(q.id) ?? 0);
  };
  const heaviest = questions.reduce((m, q) => Math.max(m, q.weight), 1);
  const placed = new Map<string, ChipData>();
  let offset = 0;
  for (const q of [...questions]
    .filter((q) => optionOf(q, answers[q.id]))
    .sort((a, b) => rank(a) - rank(b))) {
    const option = optionOf(q, answers[q.id]);
    if (!option) continue;
    const pts = option.points * q.weight;
    const size = scored.maxPoints > 0 ? (pts / scored.maxPoints) * 100 : 0;
    const stamp = stamps.map[q.id];
    placed.set(q.id, {
      key: `${q.id}:${option.value}`,
      offset,
      size,
      points: pts,
      heft: q.weight / heaviest,
      replaced: Boolean(stamp?.replaced && stamp.value === option.value),
    });
    offset += size;
  }
  // DOM order stays the questions' order; the stack order is carried by the
  // offsets, so nothing is ever moved in the document.
  const chips = questions.flatMap((q) => {
    const c = placed.get(q.id);
    return c ? [c] : [];
  });

  const meterText = `${scored.score}, ${scored.band}`;
  const sections: { name: string; items: SiteAssessmentQuestion[] }[] = [];
  for (const q of questions) {
    const name = q.section ?? "";
    const last = sections[sections.length - 1];
    if (last && last.name === name) last.items.push(q);
    else sections.push({ name, items: [q] });
  }

  const readout = (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Risk score
      </span>
      <span className="flex items-baseline gap-1 font-mono text-[28px] font-medium text-foreground">
        {status === "ready" ? (
          <Rolling value={scored.score} motionSafe={motionSafe} />
        ) : (
          <span style={{ lineHeight: "30px" }}>—</span>
        )}
        <span className="text-[11px] font-normal text-ink-3">/100</span>
      </span>
      <span className="grid text-[12px] leading-4">
        {names.map((name, i) => (
          <span
            key={name + i}
            aria-hidden={i !== scored.bandIndex}
            className="flex items-center gap-1.5 transition-opacity duration-[400ms] [grid-area:1/1]"
            style={{ opacity: i === scored.bandIndex ? 1 : 0 }}
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: bands[i] }}
            />
            <span className="truncate font-medium text-foreground">{name}</span>
          </span>
        ))}
      </span>
    </div>
  );

  const meterProps = {
    role: "meter" as const,
    "aria-label": "Risk score",
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuenow": scored.score,
    "aria-valuetext": meterText,
  };

  const marker = (horizontal: boolean) => (
    <motion.span
      aria-hidden
      className={cn(
        "pointer-events-none absolute z-10 bg-foreground",
        horizontal ? "-top-1 -bottom-1 w-px" : "-right-2 -left-2 h-px",
      )}
      initial={false}
      animate={
        horizontal
          ? { left: `${r3(Math.min(level, 100))}%` }
          : { top: `${r3(100 - Math.min(level, 100))}%` }
      }
      transition={motionSafe ? springs.glide : { duration: 0 }}
    />
  );

  /* ---------------------------- rendering ---------------------------- */

  const body =
    status === "loading" ? (
      <div aria-busy="true" className="flex flex-col gap-4 px-4 py-4">
        <p className="sr-only">Loading the checklist.</p>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} aria-hidden className="flex flex-col gap-2 px-3">
            <span className="h-3 w-2/3 rounded-full bg-surface-2" />
            <span className="h-2.5 w-1/2 rounded-full bg-surface-2/70" />
            <span className="flex gap-1.5">
              <span className="h-7 w-16 rounded-full bg-surface-2" />
              <span className="h-7 w-16 rounded-full bg-surface-2" />
              <span className="h-7 w-16 rounded-full bg-surface-2" />
            </span>
          </div>
        ))}
      </div>
    ) : status === "error" ? (
      <div className="flex h-full flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">The checklist did not load.</p>
        <p className="max-w-xs text-[12px] text-ink-3">
          Answers you already gave are kept. Try again when the signal is
          steadier.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-input px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : (
      <div className="flex flex-col px-1 pt-1 pb-3">
        {sections.map((section, s) => (
          <section
            key={`${section.name}-${s}`}
            aria-labelledby={section.name ? `${uid}-s${s}` : undefined}
            className="flex flex-col"
          >
            {section.name ? (
              <h3
                id={`${uid}-s${s}`}
                className="px-3 pt-3 pb-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
              >
                {section.name}
              </h3>
            ) : null}
            {section.items.map((q) => (
              <QuestionRow
                key={q.id}
                question={q}
                value={answers[q.id]}
                note={notes[q.id] ?? ""}
                noteOpen={Boolean(openNotes[q.id])}
                flagged={flagged && !optionOf(q, answers[q.id])}
                uid={uid}
                stops={stops}
                disabled={disabled}
                motionSafe={motionSafe}
                onChoose={(v) => choose(q, v)}
                onToggleNote={(open) =>
                  setOpenNotes((o) => ({ ...o, [q.id]: open }))
                }
                onNote={(text) => writeNote(q.id, text)}
              />
            ))}
          </section>
        ))}
      </div>
    );

  const left = scored.unanswered.length;
  const submitLabel =
    phase === "sent"
      ? "Submitted"
      : phase === "queued"
        ? "Queued"
        : isOnline
          ? "Submit"
          : "Submit when online";

  return (
    <div
      ref={rootRef}
      className={cn(
        "@container flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ height }}
    >
      <div className="flex flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-hairline px-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="truncate text-sm font-semibold">{title}</h2>
              <p className="truncate text-[11px] text-ink-3">
                Fieldline site visit · {visitDate(now)}
              </p>
            </div>
            <p className="flex h-5 items-center gap-1.5 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase tabular-nums">
              <span className="text-foreground">{answeredCount}</span> of{" "}
              {questions.length} answered
            </p>
          </header>

          {/* The column becomes a bar across the top in a narrow container. */}
          <div className="flex items-center gap-4 border-b border-hairline px-4 py-3 @min-[34rem]:hidden">
            <div className="w-[6.5rem] shrink-0">{readout}</div>
            <div {...meterProps} className="relative h-6 min-w-0 flex-1">
              <div className="absolute inset-0 overflow-hidden rounded-full border border-hairline bg-surface-0">
                <Zones bands={bands} horizontal />
                <ChipStack
                  chips={chips}
                  horizontal
                  look={look}
                  motionSafe={motionSafe}
                />
              </div>
              <Thresholds count={count} horizontal />
              {marker(true)}
            </div>
          </div>

          <AnimatePresence initial={false}>
            {!isOnline ? (
              <motion.div
                key="offline"
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
                        opacity: { duration: durations.fast },
                      }
                    : { duration: 0 }
                }
                className="overflow-hidden"
              >
                <p className="flex items-center gap-2 border-b border-hairline bg-surface-2 px-4 py-2 text-[12px] leading-4 text-ink-2">
                  <CloudOff
                    aria-hidden
                    className="size-3.5 shrink-0 text-warn"
                  />
                  Offline. Answers stay on this device and send when you are
                  back.
                </p>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div
            className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
            aria-busy={status === "loading" || undefined}
          >
            {body}
          </div>
        </div>

        <aside
          aria-label="Score"
          className="hidden w-[10.5rem] shrink-0 flex-col gap-4 border-l border-hairline bg-surface-1 px-4 py-4 @min-[34rem]:flex"
        >
          {readout}
          <div className="flex flex-1 gap-3 pb-1">
            <div {...meterProps} className="relative w-12 shrink-0">
              <div className="absolute inset-0 overflow-hidden rounded-3 border border-hairline bg-surface-0">
                <Zones bands={bands} horizontal={false} />
                <ChipStack
                  chips={chips}
                  horizontal={false}
                  look={look}
                  motionSafe={motionSafe}
                />
              </div>
              <Thresholds count={count} horizontal={false} />
              {marker(false)}
            </div>
            <div aria-hidden className="relative min-w-0 flex-1">
              {names.map((name, i) => (
                <span
                  key={name + i}
                  className={cn(
                    "absolute left-0 flex max-w-full -translate-y-1/2 items-center font-mono text-[9px] tracking-[0.06em] uppercase transition-colors duration-[400ms]",
                    i === scored.bandIndex
                      ? "font-medium text-foreground"
                      : "text-ink-3",
                  )}
                  style={{ top: `${r3((1 - (i + 0.5) / count) * 100)}%` }}
                >
                  <span className="truncate">{name}</span>
                </span>
              ))}
            </div>
          </div>
          <p className="font-mono text-[10px] text-ink-3 tabular-nums">
            {scored.points} of {scored.maxPoints} pts
          </p>
        </aside>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline px-4 py-3">
        <p className="flex min-w-0 items-center gap-1.5 text-[12px] leading-4 text-ink-2">
          {phase === "sent" ? (
            <>
              <motion.span
                aria-hidden
                className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
                initial={motionSafe ? { scale: 0.6 } : false}
                animate={{ scale: 1 }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              >
                <Check className="size-3" />
              </motion.span>
              <span className="truncate">
                Sent · score {scored.score} · {scored.band}
              </span>
            </>
          ) : phase === "queued" ? (
            <>
              <CloudOff aria-hidden className="size-3.5 shrink-0 text-warn" />
              <span className="truncate">Queued · sends when online</span>
            </>
          ) : left > 0 ? (
            <span className="truncate">
              {checks(left).replace(/^./, (c) => c.toUpperCase())} left
            </span>
          ) : draftKey ? (
            <span className="truncate">
              {restored
                ? "Draft restored on this device"
                : "Draft kept on this device"}
            </span>
          ) : (
            <span className="truncate">Every check answered</span>
          )}
        </p>
        <button
          type="button"
          onClick={submit}
          aria-disabled={disabled || phase !== "draft" || undefined}
          className={cn(
            "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-2 px-4 text-[13px] font-medium transition-colors",
            FOCUS,
            phase === "draft" && !disabled
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "cursor-default border border-input bg-surface-1 text-ink-2",
          )}
        >
          {phase === "sent" ? (
            <Check aria-hidden className="size-4 shrink-0 text-success" />
          ) : null}
          {submitLabel}
        </button>
      </footer>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
