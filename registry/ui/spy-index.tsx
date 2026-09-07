"use client";

import * as React from "react";

import { motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SpySection = {
  /** Must match the id of a heading or section inside the container. */
  id: string;
  label: string;
};

export type SpyIndexProps = {
  /** The entries, in document order. */
  sections: SpySection[];
  /** The scrolling element; defaults to the window. */
  container?: React.RefObject<HTMLElement | null>;
  /** Pixels from the top of the container that count as in view. @default 24 */
  offset?: number;
  /** Accessible name for the nav, shown above the list. @default "On this page" */
  label?: string;
  /** Fires when the section in view changes. */
  onActiveChange?: (id: string) => void;
  className?: string;
};

/**
 * A table of contents that watches the page. An IntersectionObserver keyed to
 * the reading line marks the section in view; the marker travels between
 * entries on `glide` through a shared `layoutId`, because a marker that moves
 * says "you are here" where three markers blinking would only say "something
 * changed". The active entry steps 4px out of the column and the rail beside
 * the list fills with how far through the document you are.
 *
 * The observer only reports crossings; the active entry is then read from
 * geometry, so a heading exactly on the line resolves the same way every time.
 * Entries are plain links, so Tab reaches them and Enter follows them; clicking
 * scrolls the container instead, smoothly, and hands focus to the target when
 * the author made it focusable. Under reduced motion the marker jumps and the
 * rail still fills — progress is information, not flourish.
 */
export function SpyIndex({
  sections,
  container,
  offset = 24,
  label = "On this page",
  onActiveChange,
  className,
}: SpyIndexProps) {
  const motionSafe = useMotionSafe();
  const markerId = `${React.useId()}-marker`;
  const [activeId, setActiveId] = React.useState("");
  // A motion value, not state: the rail is repainted on every scroll frame and
  // must not re-render the list to do it.
  const progress = useMotionValue(0);

  // The observer needs the ids, not the labels, so it keys off a joined string
  // instead of the array's identity: an inline `sections` prop then re-renders
  // without tearing the observer down and building it again.
  const sectionKey = sections.map((section) => section.id).join("\u0000");

  React.useEffect(() => {
    const ids = sectionKey ? sectionKey.split("\u0000") : [];
    if (ids.length === 0) return;
    const root = container?.current ?? null;
    const scrollTarget: EventTarget = root ?? window;

    const nodeFor = (id: string): HTMLElement | null => {
      const scope: ParentNode = root ?? document;
      const found = scope.querySelector(`#${CSS.escape(id)}`);
      return found instanceof HTMLElement ? found : null;
    };

    const measureProgress = () => {
      const span = root
        ? root.scrollHeight - root.clientHeight
        : document.documentElement.scrollHeight - window.innerHeight;
      const travelled = root ? root.scrollTop : window.scrollY;
      progress.set(span > 0 ? Math.min(1, Math.max(0, travelled / span)) : 0);
    };

    // The last section whose top has passed the reading line owns the marker;
    // before the first one has, the first entry does.
    const measureActive = () => {
      const line = (root ? root.getBoundingClientRect().top : 0) + offset + 1;
      let next = ids[0] ?? "";
      for (const id of ids) {
        const node = nodeFor(id);
        if (node && node.getBoundingClientRect().top <= line) next = id;
      }
      setActiveId(next);
    };

    // Margined to the reading line, so the observer fires exactly when a
    // heading crosses it rather than on every scroll frame. It also fires once
    // on observe, which seeds the first marker without touching state here.
    const observer = new IntersectionObserver(
      () => {
        measureActive();
        measureProgress();
      },
      { root, rootMargin: `-${offset}px 0px 0px 0px`, threshold: 0 },
    );
    for (const id of ids) {
      const node = nodeFor(id);
      if (node) observer.observe(node);
    }

    const handleScroll = () => measureProgress();
    scrollTarget.addEventListener("scroll", handleScroll, { passive: true });

    // Reflow changes both the line and the scrollable span.
    const resizeObserver = new ResizeObserver(() => {
      measureActive();
      measureProgress();
    });
    if (root) resizeObserver.observe(root);

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      scrollTarget.removeEventListener("scroll", handleScroll);
    };
  }, [container, offset, progress, sectionKey]);

  React.useEffect(() => {
    if (activeId) onActiveChange?.(activeId);
  }, [activeId, onActiveChange]);

  const goTo = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const root = container?.current ?? null;
    const scope: ParentNode = root ?? document;
    const found = scope.querySelector(`#${CSS.escape(id)}`);
    // No target: leave the browser's own anchor handling alone.
    if (!(found instanceof HTMLElement)) return;
    event.preventDefault();
    const behavior: ScrollBehavior = motionSafe ? "smooth" : "auto";
    const top = found.getBoundingClientRect().top;
    if (root) {
      const delta = top - root.getBoundingClientRect().top;
      root.scrollTo({ top: root.scrollTop + delta - offset, behavior });
    } else {
      window.scrollTo({ top: window.scrollY + top - offset, behavior });
    }
    // preventScroll keeps focus from cancelling the smooth scroll it triggers;
    // on a target the author left unfocusable this is simply a no-op.
    found.focus({ preventScroll: true });
  };

  return (
    <nav
      aria-label={label}
      className={cn("flex w-full min-w-0 flex-col gap-2", className)}
    >
      <p className="text-label text-ink-3">{label}</p>

      <div className="flex min-w-0 gap-3">
        <div
          aria-hidden
          className="relative w-0.5 shrink-0 overflow-hidden rounded-full bg-hairline"
        >
          <motion.span
            className="absolute inset-x-0 top-0 h-full origin-top rounded-full bg-hairline-strong"
            style={{ scaleY: progress }}
          />
        </div>

        <ul className="flex min-w-0 flex-1 flex-col gap-0.5">
          {sections.map((section) => {
            const isActive = section.id === activeId;
            return (
              <li key={section.id} className="relative min-w-0">
                {isActive ? (
                  motionSafe ? (
                    <motion.span
                      aria-hidden
                      layoutId={markerId}
                      transition={springs.glide}
                      className="absolute inset-y-1 -left-3.5 w-0.5 rounded-full bg-cobalt-bright"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="absolute inset-y-1 -left-3.5 w-0.5 rounded-full bg-cobalt-bright"
                    />
                  )
                ) : null}

                <motion.a
                  href={`#${section.id}`}
                  title={section.label}
                  aria-current={isActive ? "location" : undefined}
                  onClick={(event) => goTo(event, section.id)}
                  animate={{ x: isActive && motionSafe ? distances.nudge : 0 }}
                  transition={springs.glide}
                  className={cn(
                    "block truncate rounded-1 py-1 text-xs transition-colors outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    isActive
                      ? "font-medium text-foreground"
                      : "text-ink-3 hover:text-ink-2",
                  )}
                >
                  {section.label}
                </motion.a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
