"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MintedCard = {
  id: string;
  /** Sixteen digits, unformatted. */
  number: string;
  /** MM/YY, as printed. */
  expiry: string;
  holder: string;
};

export type MintPhase = "idle" | "rising" | "printing" | "filing";

export type VirtualMintProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Seeds every minted number and expiry — the same press mints the same card. */
  seed?: number;
  /** Cards already in the wallet row. Omit it and one is seeded for you. */
  defaultCards?: MintedCard[];
  /** Name printed on each card. */
  holder?: string;
  /** Network wordmark on the slab. */
  network?: string;
  /** Wallet cap; the oldest chip leaves when it is passed. @default 4 */
  maxCards?: number;
  /** Mint button copy. @default "Mint card" */
  mintLabel?: string;
  /** Names the wallet row. @default "Virtual cards" */
  label?: string;
  /** Fires from the filing timer, once the card has landed in the wallet. */
  onMint?: (card: MintedCard) => void;
  /** Fires from the click and from each phase timer. */
  onPhaseChange?: (phase: MintPhase) => void;
  className?: string;
};

const DIGITS = 16;
/** How long each phase holds, in milliseconds. */
const FULL: Record<MintPhase, number> = {
  idle: 0,
  rising: 420,
  printing: 920,
  filing: 420,
};
const REDUCED: Record<MintPhase, number> = {
  idle: 0,
  rising: 140,
  printing: 260,
  filing: 140,
};
const NEXT: Record<MintPhase, MintPhase | null> = {
  idle: null,
  rising: "printing",
  printing: "filing",
  filing: "idle",
};

const CARD_ART = [
  "radial-gradient(120% 130% at 96% 0%, color-mix(in oklab, var(--accent) 40%, transparent), transparent 60%)",
  "linear-gradient(150deg, var(--bg-2), var(--bg-1) 70%)",
].join(", ");
const EDGE_LEFT = "linear-gradient(to right, var(--bg-1), transparent)";
const EDGE_RIGHT = "linear-gradient(to left, var(--bg-1), transparent)";
const CAPTION = "font-mono text-[9px] tracking-[0.14em] text-ink-3 uppercase";

/** Mulberry32 — seeded, so the server and the client mint the same card. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = Math.imul(state ^ (state >>> 15), 1 | state);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** The 84 prefix is invented; no real network issues numbers in that range. */
function mintCard(seed: number, index: number, holder: string): MintedCard {
  const random = seeded(seed + index * 977 + 1);
  let number = "84";
  for (let i = 2; i < DIGITS; i += 1) number += Math.floor(random() * 10);
  const month = String(1 + Math.floor(random() * 12)).padStart(2, "0");
  const year = String(29 + Math.floor(random() * 5));
  return {
    id: `mint-${seed}-${index}`,
    number,
    expiry: `${month}/${year}`,
    holder,
  };
}

const inFours = (value: string): string[] => value.match(/.{1,4}/g) ?? [];

/** Keeps callbacks out of effect deps, so a re-render never restarts a phase. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * A new card, minted in front of you. Pressing the control raises a blank slab
 * into the stage — `y` from 16px and `scale` from 0.94 on `recoil`, ζ0.53, the
 * two visible bounces of a thing landing on the bench — and then it prints: the
 * sixteen digits arrive in a `cascade(16)` of `flick`s, then the expiry, then
 * the name, each field carried by the print reaching it. When the print
 * finishes the slab files itself away on the exit ease (an exit never springs)
 * while the wallet row below makes room on `glide` and the new chip lands.
 *
 * The sequence is one phase machine — idle, rising, printing, filing — driven
 * by a single timer chain in an effect with cleanup. It stops whenever the
 * document is hidden and restarts the phase it was in when the tab comes back,
 * so a mint never finishes off-screen. Numbers are seeded from `seed` plus the
 * mint index, so nothing is random at render and the two passes agree.
 *
 * Under reduced motion nothing rises, slides or shrinks: the slab appears at
 * rest, all three fields print at once, and the chip lands in place. The phases
 * still run and the card is still minted, because the result is information and
 * only the choreography was flourish.
 */
