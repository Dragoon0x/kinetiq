"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type StackSource = {
  id: string;
  /** The document or page the claim leans on. */
  title: string;
  /** Where it lives, printed in mono. */
  site: string;
  /** The passage the answer drew on. */
  excerpt: string;
};

export type SourceStackProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The answer; `[n]` cites `sources[n - 1]`. */
  text: string;
  /** Sources in citation order. */
  sources: StackSource[];
  /** Controlled id of the card kept in front. */
  value?: string;
  /** Initial front card for uncontrolled usage. @default the first source */
  defaultValue?: string;
  /** Fires from the press or arrow key that selected a source. */
  onValueChange?: (id: string) => void;
  /** Fires when hover or focus previews a card, and null when it ends. */
  onPreviewChange?: (id: string | null) => void;
  /** Names the answer region for assistive technology. */
  label: string;
  className?: string;
};

const MARK = /(\[\d+\])/;

/** Pixels each tucked card shows above the one in front of it. */
const PEEK = 26;
/** How much each depth shrinks a tucked card, so the pile reads as one. */
const TUCK = 0.03;

/**
 * Every source, in one stack behind the answer. The front card shows in full;
 * the others tuck behind it so only their title strips peek out, each depth
 * set back one peek and shrunk three percent. Hovering or focusing a citation
 * previews its card: `y`, `scale` and stacking order are derived from each
 * card's rank and animate to the new values on `glide` — a FLIP by rank —
 * while the others tuck back one step. Leaving returns the stack to the
 * selected card; pressing a citation, a strip, or arrowing through the stack
 * selects one so it stays in front. Each card's height is measured, so the
 * stack glides to a taller card rather than jumping.
 *
 * The answer's citations are real buttons, the stack an ordered list whose
 * strips carry a roving tabindex: Tab lands on the selected strip, the arrow
 * keys move the selection, Home and End jump, Enter or Space selects. The
 * live region reads a selection once, never a preview. Under reduced motion
 * cards swap depth without travel and the front card fades in.
 */
