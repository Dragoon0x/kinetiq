"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TranslateLanguage = {
  /** Short code printed on the chip, e.g. CDR. */
  code: string;
  /** Full name spoken by every control, e.g. Cadran. */
  name: string;
};

export type TranslateFlipProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The message as it arrived. */
  text: string;
  /** The rendering in the reader's language. */
  translation: string;
  source: TranslateLanguage;
  target: TranslateLanguage;
  /** Controlled: which face is showing. */
  translated?: boolean;
  /** Initial face for uncontrolled usage. @default false */
  defaultTranslated?: boolean;
  onTranslatedChange?: (translated: boolean) => void;
  /** Controlled: whether the fold under the translation is open. */
  originalOpen?: boolean;
  /** Initial fold state for uncontrolled usage. @default false */
  defaultOriginalOpen?: boolean;
  onOriginalOpenChange?: (open: boolean) => void;
  /** The host is still producing the translation. @default false */
  pending?: boolean;
  author: string;
  /** Sent time, already formatted. */
  time?: string;
  /** Names the thread list. @default "Thread" */
  label?: string;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;
const CROSS = { duration: durations.base, ease: easings.enter } as const;

/** One observer per face, bound as the node arrives rather than in a
 *  mount-only effect that would read a ref still holding null. */
function useMeasured(): [(node: HTMLElement | null) => void, number | null] {
  const [height, setHeight] = React.useState<number | null>(null);
  const observer = React.useRef<ResizeObserver | null>(null);
  const bind = React.useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node || typeof ResizeObserver === "undefined") return;
    const next = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    next.observe(node);
    observer.current = next;
  }, []);
  React.useEffect(() => () => observer.current?.disconnect(), []);
  return [bind, height];
}

const control =
  "flex h-8 items-center gap-1.5 rounded-full border border-hairline-strong px-3 text-[11px] font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Their language, then yours. Pressing Translate turns the bubble about its
 * horizontal axis on `snap` — one crisp overshoot, two keyframes — with the
 * original and the translation as the two faces of one card, each hiding its
 * back. The texts are never the same length, so both faces are measured by
 * observers bound to their nodes as they arrive and the card glides to the
 * active face's height on `glide`: nothing reserved, nothing clipped. The
 * original is not thrown away — a fold under the translation opens it in muted
 * type at a measured height, and Escape closes it and hands focus back.
 *
 * A language chip rides the card's corner rail, travelling from the trailing
 * corner to the leading one as a layout FLIP on `snap` while its label
 * cross-fades from the source language to yours; while the host reports work
 * in progress the chip turns a drawn arc and the control refuses politely with
 * `aria-disabled`. Under reduced motion the card does not turn: the faces
 * cross-fade in place, the chip swaps corners at once, and the arc becomes a
 * dashed ring — which language you are reading is information.
 */
