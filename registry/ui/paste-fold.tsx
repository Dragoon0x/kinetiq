"use client";

import * as React from "react";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  ArrowUp,
  CircleAlert,
  Code,
  FileText,
  LoaderCircle,
  Mail,
  Scissors,
  ScrollText,
  Table2,
  X,
  type LucideIcon,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type PasteFoldIcon = "log" | "table" | "email" | "code" | "text";

export type PasteBlock = {
  id: string;
  /** The rule that recognised it: "log", "table", "email", "code", "text". */
  kind: string;
  /** "Log", "Table"… — what the chip says. */
  label: string;
  /** The pasted text, as kept (a trim replaces it with the marked lines). */
  text: string;
  icon?: PasteFoldIcon;
};

export type PasteFoldPart =
  { type: "text"; text: string } | { type: "block"; block: PasteBlock };

export type PasteFoldRule = {
  kind: string;
  label: string;
  icon?: PasteFoldIcon;
  /** Does this paste look like this kind? Rules are tried in order. */
  test: (text: string, lines: string[]) => boolean;
  /** A one-press mark in the trim view, e.g. "Errors only" for logs. */
  keep?: { label: string; test: (line: string) => boolean };
};

export type PasteFoldHandle = {
  /** Pastes text at the caret (or the end), exactly as a real paste would. */
  paste: (text: string) => void;
  /** Puts the caret at the end of the message. */
  focus: () => void;
};

export type PasteFoldChipStyle = "tab" | "card" | "pill";

