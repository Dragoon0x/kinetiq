"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ExpandLevel = "debug" | "info" | "warn" | "error";

export type LogField = {
  key: string;
  value: string;
  /** Masked until the reveal is pressed — in the JSON view too. */
  secret?: boolean;
};

export type LogEntry = {
  /** Already formatted by the host — the component never reads a clock. */
  time: string;
  level: ExpandLevel;
  service: string;
  message: string;
  fields: LogField[];
};

export type LogExpandView = "fields" | "json";

export type LogExpandProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The line and everything behind it. */
  entry: LogEntry;
  /** Controlled disclosure state. */
  open?: boolean;
  /** Initial disclosure state for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  /** Fires from the summary press and from Escape. */
  onOpenChange?: (open: boolean) => void;
  /** Controlled body view. */
  view?: LogExpandView;
  /** Initial body view for uncontrolled usage. @default "fields" */
  defaultView?: LogExpandView;
  /** Fires from the view toggle. */
  onViewChange?: (view: LogExpandView) => void;
  /** Fires when the masked field is shown or hidden again. */
  onRevealChange?: (revealed: boolean) => void;
  /** The sentence the polite region just spoke. */
  onAnnounce?: (sentence: string) => void;
  className?: string;
};

const TONES: Record<ExpandLevel, { tag: string; word: string; text: string }> =
  {
    debug: { tag: "DBG", word: "Debug", text: "text-ink-3" },
    info: { tag: "INF", word: "Info", text: "text-cobalt-bright" },
    warn: { tag: "WRN", word: "Warn", text: "text-warn" },
    error: { tag: "ERR", word: "Error", text: "text-danger" },
  };

const VIEWS: LogExpandView[] = ["fields", "json"];

