"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CodeDelivery = "sent" | "delivered" | "read";

export type CodeBlock = {
  id: string;
  /** Own blocks sit on the right and carry the delivery mark. */
  from: "me" | "peer";
  /** Shown in the chip; any short name. */
  language: string;
  /** The block, newlines kept. */
  code: string;
  /** Shown in the header and named by the copy control. */
  filename?: string;
  /** Printed under the block, already formatted. */
  time?: string;
  /** Read for own blocks only. @default "sent" */
  delivery?: CodeDelivery;
};

export type CodeSnippetProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. */
  snippets: CodeBlock[];
  /** Lines shown before a block folds. @default 8 */
  foldLines?: number;
  /** Controlled ids of unfolded blocks. */
  open?: string[];
  /** Initial unfolded ids for uncontrolled usage. @default [] */
  defaultOpen?: string[];
  /** Fires from the disclosure that folds or unfolds a block. */
  onOpenChange?: (id: string, open: boolean) => void;
  /** Fires once the clipboard has taken a block's text. */
  onCopy?: (id: string, text: string) => void;
  /** Fires when the clipboard refuses and the block falls back to selection. */
  onCopyFail?: (id: string) => void;
  /** Milliseconds the stamp stays before the control reads Copy again. @default 1600 */
  copiedHold?: number;
  /** Names the other side in sentences. @default "Them" */
  peerName?: string;
  /** Names the thread for assistive technology. */
  label: string;
  className?: string;
};

const EMPTY: string[] = [];

/** Vertical padding inside the code box, set inline so the measurement and the
 *  layout can never drift apart. */
const PAD_Y = 8;

/** The `leading-5` row height, used until the observer reports a real one. */
const FALLBACK_LINE = 20;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** For controls flush with a clipped card's edge: an offset ring would be cut
 *  off by the card's own `overflow-hidden`, so those draw theirs inside. */
const focusRingInset =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

/** The dozen words of the house routing language that earn a colour. */
const KEYWORDS = new Set([
  "when",
  "route",
  "hold",
  "until",
  "else",
  "let",
  "send",
  "stop",
  "then",
  "and",
  "or",
  "is",
  "to",
  "note",
]);

type Kind = "plain" | "key" | "str" | "num" | "comment";
type Token = { text: string; kind: Kind };

const isDigit = (char: string) => char >= "0" && char <= "9";
const isWord = (char: string) =>
  (char >= "a" && char <= "z") || (char >= "A" && char <= "Z") || char === "_";

/**
 * One pass per line, by hand: comments run to the end, strings to their closing
 * quote, and a word is a keyword or it is not. No runtime's grammar is implied —
 * this is the house routing script and nothing else.
 */
const tokenise = (line: string): Token[] => {
  const tokens: Token[] = [];
  let index = 0;
  let plain = "";

  const flush = () => {
    if (plain.length > 0) tokens.push({ text: plain, kind: "plain" });
    plain = "";
  };

  while (index < line.length) {
    const char = line.charAt(index);
    if (char === "#") {
      flush();
      tokens.push({ text: line.slice(index), kind: "comment" });
      return tokens;
    }
    if (char === '"') {
      flush();
      let end = index + 1;
      while (end < line.length && line.charAt(end) !== '"') end += 1;
      tokens.push({ text: line.slice(index, end + 1), kind: "str" });
      index = end + 1;
      continue;
    }
    if (isDigit(char)) {
      flush();
      let end = index;
      while (end < line.length && isDigit(line.charAt(end))) end += 1;
      tokens.push({ text: line.slice(index, end), kind: "num" });
      index = end;
      continue;
    }
    if (isWord(char)) {
      let end = index;
      while (end < line.length && isWord(line.charAt(end))) end += 1;
      const word = line.slice(index, end);
      if (KEYWORDS.has(word)) {
        flush();
        tokens.push({ text: word, kind: "key" });
      } else {
        plain += word;
      }
      index = end;
      continue;
    }
    plain += char;
    index += 1;
  }
  flush();
  return tokens;
};

