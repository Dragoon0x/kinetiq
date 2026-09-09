"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SourceMapSource = {
  id: string;
  /** The publication or system the paragraph leans on. */
  label: string;
  /** Shown small under the label. */
  domain: string;
};

export type SourceMapParagraph = {
  id: string;
  text: string;
  /** Ids of the sources this paragraph draws on. */
  sources: string[];
};

export type SourceMapProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The answer's paragraphs, each naming the sources it draws on. */
  paragraphs: SourceMapParagraph[];
  /** The source cards, in column order. */
  sources: SourceMapSource[];
  /** Controlled pinned paragraph id; `null` pins nothing. */
  value?: string | null;
  /** Initial pinned paragraph id for uncontrolled usage. */
  defaultValue?: string | null;
  onValueChange?: (id: string | null) => void;
  /** Fires when the highlighted paragraph changes by hover, focus or pin. */
  onActiveChange?: (id: string | null) => void;
  /** Names the map for assistive technology. */
  label: string;
  className?: string;
};

type Anchor = { x: number; y: number };
type Geometry = {
  paragraphs: Record<string, Anchor>;
  sources: Record<string, Anchor>;
};

const round = (value: number) => Number(value.toFixed(3));

/** Idle, lit and dimmed line opacities: the map reads at rest, and brightens by contrast. */
const OPACITY = { idle: 0.5, lit: 1, dim: 0.18 } as const;

/**
 * Which sources fed which paragraph, drawn rather than footnoted. The
 * answer's paragraphs sit on the left, its source cards on the right, and an
 * overlay draws a curve from each paragraph to every source it draws on. The
 * curves are measured from the real boxes — a ResizeObserver on the frame and
 * on each paragraph and card — so a reflow redraws them where the text
 * actually is. On mount they draw themselves on `glide` in a cascade, no
 * overshoot, because a line being drawn is a surface settling.
 *
 * Hovering or focusing a paragraph lights its lines and the cards they reach,
 * and fades the rest, on a fast opacity tween; pressing pins it, so touch and
 * keyboard readers can hold the highlight without hovering. Up and Down walk
 * the paragraphs, Home and End jump, Enter and Space pin, Escape unpins.
 * Under reduced motion the lines mount already drawn and lighting is colour
 * and opacity only.
 */
