"use client";

import * as React from "react";

import { motion } from "motion/react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DeckStep = {
  id: string;
  title: string;
  note: string;
  /** What the product leaves behind at this step — stamped as a sealed tag. */
  artifact: string;
};

export type HowCardDeckProps = {
  eyebrow?: string;
  headline?: string;
  deck?: string;
  steps?: DeckStep[];
  defaultIndex?: number;
  className?: string;
};

/** Card width, px — 22rem at the house 16px root. */
const CARD_W = 352;
/** Fixed card height, px. */
const CARD_H = 320;
/** Left inset of the stage — the room the stack pulls into. */
const STAGE_INSET = 72;
/** Gap between waiting cards, px. */
const GAP = 20;
/** px a stacked card is pulled left per step of stack depth. */
const STACK_OFFSET = 14;
/** Scale shed per step of stack depth. */
const STACK_SCALE_STEP = 0.04;
/** Opacity shed per step of stack depth. */
const STACK_FADE_STEP = 0.2;
/** Opacity floor at the back of the stack. */
const STACK_FADE_FLOOR = 0.32;

const DEFAULT_STEPS = [
  {
    id: "capture",
    title: "A plot gets walked once",
    note: "Boundary, moisture, and canopy shots log from one handheld pass — nothing gets a second trip.",
    artifact: "PLOT-0192 · captured",
  },
  {
    id: "route",
    title: "The read finds its reviewer",
    note: "Plots sort by crew zone and land type, so the right reviewer sees them before end of day.",
    artifact: "QUEUE-B7 · routed",
  },
  {
    id: "verify",
    title: "Boundaries get checked twice",
    note: "A second reviewer confirms the plot against county records before anything moves further.",
    artifact: "BOUND-0192 · verified",
  },
  {
    id: "package",
    title: "Verified plots seal into a packet",
    note: "Photos, coordinates, and both sign-offs bind into one packet — nothing loose to attach later.",
    artifact: "PACKET-014 · sealed",
  },
  {
    id: "launch",
    title: "The packet reaches the client",
    note: "A live link goes out the moment the packet seals, and the survey record starts there.",
    artifact: "SURVEY-0192 · launched",
  },
] as const;

type CardLayout = { x: number; scale: number; opacity: number; zIndex: number };

/**
 * Pure layout math: where card `index` sits relative to `current`. Ahead of
 * the reader it waits at full size just past the last card, in place it is
 * the flat, crisp lead, and behind it is pulled into the stack — a few more
 * px left, a little smaller, a little dimmer per step of depth. z-index
 * always keeps the current card above every waiting card, and every waiting
 * card above every stacked one.
 */
function layoutFor(index: number, current: number, count: number): CardLayout {
  const delta = index - current;
  if (delta === 0) {
    return { x: 0, scale: 1, opacity: 1, zIndex: count * 3 };
  }
  if (delta > 0) {
    return {
      x: CARD_W * delta + GAP * delta,
      scale: 1,
      opacity: 1,
      zIndex: count * 2 - delta,
    };
  }
  const depth = -delta - 1;
  return {
    x: -(STACK_OFFSET * (depth + 1)),
    scale: 1 - STACK_SCALE_STEP * depth,
    opacity: Math.max(STACK_FADE_FLOOR, 1 - STACK_FADE_STEP * depth),
    zIndex: count - depth,
  };
}

/**
 * How it works as a card row that eats itself: five full cards start laid
 * out past the viewport edge, and every step forward pulls the one just
 * behind the reader a few px into a layered stack at the stage's left edge —
 * scaled down, dimmed, and filed behind whatever passed before it. The row
 * visibly shortening while the stack grows is the whole device; nothing
 * about the mechanism needs a caption. A step already passed stays
 * reachable — click any card in the stack to fold the row back open there,
 * or click a waiting card to jump ahead; Back, Next, and the arrow keys move
 * one card at a time. Position, scale, and opacity are plain functions of
 * index minus current, so every card just retargets on `springs.glide` —
 * this is a layout that resettles, not a sequence of entrances and exits.
 * Reduced motion: the same positions apply, but instantly — the transition
 * runs at zero duration, so a step change is a cut instead of a glide.
 */