export function SourceStack({
  ref,
  text,
  sources,
  value,
  defaultValue,
  onValueChange,
  onPreviewChange,
  label,
  className,
}: SourceStackProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const stripId = (id: string) => `${baseId}-strip-${id}`;

  const firstId = sources[0]?.id ?? "";
  const [ownValue, setOwnValue] = React.useState(defaultValue ?? firstId);
  const selected = value ?? ownValue;

  // Depth order, front first. It only changes on selection; a preview is
  // derived on top of it so leaving restores the pile exactly.
  const [order, setOrder] = React.useState<string[]>(() => [
    selected,
    ...sources.map((s) => s.id).filter((id) => id !== selected),
  ]);
  const [seen, setSeen] = React.useState(selected);
  if (seen !== selected) {
    setSeen(selected);
    setOrder((prev) => [selected, ...prev.filter((id) => id !== selected)]);
  }

  const [preview, setPreview] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const [heights, setHeights] = React.useState<Record<string, number>>({});

  // One observer per card, created once per source list so a re-render never
  // re-attaches them; React 19 runs the returned cleanup on unmount.
  const measureRefs = React.useMemo(() => {
    const map = new Map<string, React.RefCallback<HTMLLIElement>>();
    for (const source of sources) {
      map.set(source.id, (node) => {
        if (!node) return;
        const observer = new ResizeObserver(() => {
          const height = node.offsetHeight;
          setHeights((prev) =>
            prev[source.id] === height
              ? prev
              : { ...prev, [source.id]: height },
          );
        });
        observer.observe(node);
        return () => observer.disconnect();
      });
    }
    return map;
  }, [sources]);

  const startPreview = (id: string) => {
    if (id === preview) return;
    setPreview(id);
    onPreviewChange?.(id);
  };
  const endPreview = () => {
    if (preview === null) return;
    setPreview(null);
    onPreviewChange?.(null);
  };

  const select = (source: StackSource) => {
    if (source.id !== selected) {
      if (value === undefined) setOwnValue(source.id);
      onValueChange?.(source.id);
    }
    const index = sources.indexOf(source) + 1;
    setAnnouncement(`Source ${index} in front, ${source.title}`);
  };

  const moveTo = (index: number) => {
    const clamped = Math.min(sources.length - 1, Math.max(0, index));
    const source = sources[clamped];
    if (!source) return;
    select(source);
    document.getElementById(stripId(source.id))?.focus();
  };

  const onStripKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const keys: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowRight: index + 1,
      ArrowUp: index - 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: sources.length - 1,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    moveTo(next);
  };

  const frontId = preview ?? selected;
  const shown = [frontId, ...order.filter((id) => id !== frontId)];
  const depthOf = (id: string) => Math.max(0, shown.indexOf(id));
  const count = sources.length;
  const front = sources.find((s) => s.id === frontId) ?? sources[0];
  const frontHeight = heights[frontId];

  const move = motionSafe ? springs.glide : { duration: 0, ease: easings.move };
  const fade = { duration: durations.fast, ease: easings.enter } as const;

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

      <p
        onPointerLeave={endPreview}
        className="text-sm leading-relaxed text-ink"
      >
        {text.split(MARK).map((piece, pieceIndex) => {
          const match = /^\[(\d+)\]$/.exec(piece);
          const index = match ? Number(match[1]) : 0;
          const source = match ? sources[index - 1] : undefined;
          if (!source) {
            return <React.Fragment key={pieceIndex}>{piece}</React.Fragment>;
          }
          const isSelected = source.id === selected;
          const isFront = source.id === frontId;
          return (
            <button
              key={pieceIndex}
              type="button"
              aria-label={`Source ${index}, ${source.title}`}
              aria-pressed={isSelected}
              onPointerEnter={() => startPreview(source.id)}
              onFocus={() => startPreview(source.id)}
              onBlur={endPreview}
              onClick={() => select(source)}
              className={cn(
                "mx-0.5 inline-flex h-4 min-w-4 translate-y-[-1px] items-center justify-center rounded-1 border px-1 align-middle font-mono text-[10px] tabular-nums transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                isFront
                  ? "border-cobalt-bright/40 bg-cobalt-wash text-cobalt-bright"
                  : "border-hairline bg-surface-1 text-ink-2 hover:text-ink",
              )}
            >
              {index}
            </button>
          );
        })}
      </p>

      <motion.ol
        aria-label="Sources"
        onPointerLeave={endPreview}
        initial={false}
        animate={{
          height:
            frontHeight === undefined
              ? "auto"
              : (count - 1) * PEEK + frontHeight,
        }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="relative overflow-hidden"
      >
        {/* An in-flow ghost of the front card gives the pile its natural
            height before any observer has run, so the server's markup is
            already the right size; the measured height takes over from it. */}
        {front ? (
          <li
            aria-hidden
            className="invisible border border-transparent px-3 pt-1.5 pb-3"
            style={{ marginTop: (count - 1) * PEEK }}
          >
            <p className="h-5 text-sm">{front.title}</p>
            <p className="mt-1.5 text-xs leading-relaxed">{front.excerpt}</p>
            <p className="mt-2 truncate font-mono text-[10px]">
              {front.site} · {count} of {count}
            </p>
          </li>
        ) : null}

        {sources.map((source, index) => {
          const depth = depthOf(source.id);
          const isFront = depth === 0;
          const isSelected = source.id === selected;
          const y = (count - 1 - depth) * PEEK;
          const scale = Number((1 - depth * TUCK).toFixed(3));
          return (
            <motion.li
              key={source.id}
              ref={measureRefs.get(source.id)}
              initial={false}
              animate={{ y, scale }}
              transition={move}
              style={{ zIndex: count - depth, originX: 0.5, originY: 0 }}
              className={cn(
                "absolute inset-x-0 top-0 rounded-2 border bg-surface-1 px-3 pt-1.5 pb-3 shadow-raised transition-colors",
                isFront ? "border-hairline-strong" : "border-hairline",
              )}
            >
              <button
                type="button"
                id={stripId(source.id)}
                tabIndex={isSelected ? 0 : -1}
                aria-current={isSelected ? "true" : undefined}
                aria-label={`Source ${index + 1}, ${source.title}`}
                onPointerEnter={() => startPreview(source.id)}
                onClick={() => select(source)}
                onKeyDown={(event) => onStripKeyDown(event, index)}
                className={cn(
                  "flex h-5 w-full min-w-0 items-center gap-2 rounded-1 text-left outline-none",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 font-mono text-[10px] tabular-nums transition-colors",
                    isFront ? "text-cobalt-bright" : "text-ink-3",
                  )}
                >
                  {index + 1}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm font-medium transition-colors",
                    isFront ? "text-ink" : "text-ink-2",
                  )}
                >
                  {source.title}
                </span>
              </button>
              <motion.div
                aria-hidden={!isFront}
                initial={false}
                animate={{ opacity: isFront ? 1 : 0 }}
                transition={fade}
              >
                <p className="mt-1.5 text-xs leading-relaxed text-ink-2">
                  {source.excerpt}
                </p>
                <p className="mt-2 truncate font-mono text-[10px] text-ink-3">
                  {source.site} · {index + 1} of {count}
                </p>
              </motion.div>
            </motion.li>
          );
        })}
      </motion.ol>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
