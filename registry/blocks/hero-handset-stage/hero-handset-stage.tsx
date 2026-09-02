"use client";

import * as React from "react";

import { ArrowRight, ArrowUpRight, Smartphone } from "lucide-react";
import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { type HandsetCard, VignetteHandset } from "@/registry/ui/vignette-handset";

type ProofStat = {
  value: number;
  label: string;
  suffix?: string;
  decimals?: number;
};

export type HeroHandsetStageProps = {
  eyebrow?: string;
  /** Two lines of headline; each renders on its own line. */
  headline?: [string, string];
  copy?: string;
  cta?: string;
  onCta?: () => void;
  secondary?: string;
  onSecondary?: () => void;
  /** Passed straight through to the vignette. */
  appName?: string;
  cards?: HandsetCard[];
  /** The two floating proof chips beside the stage. */
  proofs?: ProofStat[];
  className?: string;
};

const DEFAULT_CARDS: HandsetCard[] = [
  { id: "shift-1", title: "Dawn shift", line: "Muster 05:45 · Dock 3 open", stat: "12 crew" },
  { id: "shift-2", title: "Crew Nettle", line: "Coating pass from 10:00", stat: "on time" },
  { id: "shift-3", title: "Tide watch", line: "Window opens 11:40", stat: "+2h" },
  { id: "shift-4", title: "Handover", line: "Notes filed for the next watch", stat: "ready" },
];

const DEFAULT_PROOFS: ProofStat[] = [
  { value: 4.9, label: "crew rating", decimals: 1 },
  { value: 12, label: "harbour crews", suffix: "k" },
];

/** y from → 0: how far the handset rises into the plinth on mount. */
const STAGE_RISE = 24;

/** The chip drift's own tween keyframes — mirrored, so no drop-back snap. */
const CHIP_DRIFT_Y = [0, -7, 0] as const;

/** Copy column: eyebrow, headline, paragraph, CTA row, store row. */
const COPY_STEPS = 5;
const copyStagger = cascade(COPY_STEPS);

function copyMotionProps(index: number, motionSafe: boolean) {
  return {
    // SSR-stable regardless of motionSafe — only the transition below picks
    // the reduced-motion path, so hydration never has to reconcile a jump.
    initial: { opacity: 0, y: distances.shift },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.4 },
    transition: motionSafe
      ? { duration: durations.base, ease: easings.enter, delay: index * copyStagger }
      : { duration: 0 },
  };
}

/** Alternating corners so a growing proofs list never piles into one spot. */
function chipPosition(index: number): React.CSSProperties {
  return index % 2 === 0
    ? { top: "-12%", right: "-8%" }
    : { bottom: "-8%", left: "-10%" };
}

type ProofChipProps = ProofStat & {
  style: React.CSSProperties;
  delaySeconds: number;
  durationSeconds: number;
};

/**
 * One floating proof chip. Its own component (not an inline map body) because
 * it reads `useMotionSafe()` itself — every chip drifts on its own tween,
 * offset in delay and duration from its neighbours so the pair never moves
 * in step.
 */
function ProofChip({
  value,
  label,
  suffix = "",
  decimals = 0,
  style,
  delaySeconds,
  durationSeconds,
}: ProofChipProps) {
  const motionSafe = useMotionSafe();
  const format = (v: number) => `${v.toFixed(decimals)}${suffix}`;

  return (
    <motion.div
      style={style}
      className="border-hairline bg-surface-1 rounded-2 shadow-raised absolute flex flex-col items-center gap-0.5 border px-3 py-2"
      initial={{ y: 0 }}
      animate={motionSafe ? { y: [...CHIP_DRIFT_Y] } : { y: 0 }}
      transition={
        motionSafe
          ? {
              type: "tween",
              duration: durationSeconds,
              ease: easings.move,
              delay: delaySeconds,
              repeat: Infinity,
              repeatType: "mirror",
            }
          : { duration: 0 }
      }
    >
      <Readout value={value} format={format} size="sm" />
      <span className="text-label text-ink-3">{label}</span>
    </motion.div>
  );
}

