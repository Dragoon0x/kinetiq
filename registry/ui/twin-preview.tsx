"use client";

import * as React from "react";

import {
  AnimatePresence,
  motion,
  type MotionValue,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
} from "motion/react";
import {
  Bold,
  FileText,
  Heading,
  Italic,
  Link as LinkIcon,
  Link2,
  Link2Off,
  List,
  Monitor,
  Moon,
  RotateCcw,
  Smartphone,
  Sun,
  SunMoon,
  Tablet,
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

export type TwinSplit = "side" | "stack";
export type TwinTheme = "match" | "light" | "dark";
export type TwinDeviceKind = "desktop" | "tablet" | "phone";
export type TwinStatus = "ready" | "loading" | "error";

export type TwinDevice = {
  id: string;
  /** Shown in the frame's bar and read by the switch, e.g. "Phone". */
  label: string;
  /** Picks the switch's icon. */
  kind: TwinDeviceKind;
  /** The frame's width in px; null fills the pane. */
  width: number | null;
};

export type TwinBlockKind = "heading" | "paragraph" | "list" | "quote" | "rule";

/** One block of the source: a heading, a paragraph, a list, a quote or a rule. */
export type TwinBlock = {
  kind: TwinBlockKind;
  /** Heading level, 1 to 3. */
  level?: 1 | 2 | 3;
  /** A numbered list rather than a bulleted one. */
  ordered?: boolean;
  /** The block's inline source, markers stripped. */
  text: string;
  /** A list's items, each inline source. */
  items?: string[];
  /** The block's lines as written. */
  raw: string;
  /** Where it starts in the source. */
  start: number;
  /** Where it ends in the source. */
  end: number;
};

export type TwinFormat = "bold" | "italic" | "heading" | "list" | "link";
/** What produced a change: typing, or a toolbar format. */
export type TwinCause = "typing" | TwinFormat;

export type TwinPreviewProps = {
  /** Editor beside the twin, or above it. Below a 40rem container they always stack. @default "side" */
  split?: TwinSplit;
  /** The device the twin starts on, by id; the switch changes it, and a new value here applies it. @default "desktop" */
  device?: string;
  /** The devices the switch offers, in order. @default defaultTwinDevices */
  devices?: TwinDevice[];
  /** The twin's theme: the page's, or a light or dark preview; the switch changes it. @default "match" */
  theme?: TwinTheme;
  /** Whether the panes scroll together; the switch changes it. @default true */
  lockstep?: boolean;
  /** Controlled source. */
  value?: string;
  /** Initial source when uncontrolled. @default defaultTwinSource */
  defaultValue?: string;
  /** Fires with the whole source after every keystroke or format. */
  onChange?: (value: string, cause: TwinCause) => void;
  /** The device switch was pressed. */
  onDeviceChange?: (device: TwinDevice) => void;
  /** The theme switch was pressed. */
  onThemeChange?: (theme: TwinTheme) => void;
  /** The lockstep switch was pressed. */
  onLockstepChange?: (lockstep: boolean) => void;
  /** Shown in the editor when the source is empty. @default "Start with a heading: # Title" */
  placeholder?: string;
  /** Whether the document has arrived. @default "ready" */
  status?: TwinStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The product, above the title. @default "Gaugeworks Docs" */
  product?: string;
  /** The document's name, the heading. @default "Calibration rollout" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; both panes scroll inside it. @default 540 */
  height?: number;
  /** Read only: the source cannot change, though the twin's switches still work. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultTwinDevices: TwinDevice[] = [
  { id: "desktop", label: "Desktop", kind: "desktop", width: null },
  { id: "tablet", label: "Tablet", kind: "tablet", width: 600 },
  { id: "phone", label: "Phone", kind: "phone", width: 360 },
];

/** A Gaugeworks Docs page: Fieldline's calibration rollout note. */
export const defaultTwinSource = [
  "# Gauge calibration rollout",
  "",
  "Fieldline's meter crews start the new calibration flow on **Monday 19 October**. This page is the single source of truth; the _support macro_ links here.",
  "",
  "## What changes",
  "",
  "- Readings are checked against the last three visits before they save",
  "- Drift above 2% opens a `recheck` task instead of failing the visit",
  "- Crews see the tolerance band on the gauge screen",
  "",
  "## Rollout plan",
  "",
  "1. Coldbrook crew: Monday",
  "2. Basinworks and Fernmoor: Wednesday",
  "3. Night shift: the following week",
  "",
  "> Anything outside tolerance still goes to review. The flow changes what the crew sees, not who signs off.",
  "",
  "Questions go to the [rollout channel](https://docs.gaugeworks.example/rollout) or to Mara Lind.",
].join("\n");

/* ----------------------------------------------------------------------- */
/*                                  Parsing                                 */
/* ----------------------------------------------------------------------- */

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^\s*[-*]\s+/;
const NUMBER = /^\s*\d+[.)]\s+/;
const QUOTE = /^>\s?/;
const RULE = /^(-{3,}|\*{3,})\s*$/;

const startsBlock = (line: string) =>
  HEADING.test(line) ||
  BULLET.test(line) ||
  NUMBER.test(line) ||
  QUOTE.test(line) ||
  RULE.test(line);

/** Splits a markdown-ish source into blocks, each knowing where it sits. */
export function parseTwinBlocks(source: string): TwinBlock[] {
  const blocks: TwinBlock[] = [];
  const lines = source.split("\n");
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const endOf = (k: number) => (starts[k] ?? 0) + (lines[k]?.length ?? 0);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    const start = starts[i] ?? 0;
    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min(3, (heading[1] ?? "#").length) as 1 | 2 | 3;
      blocks.push({
        kind: "heading",
        level,
        text: (heading[2] ?? "").trim(),
        raw: line,
        start,
        end: endOf(i),
      });
      i += 1;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ kind: "rule", text: "", raw: line, start, end: endOf(i) });
      i += 1;
      continue;
    }
    if (BULLET.test(line) || NUMBER.test(line)) {
      const ordered = NUMBER.test(line);
      const marker = ordered ? NUMBER : BULLET;
      const items: string[] = [];
      let j = i;
      while (j < lines.length && marker.test(lines[j] ?? "")) {
        items.push((lines[j] ?? "").replace(marker, "").trim());
        j += 1;
      }
      blocks.push({
        kind: "list",
        ordered,
        text: items.join("\n"),
        items,
        raw: lines.slice(i, j).join("\n"),
        start,
        end: endOf(j - 1),
      });
      i = j;
      continue;
    }
    if (QUOTE.test(line)) {
      const parts: string[] = [];
      let j = i;
      while (j < lines.length && QUOTE.test(lines[j] ?? "")) {
        parts.push((lines[j] ?? "").replace(QUOTE, "").trim());
        j += 1;
      }
      blocks.push({
        kind: "quote",
        text: parts.join(" ").trim(),
        raw: lines.slice(i, j).join("\n"),
        start,
        end: endOf(j - 1),
      });
      i = j;
      continue;
    }
    const parts: string[] = [];
    let j = i;
    while (j < lines.length) {
      const l = lines[j] ?? "";
      if (l.trim() === "" || (j > i && startsBlock(l))) break;
      parts.push(l.trim());
      j += 1;
    }
    blocks.push({
      kind: "paragraph",
      text: parts.join(" "),
      raw: lines.slice(i, j).join("\n"),
      start,
      end: endOf(j - 1),
    });
    i = j;
  }
  return blocks;
}

