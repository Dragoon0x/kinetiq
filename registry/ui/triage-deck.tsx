"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { Check, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TriageCard = {
  id: string;
  content: React.ReactNode;
};

export type TriageDeckProps = {
  cards: TriageCard[];
  onDecide?: (id: string, decision: "accept" | "reject") => void;
  onEmpty?: () => void;
  /** Right-swipe affordance + accept button label. */
  acceptLabel?: string;
  /** Left-swipe affordance + reject button label. */
  rejectLabel?: string;
  className?: string;
  "aria-label"?: string;
};

type Decision = "accept" | "reject";

/** Past this x-offset the drag itself commits, regardless of velocity. */
const COMMIT_THRESHOLD = 96;
/** Movement under this (px) is a tap — leaves button clicks intact. */
const TAP_SLOP = 3;
/** rotate/badge mapping saturates at this offset. */
const TILT_RANGE = 200;

/** Depth presentation for the two cards peeking behind the top one. */
const PEEK = [
  { scale: 0.95, y: 10, opacity: 0.6 },
  { scale: 0.9, y: 20, opacity: 0.3 },
] as const;

/**
 * A swipeable decision stack. The top card is grabbable — flick or drag it
 * right to accept, left to reject. Release projects the gesture
 * (offset + velocity × 0.2, the bottom-sheet law): clear the commit threshold
 * that way (or drag past it outright) and the card flies off on `glide`,
 * `onDecide` fires, and the next card — peeking scaled-down behind — rises to
 * the top on `snap`. Short of the threshold it springs back to center on
 * `snap`. The card tilts proportional to its x-offset while dragging, and an
 * accept/reject badge fades in on the pulled side. Accept/Reject buttons and
 * ArrowLeft/ArrowRight drive the same decisions for pointer-free use.
 *
 * Reduced motion: no rotation and no fly-off — a decision cross-fades the top
 * card out while the next fades in; dragging still tracks x 1:1 but only a
 * past-threshold drag commits (no velocity projection), otherwise it snaps
 * back on a tween. The first paint never animates.
 */