export function VirtualMint({
  ref,
  seed = 4417,
  defaultCards,
  holder = "R. ALDERWICK",
  network = "Waylight",
  maxCards = 4,
  mintLabel = "Mint card",
  label = "Virtual cards",
  onMint,
  onPhaseChange,
  className,
}: VirtualMintProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const labelId = `${uid}-label`;

  const [cards, setCards] = React.useState<MintedCard[]>(
    () => defaultCards ?? [mintCard(seed, 0, holder)],
  );
  const [minted, setMinted] = React.useState(1);
  const [phase, setPhase] = React.useState<MintPhase>("idle");
  const [pending, setPending] = React.useState<MintedCard | null>(null);

  const busy = phase !== "idle";
  const printing = phase === "printing" || phase === "filing";
  const step = motionSafe ? cascade(DIGITS) : 0;
  const timings = motionSafe ? FULL : REDUCED;
  /** Every printed field lands on the same tick-draw spring, just later. */
  const printedAt = (delay: number) =>
    motionSafe
      ? { ...springs.flick, delay }
      : { duration: durations.fast, ease: easings.enter };

  const pendingRef = useLatest(pending);
  const mintRef = useLatest(onMint);
  const phaseRef = useLatest(onPhaseChange);

  React.useEffect(() => {
    const next = NEXT[phase];
    if (!next) return;
    let timer = 0;
    const advance = () => {
      timer = 0;
      // Filing is the hand-off: the slab unmounts and exits over this phase
      // while the wallet glides open for the chip, so the two moves overlap
      // instead of the card sitting still and then teleporting.
      if (next === "filing") {
        const card = pendingRef.current;
        if (card) {
          setCards((previous) => [...previous, card].slice(-maxCards));
          setPending(null);
          mintRef.current?.(card);
        }
      }
      setPhase(next);
      phaseRef.current?.(next);
    };
    // The timer is started and stopped from the visibility callback, never read
    // back into render: a mint that would land on a hidden tab waits instead.
    const sync = () => {
      if (document.hidden) {
        if (timer) window.clearTimeout(timer);
        timer = 0;
      } else if (!timer) {
        timer = window.setTimeout(advance, timings[phase]);
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [phase, timings, maxCards, pendingRef, mintRef, phaseRef]);

  const mint = () => {
    if (busy) return;
    setPending(mintCard(seed, minted, holder));
    setMinted((previous) => previous + 1);
    setPhase("rising");
    onPhaseChange?.("rising");
  };

  const latest = cards[cards.length - 1];

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div
        className="relative w-full overflow-hidden rounded-3"
        style={{ aspectRatio: "1.9" }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {pending ? (
            <motion.div
              key={pending.id}
              aria-hidden
              className="absolute inset-0 flex flex-col justify-between overflow-hidden rounded-3 border border-hairline-strong p-4 text-ink"
              style={{ backgroundImage: CARD_ART }}
              initial={
                motionSafe
                  ? { opacity: 0, y: distances.shift, scale: 0.94 }
                  : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                motionSafe
                  ? {
                      opacity: 0,
                      y: 40,
                      scale: 0.62,
                      transition: {
                        duration: durations.slow,
                        ease: easings.exit,
                      },
                    }
                  : { opacity: 0, transition: { duration: durations.fast } }
              }
              transition={
                motionSafe
                  ? { ...springs.recoil, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              <div className="flex items-start justify-between gap-3">
                <span className="truncate text-sm font-semibold tracking-tight">
                  {network}
                </span>
                <span className={cn(CAPTION, "shrink-0")}>Single use</span>
              </div>

              <span className="flex items-center gap-2 font-mono text-[15px] tracking-[0.06em] tabular-nums">
                {inFours(pending.number).map((group, groupIndex) => (
                  <span key={groupIndex} className="flex">
                    {group.split("").map((digit, digitIndex) => {
                      const index = groupIndex * 4 + digitIndex;
                      return (
                        <motion.span
                          key={index}
                          className="inline-block w-[1ch] text-center"
                          initial={{ opacity: 0, y: -distances.nudge }}
                          animate={{
                            opacity: printing ? 1 : 0,
                            y: printing ? 0 : -distances.nudge,
                          }}
                          transition={printedAt(index * step)}
                        >
                          {digit}
                        </motion.span>
                      );
                    })}
                  </span>
                ))}
              </span>

              <div className="flex items-end justify-between gap-3">
                <motion.span
                  className="min-w-0 truncate font-mono text-[11px] tracking-[0.1em] text-ink-2 uppercase"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: printing ? 1 : 0 }}
                  transition={printedAt(DIGITS * step + 0.1)}
                >
                  {pending.holder}
                </motion.span>
                <motion.span
                  className="flex shrink-0 items-center gap-1.5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: printing ? 1 : 0 }}
                  transition={printedAt(DIGITS * step + 0.04)}
                >
                  <span className={CAPTION}>Thru</span>
                  <span className="font-mono text-[11px] tabular-nums">
                    {pending.expiry}
                  </span>
                </motion.span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="plate"
              aria-hidden
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-3 border border-dashed border-hairline-strong bg-surface-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{
                opacity: 0,
                transition: { duration: durations.fast, ease: easings.exit },
              }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              <span className={CAPTION}>Ready to mint</span>
              <span className="text-xs text-ink-3">{network} · single use</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={mint}
        disabled={busy}
        aria-busy={busy}
        className={cn(
          "flex h-9 w-full items-center justify-center rounded-2 bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          busy ? "cursor-not-allowed opacity-60" : "hover:opacity-90",
        )}
      >
        {busy ? "Minting" : mintLabel}
      </button>

      <div className="relative rounded-3 border border-hairline bg-surface-1 p-2">
        <div
          role="group"
          aria-labelledby={labelId}
          tabIndex={0}
          className="overflow-x-auto outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ul className="flex w-max gap-2">
            <AnimatePresence initial={false}>
              {cards.map((card) => (
                <motion.li
                  key={card.id}
                  layout={motionSafe}
                  className="flex w-28 shrink-0 flex-col gap-1 rounded-2 border border-hairline-strong bg-surface-2 px-2.5 py-2"
                  initial={
                    motionSafe
                      ? { opacity: 0, x: -distances.step }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, x: 0 }}
                  exit={{
                    opacity: 0,
                    transition: {
                      duration: durations.fast,
                      ease: easings.exit,
                    },
                  }}
                  transition={
                    motionSafe
                      ? springs.glide
                      : { duration: durations.fast, ease: easings.enter }
                  }
                >
                  <span className="font-mono text-[11px] tabular-nums">
                    <span aria-hidden>•••• </span>
                    <span className="sr-only">Card ending </span>
                    {card.number.slice(-4)}
                  </span>
                  <span className={CAPTION}>Thru {card.expiry}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-2 left-2 w-4 rounded-l-2"
          style={{ backgroundImage: EDGE_LEFT }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-2 right-2 w-4 rounded-r-2"
          style={{ backgroundImage: EDGE_RIGHT }}
        />
      </div>

      <span id={labelId} className="sr-only">
        {label}
      </span>
      <span role="status" className="sr-only">
        {latest
          ? `Wallet holds ${cards.length} ${cards.length === 1 ? "card" : "cards"}, latest ending ${latest.number.slice(-4)}`
          : "Wallet is empty"}
      </span>
    </div>
  );
}