const KIND_CLASS: Record<Kind, string> = {
  plain: "",
  key: "text-cobalt-bright",
  str: "text-success",
  num: "text-warn",
  comment: "text-ink-3 italic",
};

const CHECK = "M2 8.5 5 11.5 10.5 5.5";
const CHECK_TRAIL = "M6.5 11.5 12 5.5";
const CHEVRON = "M4 6.5 8 10.5 12 6.5";

const deliverySentence = (delivery: CodeDelivery, peerName: string) =>
  ({
    sent: "Sent",
    delivered: `Delivered to ${peerName}`,
    read: `Read by ${peerName}`,
  })[delivery];

/** Puts the block in the reader's selection when the clipboard refuses. */
const selectNode = (node: HTMLElement | null) => {
  if (!node || typeof window === "undefined") return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
};

type SnippetItemProps = {
  snippet: CodeBlock;
  foldLines: number;
  open: boolean;
  copiedHold: number;
  motionSafe: boolean;
  peerName: string;
  onOpenPress: (id: string, open: boolean) => void;
  onCopy?: (id: string, text: string) => void;
  onCopyFail?: (id: string) => void;
  onSay: (sentence: string) => void;
};

/** One code block: the header chip and copy control, the body, the disclosure. */
function SnippetItem({
  snippet,
  foldLines,
  open,
  copiedHold,
  motionSafe,
  peerName,
  onOpenPress,
  onCopy,
  onCopyFail,
  onSay,
}: SnippetItemProps) {
  const bodyId = React.useId();
  const preRef = React.useRef<HTMLPreElement | null>(null);
  // setState from useState is stable, so this ref callback binds the observer
  // when the node arrives without tearing it down on every render.
  const [codeNode, setCodeNode] = React.useState<HTMLElement | null>(null);
  const [codeHeight, setCodeHeight] = React.useState(0);
  const [copied, setCopied] = React.useState(false);
  const [sweep, setSweep] = React.useState(0);
  const [sweeping, setSweeping] = React.useState(false);

  const lines = React.useMemo(() => snippet.code.split("\n"), [snippet.code]);
  const foldable = lines.length > foldLines;

  React.useEffect(() => {
    if (!codeNode || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setCodeHeight(Math.round(box ? box.blockSize : codeNode.offsetHeight));
    });
    observer.observe(codeNode);
    return () => observer.disconnect();
  }, [codeNode]);

  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), copiedHold);
    return () => window.clearTimeout(timer);
  }, [copied, copiedHold]);

  // Every line is one unwrapped row, so the fold's height is exact rather than
  // guessed: one measured block divided by the lines inside it.
  const lineHeight =
    codeHeight > 0 && lines.length > 0
      ? codeHeight / lines.length
      : FALLBACK_LINE;
  const shown = foldable && !open ? foldLines : lines.length;
  const height = Math.round(lineHeight * shown) + PAD_Y * 2;

  const title = snippet.filename ?? snippet.language;

  const copy = async () => {
    const text = snippet.code;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setSweep((count) => count + 1);
      setSweeping(true);
      onCopy?.(snippet.id, text);
      onSay(`Copied ${lines.length} lines`);
    } catch {
      // An insecure origin or a denied permission: the copy is still one
      // keystroke away rather than a shrug.
      selectNode(preRef.current);
      onCopyFail?.(snippet.id);
      onSay("Copy blocked. Select the code and press Control or Command C.");
    }
  };

  const own = snippet.from === "me";
  const delivery = snippet.delivery ?? "sent";
  const fold = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.move };
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <motion.li
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor() }}
      transition={{ duration: durations.base, ease: easings.enter }}
      className={cn("flex flex-col gap-1", own ? "items-end" : "items-start")}
    >
      <div
        role="group"
        aria-label={`${own ? "Your code" : `Code from ${peerName}`}, ${snippet.language}, ${lines.length} lines`}
        className={cn(
          "w-full max-w-[96%] overflow-hidden rounded-3 border border-hairline bg-surface-1",
          own ? "rounded-br-1" : "rounded-bl-1",
        )}
      >
        <div className="flex h-9 items-center gap-2 border-b border-hairline px-2.5">
          {/* The chip and the copy control both draw a box in this row, so they
              share one height rather than sitting a pixel apart. */}
          <span className="inline-flex h-6 shrink-0 items-center rounded-1 bg-cobalt-wash px-1.5 font-mono text-[10px] tracking-[0.06em] text-cobalt-bright uppercase">
            {snippet.language}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-2">
            {snippet.filename}
          </span>
          <span
            aria-hidden
            className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums"
          >
            {lines.length} ln
          </span>
          <button
            type="button"
            aria-label={`Copy ${title}`}
            onClick={() => void copy()}
            className={cn(
              "grid h-6 shrink-0 place-items-center rounded-1 border border-hairline-strong px-2 text-[11px] font-medium transition-colors hover:bg-accent",
              focusRing,
            )}
          >
            {/* Both readings share one grid cell, so the control keeps its
                width and the stamp lands over the word it replaces. */}
            <motion.span
              aria-hidden={copied}
              className="col-start-1 row-start-1"
              initial={false}
              animate={{ opacity: copied ? 0 : 1 }}
              transition={fade}
            >
              Copy
            </motion.span>
            <motion.span
              aria-hidden={!copied}
              className="col-start-1 row-start-1 text-cobalt-bright"
              initial={false}
              animate={{
                opacity: copied ? 1 : 0,
                scale: motionSafe && copied ? 1 : motionSafe ? 1.5 : 1,
                rotate: motionSafe && copied ? 0 : motionSafe ? -6 : 0,
              }}
              transition={
                motionSafe
                  ? { ...springs.recoil, opacity: fade }
                  : { duration: 0 }
              }
            >
              Copied
            </motion.span>
          </button>
        </div>

        <motion.div
          className="relative overflow-hidden"
          initial={false}
          animate={{ height }}
          transition={fold}
        >
          <div
            className="flex"
            style={{ paddingTop: PAD_Y, paddingBottom: PAD_Y }}
          >
            <span
              aria-hidden
              className="shrink-0 border-r border-hairline px-2 text-right font-mono text-[11px] leading-5 text-ink-3 tabular-nums select-none"
            >
              {lines.map((line, index) => (
                <span key={index} className="block">
                  {index + 1}
                </span>
              ))}
            </span>
            <div
              role="region"
              tabIndex={0}
              aria-label={`${title} code`}
              id={bodyId}
              className={cn(
                "min-w-0 flex-1 overflow-x-auto px-2",
                focusRingInset,
              )}
            >
              <pre ref={preRef} className="w-max">
                <code
                  ref={setCodeNode}
                  className="block font-mono text-[11px] leading-5"
                >
                  {lines.map((line, index) => (
                    <span key={index} className="block whitespace-pre">
                      {tokenise(line).map((token, position) => (
                        <span key={position} className={KIND_CLASS[token.kind]}>
                          {token.text}
                        </span>
                      ))}
                      {line.length === 0 ? " " : null}
                    </span>
                  ))}
                </code>
              </pre>
            </div>
          </div>

          {foldable && !open ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-surface-1 to-transparent"
            />
          ) : null}

          {/* The copy's sweep: a hairline taking the block from top to bottom,
              linear, because it is showing a pass rather than landing. */}
          <AnimatePresence>
            {sweeping ? (
              motionSafe ? (
                <motion.span
                  key={`sweep-${sweep}`}
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-cobalt-bright"
                  initial={{ y: 0, opacity: 1 }}
                  animate={{ y: height, opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0 } }}
                  transition={{
                    duration: durations.base,
                    ease: easings.linear,
                  }}
                  onAnimationComplete={() => setSweeping(false)}
                />
              ) : (
                <motion.span
                  key={`wash-${sweep}`}
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-cobalt-wash"
                  initial={{ opacity: 0.7 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0 } }}
                  transition={{ duration: durations.fast }}
                  onAnimationComplete={() => setSweeping(false)}
                />
              )
            ) : null}
          </AnimatePresence>
        </motion.div>

        {foldable ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => onOpenPress(snippet.id, !open)}
            className={cn(
              "flex h-8 w-full items-center justify-center gap-1.5 border-t border-hairline text-[11px] font-medium text-ink-2 transition-colors hover:bg-accent",
              focusRingInset,
            )}
          >
            {open ? "Show fewer lines" : `Show all ${lines.length} lines`}
            <motion.svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5 shrink-0"
              initial={false}
              animate={{ rotate: motionSafe && open ? 180 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <path d={CHEVRON} />
            </motion.svg>
          </button>
        ) : null}
      </div>

      <span className="flex items-center gap-1.5 px-1">
        {snippet.time ? (
          <span className="text-[11px] text-ink-3 tabular-nums">
            {snippet.time}
          </span>
        ) : null}
        {own ? (
          <span
            role="img"
            aria-label={deliverySentence(delivery, peerName)}
            className={cn(
              "inline-flex size-3.5 items-center justify-center",
              delivery === "read" ? "text-cobalt-bright" : "text-ink-3",
            )}
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5"
            >
              <path d={CHECK} />
              {delivery === "sent" ? null : <path d={CHECK_TRAIL} />}
            </svg>
          </span>
        ) : null}
      </span>
    </motion.li>
  );
}