export function TriageDeck({
  cards,
  onDecide,
  onEmpty,
  acceptLabel = "Accept",
  rejectLabel = "Reject",
  className,
  "aria-label": ariaLabel = "Triage deck",
}: TriageDeckProps) {
  const motionSafe = useMotionSafe();

  const [index, setIndex] = React.useState(0);
  const [announcement, setAnnouncement] = React.useState("");
  /** Fades the top card out under reduced motion (motion-safe uses fly-off). */
  const fade = useMotionValue(1);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-TILT_RANGE, TILT_RANGE], [-8, 8]);
  const acceptOpacity = useTransform(x, [0, COMMIT_THRESHOLD], [0, 1]);
  const rejectOpacity = useTransform(x, [-COMMIT_THRESHOLD, 0], [1, 0]);

  // Pointer/gesture bookkeeping lives in refs so a drag never re-renders.
  const startXRef = React.useRef(0);
  const originRef = React.useRef(0);
  const pointerIdRef = React.useRef<number | null>(null);
  const draggingRef = React.useRef(false);
  const lastXRef = React.useRef(0);
  const lastTimeRef = React.useRef(0);
  const velocityRef = React.useRef(0);
  /** Latches while a fly-off/cross-fade plays so a card can't be double-decided. */
  const decidingRef = React.useRef(false);
  const controlsRef = React.useRef<ReturnType<typeof animate> | null>(null);
  const cardWidthRef = React.useRef(320);

  const total = cards.length;
  const topCard = index < total ? cards[index] : undefined;
  const remaining = Math.max(total - index - 1, 0);

  const stopControls = React.useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  // Clean up any in-flight animation and released capture on unmount.
  React.useEffect(() => stopControls, [stopControls]);

  // Empty-queue callback fires exactly once, when the index crosses the end.
  const firedEmptyRef = React.useRef(false);
  React.useEffect(() => {
    if (total > 0 && index >= total && !firedEmptyRef.current) {
      firedEmptyRef.current = true;
      onEmpty?.();
    }
    if (index < total) firedEmptyRef.current = false;
  }, [index, total, onEmpty]);

  /** Advance to the next card and reset transforms for the new top card. */
  const advance = React.useCallback(() => {
    x.jump(0);
    fade.jump(1);
    decidingRef.current = false;
    setIndex((current) => current + 1);
  }, [x, fade]);

  const decide = React.useCallback(
    (decision: Decision) => {
      const card = index < cards.length ? cards[index] : undefined;
      if (!card || decidingRef.current) return;
      decidingRef.current = true;
      stopControls();

      const label = decision === "accept" ? acceptLabel : rejectLabel;
      setAnnouncement(`${label} ${cardText(card)}, ${remaining} remaining`);
      onDecide?.(card.id, decision);

      if (motionSafe) {
        // Fly the card off that way with a same-sign vertical drift.
        const dir = decision === "accept" ? 1 : -1;
        const target = dir * cardWidthRef.current * 1.5;
        controlsRef.current = animate(x, target, {
          ...springs.glide,
          onComplete: advance,
        });
        animate(fade, 0, { duration: durations.base, ease: easings.exit });
      } else {
        // Cross-fade: the top card fades out, then the next takes its place.
        controlsRef.current = animate(fade, 0, {
          duration: durations.fast,
          onComplete: advance,
        });
      }
    },
    [
      index,
      cards,
      remaining,
      acceptLabel,
      rejectLabel,
      onDecide,
      motionSafe,
      x,
      fade,
      advance,
      stopControls,
    ],
  );

  const sampleVelocity = React.useCallback((clientX: number, now: number) => {
    const dt = now - lastTimeRef.current;
    if (dt > 0) {
      // px/s, smoothed toward the latest sample like the bottom-sheet gesture.
      const instant = ((clientX - lastXRef.current) / dt) * 1000;
      velocityRef.current = velocityRef.current * 0.6 + instant * 0.4;
    }
    lastXRef.current = clientX;
    lastTimeRef.current = now;
  }, []);

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || decidingRef.current || !topCard) return;
      stopControls();
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width > 0) cardWidthRef.current = rect.width;
      pointerIdRef.current = event.pointerId;
      draggingRef.current = false;
      startXRef.current = event.clientX;
      originRef.current = x.get();
      lastXRef.current = event.clientX;
      lastTimeRef.current = event.timeStamp;
      velocityRef.current = 0;
    },
    [topCard, x, stopControls],
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== event.pointerId || decidingRef.current) {
        return;
      }
      const dx = event.clientX - startXRef.current;
      if (!draggingRef.current) {
        if (Math.abs(dx) < TAP_SLOP) return;
        // Cross the slop → promote to a drag and capture the pointer.
        draggingRef.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      sampleVelocity(event.clientX, event.timeStamp);
      x.set(originRef.current + dx);
    },
    [x, sampleVelocity],
  );

  const endGesture = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      const wasDragging = draggingRef.current;
      pointerIdRef.current = null;
      draggingRef.current = false;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (!wasDragging || decidingRef.current) return;

      const offset = x.get();
      // Motion-safe projects the release; reduced motion commits on raw offset.
      const projected = motionSafe
        ? offset + velocityRef.current * 0.2
        : offset;
      if (projected >= COMMIT_THRESHOLD) {
        decide("accept");
      } else if (projected <= -COMMIT_THRESHOLD) {
        decide("reject");
      } else {
        // Spring back to center (tween under reduced motion).
        controlsRef.current = animate(
          x,
          0,
          motionSafe ? springs.snap : { duration: durations.fast },
        );
      }
    },
    [x, motionSafe, decide],
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!topCard || decidingRef.current) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        decide("accept");
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        decide("reject");
      }
    },
    [topCard, decide],
  );

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div
        role="group"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative flex items-center justify-center outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "focus-visible:ring-offset-surface-0 rounded-4",
        )}
      >
        {/* Sizer: reserves the plate so peeking cards never collapse it. */}
        <div aria-hidden className="invisible">
          {topCard ? topCard.content : <TriageEmpty />}
        </div>

        {topCard ? (
          <>
            {/* Peeking cards behind the top one, furthest first. */}
            {[2, 1].map((depth) => {
              const peek = cards[index + depth];
              const style = PEEK[depth - 1];
              if (!peek || !style) return null;
              return (
                <motion.div
                  key={peek.id}
                  aria-hidden
                  initial={false}
                  animate={
                    motionSafe
                      ? { scale: style.scale, y: style.y, opacity: style.opacity }
                      : { opacity: style.opacity }
                  }
                  transition={
                    motionSafe ? springs.snap : { duration: durations.fast }
                  }
                  className="absolute inset-0"
                >
                  <TriageSurface>{peek.content}</TriageSurface>
                </motion.div>
              );
            })}

            {/* The interactive top card. */}
            <motion.div
              key={topCard.id}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endGesture}
              onPointerCancel={endGesture}
              initial={false}
              style={
                motionSafe
                  ? { x, rotate, opacity: fade }
                  : { x, opacity: fade }
              }
              className="absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing"
            >
              <TriageSurface>
                {topCard.content}
                {/* Pull affordances — fade in with the drag toward each edge. */}
                <motion.div
                  aria-hidden
                  style={{ opacity: acceptOpacity }}
                  className="pointer-events-none absolute top-3 left-3"
                >
                  <TriageBadge tone="accept">{acceptLabel}</TriageBadge>
                </motion.div>
                <motion.div
                  aria-hidden
                  style={{ opacity: rejectOpacity }}
                  className="pointer-events-none absolute top-3 right-3"
                >
                  <TriageBadge tone="reject">{rejectLabel}</TriageBadge>
                </motion.div>
              </TriageSurface>
            </motion.div>
          </>
        ) : (
          <div className="absolute inset-0">
            <TriageEmpty />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={rejectLabel}
          disabled={!topCard}
          onClick={() => decide("reject")}
          className={cn(
            "flex size-11 items-center justify-center rounded-full border border-border bg-surface-1",
            "text-[var(--destructive)] transition-colors",
            "hover:border-[var(--destructive)] hover:bg-surface-2",
            "disabled:pointer-events-none disabled:opacity-40",
          )}
        >
          <X className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={acceptLabel}
          disabled={!topCard}
          onClick={() => decide("accept")}
          className={cn(
            "flex size-11 items-center justify-center rounded-full border border-border bg-surface-1",
            "text-[var(--signal)] transition-colors",
            "hover:border-[var(--signal)] hover:bg-surface-2",
            "disabled:pointer-events-none disabled:opacity-40",
          )}
        >
          <Check className="size-5" aria-hidden />
        </button>
      </div>

      <span aria-live="polite" role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

/** Card chrome shared by the top card and the peeking ones. */
function TriageSurface({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-4 border border-hairline bg-surface-1 shadow-[var(--shadow-raised)]">
      {children}
    </div>
  );
}

/** Corner affordance stamped as you pull the card toward a decision. */
function TriageBadge({
  tone,
  children,
}: {
  tone: Decision;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "text-label rounded-1 border px-2 py-1",
        tone === "accept"
          ? "border-[var(--signal)] text-[var(--signal)]"
          : "border-[var(--destructive)] text-[var(--destructive)]",
      )}
    >
      {children}
    </span>
  );
}

/** Minimal cleared-queue state. */
function TriageEmpty() {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-4 border border-dashed border-hairline bg-surface-1">
      <span className="text-label text-ink-3">Queue clear</span>
    </div>
  );
}

/** Best-effort text for the live region; falls back to the card id. */
function cardText(card: TriageCard): string {
  return typeof card.content === "string" && card.content.trim().length > 0
    ? card.content
    : card.id;
}