export function SourceMap({
  ref,
  paragraphs,
  sources,
  value,
  defaultValue = null,
  onValueChange,
  onActiveChange,
  label,
  className,
}: SourceMapProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultValue,
  );
  const isControlled = value !== undefined;
  const pinned = isControlled ? value : uncontrolled;

  const [hovered, setHovered] = React.useState<string | null>(null);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");
  const [geometry, setGeometry] = React.useState<Geometry | null>(null);

  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const paragraphNodes = React.useRef(new Map<string, HTMLElement>());
  const sourceNodes = React.useRef(new Map<string, HTMLElement>());
  const paragraphButtons = React.useRef<(HTMLButtonElement | null)[]>([]);
  const lastActive = React.useRef<string | null>(pinned);

  const active = hovered ?? pinned;

  // Endpoints are measured relative to the frame so the overlay, which is sized
  // by the frame, can draw in plain pixels without a viewBox to stretch them.
  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const box = frame.getBoundingClientRect();
      const next: Geometry = { paragraphs: {}, sources: {} };
      paragraphNodes.current.forEach((node, id) => {
        const rect = node.getBoundingClientRect();
        next.paragraphs[id] = {
          x: round(rect.right - box.left),
          y: round(rect.top + rect.height / 2 - box.top),
        };
      });
      sourceNodes.current.forEach((node, id) => {
        const rect = node.getBoundingClientRect();
        next.sources[id] = {
          x: round(rect.left - box.left),
          y: round(rect.top + rect.height / 2 - box.top),
        };
      });
      setGeometry(next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    paragraphNodes.current.forEach((node) => observer.observe(node));
    sourceNodes.current.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [paragraphs, sources]);

  const emitActive = (next: string | null) => {
    if (lastActive.current === next) return;
    lastActive.current = next;
    onActiveChange?.(next);
  };

  const hoverTo = (id: string | null) => {
    setHovered(id);
    emitActive(id ?? pinned);
  };

  const pin = (paragraph: SourceMapParagraph, index: number) => {
    const next = pinned === paragraph.id ? null : paragraph.id;
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
    emitActive(hovered ?? next);
    const count = paragraph.sources.length;
    setAnnounce(
      next
        ? `Pinned paragraph ${index + 1}, draws on ${count} ${count === 1 ? "source" : "sources"}`
        : "Unpinned",
    );
  };

  const unpin = () => {
    if (pinned === null) return;
    if (!isControlled) setUncontrolled(null);
    onValueChange?.(null);
    emitActive(hovered);
    setAnnounce("Unpinned");
  };

  const focusAt = (index: number) => {
    const clamped = Math.min(paragraphs.length - 1, Math.max(0, index));
    paragraphButtons.current[clamped]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(paragraphs.length - 1);
        break;
      case "Escape":
        if (pinned !== null) event.preventDefault();
        unpin();
        break;
      default:
        break;
    }
  };

  const links = React.useMemo(
    () =>
      paragraphs.flatMap((paragraph) =>
        paragraph.sources
          .filter((sourceId) =>
            sources.some((source) => source.id === sourceId),
          )
          .map((sourceId) => ({ paragraphId: paragraph.id, sourceId })),
      ),
    [paragraphs, sources],
  );
  const stagger = cascade(links.length);

  const activeParagraph = paragraphs.find((p) => p.id === active);
  const litSources = new Set(activeParagraph?.sources ?? []);

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
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {sources.length} {sources.length === 1 ? "source" : "sources"}
        </span>
      </div>

      <div ref={frameRef} className="relative flex items-start gap-0">
        <ol className="flex min-w-0 flex-1 flex-col gap-1.5">
          {paragraphs.map((paragraph, index) => {
            const isActive = active === paragraph.id;
            const isPinned = pinned === paragraph.id;
            const dimmed = active !== null && !isActive;
            const fed = paragraph.sources
              .map((id) => sources.find((source) => source.id === id)?.label)
              .filter((name): name is string => Boolean(name));
            const describeId = `${baseId}-p-${index}`;
            return (
              <li key={paragraph.id}>
                <button
                  ref={(node) => {
                    paragraphButtons.current[index] = node;
                    if (node) paragraphNodes.current.set(paragraph.id, node);
                    else paragraphNodes.current.delete(paragraph.id);
                  }}
                  type="button"
                  aria-pressed={isPinned}
                  aria-describedby={describeId}
                  tabIndex={index === focusIndex ? 0 : -1}
                  onFocus={() => {
                    setFocusIndex(index);
                    hoverTo(paragraph.id);
                  }}
                  onBlur={() => hoverTo(null)}
                  onPointerEnter={() => hoverTo(paragraph.id)}
                  onPointerLeave={() => hoverTo(null)}
                  onClick={() => pin(paragraph, index)}
                  onKeyDown={(event) => handleKeyDown(event, index)}
                  className={cn(
                    "block w-full rounded-2 border px-2 py-1.5 text-left text-xs leading-relaxed transition-colors outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    isPinned
                      ? "border-cobalt-bright/50 bg-cobalt-wash text-foreground"
                      : isActive
                        ? "border-hairline bg-accent text-foreground"
                        : "border-transparent text-ink-2 hover:bg-accent",
                    dimmed && "text-ink-3",
                  )}
                >
                  {paragraph.text}
                </button>
                <span id={describeId} className="sr-only">
                  {fed.length > 0
                    ? `Draws on ${fed.join(", ")}`
                    : "Draws on no source"}
                </span>
              </li>
            );
          })}
        </ol>

        {/* The gutter is where the curves cross; it stays empty on purpose. */}
        <span aria-hidden className="w-8 shrink-0" />

        <ol
          aria-label="Sources"
          className="flex w-28 shrink-0 flex-col gap-1.5 sm:w-36"
        >
          {sources.map((source) => {
            const lit = litSources.has(source.id);
            const dimmed = active !== null && !lit;
            const fedBy = paragraphs
              .map((p, i) => (p.sources.includes(source.id) ? i + 1 : null))
              .filter((n): n is number => n !== null);
            return (
              <li
                key={source.id}
                ref={(node) => {
                  if (node) sourceNodes.current.set(source.id, node);
                  else sourceNodes.current.delete(source.id);
                }}
                className={cn(
                  "flex min-w-0 flex-col gap-0.5 rounded-2 border bg-surface-0 px-2 py-1.5 transition-colors",
                  lit ? "border-cobalt-bright/60" : "border-hairline",
                  dimmed ? "text-ink-3" : "text-foreground",
                )}
              >
                <span
                  title={source.label}
                  className="truncate text-xs font-medium"
                >
                  {source.label}
                </span>
                <span className="truncate font-mono text-[10px] text-ink-3">
                  {source.domain}
                </span>
                <span className="sr-only">
                  {fedBy.length > 0
                    ? `Feeds ${fedBy.length === 1 ? "paragraph" : "paragraphs"} ${fedBy.join(", ")}`
                    : "Feeds no paragraph"}
                </span>
              </li>
            );
          })}
        </ol>

        {geometry ? (
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full overflow-visible"
          >
            {links.map((link, index) => {
              const from = geometry.paragraphs[link.paragraphId];
              const to = geometry.sources[link.sourceId];
              if (!from || !to) return null;
              const bend = round((to.x - from.x) / 2);
              const d = `M ${from.x} ${from.y} C ${round(from.x + bend)} ${from.y}, ${round(to.x - bend)} ${to.y}, ${to.x} ${to.y}`;
              const lit = active !== null && link.paragraphId === active;
              const opacity =
                active === null
                  ? OPACITY.idle
                  : lit
                    ? OPACITY.lit
                    : OPACITY.dim;
              return (
                <motion.g
                  key={`${link.paragraphId}-${link.sourceId}`}
                  className={cn(
                    "transition-colors",
                    lit ? "text-cobalt-bright" : "text-ink-3",
                  )}
                  initial={{ opacity: motionSafe ? 0 : opacity }}
                  animate={{ opacity }}
                  transition={
                    motionSafe
                      ? { ...fade, delay: index * stagger }
                      : { duration: 0 }
                  }
                >
                  <motion.path
                    d={d}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={lit ? 1.75 : 1.25}
                    strokeLinecap="round"
                    pathLength={1}
                    initial={{ pathLength: motionSafe ? 0 : 1 }}
                    animate={{ pathLength: 1 }}
                    transition={
                      motionSafe
                        ? { ...springs.glide, delay: index * stagger }
                        : { duration: 0 }
                    }
                  />
                  <circle cx={from.x} cy={from.y} r={2} fill="currentColor" />
                  <circle cx={to.x} cy={to.y} r={2} fill="currentColor" />
                </motion.g>
              );
            })}
          </svg>
        ) : null}
      </div>

      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