type Inline = {
  kind: "text" | "bold" | "italic" | "code" | "link";
  text: string;
  href?: string;
};

const INLINE =
  /(\*\*([^*\n]+)\*\*)|(\*([^*\n]+)\*)|(_([^_\n]+)_)|(`([^`\n]+)`)|(\[([^\]\n]+)\]\(([^)\s]+)\))/g;

function tokenize(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "text", text: text.slice(last, at) });
    if (m[2] !== undefined) out.push({ kind: "bold", text: m[2] });
    else if (m[4] !== undefined) out.push({ kind: "italic", text: m[4] });
    else if (m[6] !== undefined) out.push({ kind: "italic", text: m[6] });
    else if (m[8] !== undefined) out.push({ kind: "code", text: m[8] });
    else if (m[10] !== undefined)
      out.push({ kind: "link", text: m[10], href: m[11] ?? "" });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** A block's words without its markers, for counts and announcements. */
export const plainTwinText = (text: string) =>
  tokenize(text)
    .map((t) => t.text)
    .join("");

/** Counts the words of a source, markers stripped. */
export const countTwinWords = (source: string) =>
  parseTwinBlocks(source)
    .flatMap((b) => plainTwinText(b.text).split(/\s+/))
    .filter(Boolean).length;

/* ----------------------------------------------------------------------- */
/*                               Reconciling                                */
/* ----------------------------------------------------------------------- */

/** A block with an identity that survives edits and a revision that counts them. */
type Keyed = { id: string; rev: number; block: TwinBlock };
type Doc = { source: string; keyed: Keyed[]; seq: number };

const initialDoc = (source: string): Doc => {
  const blocks = parseTwinBlocks(source);
  return {
    source,
    keyed: blocks.map((block, i) => ({ id: `b${i}`, rev: 0, block })),
    seq: blocks.length,
  };
};

/**
 * Matches the new blocks to the old by a longest common subsequence of their
 * raw lines. Blocks that still read the same keep their id; a removed block
 * next to an added one is the same block edited, so it keeps its id and its
 * revision goes up; what is left over is new, or gone.
 */
function reconcile(prev: Doc, source: string): Doc {
  const next = parseTwinBlocks(source);
  const old = prev.keyed;
  const n = old.length;
  const m = next.length;
  const w = m + 1;
  const table = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * w + j] =
        old[i]?.block.raw === next[j]?.raw
          ? (table[(i + 1) * w + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * w + j] ?? 0, table[i * w + j + 1] ?? 0);
    }
  }
  let seq = prev.seq;
  const keyed: Keyed[] = [];
  let dels: Keyed[] = [];
  let ins: TwinBlock[] = [];
  const flush = () => {
    const pairs = Math.min(dels.length, ins.length);
    for (let k = 0; k < pairs; k += 1) {
      const d = dels[k];
      const b = ins[k];
      if (d && b) keyed.push({ id: d.id, rev: d.rev + 1, block: b });
    }
    for (let k = pairs; k < ins.length; k += 1) {
      const b = ins[k];
      if (!b) continue;
      seq += 1;
      keyed.push({ id: `b${seq}`, rev: 0, block: b });
    }
    dels = [];
    ins = [];
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    const p = old[i];
    const q = next[j];
    if (p && q && p.block.raw === q.raw) {
      flush();
      keyed.push({ id: p.id, rev: p.rev, block: q });
      i += 1;
      j += 1;
    } else if (
      q &&
      (!p || (table[i * w + j + 1] ?? 0) >= (table[(i + 1) * w + j] ?? 0))
    ) {
      ins.push(q);
      j += 1;
    } else if (p) {
      dels.push(p);
      i += 1;
    }
  }
  flush();
  return { source, keyed, seq };
}

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const EDITOR_PAD = 12;
const FRAME_PAD = 16;
const QUIET_MS = 600;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

const { stiffness, damping, mass } = springs.snap;
const SNAP = { stiffness, damping, mass };

const describe = (block: TwinBlock) => {
  const words = plainTwinText(block.text);
  const short = words.length > 60 ? `${words.slice(0, 57).trim()}...` : words;
  if (block.kind === "heading") return `heading ${block.level ?? 1}, ${short}`;
  if (block.kind === "list")
    return `${block.ordered ? "numbered" : "bulleted"} list, ${block.items?.length ?? 0} items`;
  if (block.kind === "rule") return "rule";
  if (block.kind === "quote") return `quote, ${short}`;
  return `paragraph, ${short}`;
};

const DEVICE_ICONS: Record<TwinDeviceKind, React.ReactNode> = {
  desktop: <Monitor aria-hidden className="size-3.5" />,
  tablet: <Tablet aria-hidden className="size-3.5" />,
  phone: <Smartphone aria-hidden className="size-3.5" />,
};

const THEMES: { id: TwinTheme; label: string; icon: React.ReactNode }[] = [
  {
    id: "match",
    label: "Match the page",
    icon: <SunMoon aria-hidden className="size-3.5" />,
  },
  {
    id: "light",
    label: "Light",
    icon: <Sun aria-hidden className="size-3.5" />,
  },
  {
    id: "dark",
    label: "Dark",
    icon: <Moon aria-hidden className="size-3.5" />,
  },
];

type FormatResult = {
  source: string;
  start: number;
  end: number;
  said: string;
};

/** Applies a toolbar format to the selection and says what it did. */
function applyFormat(
  format: TwinFormat,
  source: string,
  start: number,
  end: number,
): FormatResult {
  const selected = source.slice(start, end);
  const wrap = (mark: string, fallback: string): FormatResult => {
    const inner = source.slice(start - mark.length, start);
    const outer = source.slice(end, end + mark.length);
    if (selected && inner === mark && outer === mark) {
      return {
        source:
          source.slice(0, start - mark.length) +
          selected +
          source.slice(end + mark.length),
        start: start - mark.length,
        end: end - mark.length,
        said: `${format} removed`,
      };
    }
    const text = selected || fallback;
    return {
      source: source.slice(0, start) + mark + text + mark + source.slice(end),
      start: start + mark.length,
      end: start + mark.length + text.length,
      said: `${format} applied`,
    };
  };
  if (format === "bold") return wrap("**", "bold");
  if (format === "italic") return wrap("_", "italic");
  if (format === "link") {
    const text = selected || "link";
    const href = "https://";
    const out = `[${text}](${href})`;
    return {
      source: source.slice(0, start) + out + source.slice(end),
      start: start + text.length + 3,
      end: start + text.length + 3 + href.length,
      said: "link inserted, address selected",
    };
  }
  // Line formats work on every line the selection touches.
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  const after = source.indexOf("\n", Math.max(end, start));
  const lineEnd = after === -1 ? source.length : after;
  const lines = source.slice(lineStart, lineEnd).split("\n");
  let said = "";
  const changed = lines.map((line) => {
    if (format === "heading") {
      const h = HEADING.exec(line);
      const level = h ? (h[1] ?? "").length : 0;
      const body = h ? (h[2] ?? "") : line;
      const nextLevel = level === 3 ? 0 : level + 1;
      said = nextLevel === 0 ? "heading removed" : `heading ${nextLevel}`;
      return nextLevel === 0 ? body : `${"#".repeat(nextLevel)} ${body}`;
    }
    if (BULLET.test(line)) {
      said = "list removed";
      return line.replace(BULLET, "");
    }
    said = "list applied";
    return `- ${line}`;
  });
  const text = changed.join("\n");
  return {
    source: source.slice(0, lineStart) + text + source.slice(lineEnd),
    start: lineStart,
    end: lineStart + text.length,
    said,
  };
}

/* ----------------------------------------------------------------------- */
/*                             Small subcomponents                          */
/* ----------------------------------------------------------------------- */

function InlineText({ text }: { text: string }) {
  return (
    <>
      {tokenize(text).map((t, i) => {
        if (t.kind === "bold")
          return (
            <strong key={i} className="font-semibold text-foreground">
              {t.text}
            </strong>
          );
        if (t.kind === "italic") return <em key={i}>{t.text}</em>;
        if (t.kind === "code")
          return (
            <code
              key={i}
              className="rounded-1 bg-surface-2 px-1 py-px font-mono text-[0.85em] text-foreground"
            >
              {t.text}
            </code>
          );
        if (t.kind === "link")
          return (
            <a
              key={i}
              href={t.href}
              tabIndex={-1}
              title={t.href}
              onClick={(event) => event.preventDefault()}
              className="text-cobalt-bright underline decoration-[color-mix(in_oklab,var(--accent-bright)_45%,transparent)] underline-offset-2"
            >
              {t.text}
            </a>
          );
        return <React.Fragment key={i}>{t.text}</React.Fragment>;
      })}
    </>
  );
}

function BlockBody({ block }: { block: TwinBlock }) {
  if (block.kind === "heading") {
    const Tag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3";
    return (
      <Tag
        className={cn(
          "font-semibold tracking-tight text-foreground",
          block.level === 1 && "text-[1.65em] leading-[1.15]",
          block.level === 2 && "text-[1.25em] leading-[1.25]",
          block.level === 3 && "text-[1.05em] leading-[1.3]",
        )}
      >
        <InlineText text={block.text} />
      </Tag>
    );
  }
  if (block.kind === "list") {
    const Tag = block.ordered ? "ol" : "ul";
    return (
      <Tag
        className={cn(
          "flex flex-col gap-1 pl-5 leading-[1.55] text-ink-2 marker:text-ink-3",
          block.ordered ? "list-decimal" : "list-disc",
        )}
      >
        {(block.items ?? []).map((item, i) => (
          <li key={i}>
            <InlineText text={item} />
          </li>
        ))}
      </Tag>
    );
  }
  if (block.kind === "quote") {
    return (
      <blockquote className="border-l-2 border-hairline-strong pl-3 leading-[1.55] text-ink-2 italic">
        <InlineText text={block.text} />
      </blockquote>
    );
  }
  if (block.kind === "rule") {
    return <hr className="border-hairline-strong" />;
  }
  return (
    <p className="leading-[1.6] text-ink-2">
      <InlineText text={block.text} />
    </p>
  );
}

function TwinBlockView({
  ref,
  item,
  delay,
  motionSafe,
  nodeRef,
  onSettled,
}: {
  /** AnimatePresence's handle on the block, for popping it out on exit. */
  ref?: React.Ref<HTMLDivElement>;
  item: Keyed;
  /** Its place in the cascade when the blocks close up. */
  delay: number;
  motionSafe: boolean;
  nodeRef: (node: HTMLDivElement | null) => void;
  onSettled: () => void;
}) {
  return (
    <motion.div
      ref={(node) => {
        nodeRef(node);
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      data-block-id={item.id}
      layout={motionSafe ? "position" : false}
      initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        y: motionSafe ? -distances.nudge : 0,
        transition: exitFor(durations.base),
      }}
      transition={{
        layout: { ...springs.glide, delay },
        y: motionSafe ? springs.glide : { duration: 0 },
        opacity: { duration: durations.base, ease: easings.enter },
      }}
      onLayoutAnimationComplete={onSettled}
      className={cn("relative", item.block.kind === "rule" && "py-1")}
    >
      {/* Lights when the block's text changed and fades; keyed on the
          revision so a run of keystrokes keeps it lit. */}
      <motion.span
        key={item.rev}
        aria-hidden
        initial={{ opacity: item.rev > 0 ? 1 : 0 }}
        animate={{ opacity: 0 }}
        transition={{ duration: durations.page, ease: easings.exit }}
        className="pointer-events-none absolute -inset-x-2 -inset-y-1 rounded-2 bg-cobalt-wash"
      />
      <div className="relative">
        <BlockBody block={item.block} />
      </div>
    </motion.div>
  );
}

type SegmentItem<T extends string> = {
  id: T;
  label: string;
  icon: React.ReactNode;
};

function Segments<T extends string>({
  name,
  label,
  items,
  value,
  onChange,
  motionSafe,
  uid,
}: {
  name: string;
  label: string;
  items: SegmentItem<T>[];
  value: T;
  onChange: (id: T) => void;
  motionSafe: boolean;
  uid: string;
}) {
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const current = items.some((it) => it.id === value) ? value : items[0]?.id;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex shrink-0 items-center gap-px rounded-2 border border-hairline bg-surface-0 p-0.5"
    >
      {items.map((it, i) => {
        const checked = it.id === current;
        return (
          <button
            key={it.id}
            ref={(node) => {
              if (node) nodes.current.set(it.id, node);
              else nodes.current.delete(it.id);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={it.label}
            title={it.label}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(it.id)}
            onKeyDown={(event) => {
              let to = -1;
              if (event.key === "ArrowRight" || event.key === "ArrowDown")
                to = (i + 1) % items.length;
              else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
                to = (i - 1 + items.length) % items.length;
              else if (event.key === "Home") to = 0;
              else if (event.key === "End") to = items.length - 1;
              else return;
              event.preventDefault();
              const next = items[to];
              if (!next) return;
              onChange(next.id);
              nodes.current.get(next.id)?.focus();
            }}
            className={cn(
              "relative inline-flex size-6 items-center justify-center rounded-[4px] text-ink-3 transition-colors hover:text-foreground",
              checked && "text-foreground",
              FOCUS_RING,
            )}
          >
            {checked ? (
              <motion.span
                aria-hidden
                layoutId={motionSafe ? `${uid}-${name}` : undefined}
                transition={springs.snap}
                className="absolute inset-0 rounded-[4px] bg-surface-2 shadow-(--edge-highlight)"
              />
            ) : null}
            <span className="relative">{it.icon}</span>
          </button>
        );
      })}
    </div>
  );
}

function Skeleton({ lines, heading }: { lines: number; heading?: boolean }) {
  return (
    <div aria-hidden className="flex flex-col gap-2.5 p-3">
      {heading ? (
        <span className="mb-1 h-5 w-1/2 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
      ) : null}
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          className="h-3 rounded-1 bg-surface-2 motion-safe:animate-pulse"
          style={{
            width: `${55 + ((i * 29) % 40)}%`,
            animationDelay: `${i * 70}ms`,
          }}
        />
      ))}
    </div>
  );
}

const noopSubscribe = () => () => {};

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Tie = {
  d: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dim: boolean;
};

/**
 * A page of source beside its rendered twin. Type on the left and the twin
 * answers block by block: a block whose text changed lights with the accent
 * wash and fades, a new block rises into place on `springs.glide` while its
 * neighbours glide apart, and a removed one leaves on the exit ease as the
 * rest close up. The caret's block is banded in the editor and railed in the
 * twin, and a tie line crosses the gutter between the two; band, rail and tie
 * move together on `springs.snap` as the caret moves. A lockstep switch
 * scrolls the panes together, block for block.
 *
 * The device switch is a radio group: its frame resizes on `springs.glide`
 * and the twin reflows inside, with the width read out in the frame's bar.
 * The theme switch previews the twin in light or dark against the page.
 *
 * The formatting toolbar is one tab stop (arrows move; Enter applies bold,
 * italic, heading, list or link to the selection and returns to the editor,
 * as do Ctrl/Cmd+B, I and K). Alt+Up and Alt+Down jump between blocks in
 * both the editor and the twin, which is a document region. Every switch,
 * format and jump is announced; a change in the number of blocks is announced
 * once typing pauses. Under reduced motion nothing rises or travels: blocks
 * appear in place, the band and rail jump, and the frame resizes at once.
 */
export function TwinPreview({
  split = "side",
  device = "desktop",
  devices = defaultTwinDevices,
  theme = "match",
  lockstep = true,
  value,
  defaultValue = defaultTwinSource,
  onChange,
  onDeviceChange,
  onThemeChange,
  onLockstepChange,
  placeholder = "Start with a heading: # Title",
  status = "ready",
  onRetry,
  product = "Gaugeworks Docs",
  title = "Calibration rollout",
  label,
  height = 540,
  disabled = false,
  className,
}: TwinPreviewProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const twinHintId = `${uid}-twin-hint`;

  /* -------------------------------- state ------------------------------ */

  const [own, setOwn] = React.useState(defaultValue);
  const source = value ?? own;
  const ready = status === "ready";

  // Blocks keep their identity across edits; the doc is re-reconciled during
  // render whenever the source it was built from is no longer the source.
  const [doc, setDoc] = React.useState<Doc>(() => initialDoc(source));
  const live = doc.source === source ? doc : reconcile(doc, source);
  if (live !== doc) setDoc(live);
  const keyed = live.keyed;

  // The switches follow their props when those change, and the surface's
  // own presses in between.
  const [ownDevice, setOwnDevice] = React.useState(device);
  const [seenDevice, setSeenDevice] = React.useState(device);
  if (device !== seenDevice) {
    setSeenDevice(device);
    setOwnDevice(device);
  }
  const [ownTheme, setOwnTheme] = React.useState(theme);
  const [seenTheme, setSeenTheme] = React.useState(theme);
  if (theme !== seenTheme) {
    setSeenTheme(theme);
    setOwnTheme(theme);
  }
  const [ownLock, setOwnLock] = React.useState(lockstep);
  const [seenLock, setSeenLock] = React.useState(lockstep);
  if (lockstep !== seenLock) {
    setSeenLock(lockstep);
    setOwnLock(lockstep);
  }

  const [caret, setCaret] = React.useState(0);
  const [paneInner, setPaneInner] = React.useState<number | null>(null);
  const [activeTool, setActiveTool] = React.useState<TwinFormat>("bold");
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration, so the count never fades in
  // on the page's first paint.
  const mounted = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const currentDevice =
    devices.find((d) => d.id === ownDevice) ?? devices[0] ?? null;
  const frameWidth =
    paneInner === null
      ? null
      : Math.max(120, Math.min(currentDevice?.width ?? paneInner, paneInner));
  const empty = keyed.length === 0;

  let activeIndex = -1;
  for (let i = 0; i < keyed.length; i += 1) {
    if ((keyed[i]?.block.start ?? 0) <= caret) activeIndex = i;
  }
  if (activeIndex === -1 && keyed.length > 0) activeIndex = 0;
  const active = keyed[activeIndex] ?? null;
  const activeId = active?.id ?? null;
  const blockCount = keyed.length;

  /* -------------------------------- refs ------------------------------- */

  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const editorRef = React.useRef<HTMLTextAreaElement | null>(null);
  const mirrorRef = React.useRef<HTMLDivElement | null>(null);
  const gutterRef = React.useRef<HTMLDivElement | null>(null);
  const [viewEl, setViewEl] = React.useState<HTMLDivElement | null>(null);
  const viewRef = React.useRef<HTMLDivElement | null>(null);
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const tiePath = React.useRef<SVGPathElement | null>(null);
  const tieGroup = React.useRef<SVGGElement | null>(null);
  const tieFrom = React.useRef<SVGCircleElement | null>(null);
  const tieTo = React.useRef<SVGCircleElement | null>(null);
  const mirrorNodes = React.useRef(new Map<string, HTMLElement>());
  const twinNodes = React.useRef(new Map<string, HTMLElement>());
  const toolNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const pendingSel = React.useRef<{ start: number; end: number } | null>(null);
  const frameId = React.useRef<number | null>(null);
  const quiet = React.useRef<number | null>(null);
  const lockUntil = React.useRef<{ to: "editor" | "twin"; at: number } | null>(
    null,
  );
  const primed = React.useRef(false);
  const latest = React.useRef({
    activeId,
    motionSafe,
    lock: ownLock,
    keyed,
  });

  /* ---------------------------- motion values -------------------------- */

  const bandY = useSpring(0, SNAP);
  const bandH = useSpring(0, SNAP);
  const bandOn = useMotionValue(0);
  const railY = useSpring(0, SNAP);
  const railH = useSpring(0, SNAP);
  const railOn = useMotionValue(0);
  const edScroll = useMotionValue(0);
  const edTop = useMotionValue(0);
  const edBottom = useMotionValue(0);
  const edRight = useMotionValue(0);
  const twLeft = useMotionValue(0);
  const twTop = useMotionValue(0);
  const twBottom = useMotionValue(0);
  const frameTop = useMotionValue(0);
  const tieOn = useMotionValue(0);

  // Every value is read before any branch: the transform learns what it
  // depends on from its first run.
  const tie = useTransform((): Tie => {
    const on = tieOn.get();
    const top1 = edTop.get();
    const bottom1 = edBottom.get();
    const top2 = twTop.get();
    const bottom2 = twBottom.get();
    const rawY1 = top1 + bandY.get() + bandH.get() / 2 - edScroll.get();
    const rawY2 = frameTop.get() + railY.get() + railH.get() / 2;
    const x1 = edRight.get();
    const x2 = twLeft.get();
    if (on === 0) return { d: "", x1: 0, y1: 0, x2: 0, y2: 0, dim: false };
    const y1 = clamp(rawY1, top1 + 8, bottom1 - 8);
    const y2 = clamp(rawY2, top2 + 8, bottom2 - 8);
    const dx = Math.max(10, (x2 - x1) * 0.5);
    return {
      d: `M ${r1(x1)} ${r1(y1)} C ${r1(x1 + dx)} ${r1(y1)}, ${r1(x2 - dx)} ${r1(y2)}, ${r1(x2)} ${r1(y2)}`,
      x1: r1(x1),
      y1: r1(y1),
      x2: r1(x2),
      y2: r1(y2),
      dim: y1 !== rawY1 || y2 !== rawY2,
    };
  });

  useMotionValueEvent(tie, "change", (t) => {
    const group = tieGroup.current;
    if (group) group.style.opacity = t.d ? (t.dim ? "0.35" : "1") : "0";
    tiePath.current?.setAttribute("d", t.d);
    const a = tieFrom.current;
    const b = tieTo.current;
    if (a) {
      a.setAttribute("cx", String(t.x1));
      a.setAttribute("cy", String(t.y1));
    }
    if (b) {
      b.setAttribute("cx", String(t.x2));
      b.setAttribute("cy", String(t.y2));
    }
  });

  /* ------------------------------ measuring ---------------------------- */

  React.useLayoutEffect(() => {
    latest.current = { activeId, motionSafe, lock: ownLock, keyed };
  });

  /** Reads the DOM once and moves the band, the rail and the tie. */
  const sync = React.useCallback(() => {
    const body = bodyRef.current;
    const editor = editorRef.current;
    const mirror = mirrorRef.current;
    const view = viewRef.current;
    const frame = frameRef.current;
    if (!body || !editor || !mirror || !view || !frame) return;
    const { activeId: id, motionSafe: safe } = latest.current;
    const move = (mv: MotionValue<number>, v: number) => {
      if (safe && primed.current) mv.set(v);
      else mv.jump(v);
    };
    mirror.style.width = `${editor.clientWidth}px`;
    mirror.style.transform = `translateY(${-editor.scrollTop}px)`;
    edScroll.jump(editor.scrollTop);

    const bodyRect = body.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    const viewRect = view.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();

    const bandNode = id ? mirrorNodes.current.get(id) : undefined;
    if (bandNode) {
      const r = bandNode.getBoundingClientRect();
      move(bandY, r.top - mirrorRect.top - 2);
      move(bandH, r.height + 4);
      bandOn.jump(1);
    } else {
      bandOn.jump(0);
    }
    const railNode = id ? twinNodes.current.get(id) : undefined;
    if (railNode) {
      const r = railNode.getBoundingClientRect();
      move(railY, r.top - frameRect.top);
      move(railH, r.height);
      railOn.jump(1);
    } else {
      railOn.jump(0);
    }

    edTop.jump(editorRect.top - bodyRect.top);
    edBottom.jump(editorRect.bottom - bodyRect.top);
    edRight.jump(editorRect.right - bodyRect.left);
    twLeft.jump(frameRect.left - bodyRect.left);
    twTop.jump(viewRect.top - bodyRect.top);
    twBottom.jump(viewRect.bottom - bodyRect.top);
    frameTop.jump(frameRect.top - bodyRect.top);
    // Beside the twin the gutter is a tall strip; stacked, a wide hairline.
    const gutter = gutterRef.current;
    const beside = !!gutter && gutter.offsetWidth < gutter.offsetHeight;
    tieOn.jump(beside && bandNode && railNode ? 1 : 0);
    primed.current = true;
  }, [
    bandH,
    bandOn,
    bandY,
    edBottom,
    edRight,
    edScroll,
    edTop,
    frameTop,
    railH,
    railOn,
    railY,
    tieOn,
    twBottom,
    twLeft,
    twTop,
  ]);

  const setView = React.useCallback((node: HTMLDivElement | null) => {
    viewRef.current = node;
    setViewEl(node);
  }, []);

  /** Coalesces syncs into one per frame; nothing runs once it has settled. */
  const scheduleSync = React.useCallback(() => {
    if (frameId.current !== null || typeof window === "undefined") return;
    frameId.current = window.requestAnimationFrame(() => {
      frameId.current = null;
      sync();
    });
  }, [sync]);

  React.useLayoutEffect(() => {
    if (!ready) return;
    sync();
  }, [ready, sync, live, activeId, split, frameWidth, ownTheme]);

  React.useEffect(() => {
    const body = bodyRef.current;
    if (!body || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => scheduleSync());
    ro.observe(body);
    const editor = editorRef.current;
    if (editor) ro.observe(editor);
    return () => ro.disconnect();
  }, [scheduleSync, ready]);

  React.useEffect(() => {
    if (!viewEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const inner = Math.floor(viewEl.clientWidth - FRAME_PAD * 2);
      setPaneInner((prev) => (prev === inner ? prev : inner));
    });
    ro.observe(viewEl);
    return () => ro.disconnect();
  }, [viewEl]);

  React.useEffect(
    () => () => {
      if (frameId.current !== null)
        window.cancelAnimationFrame(frameId.current);
      if (quiet.current !== null) window.clearTimeout(quiet.current);
    },
    [],
  );

  // A format moved the selection; put it back once the new source is in.
  React.useLayoutEffect(() => {
    const sel = pendingSel.current;
    const editor = editorRef.current;
    if (!sel || !editor) return;
    pendingSel.current = null;
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(sel.start, sel.end);
  }, [source]);

  // The number of blocks is announced once typing pauses, not per keystroke.
  const seenCount = React.useRef(blockCount);
  React.useEffect(() => {
    if (seenCount.current === blockCount) return;
    const delta = blockCount - seenCount.current;
    seenCount.current = blockCount;
    if (quiet.current !== null) window.clearTimeout(quiet.current);
    quiet.current = window.setTimeout(() => {
      quiet.current = null;
      setAnnouncement(
        `${blockCount} ${blockCount === 1 ? "block" : "blocks"}: ${Math.abs(delta)} ${delta > 0 ? "added" : "removed"}.`,
      );
    }, QUIET_MS);
  }, [blockCount]);

  /* ------------------------------ lockstep ----------------------------- */

  /** Scrolls the other pane so the block at this one's top sits at the same place. */
  const follow = (from: "editor" | "twin") => {
    const editor = editorRef.current;
    const mirror = mirrorRef.current;
    const view = viewRef.current;
    if (!editor || !mirror || !view || !latest.current.lock) return;
    const src = from === "editor" ? editor : view;
    const dst = from === "editor" ? view : editor;
    const to = from === "editor" ? "twin" : "editor";
    const set = (y: number) => {
      const max = Math.max(0, dst.scrollHeight - dst.clientHeight);
      const next = clamp(Math.round(y), 0, max);
      if (Math.abs(dst.scrollTop - next) < 1) return;
      lockUntil.current = { to, at: performance.now() + 120 };
      dst.scrollTop = next;
    };
    const srcScroll = src.scrollTop;
    const srcMax = src.scrollHeight - src.clientHeight;
    if (srcScroll <= 0) return set(0);
    if (srcScroll >= srcMax - 1) return set(dst.scrollHeight);
    const mirrorRect = mirror.getBoundingClientRect();
    const viewRect = view.getBoundingClientRect();
    const edY = (el: HTMLElement) =>
      el.getBoundingClientRect().top - mirrorRect.top;
    const twY = (el: HTMLElement) =>
      el.getBoundingClientRect().top - viewRect.top + view.scrollTop;
    for (const k of latest.current.keyed) {
      const a = (from === "editor" ? mirrorNodes : twinNodes).current.get(k.id);
      const b = (from === "editor" ? twinNodes : mirrorNodes).current.get(k.id);
      if (!a || !b) continue;
      const aTop = from === "editor" ? edY(a) : twY(a);
      const aH = Math.max(1, a.getBoundingClientRect().height);
      if (aTop + aH <= srcScroll) continue;
      const bTop = from === "editor" ? twY(b) : edY(b);
      const bH = Math.max(1, b.getBoundingClientRect().height);
      const f = clamp((srcScroll - aTop) / aH, 0, 1);
      set(bTop + f * bH - (aTop + f * aH - srcScroll));
      return;
    }
    set(
      (srcScroll / Math.max(1, srcMax)) * (dst.scrollHeight - dst.clientHeight),
    );
  };

  const onPaneScroll = (me: "editor" | "twin") => {
    const lock = lockUntil.current;
    if (lock && lock.to === me && performance.now() < lock.at) {
      lockUntil.current = null;
    } else {
      follow(me);
    }
    scheduleSync();
  };

  /* ------------------------------- changes ----------------------------- */

  const commit = (next: string, cause: TwinCause) => {
    if (next === source) return;
    if (value === undefined) setOwn(next);
    onChange?.(next, cause);
  };

  const format = (kind: TwinFormat) => {
    if (disabled || !ready) return;
    const editor = editorRef.current;
    if (!editor) return;
    const result = applyFormat(
      kind,
      source,
      editor.selectionStart,
      editor.selectionEnd,
    );
    setCaret(result.start);
    if (result.source === source) {
      // Nothing changed in the text; the selection still moves.
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(result.start, result.end);
    } else {
      pendingSel.current = { start: result.start, end: result.end };
      commit(result.source, kind);
    }
    setAnnouncement(
      `${result.said.charAt(0).toUpperCase()}${result.said.slice(1)}.`,
    );
  };

  const revealInEditor = (id: string) => {
    const editor = editorRef.current;
    const mirror = mirrorRef.current;
    const node = mirrorNodes.current.get(id);
    if (!editor || !mirror || !node) return;
    const top =
      node.getBoundingClientRect().top - mirror.getBoundingClientRect().top;
    const h = node.getBoundingClientRect().height;
    if (top < editor.scrollTop + EDITOR_PAD)
      editor.scrollTop = top - EDITOR_PAD;
    else if (top + h > editor.scrollTop + editor.clientHeight - EDITOR_PAD)
      editor.scrollTop = top + h - editor.clientHeight + EDITOR_PAD;
  };

  const revealInTwin = (id: string) => {
    const view = viewRef.current;
    const node = twinNodes.current.get(id);
    if (!view || !node) return;
    const top =
      node.getBoundingClientRect().top -
      view.getBoundingClientRect().top +
      view.scrollTop;
    const h = node.getBoundingClientRect().height;
    if (top < view.scrollTop + FRAME_PAD) view.scrollTop = top - FRAME_PAD;
    else if (top + h > view.scrollTop + view.clientHeight - FRAME_PAD)
      view.scrollTop = top + h - view.clientHeight + FRAME_PAD;
  };

  /** Alt+arrows: the caret jumps to the next block's start, in both panes. */
  const jump = (dir: 1 | -1, from: "editor" | "twin") => {
    if (keyed.length === 0) return;
    const to = clamp(activeIndex + dir, 0, keyed.length - 1);
    const next = keyed[to];
    if (!next) return;
    setCaret(next.block.start);
    const editor = editorRef.current;
    if (editor && editor.selectionStart !== next.block.start) {
      editor.setSelectionRange(next.block.start, next.block.start);
    }
    if (from === "editor") revealInEditor(next.id);
    else revealInTwin(next.id);
    setAnnouncement(
      `Block ${to + 1} of ${keyed.length}: ${describe(next.block)}.`,
    );
  };

  const chooseDevice = (id: string) => {
    const next = devices.find((d) => d.id === id);
    if (!next) return;
    setOwnDevice(id);
    onDeviceChange?.(next);
    const px = next.width ?? paneInner;
    setAnnouncement(
      `${next.label}${px ? `, ${Math.min(px, paneInner ?? px)} pixels wide` : ""}.`,
    );
  };

  const chooseTheme = (next: TwinTheme) => {
    setOwnTheme(next);
    onThemeChange?.(next);
    setAnnouncement(
      next === "match"
        ? "Twin matches the page's theme."
        : `Twin previews ${next}.`,
    );
  };

  const toggleLock = () => {
    const next = !ownLock;
    setOwnLock(next);
    onLockstepChange?.(next);
    setAnnouncement(next ? "Panes scroll together." : "Panes scroll apart.");
    if (next) follow("editor");
  };

  const readCaret = (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCaret(event.currentTarget.selectionStart);
  };

  const onEditorKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.altKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      jump(event.key === "ArrowDown" ? 1 : -1, "editor");
      return;
    }
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    const kind: TwinFormat | null =
      key === "b"
        ? "bold"
        : key === "i"
          ? "italic"
          : key === "k"
            ? "link"
            : null;
    if (!kind) return;
    event.preventDefault();
    format(kind);
  };

  const onTwinKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      event.altKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      jump(event.key === "ArrowDown" ? 1 : -1, "twin");
    }
  };

  /* ------------------------------- toolbar ----------------------------- */

  const tools: { id: TwinFormat; label: string; icon: React.ReactNode }[] = [
    {
      id: "bold",
      label: "Bold",
      icon: <Bold aria-hidden className="size-3.5" />,
    },
    {
      id: "italic",
      label: "Italic",
      icon: <Italic aria-hidden className="size-3.5" />,
    },
    {
      id: "heading",
      label: "Heading",
      icon: <Heading aria-hidden className="size-3.5" />,
    },
    {
      id: "list",
      label: "List",
      icon: <List aria-hidden className="size-3.5" />,
    },
    {
      id: "link",
      label: "Link",
      icon: <LinkIcon aria-hidden className="size-3.5" />,
    },
  ];
  const inert = disabled || !ready;

  const onToolKey = (event: React.KeyboardEvent, i: number) => {
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      to = (i + 1) % tools.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      to = (i - 1 + tools.length) % tools.length;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = tools.length - 1;
    else return;
    event.preventDefault();
    const next = tools[to];
    if (!next) return;
    setActiveTool(next.id);
    toolNodes.current.get(next.id)?.focus();
  };

  /* -------------------------------- render ----------------------------- */

  const wordCount = countTwinWords(source);
  const themeClass =
    ownTheme === "dark" ? "dark" : ownTheme === "light" ? "light" : undefined;
  const step = cascade(Math.min(keyed.length, 10));

  // The mirror carries the whole source so it wraps exactly as the textarea
  // does, with a span around each block to measure.
  const mirrorPieces: React.ReactNode[] = [];
  let pos = 0;
  for (const k of keyed) {
    if (k.block.start > pos)
      mirrorPieces.push(source.slice(pos, k.block.start));
    mirrorPieces.push(
      <span
        key={k.id}
        ref={(node) => {
          if (node) mirrorNodes.current.set(k.id, node);
          else mirrorNodes.current.delete(k.id);
        }}
      >
        {source.slice(k.block.start, k.block.end)}
      </span>,
    );
    pos = k.block.end;
  }
  if (pos < source.length) mirrorPieces.push(source.slice(pos));
  mirrorPieces.push(" ");

  const editorPane = (
    <section
      aria-label="Editor"
      className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col"
    >
      <div
        role="toolbar"
        aria-label="Formatting"
        aria-controls={`${uid}-editor`}
        className="flex h-9 shrink-0 items-center gap-0.5 border-b border-hairline px-2"
      >
        {tools.map((tool, i) => (
          <motion.button
            key={tool.id}
            ref={(node) => {
              if (node) toolNodes.current.set(tool.id, node);
              else toolNodes.current.delete(tool.id);
            }}
            type="button"
            tabIndex={activeTool === tool.id ? 0 : -1}
            aria-label={tool.label}
            title={`${tool.label}${tool.id === "bold" ? " (Ctrl+B)" : tool.id === "italic" ? " (Ctrl+I)" : tool.id === "link" ? " (Ctrl+K)" : ""}`}
            aria-disabled={inert || undefined}
            onFocus={() => setActiveTool(tool.id)}
            onKeyDown={(event) => onToolKey(event, i)}
            onPointerDown={(event) => {
              // Keep the selection in the editor: the press must not blur it.
              event.preventDefault();
            }}
            onClick={() => format(tool.id)}
            whileTap={motionSafe && !inert ? { scale: 0.92 } : undefined}
            transition={springs.flick}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-2 text-ink-2 transition-colors",
              inert
                ? "cursor-not-allowed text-ink-3"
                : "hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            {tool.icon}
          </motion.button>
        ))}
        <span className="ml-auto hidden font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[48rem]:inline">
          markdown
        </span>
      </div>
      <div className="relative min-h-0 flex-1 bg-surface-0">
        {status === "loading" ? (
          <Skeleton lines={9} />
        ) : (
          <>
            <div
              ref={mirrorRef}
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 font-mono text-[13px] leading-[1.6] [overflow-wrap:break-word] break-words whitespace-pre-wrap text-transparent"
              style={{ padding: EDITOR_PAD }}
            >
              <motion.div
                aria-hidden
                className="absolute inset-x-1.5 rounded-2 bg-cobalt-wash"
                style={{ y: bandY, height: bandH, opacity: bandOn }}
              />
              <div className="relative">{mirrorPieces}</div>
            </div>
            <textarea
              ref={editorRef}
              id={`${uid}-editor`}
              value={source}
              readOnly={disabled}
              aria-disabled={disabled || undefined}
              aria-label={`${title}, source`}
              aria-describedby={hintId}
              placeholder={placeholder}
              spellCheck={false}
              onChange={(event) => {
                commit(event.target.value, "typing");
                readCaret(event);
              }}
              onSelect={readCaret}
              onKeyUp={readCaret}
              onClick={readCaret}
              onFocus={readCaret}
              onKeyDown={onEditorKey}
              onScroll={() => onPaneScroll("editor")}
              className={cn(
                "absolute inset-0 block h-full w-full resize-none bg-transparent font-mono text-[13px] leading-[1.6] [overflow-wrap:break-word] break-words whitespace-pre-wrap text-foreground caret-cobalt-bright outline-none placeholder:text-ink-3",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                disabled && "cursor-default text-ink-2",
              )}
              style={{ padding: EDITOR_PAD }}
            />
          </>
        )}
      </div>
    </section>
  );

  const twinPane = (
    <section
      aria-label="Twin"
      className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col"
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-hairline px-2">
        <Segments
          name="device"
          label="Device"
          items={devices.map((d) => ({
            id: d.id,
            label: d.label,
            icon: DEVICE_ICONS[d.kind],
          }))}
          value={ownDevice}
          onChange={chooseDevice}
          motionSafe={motionSafe}
          uid={uid}
        />
        <Segments
          name="theme"
          label="Theme"
          items={THEMES}
          value={ownTheme}
          onChange={chooseTheme}
          motionSafe={motionSafe}
          uid={uid}
        />
        <button
          type="button"
          role="switch"
          aria-checked={ownLock}
          aria-label="Scroll the panes together"
          title="Scroll the panes together"
          onClick={toggleLock}
          className={cn(
            "ml-auto inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-1.5 transition-colors hover:bg-surface-2",
            ownLock ? "text-foreground" : "text-ink-3",
            FOCUS_RING,
          )}
        >
          {ownLock ? (
            <Link2 aria-hidden className="size-3.5" />
          ) : (
            <Link2Off aria-hidden className="size-3.5" />
          )}
          <span
            aria-hidden
            className={cn(
              "relative h-3.5 w-6 rounded-full border transition-colors",
              ownLock
                ? "border-transparent bg-primary"
                : "border-hairline-strong bg-surface-2",
            )}
          >
            <motion.span
              initial={false}
              animate={{ x: ownLock ? 10 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
              className={cn(
                "absolute top-px left-px size-[10px] rounded-full",
                ownLock ? "bg-primary-foreground" : "bg-ink-3",
              )}
            />
          </span>
        </button>
      </div>
      <div
        ref={setView}
        role="document"
        tabIndex={status === "loading" ? -1 : 0}
        aria-label={`${title}, preview`}
        aria-describedby={twinHintId}
        onKeyDown={onTwinKey}
        onScroll={() => onPaneScroll("twin")}
        className={cn(
          "relative min-h-0 flex-1 [scrollbar-gutter:stable] overflow-x-hidden overflow-y-auto overscroll-contain bg-surface-0",
          "bg-[radial-gradient(color-mix(in_oklab,var(--ink-3)_28%,transparent)_1px,transparent_1px)] bg-[size:14px_14px]",
          "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
        style={{ padding: FRAME_PAD }}
      >
        {status === "loading" ? (
          <div className="mx-auto rounded-3 border border-hairline-strong bg-card">
            <Skeleton lines={7} heading />
          </div>
        ) : (
          <motion.div
            ref={frameRef}
            initial={false}
            animate={{ width: frameWidth ?? "100%" }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
            onUpdate={scheduleSync}
            className={cn(
              "@container relative mx-auto flex max-w-full flex-col overflow-hidden rounded-3 border border-hairline-strong bg-background text-foreground shadow-[0_12px_30px_-18px_color-mix(in_oklab,black_55%,transparent)]",
              themeClass,
            )}
          >
            <div
              aria-hidden
              className="flex h-6 shrink-0 items-center gap-1.5 border-b border-hairline bg-surface-1 px-2.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            >
              <span className="flex gap-1">
                <span className="size-1.5 rounded-full bg-hairline-strong" />
                <span className="size-1.5 rounded-full bg-hairline-strong" />
                <span className="size-1.5 rounded-full bg-hairline-strong" />
              </span>
              <span className="truncate">
                {currentDevice?.label ?? "Frame"}
                {frameWidth !== null ? ` · ${Math.round(frameWidth)} px` : ""}
              </span>
            </div>
            <div className="relative px-6 py-5 text-[15px] @min-[36rem]:px-8 @min-[36rem]:py-7 @min-[36rem]:text-[16px]">
              <motion.div
                aria-hidden
                className="absolute left-2.5 w-0.5 rounded-full bg-cobalt-bright @min-[36rem]:left-3.5"
                style={{ y: railY, height: railH, opacity: railOn }}
              />
              {empty ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <FileText aria-hidden className="size-5 text-ink-3" />
                  <p className="text-sm text-ink-2">A blank page.</p>
                  <p className="max-w-[26ch] text-xs text-ink-3">
                    Type on the left. # starts a heading, - a list, &gt; a
                    quote.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3.5">
                  <AnimatePresence initial={false} mode="popLayout">
                    {keyed.map((item, i) => (
                      <TwinBlockView
                        key={item.id}
                        item={item}
                        delay={motionSafe ? Math.min(i, 10) * step * 0.25 : 0}
                        motionSafe={motionSafe}
                        nodeRef={(node) => {
                          if (node) twinNodes.current.set(item.id, node);
                          else twinNodes.current.delete(item.id);
                        }}
                        onSettled={scheduleSync}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ height }}
    >
      <p id={hintId} className="sr-only">
        Markdown source. Alt and Up or Down jump between blocks. Ctrl or Command
        with B, I or K formats bold, italic or a link.
      </p>
      <p id={twinHintId} className="sr-only">
        The rendered page. Alt and Up or Down jump between blocks.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="hidden shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[30rem]:inline">
            {product}
          </span>
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
        </div>
        {ready ? (
          <p className="flex shrink-0 items-baseline gap-1 font-mono text-[11px] text-ink-3 tabular-nums">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={blockCount}
                initial={mounted ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast, ease: easings.enter }}
                className="text-foreground"
              >
                {blockCount}
              </motion.span>
            </AnimatePresence>
            <span>{blockCount === 1 ? "block" : "blocks"}</span>
            <span aria-hidden className="hidden @min-[24rem]:inline">
              · {wordCount} words
            </span>
          </p>
        ) : null}
      </header>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The document didn&apos;t load.
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
        <div
          ref={bodyRef}
          className={cn(
            "relative flex min-h-0 flex-1 flex-col",
            split === "side" && "@min-[40rem]:flex-row",
          )}
        >
          {editorPane}
          {/* The gutter only exists beside the twin; its width says so. */}
          <div
            ref={gutterRef}
            aria-hidden
            className={cn(
              "shrink-0 border-hairline",
              split === "side"
                ? "h-px w-full border-t @min-[40rem]:h-auto @min-[40rem]:w-5 @min-[40rem]:border-t-0 @min-[40rem]:border-l"
                : "h-px w-full border-t",
            )}
          />
          {twinPane}
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible"
          >
            {/* The group's opacity and the geometry are written from the
                motion values, never from a render. */}
            <g ref={tieGroup} style={{ opacity: 0 }}>
              <motion.path
                key={activeId ?? "none"}
                ref={tiePath}
                fill="none"
                stroke="var(--accent-bright)"
                strokeWidth={1.5}
                strokeLinecap="round"
                initial={motionSafe ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              />
              <circle ref={tieFrom} r={2.5} fill="var(--accent-bright)" />
              <circle ref={tieTo} r={2.5} fill="var(--accent-bright)" />
            </g>
          </svg>
          {status === "loading" ? (
            <p className="sr-only">Loading the document.</p>
          ) : null}
        </div>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
