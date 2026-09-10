"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SummaryStripProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The current summary. A new value wipes the old one and types itself. */
  summary: string;
  /** How many messages this reading covers. */
  covers?: number;
  /** The host is writing a new one; the strip sweeps and reads busy. */
  refreshing?: boolean;
  /** Milliseconds per character. @default 18 */
  typeSpeed?: number;
  /** Fires from the refresh control. */
  onRefresh?: () => void;
  /** Fires once, from an effect, when a summary finishes typing. */
  onSettle?: (text: string) => void;
  /** The strip's small heading. @default "Summary" */
  label?: string;
  /** The control's spoken name. @default "Write the summary again" */
  refreshLabel?: string;
  className?: string;
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** One string per reading: no doubled full stop, no "1 messages". */
const settleSentence = (text: string, covers?: number): string => {
  const body = text.trim();
  const tail = /[.!?]$/.test(body) ? "" : ".";
  const from =
    covers === undefined
      ? ""
      : ` From ${covers} ${covers === 1 ? "message" : "messages"}.`;
  return `Summary updated. ${body}${tail}${from}`;
};

const coversLabel = (covers: number): string =>
  `From ${covers} ${covers === 1 ? "message" : "messages"}`;

/** Keeps a callback out of effect dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
const getServerVisible = () => true;

/**
 * The gist of a long thread, sitting above it. A new summary types itself from
 * an effect with cleanup that holds where it stands while the tab is hidden,
 * with a caret beside the last character; the first summary renders whole, so
 * the first client render matches the markup the server sent. The rest of the
 * incoming sentence is laid out invisibly ahead of the caret, which is what
 * keeps the strip's box still while the words arrive instead of growing a line
 * at a time.
 *
 * Refreshing does not fade the old line away: it is wiped left to right by an
 * animated `clipPath` on the exit ease, which accelerates rather than springs,
 * and because the outgoing node keeps the text it last drew the wipe erases the
 * real sentence rather than an empty box. While the host is writing, a hairline
 * sweeps the strip on a looping linear tween — the honest reading of an unknown
 * wait — and the refresh arrow turns one full turn per press on `glide`, driven
 * from a counter so it is exactly two keyframes.
 *
 * Summaries are not all one length, so a ResizeObserver measures the content
 * and the strip's height joins it on `glide`; no room is reserved for a line
 * that has not been written. While it types the strip is `aria-busy` and its
 * text is hidden from assistive technology, and on settle a status region says
 * the whole sentence once. Under reduced motion the summary arrives whole, the
 * old line cross-fades instead of wiping and the sweep holds steady — but every
 * word still lands, because the words are the information.
 */
