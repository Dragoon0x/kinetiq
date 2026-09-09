"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TemplateFillProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** A sentence with `{key}` or `{key: placeholder words}` blanks. */
  template: string;
  /** Controlled values by key. */
  values?: Record<string, string>;
  /** Initial values for uncontrolled usage. */
  defaultValues?: Record<string, string>;
  onValuesChange?: (values: Record<string, string>) => void;
  /** Fires from Enter or blur on a blank whose value changed since its last commit. */
  onCommit?: (key: string, value: string) => void;
  /** Fires from the Use button with the composed prompt. */
  onUse?: (prompt: string) => void;
  /** The button's copy. @default "Use prompt" */
  useLabel?: string;
  /** Names the group. */
  label: string;
  className?: string;
};

type Segment =
  | { kind: "text"; text: string }
  | { kind: "blank"; key: string; placeholder: string };

const BLANK = /\{([^{}:]+)(?::([^{}]*))?\}/g;

const parse = (template: string): Segment[] => {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of template.matchAll(BLANK)) {
    const at = match.index ?? 0;
    if (at > last) {
      segments.push({ kind: "text", text: template.slice(last, at) });
    }
    const key = (match[1] ?? "").trim();
    segments.push({
      kind: "blank",
      key,
      placeholder: (match[2] ?? key).trim(),
    });
    last = at + match[0].length;
  }
  if (last < template.length) {
    segments.push({ kind: "text", text: template.slice(last) });
  }
  return segments;
};

/** The template with its blanks filled; an empty blank prints as its placeholder in brackets. */
export const composePrompt = (
  template: string,
  values: Record<string, string>,
): string =>
  parse(template)
    .map((segment) =>
      segment.kind === "text"
        ? segment.text
        : (values[segment.key] ?? "").trim() || `[${segment.placeholder}]`,
    )
    .join("");

const NO_VALUES: Record<string, string> = {};
/** A blank never shrinks past a caret's worth of room. */
const MIN_WIDTH = 28;

type BlankProps = {
  id: string;
  name: string;
  placeholder: string;
  value: string;
  focused: boolean;
  ringId: string;
  motionSafe: boolean;
  inputRef: (node: HTMLInputElement | null) => void;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onEnter: () => void;
};

/**
 * One blank. A hidden mirror carries the value or the placeholder in the
 * input's own type, and its observed width is the width the wash glides to —
 * so a filled blank tightens to the word and an emptied one opens back up.
 */
function Blank({
  id,
  name,
  placeholder,
  value,
  focused,
  ringId,
  motionSafe,
  inputRef,
  onChange,
  onFocus,
  onBlur,
  onEnter,
}: BlankProps) {
  const mirrorRef = React.useRef<HTMLSpanElement | null>(null);
  const [width, setWidth] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = mirrorRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setWidth(Math.max(MIN_WIDTH, Math.ceil(node.offsetWidth))),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const filled = value.trim().length > 0;
  const ringClass =
    "pointer-events-none absolute -inset-0.5 rounded-2 border-2 border-cobalt-bright";

  return (
    <span className="relative inline-flex align-baseline">
      {focused ? (
        motionSafe ? (
          <motion.span
            aria-hidden
            layoutId={ringId}
            transition={springs.snap}
            className={ringClass}
          />
        ) : (
          <span aria-hidden className={ringClass} />
        )
      ) : null}
      <motion.span
        initial={false}
        animate={{ width: width ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className={cn(
          "relative inline-flex h-7 items-center overflow-hidden rounded-1 border-b-2 transition-colors",
          filled
            ? "border-cobalt-bright bg-cobalt-wash/50"
            : "border-cobalt-bright/40 bg-cobalt-wash",
        )}
      >
        <span
          ref={mirrorRef}
          aria-hidden
          className="invisible absolute top-0 left-0 px-1.5 text-sm font-medium whitespace-pre"
        >
          {value || placeholder}
        </span>
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          placeholder={placeholder}
          aria-label={name}
          autoComplete="off"
          size={1}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onEnter();
            }
          }}
          className="w-full min-w-0 bg-transparent px-1.5 text-sm font-medium text-foreground outline-none placeholder:font-normal placeholder:text-cobalt-bright/80"
        />
      </motion.span>
    </span>
  );
}

/**
 * A prompt with blanks to fill. The template's blanks are real inline inputs
 * on a wash, each sized by a mirror so its width glides on `glide` from the
 * placeholder's width to the typed word's — filling a blank collapses its
 * placeholder. One `layoutId` ring travels to whichever blank has focus on
 * `snap`, so Tab and Shift+Tab move it with no handling of their own, and
 * Enter commits a blank and carries focus to the next. Beneath, the composed
 * prompt previews with filled values cross-faded to ink and empty blanks left
 * as dashed slots, a count chip reads the progress, and the Use button arms
 * when the last blank is filled.
 *
 * Commits announce on settle — "tone filled: plain. 1 of 4 filled." — never
 * per keystroke. Under reduced motion the ring swaps to the focused blank, the
 * widths move on a tween and the preview fades.
 */