export type PasteFoldProps = {
  /** Imperative handle: `paste(text)` and `focus()`. */
  ref?: React.Ref<PasteFoldHandle>;
  /** Controlled message: text runs and folded blocks, in order. */
  value?: PasteFoldPart[];
  /** Initial message when uncontrolled. @default defaultPasteFoldValue */
  defaultValue?: PasteFoldPart[];
  /** Fires with the whole message after every edit, fold, trim or removal. */
  onValueChange?: (parts: PasteFoldPart[]) => void;
  /** How pastes are recognised, tried in order; anything else folds as Text. @default defaultPasteRules */
  rules?: PasteFoldRule[];
  /** Pastes with at least this many lines fold into a block. @default 8 */
  foldThreshold?: number;
  /** Pastes with at least this many characters fold too, whatever their lines. @default 1200 */
  foldChars?: number;
  /** A tab with a kind strip, a two-line card, or a compact pill. @default "tab" */
  chipStyle?: PasteFoldChipStyle;
  /** Chips, selection, meter and Send — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The most characters a message may carry, blocks included. @default 4000 */
  limit?: number;
  /** A paste was folded into a block. */
  onPasteDetected?: (block: PasteBlock) => void;
  /** A block was opened to peek inside. */
  onExpand?: (block: PasteBlock) => void;
  /** A block was trimmed to the marked lines (indexes into its previous lines). */
  onTrim?: (block: PasteBlock, kept: number[]) => void;
  /** Enter or Send: the parts, and the message as plain text with blocks fenced. */
  onSubmit?: (parts: PasteFoldPart[], text: string) => void;
  /** Placeholder for an empty message. @default "Describe the problem, or paste the log…" */
  placeholder?: string;
  /** The message's accessible name. @default "Message" */
  label?: string;
  /** An answer is being written: Send holds. @default false */
  busy?: boolean;
  /** Nothing can be typed, pasted or sent. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const LOG_LINE =
  /^\s*(\[?\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}|\[?\d{2}:\d{2}:\d{2}|(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\b|at\s+\S)/;
const ERRORISH = /\b(ERROR|FATAL|WARN|WARNING|Exception|failed|refused)\b/;

const share = (lines: string[], test: (l: string) => boolean) =>
  lines.length ? lines.filter(test).length / lines.length : 0;

const consistent = (lines: string[], sep: string | RegExp) => {
  const counts = lines
    .filter((l) => l.trim())
    .map((l) => l.split(sep).length - 1);
  const first = counts[0] ?? 0;
  return (
    first > 0 && share(counts.map(String), (c) => Number(c) === first) >= 0.7
  );
};

export const defaultPasteRules: PasteFoldRule[] = [
  {
    kind: "log",
    label: "Log",
    icon: "log",
    test: (_t, lines) => share(lines, (l) => LOG_LINE.test(l)) >= 0.4,
    keep: { label: "Errors only", test: (l) => ERRORISH.test(l) },
  },
  {
    kind: "table",
    label: "Table",
    icon: "table",
    test: (_t, lines) =>
      consistent(lines, "\t") ||
      share(lines, (l) => /^\s*\|.*\|\s*$/.test(l)) >= 0.6 ||
      (consistent(lines, ",") &&
        share(lines, (l) => (l.match(/,/g)?.length ?? 0) >= 2) >= 0.7),
  },
  {
    kind: "email",
    label: "Email",
    icon: "email",
    test: (t) =>
      /^(from|to|subject|date|cc):/im.test(t) ||
      (/^(hi|hello|dear)\b/im.test(t) &&
        /\b(thanks|regards|cheers|best)\b/i.test(t)),
  },
  {
    kind: "code",
    label: "Code",
    icon: "code",
    test: (t, lines) =>
      share(lines, (l) => /[;{}]\s*$/.test(l)) >= 0.3 ||
      /^\s*(function|const|let|import|export|def|class|return)\b/m.test(t),
  },
];

/** The Gaugeworks import service's overnight log: 48 lines, one real error. */
export const gaugeworksLog = [
  "2026-10-14 02:00:00 INFO  import  run 4412 started, source=gauge-archive",
  "2026-10-14 02:00:01 INFO  import  reading manifest gauges-2026-10-13.json",
  "2026-10-14 02:00:01 INFO  import  manifest ok: 214 gauges, 3 regions",
  "2026-10-14 02:00:02 DEBUG fetch   opening pool, size=8, timeout=30s",
  "2026-10-14 02:00:03 INFO  fetch   region north: 71 gauges queued",
  "2026-10-14 02:00:03 INFO  fetch   region south: 88 gauges queued",
  "2026-10-14 02:00:03 INFO  fetch   region coast: 55 gauges queued",
  "2026-10-14 02:00:09 INFO  fetch   north 1-20 ok (6.1s)",
  "2026-10-14 02:00:15 INFO  fetch   north 21-40 ok (5.8s)",
  "2026-10-14 02:00:21 INFO  fetch   north 41-60 ok (6.0s)",
  "2026-10-14 02:00:25 INFO  fetch   north 61-71 ok (3.4s)",
  "2026-10-14 02:00:31 INFO  fetch   south 1-20 ok (6.3s)",
  "2026-10-14 02:00:38 INFO  fetch   south 21-40 ok (6.6s)",
  "2026-10-14 02:00:44 INFO  fetch   south 41-60 ok (6.2s)",
  "2026-10-14 02:00:52 WARN  fetch   south 61-80 slow (8.4s), retrying 2",
  "2026-10-14 02:01:04 INFO  fetch   south 61-80 ok after retry (11.9s)",
  "2026-10-14 02:01:08 INFO  fetch   south 81-88 ok (3.9s)",
  "2026-10-14 02:01:14 INFO  fetch   coast 1-20 ok (6.4s)",
  "2026-10-14 02:01:21 INFO  fetch   coast 21-40 ok (6.8s)",
  "2026-10-14 02:01:51 ERROR fetch   coast 41-55 timed out after 30s",
  "2026-10-14 02:01:51 ERROR fetch   GaugeArchiveTimeout: read of /coast/41-55 exceeded 30000ms",
  "    at ArchiveClient.read (archive/client.ts:118)",
  "    at FetchPool.run (fetch/pool.ts:64)",
  "    at Import.region (import/region.ts:41)",
  "2026-10-14 02:01:52 WARN  fetch   coast 41-55 retry 1 of 3",
  "2026-10-14 02:02:22 ERROR fetch   coast 41-55 timed out after 30s",
  "2026-10-14 02:02:23 WARN  fetch   coast 41-55 retry 2 of 3",
  "2026-10-14 02:02:53 ERROR fetch   coast 41-55 timed out after 30s",
  "2026-10-14 02:02:54 WARN  fetch   coast 41-55 retry 3 of 3",
  "2026-10-14 02:03:24 ERROR fetch   coast 41-55 timed out after 30s",
  "2026-10-14 02:03:24 ERROR import  region coast incomplete: 15 gauges missing",
  "2026-10-14 02:03:25 INFO  merge   merging 199 of 214 gauges",
  "2026-10-14 02:03:31 INFO  merge   north ok, 71 series",
  "2026-10-14 02:03:38 INFO  merge   south ok, 88 series",
  "2026-10-14 02:03:41 INFO  merge   coast partial, 40 series",
  "2026-10-14 02:03:42 WARN  merge   coast gauges 41-55 carried from 2026-10-12",
  "2026-10-14 02:03:43 INFO  check   range checks on 199 series",
  "2026-10-14 02:03:49 INFO  check   2 readings out of range (flagged)",
  "2026-10-14 02:03:50 INFO  write   writing storage-2026-10-13.parquet",
  "2026-10-14 02:03:58 INFO  write   wrote 1.8 MB, 199 series",
  "2026-10-14 02:03:58 INFO  publish dashboards refresh queued",
  "2026-10-14 02:04:02 INFO  publish 3 dashboards refreshed",
  "2026-10-14 02:04:02 WARN  publish coast dashboard shows stale data",
  "2026-10-14 02:04:03 INFO  notify  summary to ops@gaugeworks.example",
  "2026-10-14 02:04:03 ERROR import  run 4412 finished with errors (1 region)",
  "2026-10-14 02:04:03 INFO  import  duration 4m03s",
  "2026-10-14 02:04:03 INFO  import  next run 2026-10-15 02:00:00",
  "2026-10-14 02:04:04 INFO  import  run 4412 closed",
].join("\n");

export const defaultPasteFoldValue: PasteFoldPart[] = [
  { type: "text", text: "The overnight import failed again." },
  {
    type: "block",
    block: {
      id: "gaugeworks-log",
      kind: "log",
      label: "Log",
      icon: "log",
      text: gaugeworksLog,
    },
  },
  {
    type: "text",
    text: "Can you find the first error and tell me what changed since Tuesday?",
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const ICONS: Record<PasteFoldIcon, LucideIcon> = {
  log: ScrollText,
  table: Table2,
  email: Mail,
  code: Code,
  text: FileText,
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const linesOf = (text: string) => text.replace(/\n+$/, "").split(/\r?\n/);
const grouped = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const kChars = (n: number) =>
  n >= 1000 ? `${(Math.round(n / 100) / 10).toFixed(1)}k` : String(n);
const plural = (n: number, one: string, many = `${one}s`) =>
  `${grouped(n)} ${n === 1 ? one : many}`;
const clampNum = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Text runs always sit either side of every block, so there is somewhere to type. */
function normalize(parts: PasteFoldPart[]): PasteFoldPart[] {
  const out: PasteFoldPart[] = [];
  for (const part of parts) {
    const last = out[out.length - 1];
    if (part.type === "text") {
      if (last?.type === "text")
        out[out.length - 1] = { type: "text", text: last.text + part.text };
      else out.push(part);
    } else {
      if (!last || last.type === "block") out.push({ type: "text", text: "" });
      out.push(part);
    }
  }
  if (out[out.length - 1]?.type !== "text")
    out.push({ type: "text", text: "" });
  return out;
}

/** A run is keyed by the block before it, so splitting or joining keeps its node. */
const runKey = (parts: PasteFoldPart[], i: number) => {
  for (let j = i - 1; j >= 0; j -= 1) {
    const p = parts[j];
    if (p?.type === "block") return `after:${p.block.id}`;
  }
  return "start";
};

const plainText = (parts: PasteFoldPart[]) =>
  parts
    .map((p) =>
      p.type === "text"
        ? p.text
        : `\n\`\`\`${p.block.kind}\n${p.block.text}\n\`\`\`\n`,
    )
    .join(" ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

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

type Focus = { run: string; at: number } | { chip: string } | "peek" | null;

/* ----------------------------------------------------------------------- */
/*                                The chip                                  */
/* ----------------------------------------------------------------------- */

function Chip({
  block,
  chipStyle,
  spilling,
  animating,
  flash,
  motionSafe,
  disabled,
  onKey,
  onOpen,
  onRemove,
}: {
  block: PasteBlock;
  chipStyle: PasteFoldChipStyle;
  spilling: boolean;
  animating: boolean;
  /** Reduced motion's arrival: a highlight that fades, no travel. */
  flash: boolean;
  motionSafe: boolean;
  disabled: boolean;
  onKey: (event: React.KeyboardEvent<HTMLElement>) => void;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const lines = linesOf(block.text);
  const first = lines.find((l) => l.trim()) ?? "";
  const Icon = ICONS[block.icon ?? "text"] ?? FileText;
  const count = plural(lines.length, "line");
  const sheet = lines.slice(0, 5);

  return (
    <motion.span
      layout={animating && motionSafe ? true : false}
      transition={{ layout: springs.glide }}
      data-pfold-chip={block.id}
      role="button"
      tabIndex={-1}
      aria-label={`${block.label} block, ${count}. First line: ${first}`}
      aria-disabled={disabled || undefined}
      onKeyDown={onKey}
      onClick={onOpen}
      className={cn(
        "group/paste-fold relative inline-flex max-w-full cursor-pointer align-top select-none",
        spilling
          ? "w-full flex-col gap-0.5 overflow-hidden rounded-3 border border-(--pf-line) bg-surface-1 px-3 py-2"
          : chipStyle === "card"
            ? "w-[17rem] flex-col items-start gap-0.5 rounded-3 border border-(--pf-line) bg-surface-1 py-1.5 pr-7 pl-2.5 @max-[30rem]/paste-fold:w-full"
            : chipStyle === "pill"
              ? "h-6 items-center gap-1 rounded-full bg-(--pf-wash) pr-6 pl-2 @max-[30rem]/paste-fold:w-full"
              : "h-7 items-center gap-1.5 overflow-hidden rounded-2 border border-(--pf-line) bg-(--pf-wash) pr-6 @max-[30rem]/paste-fold:w-full",
        "transition-[border-color,background-color,box-shadow] focus-visible:border-(--pf-accent) focus-visible:shadow-[0_0_0_3px_var(--pf-wash)]",
        FOCUS,
      )}
    >
      {flash ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-(--pf-line)"
          initial={{ opacity: 0.8 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: easings.exit }}
        />
      ) : null}
      <AnimatePresence initial={false} mode="popLayout">
        {spilling ? (
          <motion.span
            key="sheet"
            className="flex w-full flex-col"
            style={{ originY: 0 }}
            exit={{
              opacity: 0,
              scaleY: 0.3,
              transition: { duration: durations.fast, ease: easings.exit },
            }}
          >
            {sheet.map((line, i) => (
              <motion.span
                key={i}
                className="block truncate font-mono text-[11px] leading-4 text-ink-2"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: durations.base,
                  ease: easings.enter,
                  delay: i * cascade(sheet.length) * 0.5,
                }}
              >
                {line || "\u00a0"}
              </motion.span>
            ))}
            <span className="font-mono text-[10.5px] leading-4 text-ink-3">
              {`… ${plural(lines.length, "line")}`}
            </span>
          </motion.span>
        ) : null}
      </AnimatePresence>
      {spilling ? null : (
        <>
          {chipStyle === "tab" ? (
            <span
              aria-hidden
              className="h-full w-1 shrink-0 bg-(--pf-accent)"
            />
          ) : null}
          <motion.span
            layout={animating && motionSafe ? "position" : false}
            className="flex min-w-0 items-center gap-1.5"
            initial={motionSafe && animating ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.base, delay: 0.12 }}
          >
            <Icon
              aria-hidden
              className="size-3.5 shrink-0 text-(--pf-accent)"
            />
            <span className="shrink-0 text-[12px] font-medium text-foreground">
              {block.label}
            </span>
            <span className="shrink-0 font-mono text-[10.5px] text-ink-3 tabular-nums">
              {count}
            </span>
            {chipStyle === "tab" ? (
              <span className="max-w-[28ch] min-w-0 truncate font-mono text-[10.5px] text-ink-2 @max-[30rem]/paste-fold:max-w-none">
                {first}
              </span>
            ) : null}
          </motion.span>
          {chipStyle === "card" ? (
            <motion.span
              layout={animating && motionSafe ? "position" : false}
              className="block w-full truncate font-mono text-[10.5px] leading-4 text-ink-2"
              initial={motionSafe && animating ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{ duration: durations.base, delay: 0.16 }}
            >
              {first}
            </motion.span>
          ) : null}
          <span
            aria-hidden
            title={`Remove ${block.label} block`}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            className={cn(
              "absolute top-1/2 right-1 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-1 text-ink-3 opacity-0 transition-opacity group-hover/paste-fold:opacity-100 group-focus-visible/paste-fold:opacity-100 hover:bg-surface-2 hover:text-foreground pointer-coarse:opacity-100",
              chipStyle === "card" && "top-2 translate-y-0",
            )}
          >
            <X aria-hidden className="size-3" />
          </span>
        </>
      )}
    </motion.span>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

/**
 * A composer that folds a big paste away. Paste a log, a table, a long email
 * or code and, instead of flooding the field, it spills in as a sheet of its
 * first lines and then folds on `springs.glide` into a labelled block — its
 * kind, line count and first line — with the caret already blinking after it
 * so you keep typing. The message is a flow of real textareas and block
 * chips: Left at the start of a run, or Backspace there, selects the block
 * before it; Space peeks inside; Backspace removes it.
 *
 * Peeking flips the composer to the block's lines (the height glides), and
 * Trim turns that into a marking view where you keep only the lines you
 * mark — "Errors only" marks a log's errors in one press. Over the `limit`
 * the meter turns danger and Send holds. On a phone blocks wrap as
 * full-width chips. Under reduced motion blocks appear folded with a short
 * highlight, and the peek cross-fades.
 */
export function PasteFold({
  ref,
  value: valueProp,
  defaultValue = defaultPasteFoldValue,
  onValueChange,
  rules = defaultPasteRules,
  foldThreshold = 8,
  foldChars = 1200,
  chipStyle = "tab",
  accent = "var(--accent-bright)",
  limit = 4000,
  onPasteDetected,
  onExpand,
  onTrim,
  onSubmit,
  placeholder = "Describe the problem, or paste the log…",
  label = "Message",
  busy = false,
  disabled = false,
  className,
}: PasteFoldProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();

  /* ------------------------------- value -------------------------------- */

  const [own, setOwn] = React.useState(() => normalize(defaultValue));
  const parts = normalize(valueProp ?? own);
  const commit = (next: PasteFoldPart[]) => {
    const n = normalize(next);
    if (valueProp === undefined) setOwn(n);
    onValueChange?.(n);
  };

  const [announcement, setAnnouncement] = React.useState("");
  const total = parts.reduce(
    (n, p) => n + (p.type === "text" ? p.text.length : p.block.text.length),
    0,
  );
  const over = total - limit;

  /* ------------------------------- focus -------------------------------- */

  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const pending = React.useRef<Focus>(null);
  const [focusTick, setFocusTick] = React.useState(0);
  const focusLater = (f: Focus) => {
    pending.current = f;
    setFocusTick((n) => n + 1);
  };
  React.useEffect(() => {
    const f = pending.current;
    if (f === "peek") {
      pending.current = null;
      listRef.current?.focus({ preventScroll: true });
      return;
    }
    const body = bodyRef.current;
    if (!f || !body) return;
    pending.current = null;
    if ("chip" in f) {
      body
        .querySelector<HTMLElement>(`[data-pfold-chip="${CSS.escape(f.chip)}"]`)
        ?.focus({ preventScroll: false });
      return;
    }
    const ta = body.querySelector<HTMLTextAreaElement>(
      `[data-pfold-run="${CSS.escape(f.run)}"]`,
    );
    if (!ta) return;
    ta.focus({ preventScroll: false });
    const at = clampNum(f.at, 0, ta.value.length);
    ta.setSelectionRange(at, at);
  }, [focusTick]);

  /* ------------------------------ folding ------------------------------- */

  const [spilling, setSpilling] = React.useState<string | null>(null);
  const [animating, setAnimating] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<string | null>(null);
  const seq = React.useRef(0);

  React.useEffect(() => {
    if (!spilling) return;
    const t = window.setTimeout(() => setSpilling(null), 380);
    return () => window.clearTimeout(t);
  }, [spilling]);
  React.useEffect(() => {
    if (!animating) return;
    const t = window.setTimeout(() => setAnimating(null), 1000);
    return () => window.clearTimeout(t);
  }, [animating]);
  React.useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 900);
    return () => window.clearTimeout(t);
  }, [flash]);

  const detect = (text: string): PasteBlock => {
    const lines = linesOf(text);
    const rule = rules.find((r) => r.test(text, lines));
    seq.current += 1;
    return {
      id: `${uid}-b${seq.current}`,
      kind: rule?.kind ?? "text",
      label: rule?.label ?? "Text",
      icon: rule?.icon ?? "text",
      text: text.replace(/\n+$/, ""),
    };
  };

  /** Puts `text` into run `index` between `start` and `end`, folding it if it is big. */
  const pasteInto = (
    index: number,
    start: number,
    end: number,
    text: string,
    moveCaret = true,
  ) => {
    const run = parts[index];
    if (!run || run.type !== "text" || disabled) return false;
    const lineCount = linesOf(text).length;
    if (lineCount < Math.max(2, foldThreshold) && text.length < foldChars)
      return false;
    const block = detect(text);
    const before = run.text.slice(0, start).replace(/\s+$/, "");
    const after = run.text.slice(end).replace(/^\s+/, "");
    const next = [
      ...parts.slice(0, index),
      { type: "text" as const, text: before },
      { type: "block" as const, block },
      { type: "text" as const, text: after },
      ...parts.slice(index + 1),
    ];
    commit(next);
    if (motionSafe) {
      setSpilling(block.id);
      setAnimating(block.id);
    } else setFlash(block.id);
    onPasteDetected?.(block);
    setAnnouncement(
      `${block.label} pasted and folded: ${plural(lineCount, "line")}. Left arrow selects it, Space peeks inside.`,
    );
    if (moveCaret) focusLater({ run: `after:${block.id}`, at: 0 });
    return true;
  };

  const lastFocus = React.useRef<{
    index: number;
    start: number;
    end: number;
  } | null>(null);

  const insertText = (
    index: number,
    start: number,
    end: number,
    text: string,
    moveCaret: boolean,
  ) => {
    const run = parts[index];
    if (!run || run.type !== "text") return;
    const next = [...parts];
    next[index] = {
      type: "text",
      text: run.text.slice(0, start) + text + run.text.slice(end),
    };
    commit(next);
    if (moveCaret)
      focusLater({ run: runKey(parts, index), at: start + text.length });
  };

  const sectionRef = React.useRef<HTMLElement | null>(null);
  const handlePaste = (text: string) => {
    // A paste from code only moves the caret when the caret is already here:
    // it never pulls focus, or the page, away from the reader.
    const inside = Boolean(
      sectionRef.current?.contains(document.activeElement),
    );
    let at = lastFocus.current;
    if (!at || parts[at.index]?.type !== "text") {
      const lastIndex = parts.length - 1;
      const run = parts[lastIndex];
      const len = run?.type === "text" ? run.text.length : 0;
      at = { index: lastIndex, start: len, end: len };
    }
    if (!pasteInto(at.index, at.start, at.end, text, inside))
      insertText(at.index, at.start, at.end, text, inside);
  };

  React.useImperativeHandle(ref, () => ({
    paste: handlePaste,
    focus: () => {
      const lastIndex = parts.length - 1;
      const run = parts[lastIndex];
      focusLater({
        run: runKey(parts, lastIndex),
        at: run?.type === "text" ? run.text.length : 0,
      });
    },
  }));

  /* ------------------------------- blocks ------------------------------- */

  const removeBlock = (id: string) => {
    const i = parts.findIndex((p) => p.type === "block" && p.block.id === id);
    if (i < 0 || disabled) return;
    const prev = parts[i - 1];
    const following = parts[i + 1];
    const before = prev?.type === "text" ? prev.text : "";
    const after = following?.type === "text" ? following.text : "";
    // The two runs meet where the block was; a space keeps their words apart.
    const glue =
      before && after && !/\s$/.test(before) && !/^\s/.test(after) ? " " : "";
    const join = before.length + glue.length;
    const prevKey = runKey(parts, i - 1);
    const removed = parts[i];
    const next = [...parts.slice(0, i), ...parts.slice(i + 1)];
    if (glue && following?.type === "text")
      next[i] = { type: "text", text: glue + after };
    commit(next);
    setPeek(null);
    setAnnouncement(
      `${removed?.type === "block" ? removed.block.label : "Block"} removed.`,
    );
    focusLater({ run: prevKey, at: join });
  };

  const [peek, setPeek] = React.useState<string | null>(null);
  const [trim, setTrim] = React.useState<Set<number> | null>(null);
  const [active, setActive] = React.useState(0);
  const anchor = React.useRef(0);
  const peeked = parts.find(
    (p): p is { type: "block"; block: PasteBlock } =>
      p.type === "block" && p.block.id === peek,
  )?.block;

  const openPeek = (block: PasteBlock) => {
    setPeek(block.id);
    setTrim(null);
    setActive(0);
    focusLater("peek");
    onExpand?.(block);
    setAnnouncement(
      `Peeking at ${block.label}, ${plural(linesOf(block.text).length, "line")}. Escape closes.`,
    );
  };

  const closePeek = () => {
    const id = peek;
    setPeek(null);
    setTrim(null);
    if (id) focusLater({ chip: id });
  };

  const applyTrim = () => {
    if (!peeked || !trim || trim.size === 0) return;
    const lines = linesOf(peeked.text);
    const kept = [...trim].sort((a, b) => a - b);
    const text = kept.map((i) => lines[i] ?? "").join("\n");
    const block = { ...peeked, text };
    commit(
      parts.map((p) =>
        p.type === "block" && p.block.id === peeked.id
          ? { type: "block", block }
          : p,
      ),
    );
    onTrim?.(block, kept);
    setAnnouncement(`Trimmed to ${plural(kept.length, "line")}.`);
    setTrim(null);
    setPeek(null);
    focusLater({ chip: peeked.id });
  };

  /* ------------------------------ keyboard ------------------------------ */

  const runKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
    index: number,
  ) => {
    const ta = event.currentTarget;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const before = parts[index - 1];
    const after = parts[index + 1];
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      send();
      return;
    }
    if (s !== e) return;
    if (
      (event.key === "ArrowLeft" || event.key === "Backspace") &&
      s === 0 &&
      before?.type === "block"
    ) {
      event.preventDefault();
      focusLater({ chip: before.block.id });
    } else if (
      (event.key === "ArrowRight" || event.key === "Delete") &&
      s === value.length &&
      after?.type === "block"
    ) {
      event.preventDefault();
      focusLater({ chip: after.block.id });
    } else if (event.key === "ArrowUp" && s === 0 && index > 0) {
      event.preventDefault();
      const prevRun = parts[index - 2];
      focusLater({
        run: runKey(parts, index - 2),
        at: prevRun?.type === "text" ? prevRun.text.length : 0,
      });
    } else if (
      event.key === "ArrowDown" &&
      s === value.length &&
      index < parts.length - 1
    ) {
      event.preventDefault();
      focusLater({ run: runKey(parts, index + 2), at: 0 });
    }
  };

  const chipKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
    index: number,
  ) => {
    const part = parts[index];
    if (!part || part.type !== "block") return;
    const prev = parts[index - 1];
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusLater({
          run: runKey(parts, index - 1),
          at: prev?.type === "text" ? prev.text.length : 0,
        });
        return;
      case "ArrowRight":
      case "ArrowDown":
      case "Escape":
        event.preventDefault();
        focusLater({ run: `after:${part.block.id}`, at: 0 });
        return;
      case " ":
      case "Enter":
        event.preventDefault();
        openPeek(part.block);
        return;
      case "Backspace":
      case "Delete":
        event.preventDefault();
        removeBlock(part.block.id);
        return;
      default:
        return;
    }
  };

  const toggleLine = (i: number, extend: boolean) => {
    if (!trim) return;
    const next = new Set(trim);
    if (extend) {
      const on = trim.has(anchor.current);
      const [a, b] = [Math.min(anchor.current, i), Math.max(anchor.current, i)];
      for (let k = a; k <= b; k += 1) {
        if (on) next.add(k);
        else next.delete(k);
      }
    } else {
      if (next.has(i)) next.delete(i);
      else next.add(i);
      anchor.current = i;
    }
    setTrim(next);
  };

  const onListKey = (
    event: React.KeyboardEvent<HTMLUListElement>,
    count: number,
  ) => {
    const move = (to: number) => {
      event.preventDefault();
      const n = clampNum(to, 0, count - 1);
      setActive(n);
      if (event.shiftKey && trim) toggleLine(n, true);
      listRef.current
        ?.querySelector<HTMLElement>(`[data-pfold-line="${n}"]`)
        ?.scrollIntoView({ block: "nearest" });
    };
    if (event.key === "ArrowDown") move(active + 1);
    else if (event.key === "ArrowUp") move(active - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(count - 1);
    else if (event.key === "PageDown") move(active + 6);
    else if (event.key === "PageUp") move(active - 6);
    else if (event.key === " " && trim) {
      event.preventDefault();
      toggleLine(active, event.shiftKey);
    }
  };

  /* ------------------------------- sending ------------------------------ */

  const send = () => {
    if (disabled || busy) return;
    if (over > 0) {
      setAnnouncement(
        `Over the limit by ${plural(over, "character")}. Trim or remove a block first.`,
      );
      return;
    }
    const text = plainText(parts);
    if (!text) {
      setAnnouncement("Write a message first.");
      return;
    }
    onSubmit?.(parts, text);
    if (valueProp === undefined)
      setOwn(normalize([{ type: "text", text: "" }]));
    onValueChange?.(normalize([{ type: "text", text: "" }]));
    setAnnouncement("Sent.");
    focusLater({ run: "start", at: 0 });
  };

  /* ------------------------------- layout ------------------------------- */

  const vars = {
    "--pf-accent": accent,
    "--pf-wash": `color-mix(in oklab, ${accent} 11%, transparent)`,
    "--pf-line": `color-mix(in oklab, ${accent} 40%, transparent)`,
    "--pf-solid": `oklch(from ${accent} 0.55 c h)`,
    "--pf-on": "oklch(0.99 0.004 262)",
  } as React.CSSProperties;

  const [bindBody, bodyHeight] = useMeasured();
  const ratio = clampNum(total / Math.max(1, limit), 0, 1);
  const meterTone =
    over > 0 ? "bg-danger" : ratio > 0.9 ? "bg-warn" : "bg-(--pf-accent)";
  const empty =
    parts.length === 1 && parts[0]?.type === "text" && !parts[0].text;

  const editor = (
    <motion.div
      key="editor"
      ref={bodyRef}
      role="group"
      aria-label={label}
      className="flex max-h-[128px] [scrollbar-width:thin] flex-wrap items-start gap-x-1.5 gap-y-1.5 overflow-y-auto overscroll-contain px-3 py-2.5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{
        opacity: 0,
        transition: { duration: durations.fast, ease: easings.exit },
      }}
      transition={{ duration: durations.fast }}
    >
      <LayoutGroup id={`${uid}-fold`}>
        {parts.map((part, i) => {
          if (part.type === "block") {
            return (
              <Chip
                key={part.block.id}
                block={part.block}
                chipStyle={chipStyle}
                spilling={spilling === part.block.id}
                animating={animating === part.block.id}
                flash={flash === part.block.id}
                motionSafe={motionSafe}
                disabled={disabled}
                onKey={(event) => chipKeyDown(event, i)}
                onOpen={() => openPeek(part.block)}
                onRemove={() => removeBlock(part.block.id)}
              />
            );
          }
          const key = runKey(parts, i);
          const last = i === parts.length - 1;
          const prevBlock = parts[i - 1];
          const runLabel =
            prevBlock?.type === "block"
              ? `${label}, after the ${prevBlock.block.label} block`
              : label;
          return (
            <motion.span
              key={key}
              layout={animating ? "position" : false}
              transition={{ layout: springs.glide }}
              className={cn(
                "inline-grid max-w-full min-w-[0.75ch] align-top",
                last && "min-w-[8ch] flex-1",
              )}
            >
              <span
                aria-hidden
                className="invisible col-start-1 row-start-1 text-[13.5px] leading-6 break-words whitespace-pre-wrap"
              >
                {`${part.text || (empty ? placeholder : "")}\u200b`}
              </span>
              <textarea
                data-pfold-run={key}
                aria-label={runLabel}
                aria-describedby={`${uid}-hint`}
                rows={1}
                cols={1}
                value={part.text}
                readOnly={disabled}
                placeholder={empty ? placeholder : undefined}
                spellCheck
                onFocus={(event) => {
                  const t = event.currentTarget;
                  lastFocus.current = {
                    index: i,
                    start: t.selectionStart,
                    end: t.selectionEnd,
                  };
                }}
                onSelect={(event) => {
                  const t = event.currentTarget;
                  lastFocus.current = {
                    index: i,
                    start: t.selectionStart,
                    end: t.selectionEnd,
                  };
                }}
                onChange={(event) => {
                  const v = event.currentTarget.value;
                  const next = [...parts];
                  next[i] = { type: "text", text: v };
                  commit(next);
                }}
                onPaste={(event) => {
                  const text = event.clipboardData.getData("text/plain");
                  const t = event.currentTarget;
                  if (pasteInto(i, t.selectionStart, t.selectionEnd, text))
                    event.preventDefault();
                }}
                onKeyDown={(event) => runKeyDown(event, i)}
                className="col-start-1 row-start-1 block w-full resize-none overflow-hidden bg-transparent p-0 text-[13.5px] leading-6 text-foreground outline-none placeholder:text-ink-3"
              />
            </motion.span>
          );
        })}
      </LayoutGroup>
    </motion.div>
  );

  const peekView = peeked
    ? (() => {
        const lines = linesOf(peeked.text);
        const Icon = ICONS[peeked.icon ?? "text"] ?? FileText;
        const rule = rules.find((r) => r.kind === peeked.kind);
        return (
          <motion.div
            key="peek"
            role="region"
            aria-labelledby={`${uid}-peek-title`}
            className="flex flex-col gap-2 px-3 py-2.5"
            initial={{ opacity: 0, y: motionSafe ? 6 : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              transition: { duration: durations.fast, ease: easings.exit },
            }}
            transition={
              motionSafe
                ? { y: springs.glide, opacity: { duration: durations.base } }
                : { duration: durations.fast }
            }
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                if (trim) setTrim(null);
                else closePeek();
              }
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <h3
                id={`${uid}-peek-title`}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px] font-medium text-foreground"
              >
                <Icon
                  aria-hidden
                  className="size-3.5 shrink-0 text-(--pf-accent)"
                />
                <span className="shrink-0">{peeked.label}</span>
                <span className="truncate font-mono text-[10.5px] font-normal text-ink-3 tabular-nums">
                  {`${plural(lines.length, "line")} · ${kChars(peeked.text.length)} chars`}
                </span>
              </h3>
              <span className="flex shrink-0 items-center gap-1">
                {trim ? null : (
                  <button
                    type="button"
                    onClick={() => {
                      setTrim(new Set(lines.map((_, i) => i)));
                      setAnnouncement(
                        "Trim: every line is kept. Space or a click leaves a line out.",
                      );
                      listRef.current?.focus();
                    }}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-2 text-[11.5px] text-foreground transition-colors hover:bg-surface-2",
                      FOCUS,
                    )}
                  >
                    <Scissors aria-hidden className="size-3.5" />
                    Trim
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Close"
                  onClick={closePeek}
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS,
                  )}
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </span>
            </div>
            <ul
              ref={listRef}
              role="listbox"
              tabIndex={0}
              aria-label={trim ? "Lines to keep" : `${peeked.label} lines`}
              aria-multiselectable={trim ? true : undefined}
              aria-activedescendant={`${uid}-line-${active}`}
              onKeyDown={(event) => onListKey(event, lines.length)}
              className={cn(
                "max-h-[72px] [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-2 border border-hairline bg-surface-1 py-1 @min-[30rem]/paste-fold:max-h-[104px]",
                "outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
              )}
            >
              {lines.map((line, i) => {
                const kept = trim ? trim.has(i) : true;
                return (
                  <li
                    key={i}
                    id={`${uid}-line-${i}`}
                    data-pfold-line={i}
                    role="option"
                    aria-selected={trim ? kept : i === active}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      setActive(i);
                      if (trim) toggleLine(i, event.shiftKey);
                      listRef.current?.focus();
                    }}
                    className={cn(
                      "flex cursor-default items-center gap-2 px-2 font-mono text-[11px] leading-[18px]",
                      i === active &&
                        "bg-[color-mix(in_oklab,var(--foreground)_6%,transparent)]",
                      trim && "cursor-pointer",
                      trim &&
                        !kept &&
                        "text-ink-3 line-through decoration-[color-mix(in_oklab,var(--foreground)_30%,transparent)]",
                    )}
                  >
                    {trim ? (
                      <span
                        aria-hidden
                        className={cn(
                          "inline-flex size-3 shrink-0 items-center justify-center rounded-[3px] border transition-colors",
                          kept
                            ? "border-(--pf-accent) bg-(--pf-accent)"
                            : "border-hairline-strong",
                        )}
                      >
                        {kept ? (
                          <svg
                            viewBox="0 0 12 12"
                            className="size-2.5 text-(--pf-on)"
                          >
                            <path
                              d="M2.5 6.2 5 8.5 9.5 3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : null}
                      </span>
                    ) : null}
                    <span className="w-6 shrink-0 text-right text-ink-3 tabular-nums select-none">
                      {i + 1}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 truncate whitespace-pre",
                        ERRORISH.test(line) && !(trim && !kept)
                          ? "text-foreground"
                          : "text-ink-2",
                      )}
                    >
                      {line || "\u00a0"}
                    </span>
                  </li>
                );
              })}
            </ul>
            {trim ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-1">
                  {rule?.keep ? (
                    <button
                      type="button"
                      onClick={() => {
                        const keep = new Set(
                          lines
                            .map((l, i) => (rule.keep?.test(l) ? i : -1))
                            .filter((i) => i >= 0),
                        );
                        setTrim(keep);
                        setAnnouncement(`${plural(keep.size, "line")} marked.`);
                      }}
                      className={cn(
                        "inline-flex h-7 items-center rounded-2 border border-hairline-strong bg-card px-2 text-[11.5px] text-foreground transition-colors hover:bg-surface-2",
                        FOCUS,
                      )}
                    >
                      {rule.keep.label}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setTrim(new Set(lines.map((_, i) => i)))}
                    className={cn(
                      "inline-flex h-7 items-center rounded-2 px-2 text-[11.5px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                      FOCUS,
                    )}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrim(new Set())}
                    className={cn(
                      "inline-flex h-7 items-center rounded-2 px-2 text-[11.5px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                      FOCUS,
                    )}
                  >
                    None
                  </button>
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTrim(null)}
                    className={cn(
                      "inline-flex h-7 items-center rounded-2 px-2 text-[11.5px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                      FOCUS,
                    )}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={applyTrim}
                    aria-disabled={trim.size === 0 || undefined}
                    className={cn(
                      "inline-flex h-7 items-center rounded-2 bg-(--pf-solid) px-2.5 text-[11.5px] font-medium text-(--pf-on) transition-colors hover:bg-[color-mix(in_oklab,var(--pf-solid)_88%,black)]",
                      trim.size === 0 && "opacity-50",
                      FOCUS,
                    )}
                  >
                    {`Keep ${plural(trim.size, "line")}`}
                  </button>
                </span>
              </div>
            ) : null}
          </motion.div>
        );
      })()
    : null;

  return (
    <section
      ref={sectionRef}
      aria-label={label}
      className={cn(
        "@container/paste-fold w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        "has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-ring has-[textarea:focus-visible]:outline-solid",
        className,
      )}
      style={vars}
    >
      <motion.div
        className="overflow-hidden"
        initial={false}
        animate={{ height: bodyHeight || "auto" }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        <div ref={bindBody}>
          <AnimatePresence initial={false} mode="popLayout">
            {peekView ?? editor}
          </AnimatePresence>
        </div>
      </motion.div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-hairline px-3 py-2 @max-[30rem]/paste-fold:justify-end">
        <p
          id={`${uid}-hint`}
          className={cn(
            "min-w-0 items-center gap-1.5 text-[11.5px] leading-4",
            over > 0
              ? "flex text-danger"
              : "hidden text-ink-3 @min-[30rem]/paste-fold:flex",
          )}
        >
          {over > 0 ? (
            <>
              <CircleAlert aria-hidden className="size-3.5 shrink-0" />
              <span>{`Over by ${plural(over, "character")}. Trim or remove a block.`}</span>
            </>
          ) : (
            <span>{`Pastes of ${foldThreshold}+ lines fold · ← selects a block`}</span>
          )}
        </p>
        <span className="flex items-center gap-2.5">
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="relative block h-1 w-16 overflow-hidden rounded-full bg-hairline-strong"
            >
              <motion.span
                className={cn(
                  "absolute inset-0 rounded-full transition-colors",
                  meterTone,
                )}
                style={{ originX: 0 }}
                initial={false}
                animate={{ scaleX: Number(ratio.toFixed(3)) }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
              />
            </span>
            <span
              className={cn(
                "font-mono text-[10.5px] tabular-nums",
                over > 0 ? "text-danger" : "text-ink-3",
              )}
            >
              {`${grouped(total)} / ${grouped(limit)}`}
            </span>
          </span>
          <button
            type="button"
            onClick={send}
            aria-label={
              busy
                ? "Writing the answer"
                : over > 0
                  ? `Send, over the limit by ${plural(over, "character")}`
                  : "Send"
            }
            aria-disabled={disabled || busy || over > 0 || undefined}
            aria-busy={busy || undefined}
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-(--pf-solid) text-(--pf-on) transition-[background-color,opacity] hover:bg-[color-mix(in_oklab,var(--pf-solid)_88%,black)]",
              (disabled || busy || over > 0) && "opacity-50",
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
        </span>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
