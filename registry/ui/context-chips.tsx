"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ContextKind = "file" | "page" | "selection";

export type ContextItem = {
  id: string;
  kind: ContextKind;
  name: string;
  /** Bytes. */
  size: number;
  /** The first lines of the content, shown in the preview. */
  preview: string;
};

export type ContextChipsProps = {
  ref?: React.Ref<HTMLDivElement>;
  items: ContextItem[];
  /** Bytes the model can take; prints the budget line and the bar when set. */
  budget?: number;
  /** Fires from a chip's remove button. */
  onRemove?: (id: string) => void;
  /** Fires when a preview opens or closes, with the item's id or null. */
  onPreview?: (id: string | null) => void;
  /** Formats every size. @default B / KB / MB */
  format?: (bytes: number) => string;
  /** Names the strip. */
  label: string;
  className?: string;
};

export const formatSize = (bytes: number): string => {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) {
    const kb = bytes / 1024;
    return `${kb >= 10 ? Math.round(kb) : kb.toFixed(1)} KB`;
  }
  return `${Math.max(0, Math.round(bytes))} B`;
};

/** One path per kind, so a glyph is a lookup rather than a component tree. */
const GLYPHS: Record<ContextKind, string> = {
  file: "M4 2.5h5l3.5 3.5v7.5H4zM9 2.5V6h3.5M6 9h4M6 11.5h4",
  page: "M2.5 3.5h11v9h-11zM2.5 6h11M4.5 4.75h.01M6.5 4.75h.01",
  selection: "M4 3H2.5v10H4M12 3h1.5v10H12M6 6h4M6 8h4M6 10h2.5",
};

function Glyph({ kind, className }: { kind: ContextKind; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-3.5 shrink-0 text-ink-3", className)}
    >
      <path d={GLYPHS[kind]} />
    </svg>
  );
}

/** Past this share of the budget the bar turns warn. */
const WARN_AT = 0.8;

type Shown = { id: string; pinned: boolean } | null;

/**
 * What the model can see. A chip per context item, with a glyph for its kind,
 * its name and its size. An added chip slides in from `distances.step` on
 * `snap` — one crisp overshoot, a chip landing — and a removed one leaves on
 * the exit ease while the row is measured by a ResizeObserver, so the strip's
 * height glides on `glide` to the rows it needs with nothing reserved.
 *
 * Hovering or focusing a chip opens a preview above the strip: the first
 * lines of the content in mono, rising from `distances.nudge` on `snap`.
 * Enter or Space pins it so it survives the pointer leaving; Escape closes.
 * With a `budget`, a hairline bar fills by the total's share on `glide` and
 * turns warn past 80 percent. The preview is a tooltip the chip describes
 * itself by, the bar is a meter, and a status line announces arrivals and
 * removals on settle. Under reduced motion chips and the preview fade in
 * place, and the bar still fills on a tween — the budget is information.
 */