export function TemplateFill({
  ref,
  template,
  values,
  defaultValues,
  onValuesChange,
  onCommit,
  onUse,
  useLabel = "Use prompt",
  label,
  className,
}: TemplateFillProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const ringId = `${baseId}-ring`;

  const segments = React.useMemo(() => parse(template), [template]);
  const blanks = React.useMemo(
    () =>
      segments.flatMap((segment, index) =>
        segment.kind === "blank" ? [{ ...segment, index }] : [],
      ),
    [segments],
  );

  const [uncontrolled, setUncontrolled] = React.useState<
    Record<string, string>
  >(defaultValues ?? NO_VALUES);
  const current = values ?? uncontrolled;
  const [focusedIndex, setFocusedIndex] = React.useState<number | null>(null);
  const [announce, setAnnounce] = React.useState("");
  const inputs = React.useRef<(HTMLInputElement | null)[]>([]);
  const useButtonRef = React.useRef<HTMLButtonElement | null>(null);
  // What each key last committed as, so tabbing through unchanged blanks
  // stays silent.
  const committed = React.useRef<Record<string, string>>({});

  const valueOf = (key: string) => current[key] ?? "";
  const filledCount = blanks.filter((blank) =>
    valueOf(blank.key).trim(),
  ).length;
  const total = blanks.length;
  const complete = total > 0 && filledCount === total;
  const prompt = composePrompt(template, current);

  const change = (key: string, next: string) => {
    const merged = { ...current, [key]: next };
    if (values === undefined) setUncontrolled(merged);
    onValuesChange?.(merged);
  };

  const commit = (position: number) => {
    const blank = blanks[position];
    if (!blank) return;
    const value = valueOf(blank.key).trim();
    if (committed.current[blank.key] === value) return;
    committed.current[blank.key] = value;
    const count = `${filledCount} of ${total} filled.`;
    setAnnounce(
      value
        ? `${blank.placeholder} filled: ${value}. ${count}`
        : `${blank.placeholder} cleared. ${count}`,
    );
    onCommit?.(blank.key, value);
  };

  const advance = (position: number) => {
    commit(position);
    const next = inputs.current[position + 1];
    if (next) next.focus();
    else if (complete) useButtonRef.current?.focus();
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={labelId}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[11px] tabular-nums">
          <motion.span
            key={filledCount}
            className="inline-block text-signal"
            initial={motionSafe ? { y: -6, opacity: 0 } : { opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={motionSafe ? springs.snap : fade}
          >
            {filledCount}
          </motion.span>
          <span className="text-ink-3">/ {total} filled</span>
        </span>
      </div>

      <p className="text-sm leading-8 text-ink-2">
        {segments.map((segment, index) => {
          if (segment.kind === "text") {
            return (
              <React.Fragment key={`t-${index}`}>{segment.text}</React.Fragment>
            );
          }
          const position = blanks.findIndex((blank) => blank.index === index);
          return (
            <Blank
              key={`b-${index}`}
              id={`${baseId}-blank-${index}`}
              name={segment.placeholder}
              placeholder={segment.placeholder}
              value={valueOf(segment.key)}
              focused={focusedIndex === position}
              ringId={ringId}
              motionSafe={motionSafe}
              inputRef={(node) => {
                inputs.current[position] = node;
              }}
              onChange={(next) => change(segment.key, next)}
              onFocus={() => setFocusedIndex(position)}
              onBlur={() => {
                setFocusedIndex((prev) => (prev === position ? null : prev));
                commit(position);
              }}
              onEnter={() => advance(position)}
            />
          );
        })}
      </p>

      <div className="flex flex-col gap-3 border-t border-hairline pt-3">
        <p className="text-sm leading-6 text-ink-2">
          {segments.map((segment, index) => {
            if (segment.kind === "text") {
              return (
                <React.Fragment key={`p-${index}`}>
                  {segment.text}
                </React.Fragment>
              );
            }
            const value = valueOf(segment.key).trim();
            const filled = value.length > 0;
            return (
              // Keyed by state, not by value: the span fades in once when the
              // blank fills or empties, and holds still while the word is typed.
              <motion.span
                key={`q-${index}-${filled ? "v" : "p"}`}
                className={
                  filled
                    ? "font-medium text-foreground"
                    : "border-b border-dashed border-hairline-strong text-ink-3"
                }
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={fade}
              >
                {filled ? value : segment.placeholder}
              </motion.span>
            );
          })}
        </p>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] text-ink-3 tabular-nums">
            {prompt.length} chars
          </span>
          <button
            ref={useButtonRef}
            type="button"
            aria-disabled={!complete || undefined}
            onClick={() => {
              if (complete) onUse?.(prompt);
            }}
            className={cn(
              "flex h-8 shrink-0 items-center rounded-2 px-3 text-xs font-medium transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              complete
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "border border-hairline-strong bg-surface-2 text-ink-3",
            )}
          >
            {useLabel}
          </button>
        </div>
      </div>

      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
