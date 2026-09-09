"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PullQuote = {
  id: string;
  /** The exact words, as they appear in the source. */
  text: string;
};

export type PullSource = {
  title: string;
  /** Where it lives, printed in mono. */
  site: string;
  /** The passage searched for each quote's words. */
  excerpt: string;
};

export type QuotePullProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The answer as plain runs and quoted passages, in reading order. */
  answer: (string | PullQuote)[];
  /** The source the quotes are pulled from. */
  source: PullSource;
  /** Controlled id of the quote held highlighted. */
  pinned?: string | null;
  /** Initial pinned quote for uncontrolled usage. @default null */
  defaultPinned?: string | null;
  /** Fires from the press that pinned or released a quote. */
  onPinnedChange?: (id: string | null) => void;
  /** Fires when hover or focus starts or ends a highlight, null when it ends. */
  onActiveChange?: (id: string | null) => void;
  /** Names the answer region for assistive technology. */
  label: string;
  className?: string;
};

type Run = { key: string; text: string; quoteId?: string };

/** Marker strength at full presence: amber at highlighter weight on either surface. */
const MARKER_PERCENT = 35;

/**
 * Splits the excerpt into plain runs and quoted runs. Quotes are matched
 * exactly, then without case; an overlap with an earlier match counts as not
 * found, because two highlights cannot share the same words honestly.
 */
function splitExcerpt(excerpt: string, quotes: PullQuote[]) {
  const lower = excerpt.toLowerCase();
  const found = quotes
    .map((quote) => {
      const exact = excerpt.indexOf(quote.text);
      const start =
        exact >= 0 ? exact : lower.indexOf(quote.text.toLowerCase());
      return { id: quote.id, start, end: start + quote.text.length };
    })
    .filter((hit) => hit.start >= 0)
    .sort((a, b) => a.start - b.start);

  const runs: Run[] = [];
  const foundIds = new Set<string>();
  let cursor = 0;
  for (const hit of found) {
    if (hit.start < cursor) continue;
    if (hit.start > cursor) {
      runs.push({ key: `t${cursor}`, text: excerpt.slice(cursor, hit.start) });
    }
    runs.push({
      key: `q${hit.id}`,
      text: excerpt.slice(hit.start, hit.end),
      quoteId: hit.id,
    });
    foundIds.add(hit.id);
    cursor = hit.end;
  }
  if (cursor < excerpt.length) {
    runs.push({ key: `t${cursor}`, text: excerpt.slice(cursor) });
  }
  return { runs, foundIds };
}

/**
 * The marker behind one quoted run. Its `background-size` runs 0% to 100% on
 * `glide` from a motion value, so a passage that wraps keeps sweeping onto
 * its next line instead of bursting in per line. Under reduced motion the
 * size lands at 100% at once and only the opacity moves.
 */