const VIEW_WORDS: Record<LogExpandView, string> = {
  fields: "Fields",
  json: "JSON",
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const countPhrase = (count: number, noun: string): string =>
  `${count} ${count === 1 ? noun : `${noun}s`}`;

const sentenceCase = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** Only adds the stop the message does not already carry. */
const stop = (text: string): string =>
  /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;

/** The mask is a fixed run of dots: its length must not leak the real one. */
const MASK = "••••••••••••";

const shownValue = (field: LogField, revealed: boolean): string =>
  field.secret && !revealed ? MASK : field.value;

/**
 * One log line, and everything behind it. Collapsed it is a single row — time,
 * level, service, message — and pressing it opens the panel in flow, never
 * positioned outside the component's own box, against a height a
 * ResizeObserver measured from the content's own border box and joined on
 * `glide`. The clip is `overflow-clip [contain:paint]` rather than a hidden
 * overflow, because a log line is a wide row and a hidden overflow is still a
 * scroll container whose content reaches the page.
 *
 * Inside, the fields are a real `<dl>` key-value grid and the JSON is the same
 * record printed whole. The two views cross-fade — the one leaving is taken out
 * of flow so the panel's height is always the height of what you are actually
 * reading, and no room is held for the taller of the two. A field marked secret
 * prints as a fixed run of dots in both views and stays that way until the
 * explicit reveal, which says so out loud. The chevron turns a quarter on
 * `snap`, the one crisp overshoot in the component.
 *
 * The summary is a real disclosure with `aria-expanded`, `aria-controls` and a
 * one-sentence name; a folded body is inert and hidden from assistive
 * technology rather than merely clipped. The view toggle is a radio group with
 * a roving tabindex, and Escape closes the panel from wherever focus actually
 * is, returning it to the summary. Under reduced motion the panel still opens
 * and every field still shows, but the height swaps in one step and the views
 * change without the fade.
 */
export function LogExpand({
  ref,
  entry,
  open,
  defaultOpen = false,
  onOpenChange,
  view,
  defaultView = "fields",
  onViewChange,
  onRevealChange,
  onAnnounce,
  className,
}: LogExpandProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const bodyId = `${baseId}-body`;
  const summaryId = `${baseId}-summary`;
  const summaryRef = React.useRef<HTMLButtonElement | null>(null);
  const [panel, setPanel] = React.useState<HTMLDivElement | null>(null);
  const [content, setContent] = React.useState<number | null>(null);

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = open ?? ownOpen;
  const [ownView, setOwnView] = React.useState<LogExpandView>(defaultView);
  const activeView = view ?? ownView;
  const [revealed, setRevealed] = React.useState(false);

  const tone = TONES[entry.level];
  const secret = entry.fields.find((field) => field.secret);
  const secretWord = secret
    ? sentenceCase(secret.key.split(".").slice(-1).join(""))
    : "Secret";

  const json = React.useMemo(() => {
    const rows = [
      `  "time": ${JSON.stringify(entry.time)}`,
      `  "level": ${JSON.stringify(entry.level)}`,
      `  "service": ${JSON.stringify(entry.service)}`,
      `  "message": ${JSON.stringify(entry.message)}`,
      ...entry.fields.map(
        (field) =>
          `  ${JSON.stringify(field.key)}: ${JSON.stringify(shownValue(field, revealed))}`,
      ),
    ];
    return `{\n${rows.join(",\n")}\n}`;
  }, [entry, revealed]);

  React.useEffect(() => {
    if (!panel || typeof ResizeObserver === "undefined") return;
    // The observer also delivers the first measurement, which is why nothing
    // sets state in the effect body itself.
    const observer = new ResizeObserver(() => {
      const next = Math.ceil(panel.getBoundingClientRect().height);
      setContent((prev) => (prev === next ? prev : next));
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [panel]);

  const height = useMotionValue<number | string>(
    (open ?? defaultOpen) ? "auto" : 0,
  );
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (content === null) return;
    const target = isOpen ? content : 0;
    // The first measurement is written outright, or the row would fold itself
    // on the frame it mounts.
    if (!seeded.current) {
      seeded.current = true;
      height.set(target);
      return;
    }
    const controls = animate(
      height,
      target,
      motionSafe ? springs.glide : { duration: 0 },
    );
    return () => controls.stop();
  }, [content, isOpen, height, motionSafe]);

  // Every sentence is frozen from the settled values during the render that
  // carries them, so a controlled host is never announced ahead of its answer
  // and the region speaks the new reading rather than the one it replaced.
  const signature = `${isOpen}|${activeView}|${revealed}`;
  const [spoken, setSpoken] = React.useState({
    signature,
    sentence: "",
    stamp: 0,
  });
  if (spoken.signature !== signature) {
    const parts = spoken.signature.split("|");
    const sentence =
      parts[0] !== String(isOpen)
        ? isOpen
          ? `Line opened, ${countPhrase(entry.fields.length, "field")}.`
          : "Line closed."
        : parts[1] !== activeView
          ? `Showing ${VIEW_WORDS[activeView].toLowerCase()}.`
          : `${secretWord} ${revealed ? "shown" : "hidden"}.`;
    setSpoken({ signature, sentence, stamp: spoken.stamp + 1 });
  }

  const announceRef = React.useRef(onAnnounce);
  React.useEffect(() => {
    announceRef.current = onAnnounce;
  });
  React.useEffect(() => {
    if (spoken.sentence) announceRef.current?.(spoken.sentence);
  }, [spoken.stamp, spoken.sentence]);

  const setOpen = (next: boolean) => {
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  const pickView = (next: LogExpandView) => {
    if (next !== activeView && view === undefined) setOwnView(next);
    if (next !== activeView) onViewChange?.(next);
    document.getElementById(`${baseId}-view-${next}`)?.focus();
  };

  const onViewKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0 && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const at =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? VIEWS.length - 1
          : Math.min(VIEWS.length - 1, Math.max(0, index + step));
    const next = VIEWS[at];
    if (next) pickView(next);
  };

  const summarySentence = `${tone.word}, ${entry.service}, ${entry.time}. ${stop(entry.message)} ${countPhrase(entry.fields.length, "field")}.`;
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const swap = motionSafe ? fade : { duration: 0 };

  return (
    <div
      ref={ref}
      // Escape is handled here rather than inside the panel, so it works
      // wherever focus actually is when the reader reaches for it.
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !isOpen) return;
        event.preventDefault();
        setOpen(false);
        summaryRef.current?.focus();
      }}
      className={cn(
        "w-full rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <button
        ref={summaryRef}
        type="button"
        id={summaryId}
        aria-expanded={isOpen}
        aria-controls={bodyId}
        aria-label={summarySentence}
        title={entry.message}
        onClick={() => setOpen(!isOpen)}
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-3 px-2 text-left transition-colors hover:bg-accent",
          focusRing,
        )}
      >
        <span
          aria-hidden
          className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums"
        >
          {entry.time}
        </span>
        <span
          aria-hidden
          className={cn(
            "shrink-0 font-mono text-[11px] font-semibold",
            tone.text,
          )}
        >
          {tone.tag}
        </span>
        <span
          aria-hidden
          className="min-w-0 shrink truncate font-mono text-[11px] text-ink-2"
        >
          {entry.service}
        </span>
        <span
          aria-hidden
          className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink"
        >
          {entry.message}
        </span>
        <motion.span
          aria-hidden
          className="shrink-0 text-ink-3"
          initial={false}
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
          style={{ originX: 0.5, originY: 0.5 }}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <path d="m6.5 3.5 5 4.5-5 4.5" />
          </svg>
        </motion.span>
      </button>

      <motion.div
        id={bodyId}
        role="region"
        aria-labelledby={summaryId}
        style={{ height }}
        aria-hidden={!isOpen}
        // `inert` as well as `aria-hidden`: a folded body must be out of reach
        // of the pointer and of programmatic focus, not merely clipped.
        inert={!isOpen}
        // `overflow-clip` rather than `hidden`: a hidden overflow is still a
        // scroll container, and a wide log row must not make one.
        className="overflow-clip [contain:paint]"
      >
        <div ref={setPanel} className="flex flex-col gap-2 px-2 pt-1.5 pb-2">
          <div className="flex items-center gap-2">
            <div
              role="radiogroup"
              aria-label="Body view"
              className="flex h-7 items-center gap-1 rounded-2 border border-hairline p-0.5"
            >
              {VIEWS.map((one, index) => {
                const on = one === activeView;
                return (
                  <button
                    key={one}
                    type="button"
                    role="radio"
                    id={`${baseId}-view-${one}`}
                    aria-checked={on}
                    tabIndex={on ? 0 : -1}
                    onClick={() => pickView(one)}
                    onKeyDown={(event) => onViewKeyDown(event, index)}
                    className={cn(
                      "relative flex h-6 items-center rounded-1 px-2 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors",
                      on ? "text-ink" : "text-ink-3 hover:text-ink-2",
                      focusRing,
                    )}
                  >
                    {on && (
                      <motion.span
                        aria-hidden
                        layoutId={`${baseId}-view-pill`}
                        transition={motionSafe ? springs.snap : { duration: 0 }}
                        className="absolute inset-0 rounded-1 bg-accent"
                      />
                    )}
                    <span className="relative">{VIEW_WORDS[one]}</span>
                  </button>
                );
              })}
            </div>

            {secret && (
              <button
                type="button"
                aria-pressed={revealed}
                aria-label={`${revealed ? "Hide" : "Show"} ${secret.key}.`}
                onClick={() => {
                  setRevealed(!revealed);
                  onRevealChange?.(!revealed);
                }}
                className={cn(
                  "ml-auto flex h-7 shrink-0 items-center rounded-2 border border-hairline-strong px-2 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors hover:bg-accent",
                  revealed ? "text-ink" : "text-ink-3",
                  focusRing,
                )}
              >
                {revealed ? "Hide" : "Reveal"}
              </button>
            )}
          </div>

          {/* The view leaving is taken out of flow, so the measured height is
              always the height of what is actually being read. */}
          <div className="relative">
            <motion.dl
              aria-hidden={activeView !== "fields"}
              className={cn(
                "grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1",
                activeView === "fields"
                  ? "relative"
                  : "pointer-events-none absolute inset-x-0 top-0",
              )}
              initial={false}
              animate={{ opacity: activeView === "fields" ? 1 : 0 }}
              transition={swap}
            >
              {entry.fields.map((field) => (
                <React.Fragment key={field.key}>
                  <dt className="font-mono text-[11px] text-ink-3">
                    {field.key}
                  </dt>
                  <dd
                    className={cn(
                      "min-w-0 font-mono text-[11px] break-words",
                      field.secret && !revealed ? "text-ink-3" : "text-ink",
                    )}
                  >
                    {shownValue(field, revealed)}
                  </dd>
                </React.Fragment>
              ))}
            </motion.dl>

            <motion.pre
              aria-hidden={activeView !== "json"}
              className={cn(
                "rounded-2 border border-hairline bg-surface-0 p-2 font-mono text-[11px] leading-[1.5] break-words whitespace-pre-wrap text-ink",
                activeView === "json"
                  ? "relative"
                  : "pointer-events-none absolute inset-x-0 top-0",
              )}
              initial={false}
              animate={{ opacity: activeView === "json" ? 1 : 0 }}
              transition={swap}
            >
              {json}
            </motion.pre>
          </div>
        </div>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.sentence}
      </span>
    </div>
  );
}