/**
 * A block of code sent into a thread, built to be taken. A hand tokeniser walks
 * each line once — comment, string, number, keyword, plain — for an invented
 * routing script rather than any real runtime's grammar, the gutter of line
 * numbers stays put while the body scrolls sideways inside its own box, and a
 * long block folds to `foldLines` behind a fade.
 *
 * Copy is the mechanic. Pressing writes the text, a hairline sweep takes the
 * block from top to bottom on a linear tween — the block visibly being taken —
 * and "Copied" stamps over the control on `recoil`, ζ0.53, scaling out of 1.5
 * and rotating out of −6 degrees, the two bounces of a stamp hitting paper,
 * before reverting after `copiedHold`. When the clipboard refuses, the block
 * selects its own text and the status asks for Control or Command C, so the copy
 * is still one keystroke away. Folding animates to a height measured from one
 * ResizeObserver — the code box divided by its own line count, so the fold lands
 * exactly on a line — on `glide`.
 *
 * Each block is a `role="group"` named by a sentence; the copy control names the
 * file, the disclosure is a real `aria-expanded` button, and the code region is
 * focusable so a keyboard can scroll it. Under reduced motion the sweep is
 * replaced by a single wash that fades, and the fold swaps its height on a tween.
 */
export function CodeSnippet({
  ref,
  snippets,
  foldLines = 8,
  open,
  defaultOpen = EMPTY,
  onOpenChange,
  onCopy,
  onCopyFail,
  copiedHold = 1600,
  peerName = "Them",
  label,
  className,
}: CodeSnippetProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolled, setUncontrolled] = React.useState<string[]>(defaultOpen);
  const [say, setSay] = React.useState("");
  const openIds = open ?? uncontrolled;

  const openPress = (id: string, next: boolean) => {
    if (open === undefined) {
      setUncontrolled((prev) =>
        next ? [...prev, id] : prev.filter((item) => item !== id),
      );
    }
    onOpenChange?.(id, next);
    const snippet = snippets.find((item) => item.id === id);
    const count = snippet ? snippet.code.split("\n").length : 0;
    setSay(
      next ? `Showing all ${count} lines` : `Folded to ${foldLines} lines`,
    );
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <ol role="list" aria-label={label} className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {snippets.map((snippet) => (
            <SnippetItem
              key={snippet.id}
              snippet={snippet}
              foldLines={foldLines}
              open={openIds.includes(snippet.id)}
              copiedHold={copiedHold}
              motionSafe={motionSafe}
              peerName={peerName}
              onOpenPress={openPress}
              onCopy={onCopy}
              onCopyFail={onCopyFail}
              onSay={setSay}
            />
          ))}
        </AnimatePresence>
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {say}
      </span>
    </div>
  );
}
