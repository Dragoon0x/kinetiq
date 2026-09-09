"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type VerifiedCheck = {
  id: string;
  /** What was checked, e.g. "Identity". */
  label: string;
  /** When, preformatted. */
  at: string;
};

export type VerifiedSealProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The fact. Turning true stamps the seal; turning false lifts it away. */
  verified: boolean;
  /** What was verified and when. */
  checks: VerifiedCheck[];
  /** When the seal was granted, preformatted. */
  verifiedAt?: string;
  /** Profile name. */
  name: string;
  /** Secondary line under the name. */
  handle?: string;
  /** Avatar text. Defaults to the first letters of `name`. */
  initials?: string;
  /** Controlled pinned state of the detail strip. */
  open?: boolean;
  /** Initial pinned state for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  /** Fires from the seal press or Escape. */
  onOpenChange?: (open: boolean) => void;
  /** The seal's name for assistive technology. @default "Verified" */
  sealLabel?: string;
  className?: string;
};

/**
 * A sixteen-scallop rosette, computed once and rounded to three decimals so
 * the server's sine and the browser's agree on every attribute.
 */
const ROSETTE = (() => {
  const scallops = 16;
  const steps: string[] = [];
  for (let index = 0; index < scallops * 2; index += 1) {
    const radius = index % 2 === 0 ? 11 : 9.4;
    const angle = (Math.PI * index) / scallops - Math.PI / 2;
    const x = Number((12 + radius * Math.cos(angle)).toFixed(3));
    const y = Number((12 + radius * Math.sin(angle)).toFixed(3));
    steps.push(`${index === 0 ? "M" : "L"}${x} ${y}`);
  }
  return `${steps.join(" ")} Z`;
})();

/** The landed pose, held as one object so a completed animation can be
 *  matched by identity: the glint follows the stamp, never the exit. */
const STAMPED = { scale: 1, rotate: 0, opacity: 1 };

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

/**
 * Checked, and it says so. A profile header wears a rosette seal beside the
 * name once `verified` is true. The moment it turns true the seal stamps on
 * `recoil` from 1.6× and −14° — two bounces, a stamp hitting paper — and when
 * the stamp settles a highlight sweeps across the rosette once, a `slow`
 * tween clipped by the seal: the glint. Revoking lifts it on the exit ease
 * with no celebration, and a seal already true on mount simply sits there,
 * because a stamp is an event and a page load is not.
 *
 * Hovering or focusing the seal reads what was verified and when: a strip
 * beneath the header opens to a measured height on `glide`, each check's
 * tick drawing on `flick` in a `cascade`. Leaving closes it, a press pins it
 * open, Escape closes it and keeps focus on the seal. Under reduced motion
 * the seal fades, there is no glint, the strip swaps height and cross-fades,
 * and the ticks appear complete.
 */