export function ContextChips({
  ref,
  items,
  budget,
  onRemove,
  onPreview,
  format = formatSize,
  label,
  className,
}: ContextChipsProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const previewId = `${baseId}-preview`;

  const [shown, setShown] = React.useState<Shown>(null);

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setHeight(Math.round(node.offsetHeight)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const total = items.reduce((sum, item) => sum + item.size, 0);
  const count = `${items.length} item${items.length === 1 ? "" : "s"}`;
  const budgetText =
    budget !== undefined ? `${format(total)} of ${format(budget)}` : null;

  // Announce an arrival once, when its id first appears. The seen list is
  // adjusted during render so the message belongs to that arrival, not to
  // the parent's next re-render; items present at mount stay silent.
  const [seen, setSeen] = React.useState<{ ids: string[]; message: string }>(
    () => ({ ids: items.map((item) => item.id), message: "" }),
  );
  const ids = items.map((item) => item.id);
  const changed =
    ids.length !== seen.ids.length ||
    ids.some((id, index) => id !== seen.ids[index]);
  if (changed) {
    const fresh = items.filter((item) => !seen.ids.includes(item.id));
    setSeen({
      ids,
      message:
        fresh.length > 0
          ? `${fresh.map((item) => `${item.name} added, ${format(item.size)}`).join(". ")}. ${count}${budgetText ? `, ${budgetText}` : ""}.`
          : seen.message,
    });
  }

  const announce = (id: string | null) => {
    if ((shown?.id ?? null) !== id) onPreview?.(id);
  };
  const enter = (id: string) => {
    if (shown?.pinned) return;
    announce(id);
    setShown({ id, pinned: false });
  };
  const leave = (id: string) => {
    if (!shown || shown.pinned || shown.id !== id) return;
    announce(null);
    setShown(null);
  };
  const toggle = (id: string) => {
    if (shown?.id === id && shown.pinned) {
      announce(null);
      setShown(null);
      return;
    }
    announce(id);
    setShown({ id, pinned: true });
  };
  const close = () => {
    if (!shown) return;
    announce(null);
    setShown(null);
  };
  const remove = (item: ContextItem) => {
    if (shown?.id === item.id) close();
    setSeen((prev) => ({ ...prev, message: `Removed ${item.name}` }));
    onRemove?.(item.id);
  };

  const previewed = shown
    ? items.find((item) => item.id === shown.id)
    : undefined;

  const share =
    budget !== undefined && budget > 0
      ? Number(Math.min(1, total / budget).toFixed(3))
      : 0;
  const percent = Math.round(share * 100);
  const tone =
    share >= 1
      ? "bg-danger"
      : share >= WARN_AT
        ? "bg-warn"
        : "bg-cobalt-bright";

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const settle = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={labelId}
      className={cn(
        "relative flex w-full flex-col rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <AnimatePresence>
        {previewed ? (
          <motion.div
            key="preview"
            id={previewId}
            role="tooltip"
            initial={
              motionSafe ? { opacity: 0, y: distances.nudge } : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={motionSafe ? { ...springs.snap, opacity: fade } : fade}
            className="absolute inset-x-0 bottom-full z-20 mb-1.5 rounded-2 border border-hairline-strong bg-popover p-2.5 text-popover-foreground shadow-raised"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-1.5">
                <Glyph kind={previewed.kind} />
                <span className="truncate text-xs font-medium">
                  {previewed.name}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums">
                {previewed.kind} · {format(previewed.size)}
              </span>
            </div>
            <p className="mt-1.5 line-clamp-4 font-mono text-[11px] leading-4 break-words whitespace-pre-wrap text-ink-2">
              {previewed.preview}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex h-10 items-center justify-between gap-3 px-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={count}
            className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={fade}
          >
            {count}
          </motion.span>
        </AnimatePresence>
      </div>

      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={settle}
        className="overflow-hidden"
      >
        <div ref={innerRef} className="px-3 pb-3">
          {items.length === 0 ? (
            // Held back for the exit's length so the hint arrives after the
            // last chip has gone rather than beside it.
            <motion.p
              className="flex h-8 items-center text-xs text-ink-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...fade, delay: durations.fast * 0.6 }}
            >
              Nothing in context yet
            </motion.p>
          ) : null}
          <ul className="flex flex-wrap gap-1.5 empty:hidden">
            <AnimatePresence initial={false}>
              {items.map((item) => {
                const isShown = shown?.id === item.id;
                return (
                  <motion.li
                    key={item.id}
                    layout={motionSafe ? "position" : false}
                    initial={
                      motionSafe
                        ? { x: -distances.step, opacity: 0 }
                        : { opacity: 0 }
                    }
                    animate={{ x: 0, opacity: 1 }}
                    exit={{
                      opacity: 0,
                      scale: motionSafe ? 0.92 : 1,
                      transition: exitFor(durations.fast),
                    }}
                    transition={
                      motionSafe ? { ...springs.snap, opacity: fade } : fade
                    }
                    onPointerEnter={() => enter(item.id)}
                    onPointerLeave={() => leave(item.id)}
                    onFocus={() => enter(item.id)}
                    onBlur={(event) => {
                      const next = event.relatedTarget as Node | null;
                      if (!next || !event.currentTarget.contains(next)) {
                        leave(item.id);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        close();
                      }
                    }}
                    className={cn(
                      "flex h-8 max-w-full items-center rounded-2 border bg-surface-2 pr-0.5 transition-colors",
                      isShown
                        ? "border-cobalt-bright/60"
                        : "border-hairline-strong",
                    )}
                  >
                    <button
                      type="button"
                      aria-label={`${item.name}, ${item.kind}, ${format(item.size)}`}
                      aria-expanded={isShown}
                      aria-describedby={isShown ? previewId : undefined}
                      onClick={() => toggle(item.id)}
                      className="flex h-full min-w-0 items-center gap-1.5 rounded-l-2 pl-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                    >
                      <Glyph kind={item.kind} />
                      <span className="min-w-0 truncate text-xs font-medium text-foreground">
                        {item.name}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                        {format(item.size)}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => remove(item)}
                      className="ml-0.5 grid size-6 shrink-0 place-items-center rounded-1 text-ink-3 transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                    >
                      <svg
                        viewBox="0 0 16 16"
                        aria-hidden
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        className="size-3"
                      >
                        <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
                      </svg>
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </div>
      </motion.div>

      {budget !== undefined && budgetText ? (
        <div className="flex items-center gap-3 border-t border-hairline px-3 py-2">
          <div
            role="meter"
            aria-label="Context budget"
            aria-valuemin={0}
            aria-valuemax={Math.max(1, Math.round(budget))}
            aria-valuenow={Math.min(Math.round(budget), Math.round(total))}
            aria-valuetext={`${budgetText}, ${percent} percent`}
            className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-hairline-strong"
          >
            <motion.span
              aria-hidden
              className={cn(
                "block h-full origin-left rounded-full transition-colors",
                tone,
              )}
              initial={false}
              animate={{ scaleX: share }}
              transition={
                motionSafe
                  ? springs.glide
                  : { duration: durations.base, ease: easings.enter }
              }
            />
          </div>
          <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
            {budgetText}
          </span>
        </div>
      ) : null}

      <span role="status" className="sr-only">
        {seen.message}
      </span>
    </div>
  );
}
