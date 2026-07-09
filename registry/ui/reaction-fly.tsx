"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import { Flame, Heart, PartyPopper, Sparkles, Star } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/**
 * djb2 over a small integer tuple, folded to [0, 1) with a two-round
 * avalanche — deterministic and SSR-safe, so a fly-item's drift and spin never
 * touch Math.random and server and client agree on every path. Returns a value
 * in [0, 1); pair with `signed` for a centered ±jitter.
 */
const djb2 = (a: number, b: number, seed = 0): number => {
  let h = 5381 + seed;
  h = (Math.imul(h, 33) ^ a) >>> 0;
  h = (Math.imul(h, 33) ^ b) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/** Maps a hash into [-0.5, 0.5) — signed jitter, stable per (key, lane). */
const signed = (a: number, b: number, seed = 0): number => djb2(a, b, seed) - 0.5;

/** Vertical travel band (px) a fly-item rises before it fades. */
const RISE = { min: 120, max: 180 } as const;
/** Peak horizontal drift (px) either side of the launch column. */
const DRIFT = 34;
/** Longest a fly-item can live on screen before it retires, in ms. */
const FLY_LIFETIME_MS = 1300;

export type Reaction = {
  /** Stable identity — the value passed to `onReact` and keyed in the tally. */
  id: string;
  /** Human label — the item's `aria-label` and the announced reaction. */
  label: string;
  /** Optional glyph; falls back to a curated lucide icon per default id. */
  node?: React.ReactNode;
};

export type ReactionFlyProps = {
  /** Reactions seated in the picker. Defaults to like/celebrate/spark/fire/star. */
  reactions?: Reaction[];
  /** Fires with the reaction id each time one is chosen. */
  onReact?: (id: string) => void;
  className?: string;
  "aria-label"?: string;
};

/** A curated default set, each with a lucide glyph and a warm token tint. */
const DEFAULT_REACTIONS: readonly (Reaction & {
  icon: React.ReactNode;
  tint: string;
})[] = [
  { id: "like", label: "Like", icon: <Heart />, tint: "var(--signal)" },
  { id: "celebrate", label: "Celebrate", icon: <PartyPopper />, tint: "var(--accent-bright)" },
  { id: "spark", label: "Spark", icon: <Sparkles />, tint: "var(--accent-bright)" },
  { id: "fire", label: "Fire", icon: <Flame />, tint: "var(--signal)" },
  { id: "star", label: "Star", icon: <Star />, tint: "var(--accent-bright)" },
] as const;

/** Resolve a glyph for a reaction: the caller's node, else a default icon. */
const glyphFor = (reaction: Reaction): React.ReactNode => {
  if (reaction.node !== undefined) return reaction.node;
  const preset = DEFAULT_REACTIONS.find((r) => r.id === reaction.id);
  return preset?.icon ?? <Heart />;
};

/** The token tint for a reaction's fly-item; default ids get warm accents. */
const tintFor = (reaction: Reaction): string =>
  DEFAULT_REACTIONS.find((r) => r.id === reaction.id)?.tint ?? "var(--accent-bright)";

/** One in-flight floating reaction. `key` is the identity AND the jitter seed. */
type FlyItem = { key: number; reactionId: string };

/**
 * A live-reaction control. The trigger blooms a picker of reactions above it —
 * each seat scales and fades in on a `snap` cascade, like iris-menu — and
 * choosing one (a) launches a copy that FLIES UP from the trigger, rising while
 * drifting sideways on a djb2-jittered path, popping in scale then fading like a
 * livestream float, and (b) bumps that reaction's tally. Rapid picks stack
 * independent fly-items that drift and spin differently via djb2(key), so the
 * stream never reads uniform. Full menu semantics: the trigger is
 * aria-haspopup="menu"/aria-expanded, seats are role="menuitem", arrow keys and
 * Home/End move focus, Escape closes and returns focus, click-outside closes,
 * and a polite live region announces each reaction.
 *
 * Reduced motion: the picker opens without the bloom stagger (opacity only) and
 * a pick bumps the tally and announces with NO fly-up. First paint is safe.
 */
export function ReactionFly({
  reactions,
  onReact,
  className,
  "aria-label": ariaLabel = "React",
}: ReactionFlyProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const items = React.useMemo<Reaction[]>(
    () =>
      reactions ??
      DEFAULT_REACTIONS.map(({ id, label }) => ({ id, label })),
    [reactions],
  );

  const [open, setOpen] = React.useState(false);
  const [flies, setFlies] = React.useState<FlyItem[]>([]);
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [announce, setAnnounce] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  /** Monotonic fly-item id — deterministic, never Date.now(). Not read in render. */
  const flyId = React.useRef(0);
  /** Retire timers, cleared on unmount so no setState fires after teardown. */
  const timers = React.useRef(new Set<ReturnType<typeof setTimeout>>());
  const menuId = React.useId();

  const total = React.useMemo(
    () => Object.values(counts).reduce((sum, n) => sum + n, 0),
    [counts],
  );

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const close = React.useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Click outside closes without stealing focus back.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  // Focus the first seat as the bloom opens (ref callback, not an effect that
  // reads a ref in render).
  const onSeatRef = (node: HTMLButtonElement | null, index: number) => {
    itemRefs.current[index] = node;
    if (node && index === 0 && open) node.focus();
  };

  const react = React.useCallback(
    (reaction: Reaction) => {
      setCounts((current) => ({
        ...current,
        [reaction.id]: (current[reaction.id] ?? 0) + 1,
      }));
      setAnnounce(`Reacted: ${reaction.label}`);
      onReact?.(reaction.id);

      if (motionSafe) {
        const key = flyId.current;
        flyId.current += 1;
        setFlies((current) => [...current, { key, reactionId: reaction.id }]);
        // AnimatePresence removes the node on exit, but there is no unmount
        // trigger here — retire the descriptor on a timer past its slowest tween.
        const timer = setTimeout(() => {
          timers.current.delete(timer);
          setFlies((current) => current.filter((fly) => fly.key !== key));
        }, FLY_LIFETIME_MS);
        timers.current.add(timer);
      }

      close();
    },
    [motionSafe, onReact, close],
  );

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    const seats = itemRefs.current.filter(Boolean);
    if (seats.length === 0) return;
    const current = seats.findIndex((el) => el === document.activeElement);
    const move = (delta: number) => {
      const next = (current + delta + seats.length) % seats.length;
      seats[next]?.focus();
    };
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Home":
        event.preventDefault();
        seats[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        seats[seats.length - 1]?.focus();
        break;
      case "Escape":
        event.preventDefault();
        close();
        break;
    }
  };

  const interval = cascade(items.length);
  const byId = React.useCallback(
    (id: string) => items.find((item) => item.id === id),
    [items],
  );

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      {/* Fly-items launch from the trigger's top-center and rise above it. They
          are decorative: aria-hidden, pointer-events-none, never in the tab flow. */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-full left-1/2 z-30 block h-0 w-0"
      >
        <AnimatePresence>
          {flies.map((fly) => {
            const reaction = byId(fly.reactionId);
            if (!reaction) return null;
            const rise =
              RISE.min + djb2(fly.key, 3, 17) * (RISE.max - RISE.min);
            const drift = signed(fly.key, 5, 41) * 2 * DRIFT;
            // A gentle S: sway out at the apex, ease back past it.
            const sway = signed(fly.key, 7, 71) * DRIFT * 0.6;
            const spin = signed(fly.key, 9, 101) * 26;
            const scalePeak = 1.05 + djb2(fly.key, 11, 131) * 0.18;
            return (
              <motion.span
                key={fly.key}
                className="absolute bottom-0 left-0 flex -translate-x-1/2 items-center justify-center"
                style={{ color: tintFor(reaction) }}
                initial={{ x: 0, y: 0, scale: 0.6, opacity: 0, rotate: 0 }}
                animate={{
                  x: [0, sway, drift],
                  y: [0, -rise * 0.55, -rise],
                  scale: [0.6, scalePeak, 0.9],
                  opacity: [0, 1, 0],
                  rotate: [0, spin * 0.5, spin],
                }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{
                  duration: 1.05,
                  ease: easings.exit,
                  opacity: { duration: 1.05, times: [0, 0.2, 1], ease: easings.exit },
                  scale: { ...springs.snap, duration: 1.05 },
                }}
              >
                <span className="[&>svg]:size-6 [&>svg]:fill-current [&>svg]:stroke-current [&>svg]:drop-shadow-[0_1px_6px_var(--accent-wash)]">
                  {glyphFor(reaction)}
                </span>
              </motion.span>
            );
          })}
        </AnimatePresence>
      </span>

      {/* Picker bloom — a row of seats above the trigger, staggered in on snap. */}
      <AnimatePresence>
        {open ? (
          <motion.div
            id={menuId}
            role="menu"
            aria-label={ariaLabel}
            onKeyDown={onMenuKeyDown}
            initial={motionSafe ? { opacity: 0, y: 4 } : { opacity: 0 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: motionSafe
                ? { ...springs.snap }
                : { duration: durations.fast },
            }}
            exit={{
              opacity: 0,
              y: motionSafe ? 4 : 0,
              transition: exitFor(durations.base),
            }}
            className={cn(
              "absolute bottom-full left-1/2 z-20 mb-2 flex -translate-x-1/2 items-center gap-1",
              "rounded-full border border-hairline bg-surface-1 p-1 shadow-md",
            )}
          >
            {items.map((item, index) => (
              <motion.button
                key={item.id}
                ref={(node) => onSeatRef(node, index)}
                type="button"
                role="menuitem"
                aria-label={item.label}
                tabIndex={index === 0 ? 0 : -1}
                onClick={() => react(item)}
                initial={
                  motionSafe
                    ? { scale: 0.4, opacity: 0, y: 6 }
                    : { opacity: 0 }
                }
                animate={{
                  scale: 1,
                  opacity: 1,
                  y: 0,
                  transition: motionSafe
                    ? { ...springs.snap, delay: index * interval }
                    : { duration: durations.fast },
                }}
                whileHover={motionSafe ? { scale: 1.15, y: -2 } : undefined}
                whileFocus={motionSafe ? { scale: 1.15, y: -2 } : undefined}
                whileTap={motionSafe ? { scale: 0.9 } : undefined}
                className={cn(
                  "relative flex size-9 items-center justify-center rounded-full outline-none",
                  "text-ink-2 transition-colors hover:text-ink",
                  "hover:bg-surface-2 focus-visible:bg-surface-2",
                  "focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                )}
              >
                <span aria-hidden className="[&>svg]:size-[18px]">
                  {glyphFor(item)}
                </span>
              </motion.button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Trigger — toggles the picker and carries the running total. */}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? close(false) : setOpen(true))}
        className={cn(
          "relative z-10 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 select-none",
          "border-hairline bg-surface-1 text-sm font-medium text-ink-2",
          "transition-colors hover:border-hairline-strong hover:text-ink",
          "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          open && "border-[var(--accent-bright)] text-ink",
        )}
      >
        <motion.span
          aria-hidden
          className="flex items-center justify-center [&>svg]:size-[18px]"
          animate={motionSafe ? { scale: open ? 1.1 : 1 } : undefined}
          transition={springs.snap}
          style={{ color: open ? "var(--accent-bright)" : undefined }}
        >
          <Heart />
        </motion.span>
        <span className="min-w-[1ch] tabular-nums leading-none">{total}</span>
      </button>

      {/* Polite announcer — the reaction outcome, independent of the fly-up. */}
      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
