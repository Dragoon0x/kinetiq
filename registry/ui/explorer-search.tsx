"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

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

export type ExplorerKind = "hash" | "address" | "block" | "unknown";

export type ExplorerRow = {
  label: string;
  /** Printed as-is. Ignore it and pass `amount` for money. */
  value?: string;
  /** Routed through `format`, so every figure on the card reads alike. */
  amount?: number;
  tone?: "default" | "success" | "warn" | "danger";
};

export type ExplorerHit = {
  kind: ExplorerKind;
  /** The canonical id — printed under the title, middle-truncated. */
  id: string;
  title: string;
  rows: ExplorerRow[];
};

export type ExplorerSearchProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled query text. */
  value?: string;
  /** Initial query text for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Looks the query up. Called from the debounce timer, never during render. */
  resolve?: (query: string, kind: ExplorerKind) => ExplorerHit | null;
  /** Milliseconds between the last keystroke and the lookup. @default 420 */
  resolveDelayMs?: number;
  /** Formats every amount on the preview card. */
  format?: (value: number) => string;
  /** Ticker printed after each amount. @default "BSN" */
  asset?: string;
  /** Visible field label. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  /** @default "Hash, address or block" */
  placeholder?: string;
  /** Fires when the recognised shape of the query changes. */
  onKindChange?: (kind: ExplorerKind) => void;
  /** Fires from the resolve timer with the record, or null for no match. */
  onResolved?: (hit: ExplorerHit | null) => void;
  /** Fires from Enter in the field or the card's open press. */
  onOpen?: (hit: ExplorerHit) => void;
  className?: string;
  "aria-label"?: string;
};

const MONEY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number): string => MONEY.format(value);

/** Shapes, not chains: 32 bytes is a transaction, 20 is an account, digits are a height. */
const HASH = /^0x[0-9a-f]{64}$/i;
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const BLOCK = /^\d{1,12}$/;

const classify = (query: string): ExplorerKind => {
  if (HASH.test(query)) return "hash";
  if (ADDRESS.test(query)) return "address";
  if (BLOCK.test(query)) return "block";
  return "unknown";
};

const KIND_WORD: Record<ExplorerKind, string> = {
  hash: "Transaction",
  address: "Address",
  block: "Block",
  unknown: "Unknown",
};

const KIND_HINT: Record<ExplorerKind, string> = {
  hash: "Recognised as a transaction hash.",
  address: "Recognised as an account address.",
  block: "Recognised as a block height.",
  unknown: "Not a hash, an address or a block height.",
};

const KIND_MARK: Record<ExplorerKind, string> = {
  hash: "M3 6h10M3 10h10M6.5 3.5 5.5 12.5M10.5 3.5 9.5 12.5",
  address: "M8 2.5 13.5 8 8 13.5 2.5 8Z",
  block: "M8 2.5 13.5 5.5v5L8 13.5 2.5 10.5v-5Z",
  unknown: "M8 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z",
};

const TONE: Record<NonNullable<ExplorerRow["tone"]>, string> = {
  default: "text-foreground",
  success: "text-success",
  warn: "text-warn",
  danger: "text-danger",
};

const subscribeVisible = (onChange: () => void): (() => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};

const readVisible = (): boolean =>
  typeof document === "undefined" || !document.hidden;

/**
 * A prerender has no document to read, so it reports visible and the first
 * client render matches the markup the server sent.
 */
const serverVisible = (): boolean => true;

/** The lookup waits for a foreground tab: a hidden one is nobody watching. */
function useDocumentVisible(): boolean {
  return React.useSyncExternalStore(
    subscribeVisible,
    readVisible,
    serverVisible,
  );
}

/**
 * Middle truncation without measuring: the head shrinks under `truncate` while
 * the last characters keep their width, so a hash always shows both ends at
 * 342px and the whole string stays in the title.
 */
function MiddleTruncate({ text, tail = 6 }: { text: string; tail?: number }) {
  const cut = Math.max(0, text.length - tail);
  return (
    <span title={text} className="flex min-w-0 items-baseline">
      <span className="truncate">{text.slice(0, cut)}</span>
      <span className="shrink-0">{text.slice(cut)}</span>
    </span>
  );
}