/**
 * A device-led hero that puts the product, not the pitch, in the frame: the
 * vignette is `VignetteHandset` itself, seated on a plinth stage, and the
 * copy column yields to it rather than competing for the opening beat. The
 * handset rises into the plinth on mount, on `glide`, while two proof chips
 * hover at opposite corners of the stage, each drifting on its own slow
 * tween so the pair never moves in step. A low gradient wash sits behind the
 * plinth, and the copy still arrives on the same cascade as the rest of the
 * hero family.
 *
 * Reduced motion: the handset settles in place with no rise, the proof
 * chips hold still, and the vignette falls back to its own static frame.
 */
export function HeroHandsetStage({
  eyebrow = "Basinworks · Deckhand",
  headline = ["Every shift,", "already aboard."],
  copy = "Deckhand puts the harbour roster, the tide windows, and the handover notes on the phone already in your crew pocket — built for hands that are wet half the day.",
  cta = "Get the app",
  onCta,
  secondary = "See how it works",
  onSecondary,
  appName = "Deckhand",
  cards = DEFAULT_CARDS,
  proofs = DEFAULT_PROOFS,
  className,
}: HeroHandsetStageProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative overflow-hidden", className)}
    >
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-20 sm:py-28 lg:grid-cols-2 lg:gap-16">
        <div className="flex max-w-xl flex-col items-start gap-5">
          <motion.p
            {...copyMotionProps(0, motionSafe)}
            className="text-label text-ink-3 flex items-center gap-2"
          >
            <Smartphone className="size-3.5" aria-hidden />
            {eyebrow}
          </motion.p>

          <motion.h1
            {...copyMotionProps(1, motionSafe)}
            id={headingId}
            className="text-4xl leading-[1.06] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl"
          >
            {headline[0]}
            <br />
            {headline[1]}
          </motion.h1>

          <motion.p
            {...copyMotionProps(2, motionSafe)}
            className="text-ink-2 max-w-md text-base leading-relaxed sm:text-lg"
          >
            {copy}
          </motion.p>

          <motion.div
            {...copyMotionProps(3, motionSafe)}
            className="mt-2 flex flex-wrap items-center gap-3"
          >
            <PressureButton size="lg" onClick={onCta}>
              {cta}
              <ArrowRight className="size-4" aria-hidden />
            </PressureButton>
            <PressureButton size="lg" variant="outline" onClick={onSecondary}>
              {secondary}
            </PressureButton>
          </motion.div>

          <motion.div
            {...copyMotionProps(4, motionSafe)}
            className="flex items-center gap-3"
          >
            <a
              href="#"
              className="border-hairline text-ink-3 hover:text-ink hover:border-hairline-strong rounded-2 inline-flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors"
            >
              iOS
              <ArrowUpRight className="size-3" aria-hidden />
            </a>
            <a
              href="#"
              className="border-hairline text-ink-3 hover:text-ink hover:border-hairline-strong rounded-2 inline-flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors"
            >
              Android
              <ArrowUpRight className="size-3" aria-hidden />
            </a>
          </motion.div>
        </div>

        {/* The stage: a plinth for the vignette, floating proof chips, a low wash. */}
        <div className="relative mx-auto w-full max-w-[280px] lg:mx-0 lg:justify-self-end">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-[-20%] bottom-[-12%] h-2/3 rounded-full blur-3xl"
            style={{
              background:
                "radial-gradient(closest-side, var(--accent-wash), transparent 72%)",
            }}
          />

          <div className="border-hairline bg-surface-1 rounded-4 shadow-raised relative border px-6 py-10 sm:px-8 sm:py-12">
            <motion.div
              className="flex justify-center"
              initial={{ opacity: 0, y: STAGE_RISE }}
              animate={{ opacity: 1, y: 0 }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            >
              <VignetteHandset appName={appName} cards={cards} />
            </motion.div>

            {proofs.map((proof, index) => (
              <ProofChip
                key={`${proof.label}-${index}`}
                value={proof.value}
                label={proof.label}
                suffix={proof.suffix}
                decimals={proof.decimals}
                style={chipPosition(index)}
                delaySeconds={index * 0.9}
                durationSeconds={4.4 + index * 0.7}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