export function TranslateFlip({
  ref,
  text,
  translation,
  source,
  target,
  translated,
  defaultTranslated,
  onTranslatedChange,
  originalOpen,
  defaultOriginalOpen,
  onOriginalOpenChange,
  pending = false,
  author,
  time,
  label = "Thread",
  className,
}: TranslateFlipProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const foldId = `${baseId}-original`;
  const foldButtonId = `${baseId}-fold`;

  const [uncontrolledFace, setUncontrolledFace] = React.useState(
    () => defaultTranslated ?? false,
  );
  const showing = translated ?? uncontrolledFace;

  const [uncontrolledFold, setUncontrolledFold] = React.useState(
    () => defaultOriginalOpen ?? false,
  );
  const foldOpen = (originalOpen ?? uncontrolledFold) && showing;

  const [bindFront, frontHeight] = useMeasured();
  const [bindBack, backHeight] = useMeasured();
  const [bindFold, foldHeight] = useMeasured();

  const cardHeight = showing
    ? (backHeight ?? frontHeight ?? "auto")
    : (frontHeight ?? "auto");

  // The sentence is frozen at the flip, so a host swapping the text afterwards
  // cannot make the region read a translation that is no longer on the card.
  const [beat, setBeat] = React.useState<{ face: boolean; message: string }>(
    () => ({ face: showing, message: "" }),
  );
  if (beat.face !== showing) {
    setBeat({
      face: showing,
      message: showing
        ? `${target.name} translation: ${translation}`
        : `Original in ${source.name}: ${text}`,
    });
  }

  const setFace = (next: boolean) => {
    if (translated === undefined) setUncontrolledFace(next);
    onTranslatedChange?.(next);
    // The fold belongs to the translation; turning back closes it rather than
    // leaving it primed to spring open on the next flip.
    if (!next && (originalOpen ?? uncontrolledFold)) {
      if (originalOpen === undefined) setUncontrolledFold(false);
      onOriginalOpenChange?.(false);
    }
  };

  const setFold = (next: boolean) => {
    if (originalOpen === undefined) setUncontrolledFold(next);
    onOriginalOpenChange?.(next);
  };

  /** Both measured boxes — the card and the fold — move on the same spring. */
  const measured = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.move };

  const chip = (
    <motion.span
      layout={motionSafe}
      transition={springs.snap}
      className="flex h-6 items-center gap-1.5 rounded-full border border-hairline-strong bg-surface-1 px-2 text-[10px] font-semibold tracking-[0.06em] text-ink-2 uppercase"
    >
      <span aria-hidden className="grid size-3 place-items-center">
        {pending ? (
          // The turn rides a wrapper rather than the <svg> itself, so motion
          // writes a plain CSS transform instead of an SVG transform attribute.
          <motion.span
            className="col-start-1 row-start-1 flex text-cobalt-bright"
            animate={motionSafe ? { rotate: 360 } : { rotate: 0 }}
            transition={
              motionSafe
                ? {
                    duration: durations.page,
                    ease: easings.linear,
                    repeat: Infinity,
                  }
                : { duration: 0 }
            }
          >
            <svg viewBox="0 0 16 16" className="size-3">
              <circle
                cx="8"
                cy="8"
                r="6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={motionSafe ? "20 18" : "3 4"}
              />
            </svg>
          </motion.span>
        ) : (
          <svg
            viewBox="0 0 16 16"
            className="col-start-1 row-start-1 size-3 text-cobalt-bright"
          >
            <path
              d="M2.5 8h11M9.5 4 13.5 8l-4 4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span className="grid">
        <AnimatePresence initial={false}>
          <motion.span
            key={showing ? target.code : source.code}
            className="col-start-1 row-start-1 whitespace-nowrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={CROSS}
          >
            {showing ? target.code : source.code}
          </motion.span>
        </AnimatePresence>
      </span>
    </motion.span>
  );

  const faceText =
    "rounded-3 rounded-bl-1 px-3 py-2 text-sm leading-snug wrap-break-word";

  return (
    <div
      ref={ref}
      className={cn("flex w-full flex-col gap-1", className)}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !foldOpen) return;
        event.preventDefault();
        event.stopPropagation();
        setFold(false);
        document.getElementById(foldButtonId)?.focus();
      }}
    >
      <ol role="list" aria-label={label} className="flex flex-col">
        <li className="flex flex-col items-start gap-1">
          <span className="flex items-center gap-1.5 px-1 text-[11px] font-medium text-ink-2">
            {author}
            {time ? (
              <span className="text-ink-3 tabular-nums">{time}</span>
            ) : null}
          </span>

          <div className="flex w-full max-w-[95%] flex-col gap-1">
            {/* The rail is the card's own width, so the chip rides its corners
                rather than floating over the thread. */}
            <div
              className={cn(
                "flex px-0.5",
                showing ? "justify-start" : "justify-end",
              )}
            >
              {chip}
            </div>

            <motion.div
              initial={false}
              animate={{ height: cardHeight }}
              transition={measured}
              style={{ perspective: 1000 }}
              className="w-full overflow-hidden"
            >
              <motion.div
                initial={false}
                animate={{ rotateX: motionSafe && showing ? 180 : 0 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
                style={{ transformStyle: "preserve-3d" }}
                className="relative w-full"
              >
                {/* The faces are plain elements: under rich motion the card's
                    own turn hides them by their backs, and under reduced
                    motion a 150ms opacity swap does the whole job. */}
                <div
                  ref={bindFront}
                  aria-hidden={showing || undefined}
                  style={{ backfaceVisibility: "hidden" }}
                  className={cn(
                    "w-full bg-surface-2 text-foreground transition-opacity duration-150",
                    faceText,
                    showing && "pointer-events-none",
                    !motionSafe && showing && "opacity-0",
                  )}
                >
                  {text}
                </div>

                {/* Pinned to the bottom edge: a rotation about the card's
                    centre line lands a bottom-pinned face flush with the top. */}
                <div
                  ref={bindBack}
                  aria-hidden={!showing || undefined}
                  style={
                    motionSafe
                      ? {
                          backfaceVisibility: "hidden",
                          transform: "rotateX(180deg)",
                        }
                      : undefined
                  }
                  className={cn(
                    "absolute inset-x-0 bg-cobalt-wash text-foreground transition-opacity duration-150",
                    motionSafe ? "bottom-0" : "top-0",
                    faceText,
                    !showing && "pointer-events-none",
                    !motionSafe && !showing && "opacity-0",
                  )}
                >
                  {translation}
                </div>
              </motion.div>
            </motion.div>

            <motion.div
              initial={false}
              animate={{ height: foldOpen ? (foldHeight ?? "auto") : 0 }}
              transition={measured}
              className="w-full overflow-hidden"
            >
              {/* Padding, never a margin: a child's margin collapses out of
                  the measured box and the fold would open a few pixels short. */}
              <div ref={bindFold} id={foldId} className="pt-1">
                <p className="border-l-2 border-hairline py-1 pl-2 text-[13px] leading-snug wrap-break-word text-ink-3">
                  {text}
                </p>
              </div>
            </motion.div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              aria-pressed={showing}
              aria-disabled={pending || undefined}
              onClick={() => {
                if (pending) return;
                setFace(!showing);
              }}
              // A toggle keeps one name and puts its state in aria-pressed;
              // renaming it every press would make the two controls below read
              // as the same action twice.
              aria-label={
                pending
                  ? `Translating into ${target.name}`
                  : `Translate into ${target.name}`
              }
              className={cn(
                control,
                pending
                  ? "text-ink-3 opacity-60"
                  : showing
                    ? "border-cobalt-bright bg-cobalt-wash text-cobalt-bright"
                    : "text-ink-2 hover:bg-accent",
              )}
            >
              {pending ? "Translating" : "Translate"}
            </button>

            <AnimatePresence initial={false}>
              {showing ? (
                <motion.button
                  key="fold"
                  type="button"
                  id={foldButtonId}
                  aria-expanded={foldOpen}
                  aria-controls={foldId}
                  onClick={() => setFold(!foldOpen)}
                  aria-label={
                    foldOpen
                      ? "Hide the original"
                      : `Show the original in ${source.name}`
                  }
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={FADE}
                  className={cn(control, "text-ink-2 hover:bg-accent")}
                >
                  <motion.span
                    aria-hidden
                    className="flex"
                    initial={false}
                    animate={{ rotate: foldOpen ? 180 : 0 }}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  >
                    <svg viewBox="0 0 16 16" className="size-3">
                      <path
                        d="M4 6.5 8 10.5l4-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </motion.span>
                  {foldOpen ? "Hide original" : "Original"}
                </motion.button>
              ) : null}
            </AnimatePresence>
          </div>
        </li>
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {beat.message}
      </span>
    </div>
  );
}