/**
 * Paste a hash; watch it resolve. The field classifies what is typed before it
 * looks anything up — the leading mark swaps to the recognised shape on
 * `flick`, the acknowledgement spring, while the border tweens to cobalt — then
 * waits out `resolveDelayMs` with a hairline sweeping the field's width, so the
 * pause reads as work rather than as nothing happening.
 *
 * The preview card arrives from a `step` below on `glide`, and the wrapper's
 * height is measured with a ResizeObserver and animated to match, so no room is
 * ever reserved for a card that has not resolved. Enter opens the record,
 * Escape clears the field, and a polite status region announces each settled
 * outcome once rather than on every keystroke. Under reduced motion the card
 * cross-fades in place and the sweep still runs, because the wait is
 * information about what the field is doing.
 */
export function ExplorerSearch({
  ref,
  value,
  defaultValue,
  onValueChange,
  resolve,
  resolveDelayMs = 420,
  format = defaultFormat,
  asset = "BSN",
  label,
  placeholder = "Hash, address or block",
  onKindChange,
  onResolved,
  onOpen,
  className,
  "aria-label": ariaLabel,
}: ExplorerSearchProps) {
  const motionSafe = useMotionSafe();
  const visible = useDocumentVisible();
  const baseId = React.useId();
  const inputId = `${baseId}-field`;
  const hintId = `${baseId}-hint`;
  const titleId = `${baseId}-title`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? "");
  const isControlled = value !== undefined;
  const query = (isControlled ? value : uncontrolled).trim();
  const text = isControlled ? value : uncontrolled;

  const kind = classify(query);
  const [settled, setSettled] = React.useState<{
    query: string;
    hit: ExplorerHit | null;
  } | null>(null);

  // Resolution is keyed by the exact query it answered, so a keystroke retires
  // the old card by derivation instead of by an effect writing state.
  const answer = settled && settled.query === query ? settled : null;
  const waiting = query !== "" && kind !== "unknown" && answer === null;

  // Latest handlers, kept out of the timer's deps so a re-render never restarts
  // the wait mid-keystroke.
  const handlers = React.useRef({ resolve, onResolved, onKindChange });
  React.useEffect(() => {
    handlers.current = { resolve, onResolved, onKindChange };
  });

  React.useEffect(() => {
    if (!waiting || !visible) return;
    const timer = window.setTimeout(
      () => {
        const hit = handlers.current.resolve?.(query, kind) ?? null;
        setSettled({ query, hit });
        handlers.current.onResolved?.(hit);
      },
      Math.max(0, resolveDelayMs),
    );
    return () => window.clearTimeout(timer);
  }, [waiting, visible, query, kind, resolveDelayMs]);

  // The kind is derived from a value the host may also set outright, so the
  // change is observed here rather than in the input event alone.
  const kindRef = React.useRef(kind);
  React.useEffect(() => {
    if (kindRef.current === kind) return;
    kindRef.current = kind;
    handlers.current.onKindChange?.(kind);
  }, [kind]);

  const [card, attachCard] = React.useState<HTMLElement | null>(null);
  const [height, setHeight] = React.useState(0);

  React.useEffect(() => {
    if (!card || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(card.offsetHeight));
    observer.observe(card);
    return () => observer.disconnect();
  }, [card]);

  const commit = (next: string) => {
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  const hit = answer?.hit ?? null;
  const showCard = answer !== null;
  const spring = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex h-5 items-center gap-2">
        {label ? (
          <label
            htmlFor={inputId}
            className="min-w-0 truncate text-sm font-medium"
          >
            {label}
          </label>
        ) : null}
        <span
          aria-hidden
          className="ml-auto inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[10px] tracking-[0.08em] uppercase"
        >
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full transition-colors",
              kind === "unknown" ? "bg-ink-3" : "bg-cobalt-bright",
            )}
          />
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={kind}
              className="text-ink-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              {KIND_WORD[kind]}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      <div
        aria-busy={waiting}
        className={cn(
          "relative flex h-9 items-center gap-2 overflow-hidden rounded-2 border bg-surface-1 px-2.5 transition-colors",
          "focus-within:border-cobalt-bright",
          kind === "unknown" ? "border-input" : "border-cobalt-bright/60",
        )}
      >
        <span className="grid size-4 shrink-0 place-items-center text-ink-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.svg
              key={kind}
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn(
                "col-start-1 row-start-1 size-4",
                kind === "unknown" ? "text-ink-3" : "text-cobalt-bright",
              )}
              style={{ originX: 0.5, originY: 0.5 }}
              initial={motionSafe ? { scale: 0.6, opacity: 0 } : { opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.blink) }}
              transition={
                motionSafe
                  ? { ...springs.flick, opacity: { duration: durations.blink } }
                  : { duration: durations.fast }
              }
            >
              <path d={KIND_MARK[kind]} />
            </motion.svg>
          </AnimatePresence>
        </span>

        <input
          id={inputId}
          type="search"
          spellCheck={false}
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          aria-label={label ? undefined : ariaLabel}
          aria-describedby={hintId}
          onChange={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (hit) onOpen?.(hit);
            } else if (event.key === "Escape" && text !== "") {
              event.preventDefault();
              commit("");
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground outline-none placeholder:font-sans placeholder:text-sm placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
        />

        {text !== "" ? (
          <button
            type="button"
            aria-label="Clear the query"
            onClick={() => commit("")}
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              className="size-3 shrink-0"
            >
              <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
            </svg>
          </button>
        ) : null}

        {/* The sweep is the wait made visible. It runs at the same linear rate
            under reduced motion, because a delay you cannot see reads as a
            field that has stopped working. */}
        <AnimatePresence>
          {waiting && visible ? (
            <motion.span
              key={query}
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-cobalt-bright"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.blink) }}
              transition={{
                duration: Math.max(0.05, resolveDelayMs / 1000),
                ease: easings.linear,
              }}
            />
          ) : null}
        </AnimatePresence>
      </div>

      <span id={hintId} className="sr-only">
        {KIND_HINT[kind]}
      </span>

      {/* Height is measured, never reserved: the wrapper is 0 tall until a card
          exists and glides to whatever the card actually needs. */}
      <motion.div
        className="overflow-hidden"
        initial={{ height: 0 }}
        animate={{ height: showCard ? height : 0 }}
        transition={spring}
      >
        <AnimatePresence initial={false} mode="wait">
          {answer ? (
            <motion.section
              key={`${answer.query}:${hit ? hit.id : "none"}`}
              aria-labelledby={hit ? titleId : undefined}
              aria-label={hit ? undefined : "No record found"}
              ref={attachCard}
              initial={
                motionSafe
                  ? { opacity: 0, y: distances.step }
                  : { opacity: 0, y: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={spring}
              className="rounded-3 border border-hairline bg-surface-1 p-3"
            >
              {hit ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      id={titleId}
                      className="min-w-0 truncate text-sm font-medium"
                    >
                      {hit.title}
                    </h3>
                    <button
                      type="button"
                      onClick={() => onOpen?.(hit)}
                      className="flex h-7 shrink-0 items-center rounded-2 border border-input bg-surface-2 px-2.5 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      Open
                    </button>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-ink-3">
                    <MiddleTruncate text={hit.id} />
                  </p>
                  <dl className="mt-2.5 flex flex-col gap-1.5 border-t border-hairline pt-2.5">
                    {hit.rows.map((row, index) => (
                      <motion.div
                        key={row.label}
                        className="flex items-baseline justify-between gap-3"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{
                          duration: durations.fast,
                          ease: easings.enter,
                          delay: index * cascade(hit.rows.length),
                        }}
                      >
                        <dt className="min-w-0 truncate text-[11px] text-ink-3">
                          {row.label}
                        </dt>
                        <dd
                          className={cn(
                            "shrink-0 font-mono text-[11px] tabular-nums",
                            TONE[row.tone ?? "default"],
                          )}
                        >
                          {row.amount !== undefined
                            ? `${format(row.amount)} ${asset}`
                            : row.value}
                        </dd>
                      </motion.div>
                    ))}
                  </dl>
                </>
              ) : (
                <p className="flex items-baseline gap-2">
                  <span className="shrink-0 text-sm font-medium text-ink-2">
                    No record
                  </span>
                  <span className="min-w-0 flex-1 font-mono text-[11px] text-ink-3">
                    <MiddleTruncate text={answer.query} />
                  </span>
                </p>
              )}
            </motion.section>
          ) : null}
        </AnimatePresence>
      </motion.div>

      <span role="status" className="sr-only">
        {showCard
          ? hit
            ? `${KIND_WORD[hit.kind]} resolved. ${hit.title}.`
            : "Nothing found for that query."
          : ""}
      </span>
    </div>
  );
}