function Highlight({
  on,
  motionSafe,
  children,
}: {
  on: boolean;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  const sweep = useMotionValue(0);
  const presence = useMotionValue(0);
  const backgroundSize = useTransform(
    sweep,
    (value) => `${Number((value * 100).toFixed(3))}% 100%`,
  );
  const backgroundImage = useTransform(presence, (value) => {
    const percent = Number((value * MARKER_PERCENT).toFixed(3));
    const colour = `color-mix(in oklab, var(--color-warn) ${percent}%, transparent)`;
    return `linear-gradient(${colour}, ${colour})`;
  });

  React.useEffect(() => {
    const target = on ? 1 : 0;
    const controls = [
      animate(sweep, target, motionSafe ? springs.glide : { duration: 0 }),
      animate(presence, target, {
        duration: motionSafe ? durations.blink : durations.fast,
        ease: easings.enter,
      }),
    ];
    return () => controls.forEach((control) => control.stop());
  }, [on, motionSafe, sweep, presence]);

  return (
    <motion.mark
      style={{
        backgroundSize,
        backgroundImage,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "0 0",
      }}
      className="rounded-1 bg-transparent [box-decoration-break:slice] text-inherit"
    >
      {children}
    </motion.mark>
  );
}

/**
 * The exact words, highlighted where they came from. Each quoted passage in
 * the answer takes the button role; hovering or focusing it finds those words in the
 * source excerpt below and sweeps a marker in behind them on `glide` while
 * the text around them dims to 45% on a base tween, so the eye lands on the
 * quoted words. Leaving sweeps the marker back out. Pressing pins the quote
 * so its highlight holds; Escape or a second press releases it. A quote the
 * excerpt does not contain gets a dashed danger underline and a "not in
 * source" note instead of a highlight, because a quote that cannot be found
 * is a claim.
 *
 * Each quote is an inline element with the button role wrapping a `<q>` —
 * a real button is an atomic box that could not wrap with the sentence —
 * described by whether it was found; Tab reaches each, Enter or Space pins,
 * Escape releases. The live region reads a pin or release once. Under
 * reduced motion the marker appears at full width on a fast opacity tween
 * and the dimming is the same tween.
 */
export function QuotePull({
  ref,
  answer,
  source,
  pinned: pinnedProp,
  defaultPinned = null,
  onPinnedChange,
  onActiveChange,
  label,
  className,
}: QuotePullProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const titleId = `${baseId}-title`;

  const [ownPinned, setOwnPinned] = React.useState(defaultPinned);
  const pinned = pinnedProp === undefined ? ownPinned : pinnedProp;
  const [active, setActive] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const quotes = React.useMemo(
    () => answer.filter((part): part is PullQuote => typeof part !== "string"),
    [answer],
  );
  const { runs, foundIds } = React.useMemo(
    () => splitExcerpt(source.excerpt, quotes),
    [source.excerpt, quotes],
  );
  const missing = quotes.filter((quote) => !foundIds.has(quote.id));

  const start = (id: string) => {
    if (id === active) return;
    setActive(id);
    onActiveChange?.(id);
  };
  const end = () => {
    if (active === null) return;
    setActive(null);
    onActiveChange?.(null);
  };

  const commitPin = (next: string | null, words: string) => {
    if (pinnedProp === undefined) setOwnPinned(next);
    onPinnedChange?.(next);
    setAnnouncement(words);
  };
  const togglePin = (quote: PullQuote) => {
    if (pinned === quote.id) {
      commitPin(null, "Quote released");
      return;
    }
    const words = quote.text.split(/\s+/).length;
    commitPin(
      quote.id,
      foundIds.has(quote.id)
        ? `Quote pinned, ${words} words in ${source.title}`
        : `Quote pinned, not found in ${source.title}`,
    );
  };

  const lit = new Set([active, pinned].filter((id): id is string => !!id));
  const anyLit = runs.some((run) => run.quoteId && lit.has(run.quoteId));
  const dim = { duration: durations.base, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      role="region"
      aria-labelledby={labelId}
      className={cn("flex w-full flex-col gap-3", className)}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>

      <p onPointerLeave={end} className="text-sm leading-relaxed text-ink">
        {answer.map((part, index) => {
          if (typeof part === "string") {
            return <React.Fragment key={index}>{part}</React.Fragment>;
          }
          const found = foundIds.has(part.id);
          const isPinned = pinned === part.id;
          const isLit = lit.has(part.id);
          return (
            // A real button is an atomic inline box, so a passage of any
            // length would drop to its own line; an inline span with the
            // button role wraps with the sentence and takes the same keys.
            <span
              key={index}
              role="button"
              tabIndex={0}
              aria-pressed={isPinned}
              aria-describedby={`${baseId}-desc-${part.id}`}
              onPointerEnter={() => start(part.id)}
              onFocus={() => start(part.id)}
              onBlur={end}
              onClick={() => togglePin(part)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  togglePin(part);
                } else if (event.key === "Escape" && isPinned) {
                  event.preventDefault();
                  togglePin(part);
                }
              }}
              className={cn(
                "-mx-0.5 cursor-pointer rounded-1 [box-decoration-break:clone] px-0.5 underline decoration-1 underline-offset-4 transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                found
                  ? isLit
                    ? "bg-warn/15 decoration-warn decoration-solid"
                    : "decoration-ink-3 decoration-dotted hover:decoration-ink"
                  : "decoration-danger decoration-dashed",
              )}
            >
              <q>{part.text}</q>
            </span>
          );
        })}
      </p>

      <article
        aria-labelledby={titleId}
        className="rounded-2 border border-hairline bg-surface-1 px-3 py-2.5"
      >
        <p className="flex min-w-0 items-baseline justify-between gap-3">
          <span
            id={titleId}
            className="min-w-0 truncate text-sm font-medium text-ink"
          >
            {source.title}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-ink-3">
            {source.site}
          </span>
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-2">
          {runs.map((run) =>
            run.quoteId ? (
              <Highlight
                key={run.key}
                on={lit.has(run.quoteId)}
                motionSafe={motionSafe}
              >
                {run.text}
              </Highlight>
            ) : (
              <motion.span
                key={run.key}
                initial={false}
                animate={{ opacity: anyLit ? 0.45 : 1 }}
                transition={dim}
              >
                {run.text}
              </motion.span>
            ),
          )}
        </p>
        {missing.length > 0 ? (
          <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-danger">
            {missing.length} of {quotes.length} quotes not in this excerpt
          </p>
        ) : null}
      </article>

      {quotes.map((quote) => (
        <span
          key={quote.id}
          id={`${baseId}-desc-${quote.id}`}
          className="sr-only"
        >
          {foundIds.has(quote.id)
            ? `Found in ${source.title}.`
            : `Not found in ${source.title}.`}
          {pinned === quote.id ? " Pinned." : ""}
        </span>
      ))}

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
