"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  AlignLeft,
  ArrowUp,
  List,
  ListChecks,
  LoaderCircle,
  Mail,
  Minus,
  Plus,
  Table2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type AnswerShapeKind =
  "paragraph" | "bullets" | "table" | "email" | "checklist";

/** One bar of a skeleton, in px inside the preview's box. */
export type AnswerShapeBar = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius, px. @default 2 */
  r?: number;
  /** Degrees about the bar's centre. @default 0 */
  rotate?: number;
  /** ink: text; soft: quieter text; accent: emphasis; hollow: an outline (a box, a sheet); cover: the preview's own ground, hiding what is behind. @default "ink" */
  tone?: "ink" | "soft" | "accent" | "hollow" | "cover";
};

export type AnswerShapeOption = {
  id: string;
  label: string;
  /** Which skeleton and icon the shape uses. */
  kind: AnswerShapeKind;
  /** What the length counts, plural and singular: "bullets" / "bullet". */
  unit: string;
  unitOne: string;
  min: number;
  max: number;
  step: number;
  defaultLength: number;
  /** Roughly how many words one unit of length is, for the caption. */
  wordsPer: number;
  /** Words in a prompt that ask for this form ("as a table", "bullet points"). */
  cues: string[];
  /** How a sentence names the form: "a table", "bullet points". @default the label, lower-cased */
  noun?: string;
  /** Draw this shape's skeleton yourself: bars for a length inside a box. */
  skeleton?: (
    length: number,
    box: { width: number; height: number },
  ) => AnswerShapeBar[];
};

export type AnswerShapeAnswer = {
  draft: string;
  shape: AnswerShapeOption;
  length: number;
};

export type AnswerShapeSkeletonStyle = "solid" | "wire" | "type";
export type AnswerShapePickSize = "sm" | "md" | "lg";