export function HowCardDeck({
  eyebrow = "Fieldline · how it works",
  headline = "Five steps between a walked plot and a launched survey.",
  deck = "Advance the row and watch what is behind you fold into the stack — nothing you pass is gone, it is just filed.",
  steps = [...DEFAULT_STEPS],
  defaultIndex = 0,
  className,
}: HowCardDeckProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const count = steps.length;
  const lastIndex = Math.max(0, count - 1);
  const [current, setCurrent] = React.useState(() =>
    Math.min(Math.max(defaultIndex, 0), lastIndex),
  );

  const goTo = (index: number) => {
    setCurrent(Math.min(Math.max(index, 0), lastIndex));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(current + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(current - 1);
    }
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="text-ink-2 mt-4 leading-relaxed">{deck}</p>
        </div>

        <div
          role="group"
          aria-roledescription="card deck"
          aria-label={eyebrow}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className={cn(
            "relative mt-10 w-full overflow-hidden rounded-4 outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring",
          )}
          style={{ height: CARD_H }}
        >
          {steps.map((step, index) => {
            const layout = layoutFor(index, current, count);
            return (
              <DeckCard
                key={step.id}
                step={step}
                index={index}
                isCurrent={index === current}
                layout={layout}
                motionSafe={motionSafe}
                onSelect={() => goTo(index)}
              />
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <div className="flex gap-2">
            <PressureButton
              variant="outline"
              onClick={() => goTo(current - 1)}
              disabled={current <= 0}
            >
              Back
            </PressureButton>
            <PressureButton
              variant="solid"
              onClick={() => goTo(current + 1)}
              disabled={current >= lastIndex}
            >
              Next
            </PressureButton>
          </div>
          <p className="text-ink-3 font-mono text-[11px] tracking-[0.08em] tabular-nums uppercase">
            {count === 0 ? 0 : current + 1} / {count}
          </p>
        </div>
      </div>
    </section>
  );
}

type DeckCardProps = {
  step: DeckStep;
  index: number;
  isCurrent: boolean;
  layout: CardLayout;
  motionSafe: boolean;
  onSelect: () => void;
};

/**
 * One card of the deck. It owns no state and reads no motion value itself —
 * its x, scale, and opacity arrive pre-computed from the parent's layout
 * math, so `animate` alone (two keyframes, `springs.glide`) is enough to
 * carry it wherever the current index moves, waiting or stacked alike.
 */
function DeckCard({
  step,
  index,
  isCurrent,
  layout,
  motionSafe,
  onSelect,
}: DeckCardProps) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      aria-current={isCurrent ? "step" : undefined}
      aria-label={`Step ${index + 1}: ${step.title}`}
      initial={false}
      animate={{ x: layout.x, scale: layout.scale, opacity: layout.opacity }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
      className={cn(
        "absolute top-0 flex cursor-pointer flex-col justify-between rounded-4 border p-5 text-left shadow-raised transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isCurrent
          ? "border-cobalt/60 bg-surface-2"
          : "border-hairline bg-surface-1",
      )}
      style={{
        left: STAGE_INSET,
        width: CARD_W,
        height: CARD_H,
        zIndex: layout.zIndex,
        willChange: "transform",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink-3 font-mono text-[11px] tracking-[0.08em] tabular-nums">
          {String(index + 1).padStart(2, "0")}
        </span>
        {isCurrent && (
          <span aria-hidden className="bg-cobalt size-1.5 rounded-full" />
        )}
      </div>
      <div className="mt-3 min-w-0 flex-1">
        <h3 className="text-ink text-base font-semibold tracking-tight">
          {step.title}
        </h3>
        <p className="text-ink-2 mt-2 line-clamp-2 text-sm leading-relaxed">
          {step.note}
        </p>
      </div>
      <StatusSeal variant="info" className="mt-4 self-start text-[10px]">
        {step.artifact}
      </StatusSeal>
    </motion.button>
  );
}
