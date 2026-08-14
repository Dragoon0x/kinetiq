"use client";

import * as React from "react";

import { animate, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CodeLatheProps = {
  ref?: React.Ref<HTMLDivElement>;
  code: string;
  /** Shown in the header rail beside the language. */
  filename?: string;
  language?: string;
  /**
   * Turn the listing out line by line instead of presenting it whole. Every
   * line is always in the DOM — unturned ones are only dimmed — so the source
   * is complete for assistive tech and for copy from the first frame.
   */
  stream?: boolean;
  /** Seconds per line while streaming. @default 0.06 */
  perLine?: number;
  /**
   * Read a leading `+`/`-` on each line as an edit and mark the gutter. The
   * marker is kept out of the copied text.
   */
  diff?: boolean;
  /** Offer a copy control in the header. @default true */
  copyable?: boolean;
  className?: string;
};

const KEYWORDS = new Set([
  "as","async","await","break","case","catch","class","const","continue","default","delete",
  "do","else","export","extends","false","finally","for","from","function","if","implements",
  "import","in","instanceof","interface","let","new","null","of","return","static","super",
  "switch","this","throw","true","try","type","typeof","undefined","var","void","while","yield",
  "def","elif","except","lambda","None","not","or","and","pass","raise","self","True","False",
  "fn","impl","let","mut","pub","struct","enum","match","use","where",
]);

/** One pass, no parser: comments, strings, numbers, then words. */
const PATTERN =
  /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d[\w.]*\b)|([A-Za-z_$][\w$]*)/g;

const TONE: Record<string, string> = {
  comment: "var(--ink-3)",
  string: "var(--success)",
  number: "var(--accent)",
  keyword: "var(--accent-bright)",
  call: "var(--ink)",
};

type Piece = { text: string; tone?: string };

function tokenize(line: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;
  for (const m of line.matchAll(PATTERN)) {
    const at = m.index ?? 0;
    if (at > last) pieces.push({ text: line.slice(last, at) });
    const [raw, comment, string, number, word] = m;
    if (comment) pieces.push({ text: raw, tone: TONE.comment });
    else if (string) pieces.push({ text: raw, tone: TONE.string });
    else if (number) pieces.push({ text: raw, tone: TONE.number });
    else if (word) {
      const after = line[at + raw.length];
      const tone = KEYWORDS.has(word)
        ? TONE.keyword
        : after === "("
          ? TONE.call
          : undefined;
      pieces.push({ text: raw, tone });
    }
    last = at + raw.length;
  }
  if (last < line.length) pieces.push({ text: line.slice(last) });
  return pieces;
}

type Row = { text: string; mark: "add" | "drop" | null };

/**
 * A listing turned out line by line, the way an agent actually writes one. Each
 * line lands on `glide` a beat behind the one above, so the block builds at a
 * readable pace instead of appearing whole.
 *
 * Highlighting is a single deterministic pass over comments, strings, numbers
 * and words — enough to read a snippet by, with no parser and nothing to load.
 * In `diff` mode a leading `+` or `-` becomes a gutter marker and a tinted row,
 * and is stripped from what gets copied.
 *
 * Every line is present from the first frame and only dimmed while it waits, so
 * screen readers and the copy control always see the whole source. Under
 * reduced motion the listing is simply there, complete and still.
 */
export function CodeLathe({
  ref,
  code,
  filename,
  language,
  stream = false,
  perLine = 0.06,
  diff = false,
  copyable = true,
  className,
}: CodeLatheProps) {
  const motionSafe = useMotionSafe();
  const [turned, setTurned] = React.useState(0);
  const [copied, setCopied] = React.useState(false);

  const rows = React.useMemo<Row[]>(
    () =>
      code.replace(/\n$/, "").split("\n").map((text) => {
        if (!diff) return { text, mark: null };
        if (text.startsWith("+")) return { text: text.slice(1), mark: "add" };
        if (text.startsWith("-")) return { text: text.slice(1), mark: "drop" };
        return { text, mark: null };
      }),
    [code, diff],
  );

  const total = rows.length;
  const running = stream && motionSafe;

  React.useEffect(() => {
    if (!running) return;
    const controls = animate(0, total, {
      duration: Math.max(total * perLine, durations.fast),
      ease: easings.linear,
      onUpdate: (v) => setTurned(Math.ceil(v)),
    });
    return () => controls.stop();
  }, [running, total, perLine]);

  React.useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(id);
  }, [copied]);

  const visible = running ? turned : total;

  const copy = () => {
    const text = rows.map((r) => r.text).join("\n");
    // A denied clipboard must not surface as an unhandled rejection.
    void navigator.clipboard
      ?.writeText(text)
      .then(() => setCopied(true))
      .catch(() => undefined);
  };

  return (
    <div
      ref={ref}
      className={cn(
        "border-hairline bg-surface-1 rounded-3 w-full overflow-hidden border",
        className,
      )}
    >
      {(filename || language || copyable) && (
        <div className="border-hairline flex items-center justify-between gap-3 border-b px-3 py-2">
          <span className="text-label text-ink-3 truncate">
            {filename ?? language ?? "source"}
          </span>
          <div className="flex items-center gap-2">
            {filename && language && (
              <span className="text-label text-ink-3">{language}</span>
            )}
            {copyable && (
              <button
                type="button"
                onClick={copy}
                className="border-hairline text-ink-2 hover:bg-surface-2 hover:text-ink rounded-1 border px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            )}
          </div>
        </div>
      )}

      <pre className="overflow-x-auto px-0 py-2 font-mono text-[12px] leading-[1.7]">
        <code>
          {rows.map((row, index) => {
            const shown = index < visible;
            return (
              <motion.span
                key={index}
                className={cn(
                  "grid grid-cols-[2.5rem_1fr] items-start",
                  row.mark === "add" && "bg-[color-mix(in_oklch,var(--success)_12%,transparent)]",
                  row.mark === "drop" && "bg-[color-mix(in_oklch,var(--danger)_12%,transparent)]",
                )}
                initial={false}
                animate={{ opacity: shown ? 1 : 0 }}
                transition={
                  motionSafe
                    ? { duration: durations.fast, ease: easings.enter }
                    : { duration: 0 }
                }
              >
                <span
                  aria-hidden
                  className="text-ink-3 shrink-0 pr-3 text-right tabular-nums select-none"
                >
                  {row.mark === "add" ? "+" : row.mark === "drop" ? "-" : index + 1}
                </span>
                <motion.span
                  className="text-ink-2 pr-4 whitespace-pre"
                  initial={false}
                  animate={{ x: shown ? 0 : motionSafe ? -4 : 0 }}
                  transition={motionSafe ? springs.glide : { duration: 0 }}
                >
                  {tokenize(row.text).map((piece, k) => (
                    <span key={k} style={piece.tone ? { color: piece.tone } : undefined}>
                      {piece.text}
                    </span>
                  ))}
                  {row.text === "" && " "}
                </motion.span>
              </motion.span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}