export type AnswerShapeProps = {
  /** The forms on offer, in order (Cmd or Ctrl with 1–5 picks by position). @default defaultAnswerShapes */
  shapes?: AnswerShapeOption[];
  /** Controlled shape id. */
  shape?: string;
  /** Initial shape when uncontrolled. @default "bullets" */
  defaultShape?: string;
  /** Fires from the pick, key or note that changed the shape. */
  onShapeChange?: (id: string) => void;
  /** Controlled length, in the current shape's unit. */
  length?: number;
  /** Initial length when uncontrolled. @default the shape's defaultLength */
  defaultLength?: number;
  /** Fires with the new length and the shape it belongs to. */
  onLengthChange?: (length: number, shapeId: string) => void;
  /** Controlled prompt text. */
  draft?: string;
  /** Initial prompt when uncontrolled. @default the Fieldline crew update */
  defaultDraft?: string;
  /** Fires from every edit. */
  onDraftChange?: (draft: string) => void;
  /** Enter or Send: the prompt with the form it should take. */
  onSubmit?: (answer: AnswerShapeAnswer) => void;
  /** The preview's texture: filled bars, a hairline wireframe, or faux words. @default "solid" */
  skeletonStyle?: AnswerShapeSkeletonStyle;
  /** Icon-only picks, icon and label, or tiles. @default "md" */
  pickSize?: AnswerShapePickSize;
  /** Selection, the table header, the checked box and Send — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Raise a note when the prompt asks for a different form. @default true */
  detectConflicts?: boolean;
  /** Show the skeleton preview (or its icon on a phone). @default true */
  showPreview?: boolean;
  /** Placeholder for an empty field. @default "Ask Fieldline…" */
  placeholder?: string;
  /** The field's accessible name. @default "Ask Fieldline" */
  label?: string;
  /** Lines the field grows to before it scrolls. @default 3 */
  maxRows?: number;
  /** An answer is being written: Send holds. @default false */
  busy?: boolean;
  /** Nothing can be typed, picked or sent. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultAnswerShapes: AnswerShapeOption[] = [
  {
    id: "paragraph",
    noun: "a paragraph",
    label: "Paragraph",
    kind: "paragraph",
    unit: "words",
    unitOne: "word",
    min: 40,
    max: 160,
    step: 20,
    defaultLength: 80,
    wordsPer: 1,
    cues: ["paragraph", "in prose", "a summary paragraph"],
  },
  {
    id: "bullets",
    noun: "bullet points",
    label: "Bullets",
    kind: "bullets",
    unit: "bullets",
    unitOne: "bullet",
    min: 3,
    max: 8,
    step: 1,
    defaultLength: 5,
    wordsPer: 12,
    cues: ["bullet", "bullets", "bullet points", "bulleted", "a list of"],
  },
  {
    id: "table",
    noun: "a table",
    label: "Table",
    kind: "table",
    unit: "rows",
    unitOne: "row",
    min: 2,
    max: 10,
    step: 1,
    defaultLength: 4,
    wordsPer: 9,
    cues: ["table", "a grid", "columns", "spreadsheet"],
  },
  {
    id: "email",
    noun: "an email",
    label: "Email",
    kind: "email",
    unit: "words",
    unitOne: "word",
    min: 60,
    max: 240,
    step: 20,
    defaultLength: 120,
    wordsPer: 1,
    cues: ["email", "e-mail", "write to", "message to"],
  },
  {
    id: "checklist",
    noun: "a checklist",
    label: "Checklist",
    kind: "checklist",
    unit: "items",
    unitOne: "item",
    min: 3,
    max: 10,
    step: 1,
    defaultLength: 6,
    wordsPer: 6,
    cues: ["checklist", "check list", "to-do", "todo", "tick list"],
  },
];

export const defaultAnswerDraft =
  "Summarise today’s site notes from Larch Street for the crew: what got poured, what’s held up by the crane permit, and who’s on tomorrow.";

/* ----------------------------------------------------------------------- */
/*                                Skeletons                                 */
/* ----------------------------------------------------------------------- */

const BARS = 18;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clampNum = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Word-group widths per line, a fixed pattern so server and browser agree. */
const CHUNKS = [
  [0.34, 0.28, 0.3],
  [0.22, 0.4, 0.26],
  [0.36, 0.2, 0.34],
  [0.3, 0.33, 0.25],
  [0.26, 0.3, 0.36],
  [0.4, 0.24, 0.24],
  [0.28, 0.36, 0.22],
];

const bar = (
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<AnswerShapeBar> = {},
): AnswerShapeBar => ({
  x: r2(x),
  y: r2(y),
  w: r2(Math.max(0, w)),
  h: r2(Math.max(0, h)),
  ...extra,
});

/** A line of text as word groups that together span `span` of the width. */
function textLine(
  out: AnswerShapeBar[],
  x: number,
  y: number,
  width: number,
  t: number,
  pattern: number[],
  span: number,
  parts: number,
  gap: number,
  tone: AnswerShapeBar["tone"] = "ink",
) {
  const use = pattern.slice(0, parts);
  const sum = use.reduce((a, b) => a + b, 0);
  let cx = x;
  for (const p of use) {
    const w = (width * span * p) / sum - gap;
    out.push(bar(cx, y, w, t, { r: t / 2, tone }));
    cx += w + gap;
  }
}

export function skeletonFor(
  kind: AnswerShapeKind,
  length: number,
  width: number,
  height: number,
): AnswerShapeBar[] {
  const W = width;
  const H = height;
  const small = H < 40;
  const t = small ? 2 : Math.max(4, Math.round(H * 0.065));
  const gap = small ? 1 : 3;
  const out: AnswerShapeBar[] = [];

  if (kind === "paragraph") {
    const lines = clampNum(2 + Math.round(length / 30), 3, 7);
    const pitch = Math.min(small ? 4 : 14, (H - t) / lines);
    const top = (H - pitch * (lines - 1) - t) / 2;
    const parts = lines <= 5 ? 3 : 2;
    for (let i = 0; i < lines; i += 1) {
      const last = i === lines - 1;
      textLine(
        out,
        0,
        top + i * pitch,
        W,
        t,
        CHUNKS[i % CHUNKS.length] ?? [1],
        last ? 0.56 : i % 2 ? 0.94 : 1,
        parts,
        gap,
      );
    }
    return out;
  }

  if (kind === "bullets" || kind === "checklist") {
    const items = clampNum(Math.round(length), 3, 6);
    const pitch = Math.min(small ? 4.5 : 17, (H - t) / items);
    const top = (H - pitch * (items - 1) - t) / 2;
    const mark = small ? 2 : kind === "checklist" ? t + 4 : t + 1;
    const lead = mark + (small ? 2 : 7);
    const done = Math.floor(items / 3);
    for (let i = 0; i < items; i += 1) {
      const y = top + i * pitch;
      if (kind === "bullets") {
        out.push(bar(0, y + (t - mark) / 2, mark, mark, { r: mark / 2 }));
      } else {
        out.push(
          bar(0, y + (t - mark) / 2, mark, mark, {
            r: small ? 0.5 : 2,
            tone: i < done ? "accent" : "hollow",
          }),
        );
      }
      textLine(
        out,
        lead,
        y,
        W - lead,
        t,
        CHUNKS[(i + 2) % CHUNKS.length] ?? [1],
        i % 2 ? 0.7 : 0.9,
        2,
        gap,
        kind === "checklist" && i < done ? "soft" : "ink",
      );
    }
    return out;
  }

  if (kind === "table") {
    const rows = clampNum(Math.round(length), 2, 5) + 1;
    const cols = 3;
    const cg = small ? 1 : 3;
    const rg = small ? 1 : 3;
    const ch = Math.min(small ? 3 : 12, (H - rg * (rows - 1)) / rows);
    const top = (H - (ch * rows + rg * (rows - 1))) / 2;
    const widths = [0.4, 0.3, 0.3];
    for (let r = 0; r < rows; r += 1) {
      let x = 0;
      for (let c = 0; c < cols; c += 1) {
        const w = W * (widths[c] ?? 0.3) - (c < cols - 1 ? cg : 0);
        out.push(
          bar(x, top + r * (ch + rg), w, ch, {
            r: small ? 0.5 : 2,
            tone: r === 0 ? "accent" : "soft",
          }),
        );
        x += w + cg;
      }
    }
    return out;
  }

  // Email: an envelope, flap folded into a V, a stamp, and the letter
  // standing out of it — its lines grow with the length.
  const e = small ? 1.5 : 2;
  const envH = H * 0.6;
  const envY = H - envH;
  const sheetX = W * 0.14;
  const sheetW = W * 0.72;
  const lines = clampNum(1 + Math.round(length / 60), 2, 5);
  const sheetTop = small ? 1 : 2;
  const pitch = small
    ? 3
    : Math.min(9, (envY + envH * 0.35 - sheetTop - 8) / lines);
  out.push(
    bar(sheetX, sheetTop, sheetW, envY + envH * 0.5 - sheetTop, {
      r: small ? 1 : 3,
      tone: "hollow",
    }),
  );
  for (let i = 0; i < lines; i += 1) {
    out.push(
      bar(
        sheetX + (small ? 2 : 6),
        sheetTop + (small ? 2 : 7) + i * pitch,
        (sheetW - (small ? 4 : 12)) * (i === lines - 1 ? 0.55 : 1),
        small ? 1 : Math.max(2, t - 2),
        { r: 1, tone: "soft" },
      ),
    );
  }
  // The envelope's front hides the bottom of the letter tucked into it.
  out.push(bar(0, envY, W, envH, { r: small ? 1 : 2, tone: "cover" }));
  out.push(bar(0, envY, W, e, { r: e / 2 }));
  out.push(bar(0, H - e, W, e, { r: e / 2 }));
  out.push(bar(0, envY, e, envH, { r: e / 2 }));
  out.push(bar(W - e, envY, e, envH, { r: e / 2 }));
  const half = W / 2;
  const dip = envH * 0.55;
  const len = Math.hypot(half, dip);
  const angle = (Math.atan2(dip, half) * 180) / Math.PI;
  out.push(
    bar(half / 2 - len / 2, envY + dip / 2 - e / 2, len, e, {
      r: e / 2,
      rotate: r2(angle),
    }),
  );
  out.push(
    bar(half + half / 2 - len / 2, envY + dip / 2 - e / 2, len, e, {
      r: e / 2,
      rotate: r2(-angle),
    }),
  );
  if (!small) {
    out.push(
      bar(W * 0.36, envY + envH * 0.66, W * 0.3, t - 1, { r: 2, tone: "soft" }),
    );
    out.push(
      bar(W * 0.36, envY + envH * 0.66 + t + 2, W * 0.22, t - 1, {
        r: 2,
        tone: "soft",
      }),
    );
  }
  return out;
}

const ICONS: Record<AnswerShapeKind, LucideIcon> = {
  paragraph: AlignLeft,
  bullets: List,
  table: Table2,
  email: Mail,
  checklist: ListChecks,
};

const nounOf = (s: AnswerShapeOption) => s.noun ?? s.label.toLowerCase();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The form the prompt itself asks for, by its last-mentioned cue. */
function askedFor(
  draft: string,
  shapes: AnswerShapeOption[],
): AnswerShapeOption | null {
  const text = draft.toLowerCase();
  let best: { shape: AnswerShapeOption; at: number } | null = null;
  for (const shape of shapes) {
    for (const cue of shape.cues) {
      const re = new RegExp(
        `(^|[^\\p{L}])${escapeRe(cue.toLowerCase())}(?![\\p{L}])`,
        "gu",
      );
      for (const m of text.matchAll(re)) {
        const at = m.index ?? 0;
        if (!best || at > best.at) best = { shape, at };
      }
    }
  }
  return best?.shape ?? null;
}

/** Literal classes, so the stylesheet carries every one of them. */
const TONE: Record<AnswerShapeSkeletonStyle, { ink: string; soft: string }> = {
  solid: {
    ink: "bg-[color-mix(in_oklab,var(--foreground)_24%,transparent)]",
    soft: "bg-[color-mix(in_oklab,var(--foreground)_14%,transparent)]",
  },
  wire: {
    ink: "border border-[color-mix(in_oklab,var(--foreground)_42%,transparent)] bg-transparent",
    soft: "border border-[color-mix(in_oklab,var(--foreground)_28%,transparent)] bg-transparent",
  },
  type: {
    ink: "bg-[repeating-linear-gradient(90deg,color-mix(in_oklab,var(--foreground)_30%,transparent)_0_7px,transparent_7px_10px)]",
    soft: "bg-[repeating-linear-gradient(90deg,color-mix(in_oklab,var(--foreground)_20%,transparent)_0_7px,transparent_7px_10px)]",
  },
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** A node's height, measured when it arrives and whenever it changes. */
function useMeasured() {
  const [node, setNode] = React.useState<HTMLElement | null>(null);
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() =>
      setHeight(Math.round(node.getBoundingClientRect().height)),
    );
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return [setNode, height] as const;
}

/* ----------------------------------------------------------------------- */
/*                                Skeleton                                  */
/* ----------------------------------------------------------------------- */

function Skeleton({
  shape,
  length,
  width,
  height,
  look,
  motionSafe,
}: {
  shape: AnswerShapeOption;
  length: number;
  width: number;
  height: number;
  look: AnswerShapeSkeletonStyle;
  motionSafe: boolean;
}) {
  const bars = (
    shape.skeleton ??
    ((l, box) => skeletonFor(shape.kind, l, box.width, box.height))
  )(length, {
    width,
    height,
  }).slice(0, BARS);
  const last = bars[bars.length - 1] ?? bar(0, height / 2, 0, 2);
  const step = cascade(BARS);
  const small = height < 40;
  const tone = (b: AnswerShapeBar | undefined) => {
    const kind = b?.tone ?? "ink";
    if (kind === "hollow")
      return "border border-[color-mix(in_oklab,var(--foreground)_32%,transparent)] bg-transparent";
    if (kind === "cover") return "bg-surface-1";
    if (kind === "accent")
      return look === "wire"
        ? "border border-(--as-accent) bg-(--as-wash)"
        : "bg-(--as-accent)";
    const set =
      look === "type" && (small || (b?.w ?? 0) <= 14 || (b?.h ?? 0) < 3)
        ? TONE.solid
        : (TONE[look] ?? TONE.solid);
    return kind === "soft" ? set.soft : set.ink;
  };

  return (
    <motion.span
      key={motionSafe ? "live" : `${shape.id}-${length}`}
      aria-hidden
      className="relative block shrink-0"
      style={{ width, height }}
      initial={motionSafe ? false : { opacity: 0.2 }}
      animate={{ opacity: 1 }}
      transition={{ duration: durations.base, ease: easings.enter }}
    >
      {Array.from({ length: BARS }, (_, i) => {
        const b = bars[i];
        const target = b ?? {
          x: r2(last.x + last.w),
          y: last.y,
          w: 0,
          h: last.h,
          r: last.r,
          rotate: last.rotate,
        };
        return (
          <motion.span
            key={i}
            className={cn(
              "absolute top-0 left-0 block transition-colors duration-300",
              tone(b ?? last),
            )}
            initial={false}
            animate={{
              x: target.x,
              y: target.y,
              width: target.w,
              height: target.h,
              borderRadius: target.r ?? 2,
              rotate: target.rotate ?? 0,
              opacity: b ? 1 : 0,
            }}
            transition={
              motionSafe
                ? {
                    ...springs.glide,
                    delay: r2(i * step * 0.6),
                    opacity: { duration: durations.fast },
                  }
                : { duration: 0 }
            }
          />
        );
      })}
    </motion.span>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

/** Picks are icon-only on a phone; these are their square sizes there. */
const PICK_NARROW: Record<AnswerShapePickSize, string> = {
  sm: "size-7",
  md: "size-8",
  lg: "size-10",
};

/**
 * A composer that asks what form the answer should take. Under the field sit
 * the shape picks — Paragraph, Bullets, Table, Email, Checklist — and beside
 * it a skeleton of the answer drawn from one fixed set of bars. Choosing a
 * shape moves every bar to its place in the new form on `springs.glide`:
 * a paragraph's word groups regroup into a table's rows and columns, shrink
 * into bullet marks and lines, or fold into an envelope whose flap rotates
 * into a V. Changing the length grows or folds rows the same way, and the
 * count rolls on `springs.snap` while the picks' selection slides on snap.
 *
 * When the prompt itself asks for a different form ("…as a table"), a note
 * glides open under the field with Use and Keep. The picks are a radiogroup
 * (arrows, Home, End; Cmd or Ctrl with 1–5 from anywhere in the composer),
 * the length a spinbutton, Enter sends. On a phone the preview shrinks to a
 * live icon beside Send. Under reduced motion the preview cross-fades to the
 * new form instead of morphing.
 */
export function AnswerShape({
  shapes = defaultAnswerShapes,
  shape: shapeProp,
  defaultShape = "bullets",
  onShapeChange,
  length: lengthProp,
  defaultLength,
  onLengthChange,
  draft: draftProp,
  defaultDraft = defaultAnswerDraft,
  onDraftChange,
  onSubmit,
  skeletonStyle = "solid",
  pickSize = "md",
  accent = "var(--accent-bright)",
  detectConflicts = true,
  showPreview = true,
  placeholder = "Ask Fieldline…",
  label = "Ask Fieldline",
  maxRows = 3,
  busy = false,
  disabled = false,
  className,
}: AnswerShapeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const fieldId = `${uid}-field`;
  const groupLabel = `${uid}-shapes`;

  /* ------------------------------- values ------------------------------- */

  const [ownShape, setOwnShape] = React.useState(defaultShape);
  const shapeId = shapeProp ?? ownShape;
  const current =
    shapes.find((s) => s.id === shapeId) ??
    shapes[0] ??
    defaultAnswerShapes[0]!;

  const [lengths, setLengths] = React.useState<Record<string, number>>(() =>
    defaultLength === undefined ? {} : { [defaultShape]: defaultLength },
  );
  const lengthOf = (s: AnswerShapeOption) =>
    clampNum(
      s.id === current.id && lengthProp !== undefined
        ? lengthProp
        : (lengths[s.id] ?? s.defaultLength),
      s.min,
      s.max,
    );
  const length = lengthOf(current);

  const [ownDraft, setOwnDraft] = React.useState(defaultDraft);
  const draft = draftProp ?? ownDraft;

  const [announcement, setAnnouncement] = React.useState("");
  const unitFor = (s: AnswerShapeOption, n: number) =>
    `${n} ${n === 1 ? s.unitOne : s.unit}`;

  const choose = (next: AnswerShapeOption) => {
    if (disabled || next.id === current.id) return;
    if (shapeProp === undefined) setOwnShape(next.id);
    onShapeChange?.(next.id);
    const nextLength = lengthOf(next);
    if (nextLength !== length) onLengthChange?.(nextLength, next.id);
    setAnnouncement(`${next.label}, ${unitFor(next, nextLength)}.`);
  };

  const setLength = (raw: number) => {
    if (disabled) return;
    const next = clampNum(
      Math.round((raw - current.min) / current.step) * current.step +
        current.min,
      current.min,
      current.max,
    );
    if (next === length) return;
    if (lengthProp === undefined)
      setLengths((m) => ({ ...m, [current.id]: next }));
    onLengthChange?.(next, current.id);
  };

  /* ------------------------------ conflict ------------------------------ */

  const asked = detectConflicts ? askedFor(draft, shapes) : null;
  const conflict = asked && asked.id !== current.id ? asked : null;
  const conflictKey = conflict ? `${conflict.id}>${current.id}` : "";
  const [kept, setKept] = React.useState<string | null>(null);
  const showConflict = conflict !== null && kept !== conflictKey;
  const [seenConflict, setSeenConflict] = React.useState(conflictKey);
  if (seenConflict !== conflictKey) {
    setSeenConflict(conflictKey);
    if (conflict && kept !== conflictKey)
      setAnnouncement(
        `Your prompt asks for ${nounOf(conflict)}; the answer is set to ${current.label.toLowerCase()}.`,
      );
  }
  const [bindNote, noteHeight] = useMeasured();

  /* ------------------------------ sending ------------------------------- */

  const fieldRef = React.useRef<HTMLTextAreaElement | null>(null);
  const send = () => {
    if (disabled || busy) return;
    const text = draft.trim();
    if (!text) {
      setAnnouncement("Write a prompt first.");
      fieldRef.current?.focus();
      return;
    }
    onSubmit?.({ draft: text, shape: current, length });
    if (draftProp === undefined) setOwnDraft("");
    onDraftChange?.("");
    setKept(null);
    setAnnouncement(
      `Sent. The answer will come as ${unitFor(current, length)}${current.kind === "paragraph" || current.kind === "email" ? ` in ${current.label.toLowerCase()} form` : ""}.`,
    );
  };

  /* ------------------------------ keyboard ------------------------------ */

  const pickRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const onRootKey = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const n = Number(event.key);
    if (!Number.isInteger(n) || n < 1 || n > Math.min(5, shapes.length)) return;
    const target = shapes[n - 1];
    if (!target) return;
    event.preventDefault();
    choose(target);
  };

  const onPickKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) => {
    let next = i;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (i + 1) % shapes.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (i - 1 + shapes.length) % shapes.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = shapes.length - 1;
    else return;
    event.preventDefault();
    const target = shapes[next];
    if (!target) return;
    choose(target);
    pickRefs.current.get(target.id)?.focus();
  };

  const onSpinKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const s = current.step;
    const big = Math.max(
      s * 2,
      Math.round((current.max - current.min) / 4 / s) * s,
    );
    const map: Record<string, number> = {
      ArrowUp: length + s,
      ArrowRight: length + s,
      ArrowDown: length - s,
      ArrowLeft: length - s,
      PageUp: length + big,
      PageDown: length - big,
      Home: current.min,
      End: current.max,
    };
    const next = map[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setLength(next);
  };

  /* ------------------------------- layout ------------------------------- */

  const vars = {
    "--as-accent": accent,
    "--as-wash": `color-mix(in oklab, ${accent} 12%, transparent)`,
    "--as-line": `color-mix(in oklab, ${accent} 42%, transparent)`,
    "--as-solid": `oklch(from ${accent} 0.55 c h)`,
    "--as-on": "oklch(0.99 0.004 262)",
  } as React.CSSProperties;

  const words = length * current.wordsPer;
  const caption =
    current.wordsPer === 1
      ? `about ${words} words`
      : `${unitFor(current, length)} · ~${words} words`;
  const lineH = 20;
  const fieldMax = maxRows * lineH + 16;
  const [lastLength, setLastLength] = React.useState(length);
  const [rollDir, setRollDir] = React.useState(1);
  if (lastLength !== length) {
    setRollDir(length > lastLength ? 1 : -1);
    setLastLength(length);
  }

  const picks = (
    <div
      role="radiogroup"
      aria-labelledby={groupLabel}
      className="flex flex-wrap items-center gap-1"
    >
      <span id={groupLabel} className="sr-only">
        Answer shape
      </span>
      {shapes.map((s, i) => {
        const on = s.id === current.id;
        const Icon = ICONS[s.kind];
        return (
          <button
            key={s.id}
            ref={(node) => {
              pickRefs.current.set(s.id, node);
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={pickSize === "sm" ? s.label : undefined}
            aria-keyshortcuts={
              i < 5 ? `Control+${i + 1} Meta+${i + 1}` : undefined
            }
            aria-disabled={disabled || undefined}
            tabIndex={on ? 0 : -1}
            title={`${s.label}${i < 5 ? ` · ⌘${i + 1}` : ""}`}
            onClick={() => choose(s)}
            onKeyDown={(event) => onPickKey(event, i)}
            className={cn(
              "relative inline-flex shrink-0 items-center justify-center rounded-2 text-[12px] font-medium transition-colors",
              PICK_NARROW[pickSize] ?? PICK_NARROW.md,
              pickSize === "sm"
                ? "@min-[34rem]/answer-shape:size-7"
                : pickSize === "md"
                  ? "@min-[34rem]/answer-shape:h-8 @min-[34rem]/answer-shape:w-auto @min-[34rem]/answer-shape:gap-1.5 @min-[34rem]/answer-shape:px-2.5"
                  : "@min-[34rem]/answer-shape:h-[52px] @min-[34rem]/answer-shape:w-[70px] @min-[34rem]/answer-shape:flex-col @min-[34rem]/answer-shape:gap-1",
              on
                ? "text-foreground"
                : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            {on ? (
              <motion.span
                layoutId={`${uid}-pick`}
                aria-hidden
                className="absolute inset-0 rounded-2 border border-(--as-line) bg-(--as-wash)"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            <Icon
              aria-hidden
              className={cn(
                "relative shrink-0",
                pickSize === "lg"
                  ? "size-4 @min-[34rem]/answer-shape:size-[18px]"
                  : "size-4",
                on && "text-(--as-accent)",
              )}
            />
            <span className="relative">
              <span
                className={cn(
                  "sr-only",
                  pickSize !== "sm" && "@min-[34rem]/answer-shape:not-sr-only",
                  pickSize === "lg" &&
                    "@min-[34rem]/answer-shape:block @min-[34rem]/answer-shape:text-[11px] @min-[34rem]/answer-shape:leading-none",
                )}
              >
                {s.label}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );

  const spinner = (
    <div className="flex items-center gap-0.5 rounded-2 border border-hairline bg-surface-1 p-0.5">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setLength(length - current.step)}
        className="inline-flex size-7 items-center justify-center rounded-1 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <Minus className="size-3.5" />
      </button>
      <div
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label="Answer length"
        aria-valuenow={length}
        aria-valuemin={current.min}
        aria-valuemax={current.max}
        aria-valuetext={unitFor(current, length)}
        aria-disabled={disabled || undefined}
        onKeyDown={onSpinKey}
        className={cn(
          "flex h-7 items-center gap-1 rounded-1 px-1.5 text-[12px] whitespace-nowrap text-ink-2",
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      >
        <span className="relative inline-flex h-4 overflow-hidden font-mono text-[12px] leading-4 font-medium text-foreground tabular-nums">
          <AnimatePresence initial={false} mode="popLayout" custom={rollDir}>
            <motion.span
              key={length}
              custom={rollDir}
              className="block"
              variants={{
                enter: (d: number) => ({
                  y: motionSafe ? d * 14 : 0,
                  opacity: 0,
                }),
                center: { y: 0, opacity: 1 },
                leave: (d: number) => ({
                  y: motionSafe ? d * -14 : 0,
                  opacity: 0,
                  transition: { duration: durations.fast, ease: easings.exit },
                }),
              }}
              initial="enter"
              animate="center"
              exit="leave"
              transition={
                motionSafe ? springs.snap : { duration: durations.fast }
              }
            >
              {length}
            </motion.span>
          </AnimatePresence>
        </span>
        <span>{length === 1 ? current.unitOne : current.unit}</span>
      </div>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setLength(length + current.step)}
        className="inline-flex size-7 items-center justify-center rounded-1 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );

  return (
    <section
      aria-label={`${label}, answer as ${current.label.toLowerCase()}`}
      onKeyDown={onRootKey}
      className={cn(
        "@container/answer-shape w-full rounded-4 border border-hairline bg-card p-3 text-foreground",
        className,
      )}
      style={vars}
    >
      <div className="flex gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="grid rounded-3 border border-input bg-surface-0 transition-colors focus-within:border-(--as-line)">
            <span
              aria-hidden
              className="invisible overflow-hidden px-3 py-2 text-[13.5px] leading-5 break-words whitespace-pre-wrap [grid-area:1/1]"
              style={{ maxHeight: fieldMax }}
            >
              {`${draft} `}
            </span>
            <textarea
              ref={fieldRef}
              id={fieldId}
              aria-label={label}
              rows={2}
              value={draft}
              readOnly={disabled}
              placeholder={placeholder}
              onChange={(event) => {
                const v = event.currentTarget.value;
                if (draftProp === undefined) setOwnDraft(v);
                onDraftChange?.(v);
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  send();
                }
              }}
              className={cn(
                "block h-full w-full resize-none overflow-y-auto rounded-3 bg-transparent px-3 py-2 text-[13.5px] leading-5 text-foreground [grid-area:1/1] placeholder:text-ink-3",
                "outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
              )}
            />
          </div>

          <motion.div
            className="overflow-hidden"
            initial={false}
            animate={{
              height: showConflict ? noteHeight : 0,
              opacity: showConflict ? 1 : 0,
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
            <div ref={bindNote}>
              {conflict ? (
                <div
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2 border border-[color-mix(in_oklab,var(--warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--warn)_9%,transparent)] px-2.5 py-1.5"
                  inert={!showConflict}
                >
                  <TriangleAlert
                    aria-hidden
                    className="size-3.5 shrink-0 text-warn"
                  />
                  <p className="min-w-0 flex-1 text-[12px] leading-4 text-foreground">
                    {`Your prompt asks for ${nounOf(conflict)}; the answer is set to ${current.label.toLowerCase()}.`}
                  </p>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => choose(conflict)}
                      className={cn(
                        "inline-flex h-6 items-center rounded-1 bg-(--as-solid) px-2 text-[11.5px] font-medium text-(--as-on) transition-colors hover:bg-[color-mix(in_oklab,var(--as-solid)_88%,black)]",
                        FOCUS,
                      )}
                    >
                      {`Use ${conflict.label.toLowerCase()}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setKept(conflictKey);
                        setAnnouncement(
                          `Keeping ${current.label.toLowerCase()}.`,
                        );
                        fieldRef.current?.focus();
                      }}
                      className={cn(
                        "inline-flex h-6 items-center rounded-1 px-2 text-[11.5px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                        FOCUS,
                      )}
                    >
                      {`Keep ${current.label.toLowerCase()}`}
                    </button>
                  </span>
                </div>
              ) : null}
            </div>
          </motion.div>

          {picks}

          <div className="flex flex-wrap items-center justify-between gap-2">
            {spinner}
            <div className="flex items-center gap-2">
              {showPreview ? (
                <span
                  aria-hidden
                  title={`${current.label} · ${caption}`}
                  className="inline-flex size-8 items-center justify-center rounded-2 border border-hairline bg-surface-1 @min-[34rem]/answer-shape:hidden"
                >
                  <Skeleton
                    shape={current}
                    length={length}
                    width={18}
                    height={18}
                    look="solid"
                    motionSafe={motionSafe}
                  />
                </span>
              ) : null}
              <span className="hidden font-mono text-[10.5px] text-ink-3 @min-[48rem]/answer-shape:inline">
                ↵ sends · ⇧↵ new line
              </span>
              <button
                type="button"
                onClick={send}
                aria-label={
                  busy
                    ? "Writing the answer"
                    : `Send, answer as ${unitFor(current, length)}`
                }
                aria-disabled={disabled || busy || undefined}
                aria-busy={busy || undefined}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-full bg-(--as-solid) text-(--as-on) transition-[background-color,opacity] hover:bg-[color-mix(in_oklab,var(--as-solid)_88%,black)]",
                  (disabled || busy) && "opacity-60",
                  FOCUS,
                )}
              >
                {busy ? (
                  <LoaderCircle
                    aria-hidden
                    className="size-4 motion-safe:animate-spin"
                  />
                ) : (
                  <ArrowUp aria-hidden className="size-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        {showPreview ? (
          <aside
            aria-hidden
            className="hidden w-[176px] shrink-0 flex-col justify-between gap-2 rounded-3 border border-hairline bg-surface-1 p-3 @min-[34rem]/answer-shape:flex"
          >
            <span className="flex items-center justify-between gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              <span>Preview</span>
              <span className="text-(--as-accent)">{current.label}</span>
            </span>
            <span className="flex flex-1 items-center justify-center py-1">
              <Skeleton
                shape={current}
                length={length}
                width={150}
                height={96}
                look={skeletonStyle}
                motionSafe={motionSafe}
              />
            </span>
            <span className="truncate font-mono text-[10.5px] text-ink-2 tabular-nums">
              {caption}
            </span>
          </aside>
        ) : null}
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