export function SummaryStrip({
  ref,
  summary,
  covers,
  refreshing = false,
  typeSpeed = 18,
  onRefresh,
  onSettle,
  label = "Summary",
  refreshLabel = "Write the summary again",
  className,
}: SummaryStripProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const textId = `${baseId}-text`;
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  // The first summary is already whole: typing plays on changes after mount,
  // which is also what keeps hydration honest.
  const [typed, setTyped] = React.useState(() => ({
    source: summary,
    shown: summary.length,
    previous: "",
    stamp: 0,
  }));
  if (typed.source !== summary) {
    setTyped({
      source: summary,
      shown: motionSafe ? 0 : summary.length,
      previous: typed.source,
      stamp: typed.stamp + 1,
    });
  }

  const settled = typed.shown >= typed.source.length;

  React.useEffect(() => {
    if (settled || !visible) return;
    const id = window.setTimeout(() => {
      setTyped((current) => ({
        ...current,
        shown: Math.min(current.source.length, current.shown + 1),
      }));
    }, typeSpeed);
    return () => window.clearTimeout(id);
  }, [settled, visible, typeSpeed, typed.shown, typed.stamp]);

  // The sentence is frozen the moment the line settles, so it belongs to that
  // reading and is spoken once.
  const [spoken, setSpoken] = React.useState({
    stamp: 0,
    sentence: "",
    text: "",
  });
  if (settled && spoken.stamp !== typed.stamp) {
    setSpoken({
      stamp: typed.stamp,
      sentence: settleSentence(typed.source, covers),
      text: typed.source,
    });
  }

  const settleRef = useLatest(onSettle);
  React.useEffect(() => {
    // Keyed on the frozen reading, never on the incoming prop: a summary that
    // has only just arrived has not settled yet.
    if (spoken.stamp === 0) return;
    settleRef.current?.(spoken.text);
  }, [spoken.stamp, spoken.text, settleRef]);

  // The strip measures its own content, so a summary of any length lands
  // exactly and nothing reserves room for a line that is not there.
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [content, setContent] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      setContent((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const height = useMotionValue<number | string>("auto");
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (content === null) return;
    if (!seeded.current) {
      seeded.current = true;
      height.set(content);
      return;
    }
    const controls = animate(
      height,
      content,
      motionSafe ? springs.glide : { duration: 0 },
    );
    return () => controls.stop();
  }, [content, height, motionSafe]);

  const [turns, setTurns] = React.useState(0);
  const press = () => {
    if (refreshing) return;
    setTurns((count) => count + 1);
    onRefresh?.();
  };

  const shownText = typed.source.slice(0, typed.shown);
  const restText = typed.source.slice(typed.shown);

  return (
    <div
      ref={ref}
      aria-busy={refreshing || !settled}
      className={cn(
        "relative w-full rounded-3 border border-hairline bg-surface-1 px-3 py-2.5",
        className,
      )}
    >
      {/* The sweep runs past both edges, so it gets its own clipping box rather
          than clipping the strip — an outline on the control has to survive. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px overflow-clip [contain:paint]"
      >
        {refreshing ? (
          motionSafe ? (
            <motion.span
              className="block h-px w-2/5 bg-cobalt-bright"
              initial={{ x: "-45%" }}
              animate={{ x: "260%" }}
              transition={{
                duration: durations.page * 1.6,
                ease: easings.linear,
                repeat: Infinity,
              }}
            />
          ) : (
            // Reduced motion still shows that the host is working; it just
            // does not run the bar back and forth to say so.
            <span className="block h-px w-full bg-cobalt-bright" />
          )
        ) : null}
      </span>

      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium tracking-[0.08em] text-ink-3 uppercase">
          {label}
        </span>
        {covers !== undefined ? (
          <span className="truncate font-mono text-[10px] text-ink-3 tabular-nums">
            {coversLabel(covers)}
          </span>
        ) : null}
        <button
          type="button"
          aria-disabled={refreshing}
          aria-controls={textId}
          aria-label={refreshLabel}
          onClick={press}
          className={cn(
            "ml-auto grid size-7 shrink-0 place-items-center rounded-2 transition-colors",
            refreshing ? "text-ink-3" : "text-ink-2 hover:bg-accent",
            focusRing,
          )}
        >
          <motion.svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
            style={{ originX: 0.5, originY: 0.5 }}
            initial={false}
            animate={{ rotate: motionSafe ? turns * 360 : 0 }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          >
            <path d="M13.2 6.6A5.4 5.4 0 0 0 3.4 5.2" />
            <path d="M2.8 9.4a5.4 5.4 0 0 0 9.8 1.4" />
            <path d="M13.4 3.2v3.4H10" />
            <path d="M2.6 12.8V9.4H6" />
          </motion.svg>
        </button>
      </div>

      <motion.div style={{ height }} className="overflow-clip [contain:paint]">
        <div ref={innerRef} className="relative pt-1.5">
          {/* The outgoing line keeps the text it last drew, so the wipe erases
              a real sentence rather than an empty box. */}
          {typed.stamp > 0 ? (
            <motion.p
              key={typed.stamp}
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-1.5 text-sm leading-snug text-foreground"
              initial={
                motionSafe ? { clipPath: "inset(0% 0% 0% 0%)" } : { opacity: 1 }
              }
              animate={
                motionSafe
                  ? { clipPath: "inset(0% 0% 0% 100%)" }
                  : { opacity: 0 }
              }
              transition={exitFor()}
            >
              {typed.previous}
            </motion.p>
          ) : null}

          <p
            id={textId}
            aria-hidden={!settled}
            className="text-sm leading-snug text-foreground"
          >
            {shownText}
            {!settled && motionSafe ? (
              <motion.span
                aria-hidden
                className="ml-px inline-block h-[0.95em] w-px bg-cobalt-bright align-[-0.1em]"
                animate={{ opacity: [1, 0.15] }}
                transition={{
                  duration: durations.slow,
                  ease: easings.move,
                  repeat: Infinity,
                  repeatType: "reverse",
                }}
              />
            ) : null}
            {/* The rest of the sentence holds the box open while it is typed,
                so the strip's height glides once instead of once a line. */}
            {restText ? <span className="invisible">{restText}</span> : null}
          </p>
        </div>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.sentence}
      </span>
    </div>
  );
}