export function VerifiedSeal({
  ref,
  verified,
  checks,
  verifiedAt,
  name,
  handle,
  initials,
  open,
  defaultOpen = false,
  onOpenChange,
  sealLabel = "Verified",
  className,
}: VerifiedSealProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const panelId = `${baseId}-panel`;

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const pinned = isControlled ? open : uncontrolledOpen;
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [glint, setGlint] = React.useState(0);

  // The announcement is written when the fact changes, during render against
  // the committed prop, so a profile that mounts verified announces nothing.
  const [seen, setSeen] = React.useState({ verified, text: "" });
  if (seen.verified !== verified) {
    setSeen({
      verified,
      text: verified ? `${name} is verified.` : "Verification removed.",
    });
    if (!verified) setGlint(0);
  }

  const isOpen = verified && (pinned || hovered || focused);

  const setPinned = (next: boolean) => {
    if (next === pinned) return;
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  // The strip is exactly as tall as the checks inside it; the observer rides
  // the callback ref so the node that leaves is never the one being watched.
  const [height, setHeight] = React.useState<number | null>(null);
  const observerRef = React.useRef<ResizeObserver | null>(null);
  React.useEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    },
    [],
  );
  const measure = React.useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      setHeight(
        Math.round(
          entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height,
        ),
      );
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  const stagger = cascade(checks.length);
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-full bg-cobalt-wash text-sm font-semibold text-cobalt-bright"
        >
          {initials ?? initialsOf(name)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          {/* The name's line height matches the seal's box, so the row is the
              same height with or without it: no reserve, no jump. */}
          <span className="flex items-center gap-1.5">
            <span
              className="truncate text-sm leading-5 font-semibold"
              title={name}
            >
              {name}
            </span>
            <AnimatePresence initial={false}>
              {verified ? (
                <motion.button
                  key="seal"
                  type="button"
                  aria-label={`${sealLabel}. Show what was checked`}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  // A tap both hovers and presses, so closing by press also
                  // lets go of the hover it arrived with.
                  onClick={() => {
                    const next = !pinned;
                    setPinned(next);
                    if (!next) {
                      setHovered(false);
                      setFocused(false);
                    }
                  }}
                  onPointerEnter={() => setHovered(true)}
                  onPointerLeave={() => setHovered(false)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onKeyDown={(event) => {
                    if (event.key !== "Escape") return;
                    event.preventDefault();
                    setPinned(false);
                    setHovered(false);
                    setFocused(false);
                  }}
                  initial={
                    motionSafe
                      ? { scale: 1.6, rotate: -14, opacity: 0 }
                      : { opacity: 0 }
                  }
                  animate={STAMPED}
                  exit={{
                    opacity: 0,
                    scale: motionSafe ? 0.8 : 1,
                    transition: exitFor(durations.fast),
                  }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.recoil,
                          opacity: { duration: durations.blink },
                        }
                      : { duration: durations.fast }
                  }
                  // The glint waits for the stamp to settle: light catches a
                  // seal that has landed, not one still bouncing.
                  onAnimationComplete={(definition) => {
                    if (definition === STAMPED && motionSafe) {
                      setGlint((count) => count + 1);
                    }
                  }}
                  className={cn(
                    "relative grid size-5 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full text-primary outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  )}
                >
                  <svg viewBox="0 0 24 24" aria-hidden className="size-full">
                    <path d={ROSETTE} fill="currentColor" />
                    <path
                      d="M7.5 12.5 10.3 15.3 16.5 9"
                      fill="none"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="stroke-primary-foreground"
                    />
                  </svg>
                  <AnimatePresence>
                    {glint > 0 ? (
                      <motion.span
                        key={glint}
                        aria-hidden
                        className="pointer-events-none absolute inset-0 -skew-x-12 bg-linear-to-r from-transparent via-primary-foreground/70 to-transparent"
                        initial={{ x: "-100%" }}
                        animate={{ x: "100%" }}
                        transition={{
                          duration: durations.slow,
                          ease: easings.move,
                        }}
                        onAnimationComplete={() => setGlint(0)}
                      />
                    ) : null}
                  </AnimatePresence>
                </motion.button>
              ) : null}
            </AnimatePresence>
          </span>
          {handle ? (
            <span className="truncate text-xs text-ink-3">{handle}</span>
          ) : null}
        </div>
      </div>

      <motion.div
        initial={false}
        animate={{ height: isOpen ? (height ?? "auto") : 0 }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        className="overflow-hidden"
      >
        <AnimatePresence initial={false}>
          {isOpen ? (
            <motion.div
              key="details"
              ref={measure}
              id={panelId}
              role="region"
              aria-label="Verification details"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
            >
              <div className="mt-3 flex flex-col gap-2 border-t border-hairline pt-3">
                <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  {verifiedAt ? `${sealLabel} ${verifiedAt}` : sealLabel}
                </span>
                <ul className="flex flex-col gap-1.5">
                  {checks.map((check, index) => (
                    <li
                      key={check.id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span
                        aria-hidden
                        className="grid size-4 shrink-0 place-items-center rounded-full bg-success/15 text-success"
                      >
                        <svg
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="size-2.5"
                        >
                          <motion.path
                            d="M3.5 8.5 6.5 11.5 12.5 4.5"
                            initial={
                              motionSafe ? { pathLength: 0 } : { pathLength: 1 }
                            }
                            animate={{ pathLength: 1 }}
                            transition={
                              motionSafe
                                ? { ...springs.flick, delay: index * stagger }
                                : { duration: 0 }
                            }
                          />
                        </svg>
                      </span>
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {check.label}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                        {check.at}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>

      <span role="status" className="sr-only">
        {seen.text}
      </span>
    </div>
  );
}
